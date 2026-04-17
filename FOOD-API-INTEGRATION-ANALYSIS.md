# Food API Integration Analysis

**Date:** October 28, 2025
**Purpose:** Understand current state and plan USDA/Open Food Facts integration

---

## Executive Summary

Based on comprehensive review of all planning documents, the project requires integration of **external Food APIs** (USDA FoodData Central and Open Food Facts) to power the **Community Meal Planner Agent (#7)**. These APIs are distinct from our internal food bank status APIs.

**Current Status:**
- ❌ USDA FoodData Central API: NOT integrated
- ❌ Open Food Facts API: NOT integrated
- ✅ Internal Food Bank APIs: Working correctly
- ✅ Community Events CRUD: Working correctly
- ❌ AI Agent Backend (Phase 3C): NOT implemented

---

## 1. What We Have vs What We Need

### ✅ Currently Working (Internal Backend APIs)

Our backend has these working routes:

| Route | Purpose | Status |
|-------|---------|--------|
| `/api/auth/*` | Authentication & JWT | ✅ Working |
| `/api/donations/*` | Donation processing | ✅ Working |
| `/api/organizations/*` | Org management | ✅ Working |
| `/api/ledger/*` | Transparency ledger | ✅ Working |
| `/api/food-banks/*` | Food bank status tracking | ✅ Working |
| `/api/community-events/*` | Community event CRUD | ✅ Working |
| `/api/user/*` | User profiles | ✅ Working |

**These are correct and should NOT be changed.**

### ❌ What's Missing (External Food APIs)

The project plans require these external API integrations:

| API | Purpose | Status |
|-----|---------|--------|
| **USDA FoodData Central** | Nutrition analysis, allergen verification, food safety compliance | ❌ NOT implemented |
| **Open Food Facts** | Food product database, allergen data, nutrition facts | ❌ NOT implemented |

**These need to be implemented.**

---

## 2. USDA FoodData Central Requirements

### API Overview
- **Purpose:** Government nutrition database with 350,000+ food items
- **Use Cases:**
  - Nutrition analysis for meal planning
  - Allergen verification (nut-free, gluten-free, etc.)
  - Food safety compliance
  - Dietary restriction management
- **Documentation:** https://fdc.nal.usda.gov/api-guide.html
- **API Key:** Free, requires signup at https://fdc.nal.usda.gov/api-key-signup.html

### Required Endpoints

Based on TECHNICAL-IMPLEMENTATION.md, we need:

1. **`usda_search_foods`** - Search for food items by name
   ```
   GET https://api.nal.usda.gov/fdc/v1/foods/search
   Params: query, pageSize, api_key
   Returns: List of matching foods with FDC IDs
   ```

2. **`usda_get_food_details`** - Get detailed nutrition for specific food
   ```
   GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}
   Params: fdcId, api_key
   Returns: Complete nutrition data (calories, protein, vitamins, etc.)
   ```

3. **`usda_analyze_nutrition`** - Analyze complete recipe/meal
   ```
   Custom function that:
   - Takes array of ingredients with quantities
   - Looks up each ingredient in USDA database
   - Scales nutrition based on quantity/unit
   - Sums total nutrition for the meal
   - Calculates per-serving nutrition
   ```

### Database Schema (Already Exists)

The `NutritionDataCache` table is ready in schema.prisma:

```prisma
model NutritionDataCache {
  id             String   @id @default(uuid())
  usdaFdcId      String   @unique @map("usda_fdc_id")
  foodName       String   @map("food_name")
  nutritionData  Json     @map("nutrition_data")
  allergenData   Json?    @map("allergen_data")
  lastUpdated    DateTime @default(now()) @map("last_updated")

  @@index([foodName])
  @@map("nutrition_data_cache")
}
```

**Purpose:** Cache USDA API responses to reduce API calls and improve performance.

---

## 3. Open Food Facts Requirements

### API Overview
- **Purpose:** Open database for food products with barcodes, nutrition, allergens
- **Use Cases:**
  - Product nutrition lookups by barcode
  - Allergen database
  - Ingredient lists
  - Food additives information
- **Documentation:** https://openfoodfacts.github.io/api-documentation/
- **API Key:** Not required (open API)

### Required Endpoints

1. **Product Lookup** - Get product by barcode
   ```
   GET https://world.openfoodfacts.org/api/v2/product/{barcode}
   Returns: Product name, nutrition, allergens, ingredients
   ```

2. **Product Search** - Search by name
   ```
   GET https://world.openfoodfacts.org/cgi/search.pl
   Params: search_terms, page_size, json=1
   Returns: List of matching products
   ```

---

## 4. Where Should This Code Live?

### Architecture Decision

Based on the planning documents, food API integration should be part of:

**Option A: AI Agent Backend (Phase 3C)** ✅ RECOMMENDED
- USDA API calls made by Community Meal Planner Agent
- Agents run as background jobs via BullMQ
- Results sent back to frontend via WebSocket
- Follows the conversational AI pattern described in docs

**Option B: Direct Backend Service**
- Create `/api/nutrition/*` routes
- Frontend calls these directly
- Simpler but bypasses the AI agent architecture

**My Recommendation: Start with Option A** because:
1. Planning documents show Agent #7 using USDA MCP
2. Conversational interface is the core feature ("Chat with AI to plan meals")
3. Matches the architecture described in COMPLETE-PLATFORM-PLAN.md
4. More scalable for future AI features

---

## 5. Implementation Plan

### Phase 3C: AI Backend Infrastructure

This phase is marked as **❌ MISSING** in UNIFIED-MASTER-PLAN.md but has code patterns in TECHNICAL-IMPLEMENTATION.md.

**Required Components:**

1. **MCP SDK Integration**
   - Install @modelcontextprotocol/sdk
   - Create MCP client for Zen (conversational AI)
   - Create MCP client for USDA nutrition data
   - Create MCP client for Chrome DevTools (price research)

2. **Background Job System**
   - BullMQ worker for agent tasks
   - Redis connection for job queue
   - Job handlers for each agent type

3. **WebSocket Server**
   - Socket.io for real-time progress updates
   - Emit agent progress: "🔄 [WORKING] Checking USDA nutrition data..."
   - Emit results when complete

4. **Agent Implementation: Community Meal Planner**
   ```javascript
   Tools:
   - Zen MCP: Conversational interface
   - Chrome DevTools MCP: Price research
   - USDA FoodData Central: Nutrition analysis
   - Mapbox: Location services

   Workflow:
   1. User: "Plan cookout for 75 people, $400 budget, nut allergies"
   2. Agent parses requirements via Zen MCP
   3. Agent searches bulk food prices via Chrome DevTools
   4. Agent analyzes nutrition via USDA API
   5. Agent verifies allergen-free via USDA allergen data
   6. Agent creates complete plan
   7. Results sent to frontend via WebSocket
   ```

5. **Backend Routes for Agents**
   ```
   POST /api/agents/meal-planner/start
   GET  /api/agents/meal-planner/status/:jobId
   GET  /api/agents/meal-planner/result/:jobId
   ```

6. **Frontend Integration**
   - Chat interface for conversational meal planning
   - WebSocket connection for progress updates
   - Display nutrition analysis results
   - Show verified allergen information

---

## 6. Environment Variables Required

Already in `.env.example`:

```bash
# USDA FoodData Central API (for nutrition data)
# Get your API key at: https://fdc.nal.usda.gov/api-key-signup.html
USDA_API_KEY=your_usda_api_key_here

# Mapbox (for geocoding and maps)
# Get your API key at: https://www.mapbox.com/
MAPBOX_API_KEY=your_mapbox_api_key_here
```

**Additional needed:**

```bash
# BullMQ / Redis (for agent job queue)
REDIS_URL=redis://localhost:6379

# MCP Configuration
MCP_ZEN_ENDPOINT=<if using hosted Zen>
MCP_CHROME_DEVTOOLS_ENDPOINT=<if using hosted Chrome DevTools>
```

---

## 7. Code Patterns from TECHNICAL-IMPLEMENTATION.md

The planning documents contain working code patterns for USDA integration:

### USDA Client Implementation (lines 390-553)

```javascript
async createUSDAClient() {
  const usdaClient = {
    request: async ({ method, params }) => {
      switch (method) {
        case 'usda_search_foods':
          return await this.searchFoods(params.query, params.pageSize || 10);
        case 'usda_get_food_details':
          return await this.getFoodDetails(params.fdcId);
        case 'usda_analyze_nutrition':
          return await this.analyzeNutrition(params.ingredients);
      }
    }
  };
  return usdaClient;
}

async searchFoods(query, pageSize = 10) {
  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=${pageSize}`;

  const response = await fetch(url);
  const data = await response.json();

  return {
    success: true,
    foods: data.foods || [],
    totalResults: data.totalHits || 0
  };
}

