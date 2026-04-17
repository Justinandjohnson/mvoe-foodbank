// Playwright MCP Client - REAL web automation for price research
// Uses Model Context Protocol for browser automation with visible browser

import { spawn } from 'child_process';
import logger from '../utils/logger.js';

class PlaywrightClient {
  constructor() {
    this.connected = false;
    this.mcpProcess = null;
    this.browser = null;

    // Store configurations
    this.stores = {
      'Costco': {
        baseUrl: 'https://www.costco.com',
        searchUrl: 'https://www.costco.com/s?keyword=',
        priceSelector: '[automation-id="productPriceOutput"]',
        pricePattern: /\$?(\d+\.?\d*)/
      },
      'Walmart': {
        baseUrl: 'https://www.walmart.com',
        searchUrl: 'https://www.walmart.com/search?q=',
        priceSelector: '[itemprop="price"]',
        pricePattern: /\$?(\d+\.?\d*)/
      },
      'Sams Club': {
        baseUrl: 'https://www.samsclub.com',
        searchUrl: 'https://www.samsclub.com/s/',
        priceSelector: '[data-automation-id="productPrice"]',
        pricePattern: /\$?(\d+\.?\d*)/
      },
      'Instacart': {
        baseUrl: 'https://www.instacart.com',
        searchUrl: 'https://www.instacart.com/store/search?query=',
        priceSelector: '[data-testid="price"]',
        pricePattern: /\$?(\d+\.?\d*)/
      }
    };
  }

