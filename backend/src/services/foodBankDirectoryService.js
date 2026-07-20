import { createHash } from 'node:crypto';
import { getPrismaClient } from '../utils/database.js';
import cacheService from '../utils/redis.js';
import { config } from '../config/index.js';
import ZenClient from '../mcp/zenClient.js';

const prisma = getPrismaClient();
const aiClient = new ZenClient();

const REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_RESULTS_PER_QUERY = 6;
const MAX_WEB_CANDIDATES_PER_RUN = 14;
const PAGE_TEXT_LIMIT = 9000;
const AUTO_APPLY_FIELDS = new Set(['description', 'phone', 'email', 'website', 'hours']);
const TRUSTED_DIRECTORY_DOMAINS = new Set(['feedingamerica.org', 'foodpantries.org', 'findhelp.org']);
const BLOCKED_SEARCH_DOMAINS = new Set([
  'bing.com',
  'duckduckgo.com',
  'google.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'yelp.com',
  'mapquest.com',
  'maps.apple.com',
]);
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ACCESS_FOOD_DAY_KEYS = {
  1: 'sunday',
  2: 'monday',
  3: 'tuesday',
  4: 'wednesday',
  5: 'thursday',
  6: 'friday',
  7: 'saturday',
};
const ACCESS_FOOD_API_BASE_URL = 'https://api.accessfood.org/api/MapInformation/';
const ACCESS_FOOD_PAGE_SIZE = 20;
const OFFICIAL_REGION_PROVIDERS = {
  'Austin|TX|US': {
    provider: 'accessfood',
    label: 'Central Texas Food Bank Find Food Now',
    sourceUrl: 'https://www.centraltexasfoodbank.org/food-assistance/get-food-now',
    securityToken: '99e94cff-7fdf-4d81-8f11-5dccc11469e6',
    searchRadiusMiles: 50,
    includeOutOfNetwork: true,
  },
};

function regionLabel(region) {
  return [region.city, region.state].filter(Boolean).join(', ');
}

function regionProviderKey(region) {
  return [
    normalizeWhitespace(region.city),
    normalizeStateValue(region.state),
    normalizeWhitespace(region.country || 'US').toUpperCase(),
  ].join('|');
}

function getOfficialRegionProvider(region) {
  return OFFICIAL_REGION_PROVIDERS[regionProviderKey(region)] || null;
}

function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeText(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function normalizeStateValue(value) {
  const normalized = normalizeWhitespace(value || '');
  if (!normalized) return '';
  return normalized.length <= 3 ? normalized.toUpperCase() : normalized;
}

function normalizeUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `https://${hostname}${pathname}`;
  } catch {
    return null;
  }
}

function extractDomain(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    return new URL(normalized).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value = '') {
  return decodeHtmlEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFirst(...values) {
  return values.find((value) => {
    if (value == null) return false;
    if (typeof value === 'string') return normalizeWhitespace(value).length > 0;
    return true;
  }) ?? null;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function chunkArray(values = [], size = 50) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function parseAddressString(value) {
  if (!value) {
    return {
      address: null,
      city: null,
      state: null,
      zipCode: null,
    };
  }

  const match = normalizeWhitespace(value).match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!match) {
    return {
      address: normalizeWhitespace(value),
      city: null,
      state: null,
      zipCode: null,
    };
  }

  return {
    address: normalizeWhitespace(match[1]),
    city: normalizeWhitespace(match[2]),
    state: normalizeWhitespace(match[3]).toUpperCase(),
    zipCode: normalizeWhitespace(match[4]),
  };
}

function toAmPm(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return normalizeWhitespace(value);

  let hours = Number(match[1]);
  const minutes = match[2] || '00';
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  if (hours === 0) hours = 12;
  if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${meridiem}`;
}

function dayKeyFromValue(value) {
  if (!value) return null;
  const source = String(value).toLowerCase();
  return DAY_KEYS.find((day) => source.includes(day)) || null;
}

function normalizeHours(hours) {
  if (!hours) return null;
  if (typeof hours === 'string') {
    try {
      return JSON.parse(hours);
    } catch {
      return null;
    }
  }

  if (typeof hours === 'object') {
    return hours;
  }

  return null;
}

function hoursToJsonString(hours) {
  if (!hours) return null;
  if (typeof hours === 'string') return hours;
  return JSON.stringify(hours);
}

function formatOpeningHoursSpec(specs = []) {
  if (!Array.isArray(specs) || specs.length === 0) return null;

  const result = {};

  for (const spec of specs) {
    if (!spec) continue;

    const open = toAmPm(spec.opens);
    const close = toAmPm(spec.closes);
    if (!open || !close) continue;

    const label = `${open} - ${close}`;
    const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek];

    for (const day of days) {
      const dayKey = dayKeyFromValue(day);
      if (dayKey) {
        result[dayKey] = label;
      }
    }
  }

  return Object.keys(result).length ? result : null;
}

function formatOpeningHoursStrings(values = []) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const result = {};

  for (const value of values) {
    const match = String(value).match(/^([A-Za-z]{2})(?:-([A-Za-z]{2}))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;

    const startKey = dayKeyFromValue(match[1]);
    const endKey = dayKeyFromValue(match[2] || match[1]);
    const startIndex = DAY_KEYS.indexOf(startKey);
    const endIndex = DAY_KEYS.indexOf(endKey);
    const label = `${toAmPm(match[3])} - ${toAmPm(match[4])}`;

    if (startIndex === -1 || endIndex === -1) continue;

    for (let index = startIndex; index <= endIndex; index += 1) {
      result[DAY_KEYS[index]] = label;
    }
  }

  return Object.keys(result).length ? result : null;
}

function hashText(value = '') {
  return createHash('sha256').update(value).digest('hex');
}

function buildAccessFoodRecordUrl(locationId) {
  return `https://api.accessfood.org/location/${locationId}`;
}

function buildFingerprint(candidate) {
  if (candidate.websiteDomain) return `site:${candidate.websiteDomain}`;
  if (candidate.normalizedPhone) return `phone:${candidate.normalizedPhone}`;
  return `name:${candidate.normalizedName}|${normalizeText(candidate.city)}|${normalizeText(candidate.state)}`;
}

function isLikelyFoodResource({ title = '', snippet = '', text = '' }) {
  const haystack = `${title} ${snippet} ${text}`.toLowerCase();
  return /(food pantry|food bank|food shelf|free food|meal distribution|community pantry|hunger relief|emergency food|soup kitchen|pantry hours)/i.test(haystack);
}

function parseBingRss(xml = '', query) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = regex.exec(xml))) {
    const block = match[1];
    const link = decodeHtmlEntities((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '').trim());
    const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const snippet = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const domain = extractDomain(link);

    if (!link || !domain || BLOCKED_SEARCH_DOMAINS.has(domain)) continue;

    items.push({
      query,
      url: link,
      title,
      snippet,
      domain,
    });
  }

  return items;
}

