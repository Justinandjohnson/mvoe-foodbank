import { getPrismaClient } from '../utils/database.js';
import { config } from '../config/index.js';
import {
  DEFAULT_PRICING_CATALOG_ITEMS,
  DEFAULT_PRICING_STORES,
} from '../data/pricingCatalog.js';

const prisma = getPrismaClient();
const FIRECRAWL_API_BASE_URL = 'https://api.firecrawl.dev/v2';
const SEARCH_PAGE_WAIT_MS = 2500;
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;

const STORE_SEARCH_URLS = {
  Costco: 'https://www.costco.com/s?keyword=',
  Walmart: 'https://www.walmart.com/search?q=',
  'H-E-B': 'https://www.heb.com/search/?q=',
};

const PRODUCT_MATCH_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          price: { type: 'number' },
          priceText: { type: 'string' },
          packageLabel: { type: 'string' },
          productUrl: { type: 'string' },
          availability: { type: 'string' },
        },
        required: ['productName'],
      },
    },
  },
  required: ['matches'],
};

function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeText(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value = '') {
  return normalizeText(value).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function addHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function safePrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return roundCurrency(parsed);
}

function extractNumericPrice(priceText = '') {
  const match = String(priceText).match(/(\d+(?:\.\d{1,2})?)/);
  return match ? safePrice(match[1]) : null;
}

function buildSearchUrl(store, query) {
  const base = STORE_SEARCH_URLS[store];
  if (!base) {
    throw new Error(`Unsupported pricing store: ${store}`);
  }

  return `${base}${encodeURIComponent(query)}`;
}

function getStoreSearchQuery(catalogItem, store, target = {}) {
  if (target?.storeQueries?.[store]) {
    return normalizeWhitespace(target.storeQueries[store]);
  }

  const configuredTerms = catalogItem?.storeSearchTerms && typeof catalogItem.storeSearchTerms === 'object'
    ? catalogItem.storeSearchTerms
    : {};

  const storeQuery = configuredTerms?.[store];
  if (storeQuery) {
    return normalizeWhitespace(storeQuery);
  }

  if (target?.query) {
    return normalizeWhitespace(target.query);
  }

  return normalizeWhitespace(catalogItem?.defaultSearchTerm || target?.item || target?.label || '');
}

function normalizePreferredStores(stores) {
  const normalized = Array.from(new Set(
    asArray(stores)
      .map((store) => normalizeWhitespace(store))
      .filter((store) => DEFAULT_PRICING_STORES.includes(store))
  ));

  return normalized.length ? normalized : [...DEFAULT_PRICING_STORES];
}

function chooseFreshness(snapshot) {
  if (!snapshot || !snapshot.scrapedAt) {
    return 'missing';
  }

  const scrapedAt = new Date(snapshot.scrapedAt);
  const staleAfter = config.pricingIndexStaleAfterHours;
  const staleAt = snapshot.expiresAt ? new Date(snapshot.expiresAt) : addHours(scrapedAt, staleAfter);

  if (snapshot.price == null) {
    return 'missing';
  }

  return staleAt > new Date() ? 'fresh' : 'stale';
}

function hoursSince(date) {
  if (!date) return null;
  return Math.round(((Date.now() - new Date(date).getTime()) / (60 * 60 * 1000)) * 10) / 10;
}

function formatSyncAge(date) {
  const hours = hoursSince(date);
  if (hours == null) return 'No pricing yet';
  if (hours < 1) return 'Updated less than 1 hour ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hours ago`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `Updated ${days} days ago`;
}

function freshnessRank(value) {
  return value === 'fresh' ? 0 : value === 'stale' ? 1 : 2;
}

function buildFirecrawlPrompt(store, query) {
  return [
    `This page is a ${store} product search result page.`,
    `The shopping query is "${query}".`,
    'Extract up to 3 results in order from best match to weakest match.',
    'Prefer family-size, bulk, value-pack, and standard grocery results that a community meal planner would realistically buy.',
    'Ignore sponsored tiles, accessories, memberships, recipes, and unrelated items.',
    'Capture the currently displayed sale or shelf price only.',
    'If no visible price is shown for a result, omit the numeric price.',
    'Use an absolute product URL when it is visible.',
  ].join(' ');
}