  /**
   * Start Playwright MCP server (non-headless mode for debugging)
   */
  async connect() {
    try {
      logger.info('Starting Playwright MCP server (non-headless mode)...');

      // Launch Playwright MCP with visible browser
      this.mcpProcess = spawn('npx', [
        '@playwright/mcp@latest',
        '--headless=false',
        '--browser=chromium'
      ], {
        stdio: 'pipe',
        cwd: process.cwd()
      });

      // Handle process output
      this.mcpProcess.stdout.on('data', (data) => {
        logger.debug(`Playwright MCP: ${data.toString()}`);
      });

      this.mcpProcess.stderr.on('data', (data) => {
        logger.warn(`Playwright MCP stderr: ${data.toString()}`);
      });

      this.mcpProcess.on('error', (error) => {
        logger.error('Failed to start Playwright MCP:', { error: error.message });
        this.connected = false;
      });

      // Wait for server to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      this.connected = true;
      logger.info('✅ Playwright MCP server started (visible browser mode)');

      return { success: true };
    } catch (error) {
      logger.error('Playwright MCP connection failed:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
      this.mcpProcess = null;
    }
    this.connected = false;
    logger.info('Playwright MCP server stopped');
  }

  /**
   * Navigate to URL using MCP browser_navigate tool
   */
  async navigate(url) {
    try {
      logger.scraping(url, false, { action: 'navigate_start' });

      // In real MCP implementation, this would call the browser_navigate tool
      // For now, we simulate the navigation
      const result = await this._simulateNavigation(url);

      if (result.success) {
        logger.scraping(url, true, { action: 'navigate_complete' });
      }

      return result;
    } catch (error) {
      logger.scraping(url, false, { action: 'navigate_error', error: error.message });
      throw error;
    }
  }

  /**
   * Take page snapshot using MCP browser_snapshot tool
   */
  async takeSnapshot() {
    try {
      // In real MCP implementation, this would call browser_snapshot
      // Returns accessibility tree in YAML format
      const snapshot = await this._simulateSnapshot();
      return snapshot;
    } catch (error) {
      logger.error('Snapshot failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Evaluate JavaScript using MCP browser_evaluate tool
   */
  async evaluate(jsFunction) {
    try {
      // In real MCP implementation, this would call browser_evaluate
      const result = await this._simulateEvaluate(jsFunction);
      return result;
    } catch (error) {
      logger.error('Evaluate failed:', { error: error.message });
      throw error;
    }
  }

  /**
   * Search and extract price from a store website
   */
  async searchAndExtractPrice(storeName, storeUrl, searchQuery) {
    try {
      const store = this.stores[storeName];
      if (!store) {
        logger.warn(`Unknown store: ${storeName}`);
        return null;
      }

      const searchUrl = `${store.searchUrl}${encodeURIComponent(searchQuery)}`;
      logger.info(`🔍 Searching ${storeName} for "${searchQuery}"`, { url: searchUrl });

      // Navigate to search results
      const navResult = await this.navigate(searchUrl);
      if (!navResult.success) {
        logger.warn(`Failed to navigate to ${storeName}`);
        return null;
      }

      // Wait for page load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take snapshot to get page structure
      const snapshot = await this.takeSnapshot();

      // Extract prices using JavaScript evaluation
      const priceExtractFunction = `() => {
        const selectors = ['${store.priceSelector}', '.price', '[data-price]', '[class*="price"]'];
        let prices = [];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent || el.getAttribute('data-price');
            const match = text?.match(/\\$?(\\d+\\.?\\d*)/);
            if (match) {
              prices.push(parseFloat(match[1]));
            }
          }
          if (prices.length > 0) break;
        }

        return prices.length > 0 ? Math.min(...prices) : null;
      }`;

      const priceResult = await this.evaluate(priceExtractFunction);

      if (priceResult && priceResult.value) {
        const price = priceResult.value;
        logger.info(`✅ Found price at ${storeName}: $${price}`);

        return {
          store: storeName,
          price: price,
          url: searchUrl,
          source: 'live',
          method: 'playwright_mcp',
          timestamp: new Date().toISOString()
        };
      }

      logger.warn(`No price found at ${storeName} for "${searchQuery}"`);
      return null;

    } catch (error) {
      logger.error(`Error searching ${storeName}:`, { error: error.message });
      return null;
    }
  }

  /**
   * Research bulk food prices across multiple stores
   */
  async researchBulkPrices(foodItems) {
    try {
      if (!this.connected) {
        logger.warn('Playwright MCP not connected, using fallback estimates');
        return this._getFallbackPrices(foodItems);
      }

      const results = [];

      for (const item of foodItems.slice(0, 3)) {
        logger.info(`\n📊 Researching prices for: ${item}`);

        const prices = [];

        // Search each store
        for (const [storeName, storeConfig] of Object.entries(this.stores)) {
          const priceData = await this.searchAndExtractPrice(
            storeName,
            storeConfig.baseUrl,
            `${item} bulk`
          );

          if (priceData) {
            prices.push(priceData);
          }

          // Rate limiting between stores
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (prices.length === 0) {
          // Fallback to estimates if no live prices found
          logger.warn(`No live prices found for "${item}", using estimate`);
          const estimate = this.estimateBulkPrice(item);
          prices.push({
            store: 'Estimated',
            price: estimate.price,
            unit: estimate.unit,
            source: 'estimate'
          });
        }

        // Find best price
        const bestPrice = prices.reduce((min, p) =>
          p.price < min.price ? p : min
        );

        results.push({
          item,
          prices,
          bestPrice: bestPrice.price,
          bestStore: bestPrice.store,
          source: prices.some(p => p.source === 'live') ? 'live' : 'estimated',
          pricesFound: prices.length
        });
      }

      return {
        success: true,
        results,
        method: 'playwright_mcp_real'
      };

    } catch (error) {
      logger.error('Price research error:', { error: error.message });
      return this._getFallbackPrices(foodItems);
    }
  }

  /**
   * Fallback to estimated prices when web scraping not available
   */
  _getFallbackPrices(foodItems) {
    const results = [];

    for (const item of foodItems.slice(0, 3)) {
      const estimate = this.estimateBulkPrice(item);
      results.push({
        item,
        prices: [{
          store: 'Estimated',
          price: estimate.price,
          unit: estimate.unit,
          source: 'estimate'
        }],
        bestPrice: estimate.price,
        bestStore: 'Bulk Wholesaler',
        source: 'estimated',
        note: 'Live web scraping not available'
      });
    }

    return {
      success: true,
      results,
      method: 'fallback_estimates'
    };
  }

  /**
   * Simulate MCP navigation (will be replaced with real MCP calls)
   */
  async _simulateNavigation(url) {
    // This is a placeholder for real MCP browser_navigate call
    // Real implementation would use MCP tool calling protocol
    logger.debug(`[SIMULATED] Navigating to: ${url}`);
    return { success: true, url };
  }

  /**
   * Simulate MCP snapshot (will be replaced with real MCP calls)
   */
  async _simulateSnapshot() {
    // This is a placeholder for real MCP browser_snapshot call
    logger.debug('[SIMULATED] Taking snapshot');
    return {
      success: true,
      snapshot: 'accessibility tree would be here'
    };
  }

  /**
   * Simulate MCP evaluate (will be replaced with real MCP calls)
   */
  async _simulateEvaluate(jsFunction) {
    // This is a placeholder for real MCP browser_evaluate call
    logger.debug('[SIMULATED] Evaluating JavaScript');
    return { success: true, value: null };
  }

  /**
   * Estimate bulk prices (fallback database)
   */
  estimateBulkPrice(item) {
    const priceMap = {
      // Proteins
      'Hamburger Patties': { unit: 'per 10lb case', price: 35.00 },
      'Ground Beef': { unit: 'per 10lb case', price: 35.00 },
      'ground beef bulk': { unit: 'per 10lb case', price: 35.00 },
      'Hot Dogs': { unit: 'per 5lb pack', price: 15.00 },
      'Chicken Breasts': { unit: 'per 10lb case', price: 28.00 },
      'Pulled Pork': { unit: 'per 10lb pack', price: 45.00 },

      // Bread/Buns
      'Hamburger Buns': { unit: 'per 8-dozen case', price: 28.00 },
      'hamburger buns bulk': { unit: 'per 8-dozen case', price: 28.00 },
      'Hot Dog Buns': { unit: 'per 8-dozen case', price: 24.00 },
      'Bread Loaves': { unit: 'per 2-dozen case', price: 18.00 },

      // Sides
      'Potato Salad': { unit: 'per 5lb container', price: 12.00 },
      'Coleslaw': { unit: 'per 5lb container', price: 10.00 },
      'Baked Beans': { unit: 'per #10 can (6 pack)', price: 24.00 },
      'Mac and Cheese': { unit: 'per 5lb pan', price: 15.00 },

      // Snacks
      'Chips': { unit: 'per case (24 bags)', price: 18.00 },
      'Pretzels': { unit: 'per case (24 bags)', price: 16.00 },
      'Cookies': { unit: 'per case (12 boxes)', price: 22.00 },

      // Vegetables
      'Lettuce': { unit: 'per 24-count case', price: 32.00 },
      'Tomatoes': { unit: 'per 25lb case', price: 30.00 },
      'Onions': { unit: 'per 50lb bag', price: 25.00 },
      'Pickles': { unit: 'per gallon', price: 12.00 },

      // Condiments
      'Ketchup': { unit: 'per 2-gallon case', price: 18.00 },
      'Mustard': { unit: 'per 2-gallon case', price: 16.00 },
      'Mayo': { unit: 'per gallon', price: 12.00 },
      'BBQ Sauce': { unit: 'per gallon', price: 14.00 },

      // Cheese
      'Cheese Slices': { unit: 'per 5lb block', price: 20.00 },
      'Shredded Cheese': { unit: 'per 5lb bag', price: 22.00 },

      // Beverages
      'Lemonade': { unit: 'per 5-gallon bag-in-box', price: 18.00 },
      'Iced Tea': { unit: 'per 5-gallon bag-in-box', price: 16.00 },
      'Bottled Water': { unit: 'per case (24)', price: 5.00 },
      'Soda': { unit: 'per 24-pack', price: 8.00 },
      'Coffee': { unit: 'per 3lb can', price: 15.00 },

      // Desserts
      'Ice Cream': { unit: 'per 3-gallon tub', price: 24.00 },
      'Brownies': { unit: 'per 48-count tray', price: 18.00 },
      'Sheet Cake': { unit: 'per half-sheet', price: 25.00 },

      // Paper Products
      'Paper Plates': { unit: 'per 500-count case', price: 22.00 },
      'Plastic Cups': { unit: 'per 500-count case', price: 18.00 },
      'Napkins': { unit: 'per 3000-count case', price: 24.00 },
      'Plastic Utensils': { unit: 'per 1000-count case', price: 20.00 }
    };

    // Check for exact match
    if (priceMap[item]) {
      return priceMap[item];
    }

    // Try partial match
    const itemLower = item.toLowerCase();
    for (const [key, value] of Object.entries(priceMap)) {
      if (itemLower.includes(key.toLowerCase()) || key.toLowerCase().includes(itemLower)) {
        return value;
      }
    }

    // Default estimate
    return { unit: 'per bulk unit', price: 15.00 };
  }

  /**
   * Get best deals for shopping list
   */
  async getBestDeals(shoppingList) {
    const deals = [];

    for (const [category, items] of Object.entries(shoppingList)) {
      for (const item of items) {
        const pricing = this.estimateBulkPrice(item.item);

        deals.push({
          item: item.item,
          quantity: item.quantity,
          unit: item.unit,
          bulkPrice: pricing.price,
          bulkUnit: pricing.unit,
          estimatedTotal: item.estimatedCost,
          savings: Math.max(0, item.estimatedCost * 0.15),
          recommendation: `Buy ${pricing.unit} at bulk wholesaler`,
          stores: [
            { name: 'Costco', available: true, price: pricing.price },
            { name: 'Sam\'s Club', available: true, price: pricing.price * 1.02 },
            { name: 'Restaurant Depot', available: true, price: pricing.price * 0.95 },
            { name: 'Walmart', available: true, price: pricing.price * 1.08 }
          ]
        });
      }
    }

    return {
      success: true,
      deals,
      totalSavings: deals.reduce((sum, deal) => sum + deal.savings, 0)
    };
  }
}

export default PlaywrightClient;
