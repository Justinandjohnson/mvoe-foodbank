// USDA FoodData Central MCP Client
// Provides nutrition analysis, allergen verification, and food safety compliance
import prisma from '../utils/database.js';

class USDAClient {
  constructor() {
    this.apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
    this.baseUrl = 'https://api.nal.usda.gov/fdc/v1';

    // Rate limiting: delay between API calls
    this.requestDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;

    // Cache expiry: 30 days
    this.cacheExpiryDays = 30;
  }

  /**
   * Sleep/delay function for rate limiting
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Rate-limited API request wrapper
   */
  async rateLimitedFetch(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms before next USDA API call`);
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    return fetch(url);
  }

  /**
   * MCP-compatible request handler
   */
  async request({ method, params }) {
    switch (method) {
      case 'usda_search_foods':
        return await this.searchFoods(params.query, params.pageSize || 10);

      case 'usda_get_food_details':
        return await this.getFoodDetails(params.fdcId);

      case 'usda_analyze_nutrition':
        return await this.analyzeNutrition(params.ingredients);

      case 'usda_verify_allergens':
        return await this.verifyAllergens(params.ingredients, params.allergens);

      default:
        throw new Error(`Unknown USDA method: ${method}`);
    }
  }

  /**
   * Search for food items by name (with rate limiting)
   */
  async searchFoods(query, pageSize = 10) {
    try {
      const url = `${this.baseUrl}/foods/search?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&pageSize=${pageSize}`;

      const response = await this.rateLimitedFetch(url);
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        foods: (data.foods || []).map(food => ({
          fdcId: food.fdcId,
          description: food.description,
          brandName: food.brandName,
          dataType: food.dataType,
          score: food.score
        })),
        totalResults: data.totalHits || 0
      };
    } catch (error) {
      console.error('USDA search error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get detailed nutrition information for a specific food (with caching)
   */
  async getFoodDetails(fdcId) {
    try {
      // Check cache first
      const cached = await this.getCachedFoodData(fdcId);
      if (cached) {
        console.log(`Cache hit for FDC ID: ${fdcId}`);
        return cached;
      }

      console.log(`Cache miss for FDC ID: ${fdcId}, fetching from USDA API`);

      // Not in cache, fetch from API with rate limiting
      const url = `${this.baseUrl}/food/${fdcId}?api_key=${this.apiKey}`;

      const response = await this.rateLimitedFetch(url);
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const data = await response.json();

      const result = {
        success: true,
        food: {
          fdcId: data.fdcId,
          description: data.description,
          brandName: data.brandName,
          ingredients: data.ingredients
        },
        nutrition: this.processNutritionData(data.foodNutrients || [])
      };

      // Cache the result
      await this.cacheFoodData(fdcId, data.description, result);

      return result;
    } catch (error) {
      console.error('USDA details error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get cached food data from database
   */
  async getCachedFoodData(fdcId) {
    try {
      const cacheEntry = await prisma.nutritionDataCache.findUnique({
        where: { usdaFdcId: String(fdcId) }
      });

      if (!cacheEntry) {
        return null;
      }

      // Check if cache is expired (30 days)
      const cacheAge = Date.now() - new Date(cacheEntry.lastUpdated).getTime();
      const maxAge = this.cacheExpiryDays * 24 * 60 * 60 * 1000;

      if (cacheAge > maxAge) {
        console.log(`Cache expired for FDC ID: ${fdcId}`);
        // Delete expired cache
        await prisma.nutritionDataCache.delete({
          where: { usdaFdcId: String(fdcId) }
        });
        return null;
      }

      // Return cached data
      return cacheEntry.nutritionData;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Cache food data in database
   */
  async cacheFoodData(fdcId, foodName, data) {
    try {
      await prisma.nutritionDataCache.upsert({
        where: { usdaFdcId: String(fdcId) },
        update: {
          nutritionData: data,
          allergenData: data.food?.ingredients ? { ingredients: data.food.ingredients } : null,
          lastUpdated: new Date()
        },
        create: {
          usdaFdcId: String(fdcId),
          foodName: foodName,
          nutritionData: data,
          allergenData: data.food?.ingredients ? { ingredients: data.food.ingredients } : null
        }
      });

      console.log(`Cached nutrition data for FDC ID: ${fdcId}`);
    } catch (error) {
      console.error('Cache write error:', error);
      // Don't throw - caching failure shouldn't break the flow
    }
  }

  /**
   * Analyze nutrition for a complete recipe/meal
   */
  async analyzeNutrition(ingredients) {
    try {
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
    } catch (error) {
      console.error('USDA nutrition analysis error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify ingredients against allergen list
   */
  async verifyAllergens(ingredients, allergens) {
    try {
      const allergenFlags = [];

      for (const ingredient of ingredients) {
        const searchResult = await this.searchFoods(ingredient, 1);

        if (searchResult.success && searchResult.foods.length > 0) {
          const food = searchResult.foods[0];
          const detailsResult = await this.getFoodDetails(food.fdcId);

          if (detailsResult.success && detailsResult.food.ingredients) {
            const ingredientText = detailsResult.food.ingredients.toLowerCase();

            for (const allergen of allergens) {
              if (ingredientText.includes(allergen.toLowerCase())) {
                allergenFlags.push({
                  ingredient,
                  allergen,
                  found: true,
                  warning: `⚠️ ${ingredient} contains ${allergen}`
                });
              }
            }
          }
        }
      }

      return {
        success: true,
        safe: allergenFlags.length === 0,
        allergenFlags,
        message: allergenFlags.length === 0
          ? '✅ All ingredients verified allergen-free'
          : `⚠️ Found ${allergenFlags.length} allergen concern(s)`
      };
    } catch (error) {
      console.error('USDA allergen verification error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process raw USDA nutrition data into structured format
   */
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

  /**
   * Scale nutrition values based on quantity and unit
   */
  scaleNutrition(nutrition, quantity, unit) {
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

  /**
   * Get scaling factor for unit conversions
   */
  getScaleFactor(quantity, unit) {
    // Assumes USDA data is per 100g
    const baseAmount = 100;

    switch (unit.toLowerCase()) {
      case 'g':
      case 'grams':
        return quantity / baseAmount;
      case 'oz':
      case 'ounces':
        return (quantity * 28.35) / baseAmount;
      case 'lb':
      case 'pounds':
        return (quantity * 453.592) / baseAmount;
      case 'cup':
      case 'cups':
        return (quantity * 240) / baseAmount;
      case 'tbsp':
      case 'tablespoon':
        return (quantity * 15) / baseAmount;
      case 'tsp':
      case 'teaspoon':
        return (quantity * 5) / baseAmount;
      default:
        return quantity / baseAmount;
    }
  }

  /**
   * Add nutrition values together
   */
  addNutritionValues(total, addition) {
    Object.keys(addition).forEach(key => {
      if (!total[key]) {
        total[key] = { amount: 0, unit: addition[key].unit };
      }
      total[key].amount += addition[key].amount;
    });
  }

  /**
   * Divide nutrition values (for per-serving calculations)
   */
  divideNutrition(nutrition, servings) {
    const perServing = {};

    Object.keys(nutrition).forEach(key => {
      perServing[key] = {
        amount: nutrition[key].amount / servings,
        unit: nutrition[key].unit
      };
    });

    return perServing;
  }
}

export default USDAClient;