function normalizeProductMatch(store, searchUrl, match = {}) {
  const productName = normalizeWhitespace(match.productName || '');
  const packageLabel = normalizeWhitespace(match.packageLabel || '');
  const price = safePrice(match.price) ?? extractNumericPrice(match.priceText);
  const availability = normalizeWhitespace(match.availability || 'unknown').toLowerCase() || 'unknown';
  const productUrl = normalizeWhitespace(match.productUrl || '');

  if (!productName || price == null) {
    return null;
  }

  let absoluteProductUrl = null;
  if (productUrl) {
    try {
      absoluteProductUrl = new URL(productUrl, searchUrl).toString();
    } catch {
      absoluteProductUrl = productUrl;
    }
  }

  return {
    store,
    productName,
    packageLabel,
    productUrl: absoluteProductUrl,
    sourceUrl: searchUrl,
    price,
    availability,
  };
}

async function firecrawlScrapeSearchPage({ store, query, forceFresh = false }) {
  if (!config.firecrawlApiKey) {
    throw new Error('FIRECRAWL_API_KEY is not configured');
  }

  const searchUrl = buildSearchUrl(store, query);
  const response = await fetch(`${FIRECRAWL_API_BASE_URL}/scrape`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.firecrawlApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: searchUrl,
      formats: [{
        type: 'json',
        schema: PRODUCT_MATCH_SCHEMA,
        prompt: buildFirecrawlPrompt(store, query),
      }],
      onlyMainContent: false,
      waitFor: SEARCH_PAGE_WAIT_MS,
      timeout: DEFAULT_REQUEST_TIMEOUT_MS,
      location: {
        country: 'US',
        languages: ['en-US'],
      },
      blockAds: true,
      proxy: 'auto',
      maxAge: forceFresh ? 0 : 60 * 60 * 1000,
      storeInCache: true,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.error || payload?.message || `Firecrawl scrape failed with status ${response.status}`;
    throw new Error(message);
  }

  const extracted = payload?.data?.json || payload?.json || {};
  const matches = asArray(extracted.matches)
    .map((match) => normalizeProductMatch(store, searchUrl, match))
    .filter(Boolean);

  return {
    searchUrl,
    match: matches[0] || null,
    matches,
    raw: payload?.data || payload,
  };
}

class PricingIndexService {
  async ensureCatalogSeed() {
    for (const item of DEFAULT_PRICING_CATALOG_ITEMS) {
      await prisma.pricingCatalogItem.upsert({
        where: { slug: item.slug },
        update: {
          displayName: item.displayName,
          normalizedName: normalizeText(item.displayName),
          category: item.category || null,
          aliases: item.aliases || [],
          defaultSearchTerm: item.defaultSearchTerm,
          storeSearchTerms: item.storeSearchTerms || {},
          isStaple: true,
          isActive: true,
        },
        create: {
          slug: item.slug,
          displayName: item.displayName,
          normalizedName: normalizeText(item.displayName),
          category: item.category || null,
          aliases: item.aliases || [],
          defaultSearchTerm: item.defaultSearchTerm,
          storeSearchTerms: item.storeSearchTerms || {},
          isStaple: true,
          isActive: true,
        },
      });
    }
  }

  async loadCatalogItems() {
    await this.ensureCatalogSeed();
    return prisma.pricingCatalogItem.findMany({
      where: { isActive: true },
      orderBy: { displayName: 'asc' },
    });
  }