async function searchQuery(query) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MVOE-FoodBankIndexer/1.0',
      Accept: 'application/rss+xml,application/xml,text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed (${response.status})`);
  }

  const xml = await response.text();
  return parseBingRss(xml, query).slice(0, SEARCH_RESULTS_PER_QUERY);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MVOE-FoodBankIndexer/1.0',
      Accept: 'application/json,text/plain,*/*',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json();
}

function buildAccessFoodHours(schedules = []) {
  const result = {};

  for (const schedule of schedules) {
    const dayKey = ACCESS_FOOD_DAY_KEYS[schedule.dayOfWeek] || dayKeyFromValue(schedule.weekDayDescr);
    if (!dayKey) continue;

    const start = normalizeWhitespace(schedule.startTimeDescr || '');
    const end = normalizeWhitespace(schedule.endTimeDescr || '');
    if (!start || !end) continue;

    let label = `${start} - ${end}`;
    if (normalizeWhitespace(schedule.weeksOfMonth)) {
      label = `${label} (${normalizeWhitespace(schedule.weeksOfMonth)})`;
    }
    if (schedule.everyOtherWeekInd) {
      label = `${label} (every other week)`;
    }
    if (normalizeWhitespace(schedule.notes)) {
      label = `${label} ${normalizeWhitespace(schedule.notes)}`;
    }

    if (!result[dayKey]) {
      result[dayKey] = [];
    }

    if (!result[dayKey].includes(label)) {
      result[dayKey].push(label);
    }
  }

  const normalized = Object.fromEntries(
    Object.entries(result).map(([dayKey, labels]) => [dayKey, labels.join(', ')])
  );

  return Object.keys(normalized).length ? normalized : null;
}

function buildAccessFoodDescription(location, services = []) {
  const overview = services
    .map((service) => normalizeWhitespace(service.overview || ''))
    .find(Boolean);

  if (overview) return overview;

  const about = normalizeWhitespace(location.aboutUs || '');
  if (about) return about;

  const programs = normalizeWhitespace(location.foodPrograms || '');
  if (programs) return `Programs: ${programs}.`;

  return normalizeWhitespace(location.notes || '');
}

function buildAccessFoodEligibilityNotes(services = [], schedules = []) {
  const values = [
    ...services.flatMap((service) => [
      service.qualifications,
      service.notes,
      service.orderingInformation,
    ]),
    ...schedules.flatMap((schedule) => [
      schedule.contactForHoursMessage,
      schedule.notes,
    ]),
  ]
    .map((value) => normalizeWhitespace(value || ''))
    .filter(Boolean);

  return values.length ? Array.from(new Set(values)).join(' ') : '';
}

async function fetchAccessFoodRegionMap(providerConfig) {
  const params = new URLSearchParams({
    securityToken: providerConfig.securityToken,
    isMapV2: 'true',
  });

  return fetchJson(`${ACCESS_FOOD_API_BASE_URL}RegionMap?${params}`);
}

