import test from 'node:test';
import assert from 'node:assert/strict';

import MealPlannerAgent, {
  buildBudgetSnapshot,
  buildMealPlanRequirements,
  buildStorePlan,
  extractExecutionPlanJson,
  normalizeParsedRequest,
} from '../agents/mealPlannerAgent.js';

test('extractExecutionPlanJson tolerates inline comments from the model', () => {
  const raw = `{
    "parsedRequest": {
      "people": 40,
      "budget": 200
    },
    // Ingredient planning comment
    "executionPlan": [
      {"tool": "zen_plan_meal", "params": {"people": 40, "budget": 200}, "description": "Draft menu"}
    ]
  }`;

  const parsed = extractExecutionPlanJson(raw);
  assert.equal(parsed.parsedRequest.people, 40);
  assert.equal(parsed.executionPlan[0].tool, 'zen_plan_meal');
});

test('normalizeParsedRequest defaults missing arrays and stores cleanly', () => {
  const normalized = normalizeParsedRequest({ people: '40', budget: '200' });

  assert.equal(normalized.people, 40);
  assert.equal(normalized.budget, 200);
  assert.deepEqual(normalized.dietary, []);
  assert.deepEqual(normalized.allergens, []);
  assert.deepEqual(normalized.preferredStores, ['Costco', 'Walmart', 'H-E-B']);
});

test('buildMealPlanRequirements falls back to parsed request arrays', () => {
  const combined = buildMealPlanRequirements(
    { people: 40, budget: 200, dietary: ['vegetarian'], allergens: ['nuts'] },
    { people: 40, budget: 200 }
  );

  assert.equal(combined.people, 40);
  assert.equal(combined.budget, 200);
  assert.deepEqual(combined.dietary, ['vegetarian']);
  assert.deepEqual(combined.allergens, ['nuts']);
});

test('buildMealPlanRequirements preserves a narrower parsed store preference when the step omits stores', () => {
  const combined = buildMealPlanRequirements(
    { people: 20, budget: 150, preferredStores: ['H-E-B'] },
    { people: 20, budget: 150, dietary: ['vegetarian'] }
  );

  assert.deepEqual(combined.preferredStores, ['H-E-B']);
  assert.deepEqual(combined.dietary, ['vegetarian']);
});

test('buildStorePlan groups priced items by store and totals subtotals', () => {
  const storePlan = buildStorePlan([
    {
      item: 'Chicken thighs',
      store: 'Costco',
      estimatedCost: 24,
      livePriceFound: true,
      priceSource: 'live_refresh',
      priceFreshness: 'fresh',
      amountNeeded: '10 lb',
      purchaseUnit: 'pack',
      purchaseCount: 2,
      usedFor: 'Sliders',
    },
    {
      item: 'Slider buns',
      store: 'Walmart',
      estimatedCost: 9,
      livePriceFound: false,
      priceSource: 'index',
      priceFreshness: 'fresh',
      amountNeeded: '24 buns',
      purchaseUnit: 'pack',
      purchaseCount: 3,
      usedFor: 'Sliders',
    },
    {
      item: 'BBQ sauce',
      store: 'Costco',
      estimatedCost: 8,
      livePriceFound: true,
      priceSource: 'live_refresh',
      priceFreshness: 'fresh',
      amountNeeded: '2 bottles',
      purchaseUnit: 'bottle',
      purchaseCount: 2,
      usedFor: 'Sliders',
    },
  ]);

  assert.equal(storePlan.length, 2);
  assert.deepEqual(storePlan[0], {
    store: 'Walmart',
    subtotal: 9,
    liveItems: 0,
    indexedItems: 1,
    staleItems: 0,
    items: [{
      item: 'Slider buns',
      amountNeeded: '24 buns',
      purchaseUnit: 'pack',
      purchaseCount: 3,
      estimatedCost: 9,
      priceSource: 'index',
      usedFor: 'Sliders',
    }],
  });
  assert.equal(storePlan[1].store, 'Costco');
  assert.equal(storePlan[1].subtotal, 32);
  assert.equal(storePlan[1].liveItems, 2);
});

test('buildBudgetSnapshot returns total, per-person, and live-price coverage', () => {
  const snapshot = buildBudgetSnapshot(
    { people: 20, budget: 120 },
    [
      { estimatedCost: 24, livePriceFound: true, priceSource: 'live_refresh' },
      { estimatedCost: 9, livePriceFound: false, priceSource: 'index' },
      { estimatedCost: 8, livePriceFound: true, priceSource: 'live_refresh' },
    ]
  );

  assert.deepEqual(snapshot, {
    totalBudget: 120,
    estimatedTotal: 41,
    remaining: 79,
    budgetPerPerson: 6,
    estimatedCostPerPerson: 2.05,
    isComplete: true,
    livePricedItems: 2,
    indexedItems: 1,
    stalePricedItems: 0,
    unpricedItems: 0,
    unpricedItemLabels: [],
  });
});

