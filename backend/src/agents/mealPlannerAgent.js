// Community Meal Planner Agent - structured meal planning with live price research when available
import ZenClient from '../mcp/zenClient.js';
import { recordAgentActivity } from '../services/agentActivityService.js';
import pricingIndexService from '../services/pricingIndexService.js';

const DEFAULT_STORES = ['Costco', 'Walmart', 'H-E-B'];
const MAX_PRICING_TARGETS = 8;

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

function extractJsonObject(rawText = '') {
  const jsonMatch = String(rawText).match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI failed to return valid JSON');
  }

  const cleaned = jsonMatch[0]
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
}

export function extractExecutionPlanJson(rawText) {
  return extractJsonObject(rawText);
}

function sanitizeStringList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeWhitespace(value || ''))
      .filter(Boolean)
  ));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatCurrency(value) {
  return `$${roundCurrency(value).toFixed(2)}`;
}

function normalizeStoreName(store) {
  const value = normalizeWhitespace(store || '').toLowerCase();
  if (!value) return null;
  if (value === 'heb' || value === 'h-e-b' || value === 'h e b') return 'H-E-B';
  if (value === 'costco') return 'Costco';
  if (value === 'walmart') return 'Walmart';
  if (value === "sam's club" || value === 'sams club' || value === 'sams') return "Sam's Club";
  return normalizeWhitespace(store);
}

function normalizeStoreList(values, fallback = DEFAULT_STORES) {
  const normalized = Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeStoreName(value))
      .filter(Boolean)
  ));

  return normalized.length ? normalized : [...fallback];
}

function inferEventType(text = '') {
  const source = text.toLowerCase();
  if (/(barbecue|bbq|cookout|cook out)/i.test(source)) return 'barbecue';
  if (/potluck/i.test(source)) return 'potluck';
  if (/(distribution|food box|food boxes|pantry)/i.test(source)) return 'distribution';
  if (/(breakfast|brunch)/i.test(source)) return 'breakfast';
  if (/(lunch)/i.test(source)) return 'lunch';
  if (/(dinner|supper)/i.test(source)) return 'dinner';
  return 'community_meal';
}

function fallbackParseFromText(text = '') {
  const peopleMatch = text.match(/(\d+)\s+(?:people|guests|volunteers|attendees|adults|kids|families)\b/i);
  const dollarMatch = text.match(/\$(\d+(?:\.\d{1,2})?)/);
  const budgetPhraseMatch = text.match(/budget(?:\s+of)?\s+(\d+(?:\.\d{1,2})?)/i);
  const stores = [];

  if (/costco/i.test(text)) stores.push('Costco');
  if (/walmart/i.test(text)) stores.push('Walmart');
  if (/\bheb\b|h-e-b/i.test(text)) stores.push('H-E-B');

  return {
    people: peopleMatch ? Number(peopleMatch[1]) : 0,
    budget: dollarMatch ? Number(dollarMatch[1]) : (budgetPhraseMatch ? Number(budgetPhraseMatch[1]) : 0),
    dietary: [],
    allergens: [],
    preferredFoods: [],
    preferredMeals: [],
    excludedFoods: [],
    preferredStores: stores.length ? stores : DEFAULT_STORES,
    eventType: inferEventType(text),
    location: '',
    occasion: '',
    servingStyle: inferEventType(text) === 'potluck' ? 'potluck' : 'buffet',
    notes: '',
  };
}

export function normalizeParsedRequest(parsedRequest = {}, { defaultStores = DEFAULT_STORES } = {}) {
  return {
    people: Number(parsedRequest.people || 0),
    budget: Number(parsedRequest.budget || 0),
    dietary: sanitizeStringList(parsedRequest.dietary),
    allergens: sanitizeStringList(parsedRequest.allergens),
    preferredFoods: sanitizeStringList(parsedRequest.preferredFoods),
    preferredMeals: sanitizeStringList(parsedRequest.preferredMeals),
    excludedFoods: sanitizeStringList(parsedRequest.excludedFoods),
    preferredStores: normalizeStoreList(parsedRequest.preferredStores, defaultStores),
    eventType: normalizeWhitespace(parsedRequest.eventType || ''),
    location: normalizeWhitespace(parsedRequest.location || ''),
    occasion: normalizeWhitespace(parsedRequest.occasion || ''),
    servingStyle: normalizeWhitespace(parsedRequest.servingStyle || ''),
    notes: normalizeWhitespace(parsedRequest.notes || ''),
  };
}

export function buildMealPlanRequirements(parsedRequest = {}, stepParams = {}) {
  const normalizedParsed = normalizeParsedRequest(parsedRequest, { defaultStores: [] });
  const normalizedStep = normalizeParsedRequest(stepParams, { defaultStores: [] });

  return {
    ...normalizedParsed,
    ...normalizedStep,
    people: normalizedStep.people || normalizedParsed.people,
    budget: normalizedStep.budget || normalizedParsed.budget,
    dietary: normalizedStep.dietary.length ? normalizedStep.dietary : normalizedParsed.dietary,
    allergens: normalizedStep.allergens.length ? normalizedStep.allergens : normalizedParsed.allergens,
    preferredFoods: normalizedStep.preferredFoods.length ? normalizedStep.preferredFoods : normalizedParsed.preferredFoods,
    preferredMeals: normalizedStep.preferredMeals.length ? normalizedStep.preferredMeals : normalizedParsed.preferredMeals,
    excludedFoods: normalizedStep.excludedFoods.length ? normalizedStep.excludedFoods : normalizedParsed.excludedFoods,
    preferredStores: normalizedStep.preferredStores.length
      ? normalizedStep.preferredStores
      : (normalizedParsed.preferredStores.length ? normalizedParsed.preferredStores : [...DEFAULT_STORES]),
    eventType: normalizedStep.eventType || normalizedParsed.eventType,
    location: normalizedStep.location || normalizedParsed.location,
    occasion: normalizedStep.occasion || normalizedParsed.occasion,
    servingStyle: normalizedStep.servingStyle || normalizedParsed.servingStyle,
    notes: normalizedStep.notes || normalizedParsed.notes,
  };
}