async function fetchAccessFoodSearchResults(region, providerConfig) {
  const regionMap = await fetchAccessFoodRegionMap(providerConfig);
  const baseParams = {
    radius: String(providerConfig.searchRadiusMiles || 50),
    lat: String(regionMap.defaultLatitude),
    lng: String(regionMap.defaultLongitude),
    dayAv: '',
    foodProgramAv: '',
    serviceTypeAv: '',
    foodOfferingAv: '',
    dietRestrictionAv: '',
    locationFeatureAv: '',
    languagesAv: '',
    serviceCategoriesAv: '',
    regionId: String(regionMap.regionId),
    regionMapId: String(regionMap.regionMapId),
    showOutOfNetwork: providerConfig.includeOutOfNetwork ? '1' : '0',
    includeLocationOperatingHours: 'true',
    isMapV2: 'true',
  };

  const firstPage = await fetchJson(`${ACCESS_FOOD_API_BASE_URL}LocationSearch?${new URLSearchParams({
    ...baseParams,
    page: '0',
  })}`);

  const totalResults = Number(firstPage?.item5 || toArray(firstPage?.item1).length);
  const totalPages = Math.max(1, Math.ceil(totalResults / ACCESS_FOOD_PAGE_SIZE));
  const remainingPages = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => fetchJson(
          `${ACCESS_FOOD_API_BASE_URL}LocationSearch?${new URLSearchParams({
            ...baseParams,
            page: String(index + 1),
          })}`
        ))
      )
    : [];

  const locations = [];
  const seenLocationIds = new Set();
  for (const page of [firstPage, ...remainingPages]) {
    for (const location of toArray(page?.item1)) {
      if (!location?.locationId || seenLocationIds.has(location.locationId)) continue;
      seenLocationIds.add(location.locationId);
      locations.push(location);
    }
  }

  if (!locations.length) {
    return [];
  }

  const locationIdChunks = chunkArray(locations.map((location) => location.locationId), 25);
  const locationRegionIdChunks = chunkArray(
    locations.map((location) => `${location.locationId}|${location.regionId || regionMap.regionId}`),
    25
  );

  const [servicesBatches, schedulesBatches] = await Promise.all([
    Promise.all(locationRegionIdChunks.map((chunk) => fetchJson(
      `${ACCESS_FOOD_API_BASE_URL}LocationServices?${new URLSearchParams({
        LocationIds: chunk.join(','),
        PreviewMode: 'false',
        MapRegionId: String(regionMap.regionId),
      })}`
    ))),
    Promise.all(locationIdChunks.map((chunk) => fetchJson(
      `${ACCESS_FOOD_API_BASE_URL}LocationServiceSchedules?${new URLSearchParams({
        LocationIds: chunk.join(','),
        MapRegionId: String(regionMap.regionId),
      })}`
    ))),
  ]);

  const servicesResponse = servicesBatches.flatMap((batch) => toArray(batch));
  const schedulesResponse = schedulesBatches.flatMap((batch) => toArray(batch));

  const servicesByLocation = new Map();
  for (const service of toArray(servicesResponse)) {
    if (!service?.locationId) continue;
    if (!servicesByLocation.has(service.locationId)) {
      servicesByLocation.set(service.locationId, []);
    }
    servicesByLocation.get(service.locationId).push(service);
  }

  const schedulesByLocation = new Map();
  for (const schedule of toArray(schedulesResponse)) {
    if (!schedule?.locationId) continue;
    if (!schedulesByLocation.has(schedule.locationId)) {
      schedulesByLocation.set(schedule.locationId, []);
    }
    schedulesByLocation.get(schedule.locationId).push(schedule);
  }

  const sourceDomain = extractDomain(providerConfig.sourceUrl) || 'accessfood.org';

  return locations.map((location) => {
    const services = servicesByLocation.get(location.locationId) || [];
    const serviceSchedules = schedulesByLocation.get(location.locationId) || [];

    return {
      query: providerConfig.label,
      url: buildAccessFoodRecordUrl(location.locationId),
      title: normalizeWhitespace(location.locationName || ''),
      snippet: buildAccessFoodDescription(location, services),
      domain: sourceDomain,
      provider: 'accessfood',
      accessFoodData: {
        providerConfig,
        regionMap,
        location,
        services,
        serviceSchedules,
      },
    };
  });
}

async function fetchSearchResults(region) {
  const officialProvider = getOfficialRegionProvider(region);
  if (officialProvider) {
    try {
      const officialResults = await fetchAccessFoodSearchResults(region, officialProvider);
      if (officialResults.length > 0) {
        return officialResults;
      }
    } catch (error) {
      console.error(`Official food resource discovery failed for ${regionLabel(region)}:`, error.message);
    }
  }

  const label = regionLabel(region);
  const configuredQueries = Array.isArray(region.searchQueries) ? region.searchQueries : [];
  const queries = configuredQueries.length ? configuredQueries : [
    `food bank ${label}`,
    `food pantry ${label}`,
    `free food ${label}`,
    `meal distribution ${label}`,
  ];

  const results = [];
  const seenUrls = new Set();

  for (const query of queries) {
    try {
      const queryResults = await searchQuery(query);
      for (const result of queryResults) {
        const normalized = normalizeUrl(result.url);
        if (!normalized || seenUrls.has(normalized)) continue;

        seenUrls.add(normalized);
        results.push({ ...result, url: normalized });
      }
    } catch (error) {
      console.error(`Food bank discovery query failed for "${query}":`, error.message);
    }
  }

  return results
    .filter((result) => isLikelyFoodResource(result))
    .slice(0, MAX_WEB_CANDIDATES_PER_RUN);
}

function extractJsonLdBlocks(html = '') {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const raw = match[1].trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // Ignore malformed blocks.
    }
  }

  return blocks.flatMap((item) => Array.isArray(item) ? item : [item]);
}

function findStructuredCandidate(blocks = []) {
  const flattened = [];

  for (const item of blocks) {
    if (item?.['@graph']) {
      flattened.push(...item['@graph']);
    } else {
      flattened.push(item);
    }
  }

  for (const item of flattened) {
    const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
    const joinedTypes = types.filter(Boolean).join(' ').toLowerCase();
    const name = normalizeWhitespace(item?.name || '');

    if (!name) continue;
    if (!/(organization|ngo|place|localbusiness|foodestablishment)/i.test(joinedTypes)) continue;

    const rawAddress = item?.address;
    const addressText = typeof rawAddress === 'string'
      ? rawAddress
      : [rawAddress?.streetAddress, rawAddress?.addressLocality, rawAddress?.addressRegion, rawAddress?.postalCode]
        .filter(Boolean)
        .join(', ');
    const parsedAddress = parseAddressString(addressText);

    return {
      name,
      description: normalizeWhitespace(item?.description || ''),
      phone: normalizeWhitespace(item?.telephone || ''),
      email: normalizeWhitespace(item?.email || ''),
      website: normalizeWhitespace(item?.url || ''),
      address: parsedAddress.address,
      city: pickFirst(rawAddress?.addressLocality, parsedAddress.city),
    state: pickFirst(rawAddress?.addressRegion, parsedAddress.state),
      zipCode: pickFirst(rawAddress?.postalCode, parsedAddress.zipCode),
      latitude: typeof item?.geo?.latitude === 'number' ? item.geo.latitude : null,
      longitude: typeof item?.geo?.longitude === 'number' ? item.geo.longitude : null,
      hours: formatOpeningHoursSpec(item?.openingHoursSpecification) || formatOpeningHoursStrings(item?.openingHours),
      confidence: 0.78,
    };
  }

  return null;
}