test('buildBudgetSnapshot marks incomplete totals when indexed pricing is missing', () => {
  const snapshot = buildBudgetSnapshot(
    { people: 20, budget: 120 },
    [
      { item: 'Chicken thighs', estimatedCost: 24, livePriceFound: false, priceSource: 'index' },
      { item: 'Slider buns', estimatedCost: null, livePriceFound: false, priceSource: 'missing' },
    ]
  );

  assert.deepEqual(snapshot, {
    totalBudget: 120,
    estimatedTotal: 24,
    remaining: null,
    budgetPerPerson: 6,
    estimatedCostPerPerson: 1.2,
    isComplete: false,
    livePricedItems: 0,
    indexedItems: 1,
    stalePricedItems: 0,
    unpricedItems: 1,
    unpricedItemLabels: ['Slider buns'],
  });
});

test('composeFinalPlan returns a readable structured plan with grouped stores and simple math', async () => {
  const agent = new MealPlannerAgent({ to: () => ({ emit() {} }), emit() {} });
  agent.runStructuredJsonPrompt = async () => ({
    assistantNote: 'This menu works and keeps the buying plan simple.',
    summaryBullets: [
      'The plan keeps the menu tight so the budget stays controlled.',
      'Protein and bread are the main spend drivers.',
    ],
    mathBreakdown: [
      {
        label: 'Chicken slider count',
        formula: '22 servings x 2 sliders',
        result: '44 sliders',
      },
    ],
    stretchTips: ['Skip dessert if the produce total climbs.'],
    nextSteps: ['Buy drinks and buns first, then finish with produce.'],
    questions: ['Do you want me to turn this into a one-store Costco version?'],
  });

  const finalPlan = await agent.composeFinalPlan({
    parsedRequest: {
      people: 20,
      budget: 120,
      preferredStores: ['Costco', 'Walmart'],
      eventType: 'potluck',
    },
    rawRequest: 'Help me plan a potluck for 20 people with a $120 budget.',
    draftPlan: {
      plannerNote: 'This is a practical slider meal.',
      headcountPlan: {
        guestCount: 20,
        bufferPercent: 10,
        targetServings: 22,
      },
      menu: [
        {
          dish: 'BBQ chicken sliders',
          role: 'main',
          serves: 22,
          portion: '2 sliders per person',
          whyItFits: 'Chicken stretches further than beef.',
          prepNote: 'Shred the chicken the day before.',
        },
      ],
      shoppingItems: [
        {
          item: 'Chicken thighs',
          searchTerm: 'chicken thighs bulk family pack',
          amountNeeded: '10 lb',
          purchaseUnit: 'family pack',
          purchaseCount: 2,
          usedFor: 'BBQ chicken sliders',
          preferredStores: ['Costco'],
          notes: '',
        },
        {
          item: 'Slider buns',
          searchTerm: 'slider buns pack',
          amountNeeded: '24 buns',
          purchaseUnit: 'pack',
          purchaseCount: 3,
          usedFor: 'BBQ chicken sliders',
          preferredStores: ['Walmart'],
          notes: '',
        },
      ],
      mathNotes: [
        {
          label: 'Serving buffer',
          formula: '20 guests + 10% buffer',
          result: '22 servings',
        },
      ],
      prepTimeline: ['Buy shelf-stable items first.'],
      stretchTips: ['Use chicken instead of beef to stay inside budget.'],
    },
    priceResearch: {
      success: true,
      results: [
        {
          item: 'Chicken thighs',
          query: 'chicken thighs bulk family pack',
          bestPrice: 12,
          bestStore: 'Costco',
          source: 'live_refresh',
          freshness: 'fresh',
          prices: [{ store: 'Costco', price: 12, source: 'index', freshness: 'fresh' }],
        },
        {
          item: 'Slider buns',
          query: 'slider buns pack',
          bestPrice: 3,
          bestStore: 'Walmart',
          source: 'index',
          freshness: 'fresh',
          prices: [{ store: 'Walmart', price: 3, source: 'index', freshness: 'fresh' }],
        },
      ],
      refreshed: true,
    },
  });

  assert.equal(finalPlan.formatVersion, 2);
  assert.equal(finalPlan.verdict, 'within_budget');
  assert.equal(finalPlan.budget.estimatedTotal, 33);
  assert.equal(finalPlan.budget.remaining, 87);
  assert.equal(finalPlan.storePlan.length, 2);
  assert.equal(finalPlan.storePlan[0].store, 'Walmart');
  assert.equal(finalPlan.storePlan[1].store, 'Costco');
  assert.equal(finalPlan.mathBreakdown[0].label, 'Budget per person');
  assert.equal(finalPlan.pricingStatus.refreshedThisRun, true);
  assert.match(finalPlan.textSummary, /Current priced total: \$33\.00 of \$120\.00/);
  assert.deepEqual(finalPlan.questions, ['Do you want me to turn this into a one-store Costco version?']);
});