async getFoodDetails(fdcId) {
  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  return {
    success: true,
    food: data,
    nutrition: this.processNutritionData(data.foodNutrients || [])
  };
}

async analyzeNutrition(ingredients) {
  // Analyze multiple ingredients and sum nutrition
  const results = [];
  let totalNutrition = {};

  for (const ingredient of ingredients) {
    const { quantity, unit, foodName } = ingredient;

    // Search for the food item
    const searchResult = await this.searchFoods(foodName, 1);

    if (searchResult.success && searchResult.foods.length > 0) {
      const food = searchResult.foods[0];
      const detailsResult = await this.getFoodDetails(food.fdcId);

      if (detailsResult.success) {
        const scaledNutrition = this.scaleNutrition(
          detailsResult.nutrition,
          quantity,
          unit
        );

        results.push({
          ingredient: foodName,
          nutrition: scaledNutrition,
          fdcId: food.fdcId
        });

        // Sum up total nutrition
        this.addNutritionValues(totalNutrition, scaledNutrition);
      }
    }
  }

  return {
    success: true,
    ingredients: results,
    totalNutrition,
    perServing: ingredients.servings
      ? this.divideNutrition(totalNutrition, ingredients.servings)
      : null
  };
}

processNutritionData(foodNutrients) {
  const nutrition = {};

  foodNutrients.forEach(nutrient => {
    const name = nutrient.nutrient?.name?.toLowerCase();
    if (name) {
      nutrition[name] = {
        amount: nutrient.amount || 0,
        unit: nutrient.nutrient?.unitName || 'g'
      };
    }
  });

  return nutrition;
}