function extractHeuristicCandidate(result, text, title) {
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || null;
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  const addressBlock = text.match(/\b\d{1,6}\s+[A-Za-z0-9.#'’\- ]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/)?.[0] || null;
  const parsedAddress = parseAddressString(addressBlock);
  const canonicalName = normalizeWhitespace(title.split('|')[0]?.split(' - ')[0] || result.title);

  return {
    name: canonicalName || null,
    description: normalizeWhitespace(result.snippet || text.slice(0, 220)),
    phone,
    email,
    website: result.url,
    address: parsedAddress.address,
    city: parsedAddress.city,
    state: parsedAddress.state,
    zipCode: parsedAddress.zipCode,
    confidence: isLikelyFoodResource({ title, snippet: result.snippet, text }) ? 0.52 : 0.3,
  };
}

function stripCodeFence(value = '') {
  return String(value).replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function extractJsonObject(value = '') {
  const stripped = stripCodeFence(value);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in AI response');
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

async function extractCandidateWithAI(result, text, structuredData, region) {
  if (aiClient.provider === 'none') return null;

  const prompt = `Extract structured food resource data from this webpage.

Return JSON only with this shape:
{
  "isFoodResource": true,
  "name": "string or null",
  "description": "string or null",
  "phone": "string or null",
  "email": "string or null",
  "website": "string or null",
  "address": "string or null",
  "city": "string or null",
  "state": "string or null",
  "zipCode": "string or null",
  "hours": {
    "monday": "9:00 AM - 5:00 PM"
  } | null,
  "latitude": 0 | null,
  "longitude": 0 | null,
  "eligibilityNotes": "string or null",
  "confidence": 0.0,
  "reason": "short explanation"
}

Rules:
- Only set isFoodResource=true if the page clearly represents a food bank, pantry, meal distribution, or emergency food provider.
- Keep confidence between 0 and 1.
- Use the region as context: ${regionLabel(region)}.
- Preserve exact phones, addresses, and hours when present.

Search result title: ${result.title}
Search result snippet: ${result.snippet}
URL: ${result.url}
Structured data guess: ${JSON.stringify(structuredData || {})}
Page text:
${text.slice(0, PAGE_TEXT_LIMIT)}`;

  const response = await aiClient.chat({
    prompt,
    systemPrompt: 'You extract precise nonprofit and food-bank directory data. Return JSON only.',
    temperature: 0.1,
    maxTokens: 1200,
    model: 'gpt-4o-mini',
  });

  if (!response.success || !response.text) return null;

  try {
    return extractJsonObject(response.text);
  } catch (error) {
    console.error('Failed to parse food bank extraction JSON:', error.message);
    return null;
  }
}

function mergeCandidateData(result, structuredData, heuristicData, aiData, region, contentHash) {
  const addressSource = pickFirst(aiData?.address, structuredData?.address, heuristicData?.address);
  const parsedAddress = parseAddressString(addressSource);
  const canonicalName = normalizeWhitespace(
    pickFirst(aiData?.name, structuredData?.name, heuristicData?.name, result.title)
  );
  const city = pickFirst(aiData?.city, structuredData?.city, heuristicData?.city, region.city);
  const state = pickFirst(aiData?.state, structuredData?.state, heuristicData?.state, region.state);
  const website = normalizeUrl(pickFirst(aiData?.website, structuredData?.website, heuristicData?.website, result.url));
  const sourceDomain = extractDomain(result.url);
  const websiteDomain = extractDomain(website);
  const isFoodResource = aiData?.isFoodResource ?? isLikelyFoodResource({
    title: result.title,
    snippet: result.snippet,
    text: `${structuredData?.description || ''} ${heuristicData?.description || ''}`,
  });
  const sourceTrust = websiteDomain && sourceDomain === websiteDomain
    ? 'official'
    : TRUSTED_DIRECTORY_DOMAINS.has(sourceDomain)
      ? 'trusted_directory'
      : 'secondary';

  return {
    canonicalName,
    normalizedName: normalizeText(canonicalName),
    description: normalizeWhitespace(pickFirst(aiData?.description, structuredData?.description, heuristicData?.description) || ''),
    phone: normalizeWhitespace(pickFirst(aiData?.phone, structuredData?.phone, heuristicData?.phone) || ''),
    normalizedPhone: normalizePhone(pickFirst(aiData?.phone, structuredData?.phone, heuristicData?.phone)),
    email: normalizeWhitespace(pickFirst(aiData?.email, structuredData?.email, heuristicData?.email) || ''),
    website,
    websiteDomain,
    address: pickFirst(parsedAddress.address, structuredData?.address, heuristicData?.address),
    city: normalizeWhitespace(city || ''),
    state: normalizeStateValue(state || ''),
    zipCode: normalizeWhitespace(pickFirst(aiData?.zipCode, structuredData?.zipCode, heuristicData?.zipCode) || ''),
    latitude: Number.isFinite(aiData?.latitude) ? aiData.latitude : (Number.isFinite(structuredData?.latitude) ? structuredData.latitude : null),
    longitude: Number.isFinite(aiData?.longitude) ? aiData.longitude : (Number.isFinite(structuredData?.longitude) ? structuredData.longitude : null),
    hours: normalizeHours(aiData?.hours) || normalizeHours(structuredData?.hours) || null,
    eligibilityNotes: normalizeWhitespace(aiData?.eligibilityNotes || ''),
    sourceUrl: result.url,
    sourceDomain,
    sourceTrust,
    isFoodResource,
    confidence: Math.max(
      Number(aiData?.confidence || 0),
      Number(structuredData?.confidence || 0),
      Number(heuristicData?.confidence || 0)
    ),
    extractionReason: normalizeWhitespace(aiData?.reason || ''),
    contentHash,
  };
}

async function fetchCandidatePage(result, region) {
  if (result.provider === 'accessfood' && result.accessFoodData) {
    const { providerConfig, location, services, serviceSchedules } = result.accessFoodData;
    const description = buildAccessFoodDescription(location, services);
    const sourceUrl = normalizeUrl(providerConfig.sourceUrl) || normalizeUrl(location.website) || buildAccessFoodRecordUrl(location.locationId);
    const website = normalizeUrl(location.website) || normalizeUrl(providerConfig.sourceUrl);
    const address = [location.address1, location.address2]
      .map((value) => normalizeWhitespace(value || ''))
      .filter(Boolean)
      .join(' ');
    const phone = normalizeWhitespace(
      pickFirst(
        location.phone,
        location.contactPhone,
        ...services.map((service) => service.contactPhone)
      ) || ''
    );
    const email = normalizeWhitespace(
      pickFirst(
        location.contactEmail,
        ...services.map((service) => service.contactEmail)
      ) || ''
    );
    const candidate = {
      canonicalName: normalizeWhitespace(location.locationName || result.title),
      normalizedName: normalizeText(location.locationName || result.title),
      phone: phone || null,
      normalizedPhone: normalizePhone(phone),
      email: email || null,
      website,
      websiteDomain: extractDomain(website),
      address: address || null,
      city: normalizeWhitespace(location.city || region.city || ''),
      state: normalizeStateValue(location.state || region.state || ''),
      zipCode: normalizeWhitespace(location.zipCode || ''),
      description,
      latitude: Number.isFinite(location.latitude) ? Number(location.latitude) : null,
      longitude: Number.isFinite(location.longitude) ? Number(location.longitude) : null,
      hours: buildAccessFoodHours(serviceSchedules),
      eligibilityNotes: buildAccessFoodEligibilityNotes(services, serviceSchedules),
      sourceUrl,
      sourceDomain: extractDomain(sourceUrl) || result.domain,
      sourceTrust: 'official',
      isFoodResource: true,
      confidence: 0.96,
      extractionReason: 'Structured location and schedule data from official AccessFood network API.',
      contentHash: hashText(JSON.stringify({
        location,
        services,
        serviceSchedules,
      })),
    };

    return {
      candidate,
      title: result.title,
      text: description,
      structuredData: null,
    };
  }

  const response = await fetch(result.url, {
    headers: {
      'User-Agent': 'MVOE-FoodBankIndexer/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source (${response.status})`);
  }

  const html = await response.text();
  const title = normalizeWhitespace(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || result.title);
  const text = stripHtml(html).slice(0, PAGE_TEXT_LIMIT);
  const structuredData = findStructuredCandidate(extractJsonLdBlocks(html));
  const contentHash = hashText(text);

  const cachedSource = await prisma.foodBankSourceRecord.findFirst({
    where: {
      url: result.url,
      contentHash,
      extractedData: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (cachedSource?.extractedData) {
    return {
      candidate: {
        ...cachedSource.extractedData,
        contentHash,
      },
      title,
      text,
      structuredData,
    };
  }

  const heuristicData = extractHeuristicCandidate(result, text, title);
  let aiData = null;

  if (isLikelyFoodResource({ title, snippet: result.snippet, text })) {
    aiData = await extractCandidateWithAI(result, text, structuredData, region);
  }

  return {
    candidate: mergeCandidateData(result, structuredData, heuristicData, aiData, region, contentHash),
    title,
    text,
    structuredData,
  };
}

function buildEntryPayload(candidate, regionId) {
  return {
    regionId,
    canonicalName: candidate.canonicalName,
    normalizedName: candidate.normalizedName,
    fingerprint: buildFingerprint(candidate),
    sourceUrl: candidate.sourceUrl,
    sourceDomain: candidate.sourceDomain,
    website: candidate.website,
    websiteDomain: candidate.websiteDomain,
    phone: candidate.phone || null,
    normalizedPhone: candidate.normalizedPhone,
    email: candidate.email || null,
    address: candidate.address || null,
    city: candidate.city || null,
    state: candidate.state || null,
    zipCode: candidate.zipCode || null,
    latitude: Number.isFinite(candidate.latitude) ? candidate.latitude : null,
    longitude: Number.isFinite(candidate.longitude) ? candidate.longitude : null,
    hours: hoursToJsonString(candidate.hours),
    description: candidate.description || null,
    eligibilityNotes: candidate.eligibilityNotes || null,
    metadata: {
      confidence: candidate.confidence,
      sourceTrust: candidate.sourceTrust,
      extractionReason: candidate.extractionReason,
      contentHash: candidate.contentHash,
    },
  };
}

function buildOrganizationPayload(candidate) {
  const payload = {};

  if (candidate.canonicalName) payload.name = candidate.canonicalName;
  if (candidate.description) payload.description = candidate.description;
  if (candidate.address) payload.address = candidate.address;
  if (candidate.city) payload.city = candidate.city;
  if (candidate.state) payload.state = candidate.state;
  if (candidate.zipCode) payload.zipCode = candidate.zipCode;
  if (candidate.phone) payload.phone = candidate.phone;
  if (candidate.email) payload.email = candidate.email;
  if (candidate.website) payload.website = candidate.website;
  if (Number.isFinite(candidate.latitude)) payload.latitude = candidate.latitude;
  if (Number.isFinite(candidate.longitude)) payload.longitude = candidate.longitude;
  if (candidate.hours) payload.hours = hoursToJsonString(candidate.hours);

  return payload;
}

function snapshotOrganization(organization) {
  if (!organization) return null;

  return {
    name: organization.name || null,
    description: organization.description || null,
    address: organization.address || null,
    city: organization.city || null,
    state: organization.state || null,
    zipCode: organization.zipCode || null,
    phone: organization.phone || null,
    email: organization.email || null,
    website: normalizeUrl(organization.website),
    latitude: Number.isFinite(organization.latitude) ? organization.latitude : null,
    longitude: Number.isFinite(organization.longitude) ? organization.longitude : null,
    hours: hoursToJsonString(normalizeHours(organization.hours)),
  };
}

function diffOrganizationPayload(previous = {}, next = {}) {
  const changedFields = [];

  for (const [key, value] of Object.entries(next)) {
    const prevValue = previous?.[key] ?? null;
    if (key === 'website') {
      if (normalizeUrl(prevValue) !== normalizeUrl(value)) changedFields.push(key);
      continue;
    }
    if (key === 'hours') {
      if (hoursToJsonString(normalizeHours(prevValue)) !== hoursToJsonString(normalizeHours(value))) {
        changedFields.push(key);
      }
      continue;
    }
    if (Number.isFinite(value)) {
      if (Number(prevValue) !== Number(value)) changedFields.push(key);
      continue;
    }
    if (normalizeWhitespace(prevValue || '') !== normalizeWhitespace(value || '')) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

function canAutoCreateOrganization(candidate, payload) {
  return candidate.sourceTrust === 'official'
    && candidate.confidence >= 0.75
    && Boolean(payload.name)
    && Boolean(payload.city)
    && Boolean(payload.state)
    && Boolean(
      payload.website
      || payload.phone
      || (
        payload.address
        && Number.isFinite(payload.latitude)
        && Number.isFinite(payload.longitude)
      )
    );
}

function canAutoApplyUpdate(candidate, changedFields) {
  return candidate.sourceTrust === 'official'
    && candidate.confidence >= 0.68
    && changedFields.length > 0
    && changedFields.every((field) => AUTO_APPLY_FIELDS.has(field));
}

async function clearOrganizationCaches(organizationId = null) {
  try {
    if (organizationId) {
      await cacheService.del(`organization:${organizationId}`);
    }
    await cacheService.delPattern('organizations:*');
  } catch (error) {
    console.warn('Food bank directory cache invalidation skipped:', error.message);
  }
}

async function findMatchingEntry(candidate, regionId) {
  if (candidate.websiteDomain) {
    const entryBySite = await prisma.foodBankDirectoryEntry.findFirst({
      where: {
        regionId,
        websiteDomain: candidate.websiteDomain,
      },
      include: { organization: true },
    });
    if (entryBySite) return entryBySite;
  }

  if (candidate.normalizedPhone) {
    const entryByPhone = await prisma.foodBankDirectoryEntry.findFirst({
      where: {
        regionId,
        normalizedPhone: candidate.normalizedPhone,
      },
      include: { organization: true },
    });
    if (entryByPhone) return entryByPhone;
  }

  const entryByName = await prisma.foodBankDirectoryEntry.findFirst({
    where: {
      regionId,
      normalizedName: candidate.normalizedName,
    },
    include: { organization: true },
  });

  return entryByName;
}

async function findMatchingOrganization(candidate) {
  if (candidate.website) {
    const orgBySite = await prisma.organization.findFirst({
      where: {
        type: 'food_bank',
        website: candidate.website,
      },
    });
    if (orgBySite) return orgBySite;
  }

  if (candidate.phone) {
    const orgByPhone = await prisma.organization.findFirst({
      where: {
        type: 'food_bank',
        phone: candidate.phone,
      },
    });
    if (orgByPhone) return orgByPhone;
  }

  return prisma.organization.findFirst({
    where: {
      type: 'food_bank',
      name: candidate.canonicalName,
      city: candidate.city || undefined,
      state: candidate.state || undefined,
    },
  });
}

async function createChangeIfNeeded({
  entryId,
  runId,
  changeType,
  changedFields,
  previousData,
  nextData,
  reviewStatus,
  notes = null,
}) {
  if (changeType !== 'new' && changedFields.length === 0) {
    return null;
  }

  const latestPending = await prisma.foodBankDirectoryChange.findFirst({
    where: {
      entryId,
      reviewStatus: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });

  if (
    latestPending
    && JSON.stringify(latestPending.nextData || {}) === JSON.stringify(nextData || {})
    && JSON.stringify(latestPending.changedFields || []) === JSON.stringify(changedFields || [])
  ) {
    return latestPending;
  }

  return prisma.foodBankDirectoryChange.create({
    data: {
      entryId,
      runId,
      changeType,
      changedFields,
      previousData,
      nextData,
      reviewStatus,
      notes,
    },
  });
}

async function recordSource({
  regionId,
  runId,
  entryId,
  result,
  candidate,
}) {
  return prisma.foodBankSourceRecord.create({
    data: {
      regionId,
      runId,
      entryId,
      query: result.query,
      title: result.title,
      url: result.url,
      domain: result.domain,
      snippet: result.snippet,
      contentHash: candidate.contentHash,
      extractedData: candidate,
    },
  });
}

class FoodBankDirectoryService {
  parseRegionsConfig() {
    return config.foodBankDirectoryRegions
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [city, state, country = 'US'] = item.split(',').map((part) => part.trim());
        if (!city || !state) return null;
        return { city, state, country };
      })
      .filter(Boolean);
  }

  async syncRegionsFromConfig() {
    const regions = this.parseRegionsConfig();

    for (const region of regions) {
      await prisma.foodBankIndexRegion.upsert({
        where: {
          city_state_country: {
            city: region.city,
            state: region.state,
            country: region.country,
          },
        },
        create: {
          ...region,
          nextRunAt: new Date(),
        },
        update: {},
      });
    }

    return this.listRegions();
  }

  async listRegions() {
    return prisma.foodBankIndexRegion.findMany({
      orderBy: [
        { state: 'asc' },
        { city: 'asc' },
      ],
      include: {
        _count: {
          select: {
            entries: true,
            runs: true,
          },
        },
      },
    });
  }

  async createRegion(data) {
    const region = await prisma.foodBankIndexRegion.create({
      data: {
        city: normalizeWhitespace(data.city),
        state: normalizeStateValue(data.state),
        country: normalizeWhitespace(data.country || 'US').toUpperCase(),
        searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries : null,
        isActive: data.isActive ?? true,
        nextRunAt: new Date(),
      },
    });

    return region;
  }

  async createManualRun({ regionId, initiatedBy = null }) {
    const region = await prisma.foodBankIndexRegion.findUnique({ where: { id: regionId } });
    if (!region) {
      throw new Error('Food bank index region not found');
    }

    return prisma.foodBankIndexRun.create({
      data: {
        regionId,
        status: 'queued',
        runType: 'manual_sync',
        metadata: initiatedBy ? { initiatedBy } : undefined,
      },
    });
  }

  async createScheduledRun(regionId) {
    const region = await prisma.foodBankIndexRegion.findUnique({ where: { id: regionId } });
    if (!region) {
      throw new Error('Food bank index region not found');
    }

    return prisma.foodBankIndexRun.create({
      data: {
        regionId,
        status: 'queued',
        runType: 'weekly_sync',
        metadata: {
          initiatedBy: 'scheduler',
        },
      },
    });
  }

  async attachJobToRun(runId, jobId) {
    return prisma.foodBankIndexRun.update({
      where: { id: runId },
      data: { jobId: String(jobId) },
    });
  }

  async markRegionQueued(regionId) {
    return prisma.foodBankIndexRegion.update({
      where: { id: regionId },
      data: {
        nextRunAt: new Date(Date.now() + (config.foodBankDirectoryRunIntervalHours * 60 * 60 * 1000)),
      },
    });
  }

  async listRuns(limit = 25) {
    return prisma.foodBankIndexRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        region: true,
      },
    });
  }

  async getStatus() {
    const [regions, pendingReviews, activeRuns, latestRuns] = await Promise.all([
      prisma.foodBankIndexRegion.findMany({
        orderBy: [
          { state: 'asc' },
          { city: 'asc' },
        ],
        include: {
          _count: {
            select: {
              entries: true,
            },
          },
        },
      }),
      prisma.foodBankDirectoryChange.count({
        where: { reviewStatus: 'pending' },
      }),
      prisma.foodBankIndexRun.findMany({
        where: { status: { in: ['queued', 'running'] } },
        orderBy: { createdAt: 'desc' },
        include: { region: true },
      }),
      this.listRuns(10),
    ]);

    return {
      pendingReviews,
      regions,
      activeRuns,
      latestRuns,
    };
  }

  async listEntries(filters = {}) {
    const { regionId, reviewStatus, discoveryStatus, limit = 50, offset = 0 } = filters;

    return prisma.foodBankDirectoryEntry.findMany({
      where: {
        ...(regionId ? { regionId } : {}),
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(discoveryStatus ? { discoveryStatus } : {}),
      },
      include: {
        region: true,
        organization: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });
  }

  async listReviewQueue(limit = 100) {
    return prisma.foodBankDirectoryChange.findMany({
      where: { reviewStatus: 'pending' },
      include: {
        entry: {
          include: {
            region: true,
            organization: true,
          },
        },
        run: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
  }

  async approveChange(changeId, userId, notes = null) {
    const change = await prisma.foodBankDirectoryChange.findUnique({
      where: { id: changeId },
      include: {
        entry: true,
      },
    });

    if (!change) {
      throw new Error('Directory change not found');
    }

    if (change.reviewStatus !== 'pending') {
      return change;
    }

    const payload = change.nextData || {};
    let organizationId = change.entry.organizationId;

    if (!organizationId) {
      const created = await prisma.organization.create({
        data: {
          ...payload,
          type: 'food_bank',
          verificationStatus: 'verified',
          isActive: true,
        },
      });
      organizationId = created.id;
    } else if (Object.keys(payload).length > 0) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: payload,
      });
    }

    await prisma.foodBankDirectoryEntry.update({
      where: { id: change.entryId },
      data: {
        organizationId,
        reviewStatus: 'approved',
        discoveryStatus: 'indexed',
        lastVerifiedAt: new Date(),
        nextReviewAt: new Date(Date.now() + REVIEW_INTERVAL_MS),
      },
    });

    const updatedChange = await prisma.foodBankDirectoryChange.update({
      where: { id: changeId },
      data: {
        reviewStatus: 'approved',
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: notes || change.notes,
      },
    });

    await clearOrganizationCaches(organizationId);
    return updatedChange;
  }

  async rejectChange(changeId, userId, notes = null) {
    const change = await prisma.foodBankDirectoryChange.findUnique({
      where: { id: changeId },
    });

    if (!change) {
      throw new Error('Directory change not found');
    }

    if (change.reviewStatus !== 'pending') {
      return change;
    }

    await prisma.foodBankDirectoryEntry.update({
      where: { id: change.entryId },
      data: {
        reviewStatus: 'rejected',
      },
    });

    return prisma.foodBankDirectoryChange.update({
      where: { id: changeId },
      data: {
        reviewStatus: 'rejected',
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: notes || change.notes,
      },
    });
  }

  async getDueRegions() {
    return prisma.foodBankIndexRegion.findMany({
      where: {
        isActive: true,
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: new Date() } },
        ],
      },
      orderBy: [
        { nextRunAt: 'asc' },
        { updatedAt: 'asc' },
      ],
    });
  }

  async runSync({ regionId, runId = null, onProgress = null }) {
    const region = await prisma.foodBankIndexRegion.findUnique({ where: { id: regionId } });
    if (!region) {
      throw new Error('Food bank index region not found');
    }

    const run = runId
      ? await prisma.foodBankIndexRun.update({
          where: { id: runId },
          data: {
            status: 'running',
            startedAt: new Date(),
            errorMessage: null,
          },
        })
      : await prisma.foodBankIndexRun.create({
          data: {
            regionId,
            status: 'running',
            runType: 'manual_sync',
            startedAt: new Date(),
          },
        });

    const counts = {
      discoveredCount: 0,
      newCount: 0,
      changedCount: 0,
      autoAppliedCount: 0,
      reviewCount: 0,
      skippedCount: 0,
    };

    const reportProgress = async (message) => {
      if (typeof onProgress === 'function') {
        await onProgress(message);
      }
    };

    try {
      await reportProgress(`Searching for food resources in ${regionLabel(region)}`);
      const searchResults = await fetchSearchResults(region);
      counts.discoveredCount = searchResults.length;

      for (const [index, result] of searchResults.entries()) {
        await reportProgress(`Checking source ${index + 1} of ${searchResults.length}: ${result.title}`);

        try {
          const { candidate } = await fetchCandidatePage(result, region);
          if (!candidate.isFoodResource || !candidate.canonicalName) {
            counts.skippedCount += 1;
            continue;
          }

          const entryPayload = buildEntryPayload(candidate, region.id);
          const orgPayload = buildOrganizationPayload(candidate);
          const matchedEntry = await findMatchingEntry(candidate, region.id);
          const matchedOrganization = matchedEntry?.organization || await findMatchingOrganization(candidate);
          const now = new Date();

          let entry;
          if (!matchedEntry) {
            entry = await prisma.foodBankDirectoryEntry.create({
              data: {
                ...entryPayload,
                organizationId: matchedOrganization?.id || null,
                reviewStatus: matchedOrganization ? 'approved' : 'pending',
                discoveryStatus: 'indexed',
                firstSeenAt: now,
                lastSeenAt: now,
                nextReviewAt: new Date(now.getTime() + REVIEW_INTERVAL_MS),
              },
            });
          } else {
            entry = await prisma.foodBankDirectoryEntry.update({
              where: { id: matchedEntry.id },
              data: {
                ...entryPayload,
                organizationId: matchedEntry.organizationId || matchedOrganization?.id || null,
                lastSeenAt: now,
                nextReviewAt: new Date(now.getTime() + REVIEW_INTERVAL_MS),
              },
            });
          }

          await recordSource({
            regionId: region.id,
            runId: run.id,
            entryId: entry.id,
            result,
            candidate,
          });

          const previousApproved = snapshotOrganization(matchedOrganization);
          const changedFields = diffOrganizationPayload(previousApproved || {}, orgPayload);
          const changeType = matchedOrganization ? 'updated' : 'new';

          if (!matchedOrganization && canAutoCreateOrganization(candidate, orgPayload)) {
            const createdOrganization = await prisma.organization.create({
              data: {
                ...orgPayload,
                type: 'food_bank',
                verificationStatus: 'verified',
                isActive: true,
              },
            });

            await prisma.foodBankDirectoryEntry.update({
              where: { id: entry.id },
              data: {
                organizationId: createdOrganization.id,
                reviewStatus: 'auto_applied',
                discoveryStatus: 'indexed',
                lastVerifiedAt: now,
              },
            });

            await createChangeIfNeeded({
              entryId: entry.id,
              runId: run.id,
              changeType,
              changedFields: Object.keys(orgPayload),
              previousData: null,
              nextData: orgPayload,
              reviewStatus: 'auto_applied',
              notes: 'Auto-created from official source',
            });

            counts.newCount += 1;
            counts.autoAppliedCount += 1;
            await clearOrganizationCaches(createdOrganization.id);
            continue;
          }

          if (matchedOrganization && changedFields.length === 0) {
            await prisma.foodBankDirectoryEntry.update({
              where: { id: entry.id },
              data: {
                reviewStatus: 'approved',
                discoveryStatus: 'indexed',
                lastVerifiedAt: now,
              },
            });
            counts.skippedCount += 1;
            continue;
          }

          if (matchedOrganization && canAutoApplyUpdate(candidate, changedFields)) {
            await prisma.organization.update({
              where: { id: matchedOrganization.id },
              data: orgPayload,
            });

            await prisma.foodBankDirectoryEntry.update({
              where: { id: entry.id },
              data: {
                reviewStatus: 'auto_applied',
                discoveryStatus: 'indexed',
                lastVerifiedAt: now,
              },
            });

            await createChangeIfNeeded({
              entryId: entry.id,
              runId: run.id,
              changeType,
              changedFields,
              previousData: previousApproved,
              nextData: orgPayload,
              reviewStatus: 'auto_applied',
              notes: 'Auto-applied from official source',
            });

            counts.changedCount += 1;
            counts.autoAppliedCount += 1;
            await clearOrganizationCaches(matchedOrganization.id);
            continue;
          }

          const change = await createChangeIfNeeded({
            entryId: entry.id,
            runId: run.id,
            changeType,
            changedFields: matchedOrganization ? changedFields : Object.keys(orgPayload),
            previousData: previousApproved,
            nextData: orgPayload,
            reviewStatus: 'pending',
          });

          await prisma.foodBankDirectoryEntry.update({
            where: { id: entry.id },
            data: {
              reviewStatus: change ? 'pending' : entry.reviewStatus,
              discoveryStatus: change ? 'pending_review' : entry.discoveryStatus,
            },
          });

          if (changeType === 'new') {
            counts.newCount += 1;
          } else if (changedFields.length > 0) {
            counts.changedCount += 1;
          } else {
            counts.skippedCount += 1;
          }

          if (change) {
            counts.reviewCount += 1;
          }
        } catch (error) {
          console.error(`Food bank source processing failed for ${result.url}:`, error.message);
          counts.skippedCount += 1;
        }
      }

      const completedAt = new Date();
      await prisma.foodBankIndexRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt,
          ...counts,
          metadata: {
            region: regionLabel(region),
            provider: config.foodBankDirectorySearchProvider,
          },
        },
      });

      await prisma.foodBankIndexRegion.update({
        where: { id: region.id },
        data: {
          lastRunAt: completedAt,
          nextRunAt: new Date(completedAt.getTime() + (config.foodBankDirectoryRunIntervalHours * 60 * 60 * 1000)),
        },
      });

      await reportProgress(`Finished food bank sync for ${regionLabel(region)}`);
      return {
        runId: run.id,
        region: regionLabel(region),
        ...counts,
      };
    } catch (error) {
      await prisma.foodBankIndexRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
          ...counts,
        },
      });
      throw error;
    }
  }
}

const foodBankDirectoryService = new FoodBankDirectoryService();

export default foodBankDirectoryService;
export { REVIEW_INTERVAL_MS, regionLabel };