function sanitizeBreakdownRows(values) {
  return (Array.isArray(values) ? values : [])
    .map((row) => ({
      label: normalizeWhitespace(row?.label || ''),
      formula: normalizeWhitespace(row?.formula || ''),
      result: normalizeWhitespace(row?.result || ''),
    }))
    .filter((row) => row.label && row.result);
}

function sanitizeMenuItems(menuItems = [], targetServings = 0) {
  return (Array.isArray(menuItems) ? menuItems : [])
    .map((item) => ({
      dish: normalizeWhitespace(item?.dish || ''),
      role: normalizeWhitespace(item?.role || ''),
      serves: safePositiveNumber(item?.serves, targetServings),
      portion: normalizeWhitespace(item?.portion || ''),
      whyItFits: normalizeWhitespace(item?.whyItFits || ''),
      prepNote: normalizeWhitespace(item?.prepNote || ''),
    }))
    .filter((item) => item.dish);
}

function sanitizeShoppingItems(shoppingItems = [], preferredStores = DEFAULT_STORES) {
  return (Array.isArray(shoppingItems) ? shoppingItems : [])
    .map((item, index) => ({
      item: normalizeWhitespace(item?.item || item?.label || `Item ${index + 1}`),
      searchTerm: normalizeWhitespace(item?.searchTerm || item?.item || item?.label || `Item ${index + 1}`),
      amountNeeded: normalizeWhitespace(item?.amountNeeded || ''),
      purchaseUnit: normalizeWhitespace(item?.purchaseUnit || item?.unit || 'unit'),
      purchaseCount: Math.max(1, Math.round(safePositiveNumber(item?.purchaseCount, 1))),
      usedFor: normalizeWhitespace(item?.usedFor || ''),
      preferredStores: normalizeStoreList(item?.preferredStores, preferredStores),
      notes: normalizeWhitespace(item?.notes || ''),
    }))
    .filter((item) => item.item && item.searchTerm);
}

function sanitizeDraftPlan(plan = {}, parsedRequest = {}) {
  const request = normalizeParsedRequest(parsedRequest);
  const guestCount = request.people || safePositiveNumber(plan?.headcountPlan?.guestCount, 0);
  const bufferPercent = clamp(
    Math.round(safePositiveNumber(plan?.headcountPlan?.bufferPercent, guestCount > 0 ? 10 : 0)),
    0,
    25
  );
  const targetServings = Math.max(
    guestCount || 0,
    Math.round(safePositiveNumber(
      plan?.headcountPlan?.targetServings,
      guestCount + Math.max(2, Math.ceil((guestCount || 0) * (bufferPercent || 0.1) / 100))
    ))
  );

  return {
    plannerNote: normalizeWhitespace(plan?.plannerNote || ''),
    strategy: normalizeWhitespace(plan?.strategy || ''),
    headcountPlan: {
      guestCount,
      bufferPercent,
      targetServings,
    },
    menu: sanitizeMenuItems(plan?.menu, targetServings),
    shoppingItems: sanitizeShoppingItems(plan?.shoppingItems, request.preferredStores),
    mathNotes: sanitizeBreakdownRows(plan?.mathNotes),
    prepTimeline: sanitizeStringList(plan?.prepTimeline),
    stretchTips: sanitizeStringList(plan?.stretchTips),
  };
}