scaleNutrition(nutrition, quantity, unit) {
  // Scale nutrition values based on quantity and unit
  const scaleFactor = this.getScaleFactor(quantity, unit);
  const scaled = {};

  Object.keys(nutrition).forEach(key => {
    scaled[key] = {
      amount: nutrition[key].amount * scaleFactor,
      unit: nutrition[key].unit
    };
  });

  return scaled;
}

getScaleFactor(quantity, unit) {
  // Simplified scaling - assumes USDA data is per 100g
  const baseAmount = 100; // grams

  switch (unit.toLowerCase()) {
    case 'g':
    case 'grams':
      return quantity / baseAmount;
    case 'oz':
    case 'ounces':
      return (quantity * 28.35) / baseAmount; // oz to grams
    case 'lb':
    case 'pounds':
      return (quantity * 453.592) / baseAmount; // lb to grams
    case 'cup':
    case 'cups':
      return (quantity * 240) / baseAmount; // approximate cup to grams
    default:
      return quantity / baseAmount;
  }
}
```

**This code exists in the planning docs but NOT in the actual codebase.**

---

## 8. Key Findings Summary

### What's Correct ✅
1. All internal backend APIs are working properly
2. Food bank status tracking uses real database data
3. Community events CRUD is fully functional
4. Database schema includes NutritionDataCache table
5. Authentication and payment processing work correctly
6. No mock data in production code (except AI dashboard UI)

### What's Missing ❌
1. USDA FoodData Central API integration
2. Open Food Facts API integration
3. AI Agent backend infrastructure (Phase 3C)
4. MCP SDK integration
5. BullMQ job queue for agents
6. WebSocket server for real-time agent updates
7. Community Meal Planner Agent implementation
8. Backend routes for `/api/agents/*` or `/api/nutrition/*`

### Architecture Clarity 📐
- **Internal APIs** (`/api/food-banks/*`): For managing our food bank locations, status, needs
- **External Food APIs** (USDA, Open Food Facts): For nutrition data, allergen info, food products
- **AI Agents**: Orchestrate external APIs via MCP to provide conversational planning

---

## 9. Next Steps (User Decision Required)

I need clarification on implementation priority:

### Option 1: Implement USDA Integration Only (Simpler)
- Create backend service for USDA API calls
- Add routes: `/api/nutrition/search`, `/api/nutrition/analyze`
- Frontend calls these directly
- Skip AI agent architecture for now
- **Time Estimate:** 2-3 hours

### Option 2: Implement Full Agent System (Comprehensive)
- Complete Phase 3C: AI Backend Infrastructure
- MCP SDK + BullMQ + WebSocket
- Implement Community Meal Planner Agent
- Conversational interface as planned
- **Time Estimate:** 8-12 hours

### Option 3: Hybrid Approach (Recommended)
- Implement USDA backend service first (Option 1)
- Test and verify nutrition analysis works
- Then wrap it in AI agent architecture (Option 2)
- Allows incremental development and testing
- **Time Estimate:** 4-6 hours total (staged)

---

## 10. Questions for User

1. **Which implementation approach do you prefer?** (Option 1, 2, or 3)

2. **Do you have USDA API key ready?** If not, I can use DEMO_KEY for testing

3. **Should I implement Phase 3C (full AI agent system) now or just the USDA integration?**

4. **Do you also need Open Food Facts integration now, or USDA first?**

5. **For testing: Do you want a simple UI to test nutrition lookups before building the full conversational interface?**

---

**Status:** Awaiting user direction on implementation approach