  matchCatalogItem(catalogItems, target) {
    const probes = Array.from(new Set(
      [
        target?.item,
        target?.label,
        target?.query,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
    ));

    if (probes.length === 0) {
      return null;
    }

    for (const item of catalogItems) {
      const aliases = Array.from(new Set([
        item.normalizedName,
        normalizeText(item.displayName),
        ...asArray(item.aliases).map((alias) => normalizeText(alias)),
      ].filter(Boolean)));

      if (probes.some((probe) => aliases.includes(probe))) {
        return item;
      }
    }

    for (const item of catalogItems) {
      const aliases = Array.from(new Set([
        item.normalizedName,
        normalizeText(item.displayName),
        ...asArray(item.aliases).map((alias) => normalizeText(alias)),
      ].filter(Boolean)));

      if (probes.some((probe) => aliases.some((alias) => probe.includes(alias) || alias.includes(probe)))) {
        return item;
      }
    }

    return null;
  }

  async ensureCatalogItem(target, catalogItems) {
    const existing = this.matchCatalogItem(catalogItems, target);
    if (existing) {
      return existing;
    }

    const label = normalizeWhitespace(target?.item || target?.label || target?.query || 'custom-item');
    const baseSlug = slugify(label) || `custom-item-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 1;

    while (await prisma.pricingCatalogItem.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const created = await prisma.pricingCatalogItem.create({
      data: {
        slug,
        displayName: label,
        normalizedName: normalizeText(label),
        aliases: [],
        defaultSearchTerm: normalizeWhitespace(target?.query || label),
        storeSearchTerms: {},
        isStaple: false,
        isActive: true,
        metadata: {
          autoCreated: true,
        },
      },
    });

    catalogItems.push(created);
    return created;
  }

  async upsertSnapshot(itemId, store, storeQuery, scrapeResult) {
    const now = new Date();
    return prisma.pricingSnapshot.upsert({
      where: {
        itemId_store: {
          itemId,
          store,
        },
      },
      update: {
        storeQuery,
        productName: scrapeResult.productName,
        productUrl: scrapeResult.productUrl,
        sourceUrl: scrapeResult.sourceUrl,
        packageLabel: scrapeResult.packageLabel,
        price: scrapeResult.price,
        currency: 'USD',
        availability: scrapeResult.availability || 'unknown',
        freshness: 'fresh',
        scrapedAt: now,
        expiresAt: addHours(now, config.pricingIndexStaleAfterHours),
        metadata: {
          matches: scrapeResult.matches,
        },
      },
      create: {
        itemId,
        store,
        storeQuery,
        productName: scrapeResult.productName,
        productUrl: scrapeResult.productUrl,
        sourceUrl: scrapeResult.sourceUrl,
        packageLabel: scrapeResult.packageLabel,
        price: scrapeResult.price,
        currency: 'USD',
        availability: scrapeResult.availability || 'unknown',
        freshness: 'fresh',
        scrapedAt: now,
        expiresAt: addHours(now, config.pricingIndexStaleAfterHours),
        metadata: {
          matches: scrapeResult.matches,
        },
      },
    });
  }

  async getItemSnapshots(itemId, stores = DEFAULT_PRICING_STORES) {
    return prisma.pricingSnapshot.findMany({
      where: {
        itemId,
        store: {
          in: normalizePreferredStores(stores),
        },
      },
      orderBy: {
        scrapedAt: 'desc',
      },
    });
  }

  buildTargetResult(target, snapshots, refreshedAtByStore = new Map()) {
    const viableSnapshots = snapshots
      .map((snapshot) => ({
        ...snapshot,
        freshness: chooseFreshness(snapshot),
      }))
      .filter((snapshot) => snapshot.price != null);

    const sortedSnapshots = viableSnapshots
      .slice()
      .sort((left, right) => {
        const freshnessDelta = freshnessRank(left.freshness) - freshnessRank(right.freshness);
        if (freshnessDelta !== 0) {
          return freshnessDelta;
        }

        return Number(left.price) - Number(right.price);
      });

    const selected = sortedSnapshots[0] || null;
    if (!selected) {
      return {
        item: target.label || target.item,
        query: target.query,
        prices: [],
        bestPrice: null,
        bestStore: null,
        source: 'missing',
        freshness: 'missing',
        note: 'No indexed pricing is available for this item yet.',
      };
    }

    const bestStore = selected.store;
    const wasRefreshedNow = refreshedAtByStore.has(bestStore)
      && new Date(selected.scrapedAt).getTime() >= refreshedAtByStore.get(bestStore).getTime();

    return {
      item: target.label || target.item,
      query: target.query,
      prices: sortedSnapshots.map((snapshot) => ({
        store: snapshot.store,
        price: roundCurrency(snapshot.price),
        source: chooseFreshness(snapshot) === 'fresh' ? 'index' : 'stale_index',
        url: snapshot.productUrl || snapshot.sourceUrl || null,
        productName: snapshot.productName || null,
        packageLabel: snapshot.packageLabel || null,
        scrapedAt: snapshot.scrapedAt,
        freshness: chooseFreshness(snapshot),
      })),
      bestPrice: roundCurrency(selected.price),
      bestStore,
      source: wasRefreshedNow ? 'live_refresh' : (selected.freshness === 'fresh' ? 'index' : 'stale_index'),
      freshness: selected.freshness,
      note: selected.freshness === 'fresh'
        ? `Indexed pricing available from ${bestStore}.`
        : `Using stale indexed pricing from ${bestStore} while you decide whether to refresh.`,
    };
  }

  async createSyncRun(data = {}) {
    return prisma.pricingSyncRun.create({
      data: {
        scope: data.scope || 'catalog',
        trigger: data.trigger || 'manual',
        status: 'running',
        requestedBy: data.requestedBy || null,
        itemCount: data.itemCount || 0,
        metadata: data.metadata || {},
      },
    });
  }

  async finalizeSyncRun(runId, data = {}) {
    return prisma.pricingSyncRun.update({
      where: { id: runId },
      data: {
        status: data.status || 'completed',
        updatedCount: data.updatedCount || 0,
        failedCount: data.failedCount || 0,
        completedAt: new Date(),
        errorMessage: data.errorMessage || null,
        metadata: data.metadata || undefined,
      },
    });
  }

  async refreshTargets(
    targets = [],
    {
      scope = 'plan',
      trigger = 'manual',
      requestedBy = null,
      forceFresh = true,
    } = {}
  ) {
    await this.ensureCatalogSeed();

    const catalogItems = await this.loadCatalogItems();
    const run = await this.createSyncRun({
      scope,
      trigger,
      requestedBy,
      itemCount: targets.length,
      metadata: {
        targets,
      },
    });

    let updatedCount = 0;
    let failedCount = 0;
    const refreshedAtByTarget = new Map();

    try {
      for (const target of targets) {
        const item = await this.ensureCatalogItem(target, catalogItems);
        const preferredStores = normalizePreferredStores(target.stores);
        const refreshedAtByStore = new Map();

        for (const store of preferredStores) {
          const query = getStoreSearchQuery(item, store, target);
          try {
            const scraped = await firecrawlScrapeSearchPage({
              store,
              query,
              forceFresh,
            });

            if (scraped.match) {
              const snapshot = await this.upsertSnapshot(item.id, store, query, {
                ...scraped.match,
                matches: scraped.matches,
              });
              refreshedAtByStore.set(store, new Date(snapshot.scrapedAt));
              updatedCount += 1;
            } else {
              failedCount += 1;
            }
          } catch (error) {
            failedCount += 1;
          }
        }

        await prisma.pricingCatalogItem.update({
          where: { id: item.id },
          data: {
            lastIndexedAt: refreshedAtByStore.size ? new Date() : item.lastIndexedAt,
            nextRefreshAt: addHours(new Date(), config.pricingIndexRefreshIntervalHours),
          },
        });

        refreshedAtByTarget.set(item.id, refreshedAtByStore);
      }

      await this.finalizeSyncRun(run.id, {
        status: 'completed',
        updatedCount,
        failedCount,
      });

      return {
        runId: run.id,
        updatedCount,
        failedCount,
        refreshedAtByTarget,
      };
    } catch (error) {
      await this.finalizeSyncRun(run.id, {
        status: 'failed',
        updatedCount,
        failedCount,
        errorMessage: error.message,
      });
      throw error;
    }
  }

  async refreshStapleCatalog({ trigger = 'scheduler', requestedBy = null, forceFresh = true, items = null } = {}) {
    await this.ensureCatalogSeed();
    const stapleItems = items || await prisma.pricingCatalogItem.findMany({
      where: {
        isActive: true,
        isStaple: true,
      },
      orderBy: { displayName: 'asc' },
    });

    const targets = stapleItems.map((item) => ({
      item: item.displayName,
      label: item.displayName,
      query: item.defaultSearchTerm,
      stores: DEFAULT_PRICING_STORES,
    }));

    return this.refreshTargets(targets, {
      scope: 'catalog',
      trigger,
      requestedBy,
      forceFresh,
    });
  }

  async getDueCatalogItems() {
    await this.ensureCatalogSeed();

    return prisma.pricingCatalogItem.findMany({
      where: {
        isActive: true,
        isStaple: true,
        OR: [
          { nextRefreshAt: null },
          { nextRefreshAt: { lte: new Date() } },
        ],
      },
      orderBy: { nextRefreshAt: 'asc' },
    });
  }

  async resolveMealPlannerPrices(targets = [], { forceRefresh = false, requestedBy = null } = {}) {
    await this.ensureCatalogSeed();

    const catalogItems = await this.loadCatalogItems();
    const resolvedTargets = [];
    for (const target of targets) {
      const item = await this.ensureCatalogItem(target, catalogItems);
      resolvedTargets.push({
        ...target,
        itemId: item.id,
        stores: normalizePreferredStores(target.stores),
        query: normalizeWhitespace(target.query || item.defaultSearchTerm || target.item || ''),
      });
    }

    let refreshResult = null;
    if (forceRefresh) {
      refreshResult = await this.refreshTargets(resolvedTargets, {
        scope: 'plan',
        trigger: 'meal_planner_refresh',
        requestedBy,
        forceFresh: true,
      });
    }

    const results = [];
    for (const target of resolvedTargets) {
      const snapshots = await this.getItemSnapshots(target.itemId, target.stores);
      const refreshedAtByStore = refreshResult?.refreshedAtByTarget?.get(target.itemId) || new Map();
      results.push(this.buildTargetResult(target, snapshots, refreshedAtByStore));
    }

    return {
      success: results.every((result) => result.source !== 'missing'),
      results,
      runId: refreshResult?.runId || null,
      refreshed: Boolean(refreshResult),
    };
  }

  async getStatus() {
    await this.ensureCatalogSeed();

    const [catalogItems, snapshots, latestRun] = await Promise.all([
      prisma.pricingCatalogItem.findMany({
        where: { isActive: true },
      }),
      prisma.pricingSnapshot.findMany(),
      prisma.pricingSyncRun.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const freshSnapshots = snapshots.filter((snapshot) => chooseFreshness(snapshot) === 'fresh');
    const staleSnapshots = snapshots.filter((snapshot) => chooseFreshness(snapshot) === 'stale');

    return {
      configured: Boolean(config.firecrawlApiKey),
      stores: [...DEFAULT_PRICING_STORES],
      catalogItemCount: catalogItems.length,
      stapleItemCount: catalogItems.filter((item) => item.isStaple).length,
      indexedStorePriceCount: snapshots.filter((snapshot) => snapshot.price != null).length,
      freshStorePriceCount: freshSnapshots.length,
      staleStorePriceCount: staleSnapshots.length,
      unpricedCatalogCount: catalogItems.filter((item) => {
        const snapshotStores = snapshots.filter((snapshot) => snapshot.itemId === item.id && snapshot.price != null);
        return snapshotStores.length === 0;
      }).length,
      latestSync: latestRun ? {
        id: latestRun.id,
        status: latestRun.status,
        scope: latestRun.scope,
        trigger: latestRun.trigger,
        updatedCount: latestRun.updatedCount,
        failedCount: latestRun.failedCount,
        startedAt: latestRun.startedAt,
        completedAt: latestRun.completedAt,
        ageLabel: formatSyncAge(latestRun.completedAt || latestRun.startedAt),
      } : null,
      refreshIntervalHours: config.pricingIndexRefreshIntervalHours,
      staleAfterHours: config.pricingIndexStaleAfterHours,
      sampleCoverage: DEFAULT_PRICING_STORES.map((store) => ({
        store,
        indexedCount: snapshots.filter((snapshot) => snapshot.store === store && snapshot.price != null).length,
      })),
    };
  }
}

const pricingIndexService = new PricingIndexService();

export default pricingIndexService;