function buildFallbackDraftPlan(parsedRequest = {}) {
  const request = normalizeParsedRequest(parsedRequest);
  const guestCount = request.people || 20;
  const bufferPercent = 10;
  const targetServings = guestCount + Math.max(2, Math.ceil(guestCount * 0.1));
  const prefersCookout = request.eventType === 'barbecue'
    || request.eventType === 'potluck'
    || request.preferredFoods.some((food) => /(burger|bbq|barbecue|hot dog|cookout|slider)/i.test(food));

  if (prefersCookout) {
    return {
      plannerNote: 'I built a simple cookout plan that stretches the budget by leaning on bulk protein, one cold side, one crunchy side, and inexpensive drinks.',
      strategy: 'Use one main protein-heavy item, skip expensive extras, and buy most volume from a warehouse or big-box store.',
      headcountPlan: { guestCount, bufferPercent, targetServings },
      menu: [
        {
          dish: 'BBQ chicken sliders',
          role: 'main',
          serves: targetServings,
          portion: '2 sliders per person',
          whyItFits: 'Chicken stretches further than beef while still feeling like a cookout meal.',
          prepNote: 'Slow cook or roast in bulk, then shred and sauce.',
        },
        {
          dish: 'Chips and slaw',
          role: 'side',
          serves: targetServings,
          portion: '1 side scoop plus chips',
          whyItFits: 'Cheap, easy, and adds texture without much labor.',
          prepNote: 'Buy premade slaw or a slaw kit if labor is tight.',
        },
        {
          dish: 'Water and lemonade',
          role: 'drink',
          serves: targetServings,
          portion: '2 drinks per person',
          whyItFits: 'Keeps the drink line simple and inexpensive.',
          prepNote: 'Use bottled water plus one big lemonade batch.',
        },
      ],
      shoppingItems: [
        {
          item: 'Chicken thighs',
          searchTerm: 'chicken thighs bulk family pack',
          amountNeeded: `${Math.max(8, Math.ceil(targetServings * 0.45))} lb raw`,
          purchaseUnit: 'family pack',
          purchaseCount: Math.max(2, Math.ceil(targetServings / 12)),
          usedFor: 'BBQ chicken sliders',
          preferredStores: request.preferredStores,
        },
        {
          item: 'Slider buns',
          searchTerm: 'slider buns pack',
          amountNeeded: `${targetServings * 2} buns`,
          purchaseUnit: 'pack',
          purchaseCount: Math.max(3, Math.ceil((targetServings * 2) / 12)),
          usedFor: 'BBQ chicken sliders',
          preferredStores: request.preferredStores,
        },
        {
          item: 'BBQ sauce',
          searchTerm: 'bbq sauce bulk bottle',
          amountNeeded: '2 large bottles',
          purchaseUnit: 'bottle',
          purchaseCount: 2,
          usedFor: 'BBQ chicken sliders',
          preferredStores: request.preferredStores,
        },
        {
          item: 'Coleslaw mix',
          searchTerm: 'coleslaw mix family size',
          amountNeeded: '3 large bags',
          purchaseUnit: 'bag',
          purchaseCount: 3,
          usedFor: 'Slaw',
          preferredStores: request.preferredStores,
        },
        {
          item: 'Chips variety box',
          searchTerm: 'chips variety box bulk',
          amountNeeded: '2 bulk boxes',
          purchaseUnit: 'box',
          purchaseCount: 2,
          usedFor: 'Chips side',
          preferredStores: request.preferredStores,
        },
        {
          item: 'Bottled water',
          searchTerm: 'bottled water case 24',
          amountNeeded: '3 cases',
          purchaseUnit: 'case',
          purchaseCount: 3,
          usedFor: 'Water',
          preferredStores: request.preferredStores,
        },
        {
          item: 'Lemonade mix',
          searchTerm: 'lemonade mix bulk',
          amountNeeded: '2 mix packs',
          purchaseUnit: 'pack',
          purchaseCount: 2,
          usedFor: 'Lemonade',
          preferredStores: request.preferredStores,
        },
      ],
      mathNotes: [
        {
          label: 'Serving buffer',
          formula: `${guestCount} guests + 10% buffer`,
          result: `${targetServings} total servings`,
        },
      ],
      prepTimeline: [
        'Buy buns, chips, drinks, and sauce first because those are the easiest prices to compare.',
        'Cook and shred the chicken the day before if the kitchen schedule is tight.',
        'Hold slaw cold and set sliders out in waves so food stays fresh.',
      ],
      stretchTips: [
        'Use chicken instead of beef when the budget matters most.',
        'Keep dessert optional unless the remaining budget stays comfortable after pricing.',
      ],
    };
  }

  return {
    plannerNote: 'I built a low-labor crowd meal that is cheap to scale, easy to prep in bulk, and easy to serve.',
    strategy: 'Lean on pasta, sauce, bread, and salad kits because they scale cleanly for community meals.',
    headcountPlan: { guestCount, bufferPercent, targetServings },
    menu: [
      {
        dish: 'Baked pasta',
        role: 'main',
        serves: targetServings,
        portion: '1 generous scoop per person',
        whyItFits: 'Pasta is cost-efficient, filling, and easy to prep ahead.',
        prepNote: 'Bake in hotel pans and hold warm until service.',
      },
      {
        dish: 'Garden salad and garlic bread',
        role: 'side',
        serves: targetServings,
        portion: '1 side salad plus 1 bread piece',
        whyItFits: 'Rounds out the meal without adding much cost.',
        prepNote: 'Buy bagged salad kits if labor is limited.',
      },
      {
        dish: 'Water and iced tea',
        role: 'drink',
        serves: targetServings,
        portion: '2 drinks per person',
        whyItFits: 'Keeps the drink budget under control.',
        prepNote: 'Brew tea in bulk or use tea concentrate.',
      },
    ],
    shoppingItems: [
      {
        item: 'Pasta',
        searchTerm: 'pasta case bulk',
        amountNeeded: `${Math.max(10, Math.ceil(targetServings * 0.5))} lb`,
        purchaseUnit: 'case',
        purchaseCount: 1,
        usedFor: 'Baked pasta',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Marinara sauce',
        searchTerm: 'marinara sauce bulk cans',
        amountNeeded: '6 large cans',
        purchaseUnit: 'case',
        purchaseCount: 1,
        usedFor: 'Baked pasta',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Mozzarella cheese',
        searchTerm: 'mozzarella cheese bulk pack',
        amountNeeded: '2 bulk packs',
        purchaseUnit: 'pack',
        purchaseCount: 2,
        usedFor: 'Baked pasta',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Salad kits',
        searchTerm: 'salad kit family size',
        amountNeeded: '4 kits',
        purchaseUnit: 'kit',
        purchaseCount: 4,
        usedFor: 'Salad',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Garlic bread',
        searchTerm: 'garlic bread pack',
        amountNeeded: '4 packs',
        purchaseUnit: 'pack',
        purchaseCount: 4,
        usedFor: 'Garlic bread',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Bottled water',
        searchTerm: 'bottled water case 24',
        amountNeeded: '3 cases',
        purchaseUnit: 'case',
        purchaseCount: 3,
        usedFor: 'Water',
        preferredStores: request.preferredStores,
      },
      {
        item: 'Tea mix',
        searchTerm: 'iced tea mix bulk',
        amountNeeded: '2 containers',
        purchaseUnit: 'container',
        purchaseCount: 2,
        usedFor: 'Iced tea',
        preferredStores: request.preferredStores,
      },
    ],
    mathNotes: [
      {
        label: 'Serving buffer',
        formula: `${guestCount} guests + 10% buffer`,
        result: `${targetServings} total servings`,
      },
    ],
    prepTimeline: [
      'Buy all dry goods first because they are the least volatile and easiest to compare.',
      'Bake the pasta in batches and hold it warm until service.',
      'Open salad kits just before service so they stay crisp.',
    ],
    stretchTips: [
      'Skip meat in the pasta base if the budget gets tight.',
      'Use water and tea instead of canned soda to preserve budget for the main meal.',
    ],
  };
}

function buildPricingTargetsFromDraft(draftPlan = {}, parsedRequest = {}) {
  const request = normalizeParsedRequest(parsedRequest);
  const seen = new Set();

  return (Array.isArray(draftPlan.shoppingItems) ? draftPlan.shoppingItems : [])
    .slice(0, MAX_PRICING_TARGETS)
    .map((item) => ({
      item: item.item,
      label: item.item,
      query: item.searchTerm,
      stores: normalizeStoreList(item.preferredStores, request.preferredStores),
    }))
    .filter((item) => {
      const key = `${normalizeText(item.query)}|${item.stores.map((store) => normalizeText(store)).join(',')}`;
      if (!item.query || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildPriceLookup(priceResearch = {}) {
  const lookup = new Map();

  for (const result of Array.isArray(priceResearch?.results) ? priceResearch.results : []) {
    const queryKey = normalizeText(result?.query || '');
    const itemKey = normalizeText(result?.item || '');
    if (queryKey) lookup.set(queryKey, result);
    if (itemKey && !lookup.has(itemKey)) lookup.set(itemKey, result);
  }

  return lookup;
}

function buildPricedShoppingList(draftPlan = {}, priceResearch = {}, parsedRequest = {}) {
  const request = normalizeParsedRequest(parsedRequest);
  const priceLookup = buildPriceLookup(priceResearch);

  return (Array.isArray(draftPlan.shoppingItems) ? draftPlan.shoppingItems : []).map((item) => {
    const priceResult = priceLookup.get(normalizeText(item.searchTerm)) || priceLookup.get(normalizeText(item.item));
    const unitPrice = safePositiveNumber(priceResult?.bestPrice, 0) || null;
    const estimatedCost = unitPrice == null
      ? null
      : roundCurrency(unitPrice * Math.max(1, item.purchaseCount || 1));
    const bestStore = normalizeStoreName(priceResult?.bestStore)
      || (unitPrice != null ? (item.preferredStores?.[0] || request.preferredStores[0]) : null);
    const storeOptions = (Array.isArray(priceResult?.prices) ? priceResult.prices : [])
      .map((option) => ({
        store: normalizeStoreName(option.store) || option.store,
        price: roundCurrency(option.price),
        source: option.source || priceResult?.source || 'missing',
        url: option.url || null,
        freshness: option.freshness || 'missing',
      }))
      .filter((option) => option.store && Number.isFinite(option.price));

    return {
      item: item.item,
      amountNeeded: item.amountNeeded,
      purchaseUnit: item.purchaseUnit,
      purchaseCount: item.purchaseCount,
      usedFor: item.usedFor,
      notes: item.notes,
      searchTerm: item.searchTerm,
      store: bestStore,
      unitPrice,
      estimatedCost,
      priceSource: priceResult?.source || 'missing',
      priceFreshness: priceResult?.freshness || 'missing',
      storeOptions,
      livePriceFound: priceResult?.source === 'live_refresh',
      indexedPriceFound: ['index', 'stale_index', 'live_refresh'].includes(priceResult?.source),
      preferredStores: item.preferredStores || request.preferredStores,
      pricingNote: priceResult?.note || null,
    };
  });
}

export function buildStorePlan(pricedShoppingList = []) {
  const grouped = new Map();

  for (const item of pricedShoppingList.filter((row) => row.estimatedCost != null && row.store)) {
    const storeName = normalizeStoreName(item.store) || 'Indexed';
    if (!grouped.has(storeName)) {
      grouped.set(storeName, {
        store: storeName,
        subtotal: 0,
        liveItems: 0,
        indexedItems: 0,
        staleItems: 0,
        items: [],
      });
    }

    const group = grouped.get(storeName);
    group.subtotal = roundCurrency(group.subtotal + roundCurrency(item.estimatedCost || 0));
    if (item.livePriceFound) {
      group.liveItems += 1;
    } else if (item.priceFreshness === 'stale') {
      group.staleItems += 1;
    } else {
      group.indexedItems += 1;
    }
    group.items.push({
      item: item.item,
      amountNeeded: item.amountNeeded,
      purchaseUnit: item.purchaseUnit,
      purchaseCount: item.purchaseCount,
      estimatedCost: roundCurrency(item.estimatedCost || 0),
      priceSource: item.priceSource,
      usedFor: item.usedFor,
    });
  }

  return Array.from(grouped.values()).sort((left, right) => left.subtotal - right.subtotal);
}

export function buildBudgetSnapshot(parsedRequest = {}, pricedShoppingList = []) {
  const request = normalizeParsedRequest(parsedRequest);
  const pricedItems = pricedShoppingList.filter((item) => item.estimatedCost != null);
  const unpricedItems = pricedShoppingList.filter((item) => item.estimatedCost == null);
  const estimatedTotal = roundCurrency(
    pricedItems.reduce((sum, item) => sum + roundCurrency(item.estimatedCost || 0), 0)
  );
  const totalBudget = roundCurrency(request.budget || 0);
  const isComplete = unpricedItems.length === 0;
  const remaining = isComplete ? roundCurrency(totalBudget - estimatedTotal) : null;
  const livePricedItems = pricedShoppingList.filter((item) => item.priceSource === 'live_refresh').length;
  const indexedItems = pricedShoppingList.filter((item) => item.priceSource === 'index').length;
  const stalePricedItems = pricedShoppingList.filter((item) => item.priceSource === 'stale_index').length;

  return {
    totalBudget,
    estimatedTotal,
    remaining,
    budgetPerPerson: request.people > 0 ? roundCurrency(totalBudget / request.people) : 0,
    estimatedCostPerPerson: request.people > 0 ? roundCurrency(estimatedTotal / request.people) : 0,
    isComplete,
    livePricedItems,
    indexedItems,
    stalePricedItems,
    unpricedItems: unpricedItems.length,
    unpricedItemLabels: unpricedItems.map((item) => item.item),
  };
}

function determineBudgetVerdict(budgetSnapshot) {
  if (!budgetSnapshot.isComplete) {
    return 'pricing_incomplete';
  }

  if (budgetSnapshot.remaining >= 0) {
    return budgetSnapshot.remaining <= Math.max(10, budgetSnapshot.totalBudget * 0.08)
      ? 'tight'
      : 'within_budget';
  }

  return 'over_budget';
}

function buildPricingNotes(pricedShoppingList, budgetSnapshot) {
  const notes = [];

  if (budgetSnapshot.livePricedItems > 0) {
    notes.push(`${budgetSnapshot.livePricedItems} shopping lines were refreshed live for this run.`);
  }

  if (budgetSnapshot.indexedItems > 0) {
    notes.push(`${budgetSnapshot.indexedItems} shopping lines are coming from the saved pricing index.`);
  }

  if (budgetSnapshot.stalePricedItems > 0) {
    notes.push(`${budgetSnapshot.stalePricedItems} shopping lines are using stale indexed prices and should be refreshed before buying.`);
  }

  if (budgetSnapshot.unpricedItems > 0) {
    notes.push(
      `${budgetSnapshot.unpricedItems} shopping lines still need indexed pricing: ${budgetSnapshot.unpricedItemLabels.join(', ')}.`
    );
    notes.push('Use Get latest pricing to refresh those lines before trusting the total.');
  }

  const cheapestStore = buildStorePlan(pricedShoppingList)[0];
  if (cheapestStore && budgetSnapshot.isComplete) {
    notes.push(`${cheapestStore.store} is currently the cheapest single-store starting point at ${formatCurrency(cheapestStore.subtotal)}.`);
  }

  return notes;
}

function mergeBreakdownRows(...groups) {
  const seen = new Set();
  const merged = [];

  for (const row of groups.flat()) {
    if (!row?.label || !row?.result) continue;
    const key = `${normalizeText(row.label)}|${normalizeText(row.result)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      label: normalizeWhitespace(row.label),
      formula: normalizeWhitespace(row.formula || ''),
      result: normalizeWhitespace(row.result),
    });
  }

  return merged;
}

function buildFallbackNarrative({ parsedRequest, budgetSnapshot, draftPlan, verdict }) {
  const request = normalizeParsedRequest(parsedRequest);
  const underBudget = verdict !== 'over_budget' && verdict !== 'pricing_incomplete';

  if (!budgetSnapshot.isComplete) {
    return {
      assistantNote: `I have the menu and quantities mapped out, but ${budgetSnapshot.unpricedItems} shopping lines still need indexed pricing before I can give you a trustworthy total.`,
      summaryBullets: [
        'The menu and quantity math are ready, but the price coverage is incomplete.',
        `I can already price ${draftPlan.shoppingItems.length - budgetSnapshot.unpricedItems} of ${draftPlan.shoppingItems.length} shopping lines from the index.`,
        `The plan still targets ${draftPlan.headcountPlan.targetServings} servings so the table does not run short.`,
      ],
      mathBreakdown: [],
      stretchTips: draftPlan.stretchTips,
      nextSteps: [
        'Press Get latest pricing to refresh the missing store lines.',
        'After the missing prices land, review whether the menu still fits the budget.',
        'If the budget gets tight after refresh, cut dessert or extra drinks before cutting the main dish.',
      ],
      questions: [
        'Do you want me to refresh the latest pricing for this exact plan?',
        'Do you want a one-store version to reduce shopping time?',
      ],
    };
  }

  return {
    assistantNote: underBudget
      ? `The current priced total is ${formatCurrency(budgetSnapshot.estimatedTotal)}, which is ${formatCurrency(budgetSnapshot.estimatedCostPerPerson)} per person.`
      : `The current priced total is ${formatCurrency(budgetSnapshot.estimatedTotal)}, so it needs one or two cheaper swaps to fit a ${formatCurrency(request.budget)} budget.`,
    summaryBullets: [
      underBudget
        ? `The current menu stays ${verdict === 'tight' ? 'just inside' : 'comfortably inside'} the budget.`
        : 'The current menu is over budget and needs substitutions or a narrower menu.',
      `The plan targets ${draftPlan.headcountPlan.targetServings} servings so the table does not run short.`,
      `The shopping list is grouped so one person can buy the whole meal without guessing quantities.`,
    ],
    mathBreakdown: [],
    stretchTips: draftPlan.stretchTips,
    nextSteps: [
      'Lock the menu first, then price the core protein, bread, and drinks again right before shopping.',
      'Buy shelf-stable items first and leave produce for the final trip.',
      'If the budget tightens, cut dessert or extra beverages before cutting the main meal.',
    ],
    questions: [
      'Do you want a cheaper menu version, or are you happy with this one?',
      'Do you want the shopping list narrowed to one store only?',
    ],
  };
}

function buildPlainTextSummary(plan) {
  const summaryLines = [
    plan.assistantNote,
    '',
    plan.budget.isComplete
      ? `Current priced total: ${formatCurrency(plan.budget.estimatedTotal)} of ${formatCurrency(plan.budget.totalBudget)}`
      : `Priced subtotal so far: ${formatCurrency(plan.budget.estimatedTotal)} of ${formatCurrency(plan.budget.totalBudget)}`,
    `Current cost per person: ${formatCurrency(plan.budget.estimatedCostPerPerson)}`,
  ];

  if (!plan.budget.isComplete) {
    summaryLines.push(`Pricing still missing for ${plan.budget.unpricedItems} shopping line(s).`);
  }

  if (Array.isArray(plan.summaryBullets) && plan.summaryBullets.length > 0) {
    summaryLines.push('', 'Summary:');
    for (const bullet of plan.summaryBullets) {
      summaryLines.push(`- ${bullet}`);
    }
  }

  if (Array.isArray(plan.menu) && plan.menu.length > 0) {
    summaryLines.push('', 'Menu:');
    for (const item of plan.menu) {
      summaryLines.push(`- ${item.dish}: serves ${item.serves}${item.portion ? `, ${item.portion}` : ''}`);
    }
  }

  return summaryLines.filter(Boolean).join('\n');
}

class MealPlannerAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.zenClient = new ZenClient();
  }

  async runStructuredJsonPrompt(prompt, { model = 'gpt-4o-mini', maxTokens = 2200, temperature = 0.25 } = {}) {
    const response = await this.zenClient.chat({
      prompt,
      model,
      maxTokens,
      temperature,
      systemPrompt: 'You are a structured meal-planning assistant. Return only valid JSON with no markdown.',
    });

    if (!response?.success || !response.text) {
      throw new Error(response?.error || 'Meal planner AI request failed');
    }

    return extractJsonObject(response.text);
  }

  buildRequestParserPrompt(userRequest) {
    return `Parse this meal-planning request into JSON.

Request:
${userRequest}

Requirements:
- Return ONLY valid JSON.
- Pull out headcount, budget, dietary rules, allergy rules, preferred foods, preferred meals, excluded foods, preferred stores, event type, location, serving style, and any notes.
- Preferred stores should only include Costco, Walmart, and H-E-B when they are mentioned.
- If a field is unknown, use an empty string, 0, or [].

Return exactly:
{
  "people": 0,
  "budget": 0,
  "dietary": [],
  "allergens": [],
  "preferredFoods": [],
  "preferredMeals": [],
  "excludedFoods": [],
  "preferredStores": [],
  "eventType": "",
  "location": "",
  "occasion": "",
  "servingStyle": "",
  "notes": ""
}`;
  }

  buildDraftPlanPrompt(parsedRequest, rawRequest) {
    return `You are planning one realistic meal event for a community organizer.

User request:
${rawRequest}

Structured request:
${JSON.stringify(parsedRequest)}

Requirements:
- Return ONLY valid JSON.
- Build ONE final plan, not multiple options.
- Favor dishes that scale cleanly and keep people full.
- Respect the budget. If the preferred foods are too expensive, pivot to the cheapest close alternative that still feels right.
- Keep the shopping list to 8 purchase lines or fewer so live price checks stay practical.
- Keep the shopping list to 8 purchase lines or fewer so indexed pricing and on-demand refreshes stay practical.
- Use Costco, Walmart, and H-E-B as the preferred shopping set unless the request narrows it further.
- Use simple quantities and store-friendly search terms.
- Make the explanation conversational, but keep the JSON concise.

Return exactly:
{
  "plannerNote": "...",
  "strategy": "...",
  "headcountPlan": {
    "guestCount": 0,
    "bufferPercent": 10,
    "targetServings": 0
  },
  "menu": [
    {
      "dish": "...",
      "role": "main|side|drink|dessert",
      "serves": 0,
      "portion": "...",
      "whyItFits": "...",
      "prepNote": "..."
    }
  ],
  "shoppingItems": [
    {
      "item": "...",
      "searchTerm": "...",
      "amountNeeded": "...",
      "purchaseUnit": "...",
      "purchaseCount": 1,
      "usedFor": "...",
      "preferredStores": ["Costco", "Walmart", "H-E-B"],
      "notes": "..."
    }
  ],
  "mathNotes": [
    {
      "label": "...",
      "formula": "...",
      "result": "..."
    }
  ],
  "prepTimeline": ["..."],
  "stretchTips": ["..."]
}`;
  }

  buildNarrativePrompt({ parsedRequest, draftPlan, storePlan, budgetSnapshot, pricedShoppingList, verdict }) {
    const simplifiedPricing = pricedShoppingList.map((item) => ({
      item: item.item,
      amountNeeded: item.amountNeeded,
      purchaseCount: item.purchaseCount,
      purchaseUnit: item.purchaseUnit,
      store: item.store,
      estimatedCost: item.estimatedCost,
      priceSource: item.priceSource,
    }));

    return `You are formatting a meal plan so a busy organizer can read it quickly.

Use these inputs exactly. Do not change totals.

Structured request:
${JSON.stringify(parsedRequest)}

Menu draft:
${JSON.stringify(draftPlan)}

Shopping plan:
${JSON.stringify(simplifiedPricing)}

Store totals:
${JSON.stringify(storePlan)}

Budget snapshot:
${JSON.stringify(budgetSnapshot)}

Verdict:
${verdict}

Requirements:
- Return ONLY valid JSON.
- Keep the tone conversational and direct.
- Explain the math simply.
- Do not invent new prices or quantities.
- If some prices are stale or missing, say so plainly.

Return exactly:
{
  "assistantNote": "...",
  "summaryBullets": ["..."],
  "mathBreakdown": [
    {
      "label": "...",
      "formula": "...",
      "result": "..."
    }
  ],
  "stretchTips": ["..."],
  "nextSteps": ["..."],
  "questions": ["..."]
}`;
  }

  async parseRequest(userRequest) {
    const aiParsed = await this.runStructuredJsonPrompt(this.buildRequestParserPrompt(userRequest), {
      maxTokens: 900,
      temperature: 0.1,
    });
    return buildMealPlanRequirements(fallbackParseFromText(userRequest), aiParsed);
  }

  async createDraftPlan(parsedRequest, rawRequest) {
    const draft = await this.runStructuredJsonPrompt(this.buildDraftPlanPrompt(parsedRequest, rawRequest), {
      maxTokens: 2200,
      temperature: 0.35,
    });
    const sanitized = sanitizeDraftPlan(draft, parsedRequest);
    if (sanitized.menu.length === 0 || sanitized.shoppingItems.length === 0) {
      throw new Error('AI returned an empty meal plan. Please try again with more detail.');
    }
    return sanitized;
  }

  async getPriceResearch(draftPlan, parsedRequest, options = {}) {
    const pricingTargets = buildPricingTargetsFromDraft(draftPlan, parsedRequest);

    if (pricingTargets.length === 0) {
      return { success: true, results: [] };
    }

    return pricingIndexService.resolveMealPlannerPrices(pricingTargets, {
      forceRefresh: Boolean(options.forceRefreshPricing),
      requestedBy: options.userId || options.jobOwnerType || null,
    });
  }

  async composeFinalPlan({ parsedRequest, rawRequest, draftPlan, priceResearch }) {
    const pricedShoppingList = buildPricedShoppingList(draftPlan, priceResearch, parsedRequest);
    const storePlan = buildStorePlan(pricedShoppingList);
    const budgetSnapshot = buildBudgetSnapshot(parsedRequest, pricedShoppingList);
    const verdict = determineBudgetVerdict(budgetSnapshot);

    const narrative = await this.runStructuredJsonPrompt(
      this.buildNarrativePrompt({
        parsedRequest,
        draftPlan,
        storePlan,
        budgetSnapshot,
        pricedShoppingList,
        verdict,
      }),
      {
        maxTokens: 1400,
        temperature: 0.25,
      }
    );

    const safeNarrative = {
      assistantNote: normalizeWhitespace(narrative?.assistantNote || ''),
      summaryBullets: sanitizeStringList(narrative?.summaryBullets),
      mathBreakdown: sanitizeBreakdownRows(narrative?.mathBreakdown),
      stretchTips: sanitizeStringList(narrative?.stretchTips),
      nextSteps: sanitizeStringList(narrative?.nextSteps),
      questions: sanitizeStringList(narrative?.questions),
    };

    const mathBreakdown = mergeBreakdownRows(
      [
        {
          label: 'Budget per person',
          formula: `${formatCurrency(budgetSnapshot.totalBudget)} / ${Math.max(1, parsedRequest.people)} people`,
          result: formatCurrency(budgetSnapshot.budgetPerPerson || 0),
        },
        {
          label: 'Servings target',
          formula: `${draftPlan.headcountPlan.guestCount} guests + ${draftPlan.headcountPlan.bufferPercent}% buffer`,
          result: `${draftPlan.headcountPlan.targetServings} servings`,
        },
        {
          label: budgetSnapshot.isComplete ? 'Current total' : 'Priced subtotal',
          formula: budgetSnapshot.isComplete
            ? 'Sum of the current store subtotals'
            : 'Sum of the shopping lines that already have indexed prices',
          result: formatCurrency(budgetSnapshot.estimatedTotal),
        },
        {
          label: budgetSnapshot.isComplete
            ? (budgetSnapshot.remaining >= 0 ? 'Budget remaining' : 'Budget gap')
            : 'Pricing coverage',
          formula: budgetSnapshot.isComplete
            ? `${formatCurrency(budgetSnapshot.totalBudget)} - ${formatCurrency(budgetSnapshot.estimatedTotal)}`
            : `${draftPlan.shoppingItems.length - budgetSnapshot.unpricedItems}/${draftPlan.shoppingItems.length} shopping lines priced`,
          result: budgetSnapshot.isComplete
            ? formatCurrency(Math.abs(budgetSnapshot.remaining))
            : `${draftPlan.shoppingItems.length - budgetSnapshot.unpricedItems}/${draftPlan.shoppingItems.length}`,
        },
      ],
      draftPlan.mathNotes,
      safeNarrative.mathBreakdown
    );

    const finalPlan = {
      formatVersion: 2,
      request: parsedRequest,
      rawRequest,
      verdict,
      assistantNote: safeNarrative.assistantNote
        || draftPlan.plannerNote
        || buildFallbackNarrative({ parsedRequest, budgetSnapshot, draftPlan, verdict }).assistantNote,
      headcountPlan: draftPlan.headcountPlan,
      budget: budgetSnapshot,
      summaryBullets: safeNarrative.summaryBullets,
      menu: draftPlan.menu,
      shoppingList: pricedShoppingList,
      storePlan,
      mathBreakdown,
      prepTimeline: draftPlan.prepTimeline,
      stretchTips: sanitizeStringList([...draftPlan.stretchTips, ...safeNarrative.stretchTips]),
      nextSteps: safeNarrative.nextSteps,
      questions: safeNarrative.questions,
      pricingNotes: buildPricingNotes(pricedShoppingList, budgetSnapshot),
      pricingStatus: {
        refreshedThisRun: Boolean(priceResearch?.refreshed),
        isComplete: budgetSnapshot.isComplete,
      },
      textSummary: '',
    };

    finalPlan.textSummary = buildPlainTextSummary(finalPlan);
    return finalPlan;
  }

  async execute(jobData) {
    const { sessionId, request, options = {} } = jobData;

    try {
      this.emitProgress(sessionId, 'Parsing your headcount, budget, and food preferences...');
      const parsedRequest = await this.parseRequest(request);

      this.emitProgress(sessionId, 'Drafting a crowd-friendly menu and shopping target...');
      const draftPlan = await this.createDraftPlan(parsedRequest, request);

      this.emitProgress(
        sessionId,
        options.forceRefreshPricing
          ? 'Refreshing the latest Costco, Walmart, and H-E-B pricing for this plan...'
          : 'Checking the saved Costco, Walmart, and H-E-B pricing index...'
      );
      const priceResearch = await this.getPriceResearch(draftPlan, parsedRequest, {
        ...options,
        userId: jobData.userId || null,
        jobOwnerType: jobData.jobOwnerType || null,
      });

      this.emitProgress(sessionId, 'Choosing the cheapest workable mix and formatting the plan...');
      const plan = await this.composeFinalPlan({
        parsedRequest,
        rawRequest: request,
        draftPlan,
        priceResearch,
      });

      const result = {
        success: true,
        plan,
      };

      this.emitComplete(sessionId, result);
      return result;
    } catch (error) {
      this.emitError(sessionId, error.message || 'Meal planner failed');
      throw error;
    }
  }

  emitProgress(sessionId, message) {
    const payload = {
      type: 'progress',
      agentType: 'meal-planner',
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    };
    this.io.to(sessionId).emit('agent:progress', payload);
    this.io.emit('agent:progress', payload);
    recordAgentActivity({
      action: 'AGENT_PROGRESS',
      entityId: sessionId,
      details: { agentType: 'meal-planner', message },
    });
  }

  emitComplete(sessionId, result) {
    const payload = {
      type: 'complete',
      agentType: 'meal-planner',
      sessionId,
      result,
      timestamp: new Date().toISOString(),
    };
    this.io.to(sessionId).emit('agent:complete', payload);
    this.io.emit('agent:complete', payload);
    recordAgentActivity({
      action: 'AGENT_COMPLETE',
      entityId: sessionId,
      details: { agentType: 'meal-planner' },
    });
  }

  emitError(sessionId, error) {
    const payload = {
      type: 'error',
      agentType: 'meal-planner',
      sessionId,
      error,
      timestamp: new Date().toISOString(),
    };
    this.io.to(sessionId).emit('agent:error', payload);
    this.io.emit('agent:error', payload);
    recordAgentActivity({
      action: 'AGENT_ERROR',
      entityId: sessionId,
      details: { agentType: 'meal-planner', error },
    });
  }
}

export default MealPlannerAgent;
