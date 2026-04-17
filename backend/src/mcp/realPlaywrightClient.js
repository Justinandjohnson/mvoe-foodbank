// Real Playwright Client - Uses actual Playwright library for web scraping
// This bypasses MCP and uses Playwright directly for reliable web automation

import { chromium } from 'playwright';
import logger from '../utils/logger.js';

class RealPlaywrightClient {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.connected = false;

    // Store configurations
    this.stores = {
      'Costco': {
        baseUrl: 'https://www.costco.com',
        searchUrl: 'https://www.costco.com/s?keyword=',
        priceSelectors: [
          '[automation-id="productPriceOutput"]',
          '.price',
          '[data-price]',
          '.product-price'
        ]
      },
      'Walmart': {
        baseUrl: 'https://www.walmart.com',
        searchUrl: 'https://www.walmart.com/search?q=',
        priceSelectors: [
          '[itemprop="price"]',
          '[data-price]',
          '.price-characteristic',
          '.price-wrap .price'
        ]
      },
      'Sams Club': {
        baseUrl: 'https://www.samsclub.com',
        searchUrl: 'https://www.samsclub.com/s/',
        priceSelectors: [
          '[data-automation-id="productPrice"]',
          '.price',
          '[data-testid="price"]'
        ]
      },
      'Instacart': {
        baseUrl: 'https://www.instacart.com',
        searchUrl: 'https://www.instacart.com/store/search?query=',
        priceSelectors: [
          '[data-testid="price"]',
          '.price',
          '[class*="price"]'
        ]
      }
    };
  }

  /**
   * Launch browser with Playwright
   */
  async connect(headless = false) {
    try {
      logger.info(`Launching Playwright browser (headless: ${headless})...`);

      this.browser = await chromium.launch({
        headless: headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });

      this.page = await this.context.newPage();
      this.connected = true;

      logger.info('✅ Playwright browser launched successfully');
      return { success: true };
    } catch (error) {
      logger.error('Failed to launch Playwright:', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Close browser
   */
  async disconnect() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();

      this.page = null;
      this.context = null;
      this.browser = null;
      this.connected = false;

      logger.info('Playwright browser closed');
    } catch (error) {
      logger.error('Error closing browser:', { error: error.message });
    }
  }

  /**
   * Search and extract price from a store website
   */
  async searchAndExtractPrice(storeName, storeConfig, searchQuery) {
    if (!this.connected || !this.page) {
      logger.warn('Browser not connected');
      return null;
    }

    try {
      const searchUrl = `${storeConfig.searchUrl}${encodeURIComponent(searchQuery)}`;
      logger.info(`🔍 Searching ${storeName} for "${searchQuery}"`, { url: searchUrl });
      logger.scraping(searchUrl, false, { action: 'navigate_start' });

      // Navigate to search URL
      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      logger.scraping(searchUrl, true, { action: 'navigate_complete' });

      // Wait for any price elements to load
      await this.page.waitForTimeout(2000);

      // Try multiple selectors to find prices
      const prices = await this.page.evaluate((selectors) => {
        const allPrices = [];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent || el.getAttribute('data-price') || el.getAttribute('content');
            if (text) {
              // Extract price numbers
              const match = text.match(/\$?(\d+\.?\d*)/);
              if (match) {
                const price = parseFloat(match[1]);
                if (price > 0 && price < 1000) { // Reasonable bulk price range
                  allPrices.push(price);
                }
              }
            }
          }
          if (allPrices.length > 0) break;
        }

        return allPrices;
      }, storeConfig.priceSelectors);

      if (prices && prices.length > 0) {
        // Get the minimum price (best deal)
        const minPrice = Math.min(...prices);
        logger.info(`✅ Found ${prices.length} prices at ${storeName}, best: $${minPrice}`);

        return {
          store: storeName,
          price: minPrice,
          url: searchUrl,
          source: 'live',
          method: 'playwright_direct',
          timestamp: new Date().toISOString(),
          pricesFound: prices.length
        };
      }

      logger.warn(`No prices found at ${storeName} for "${searchQuery}"`);
      return null;

    } catch (error) {
      logger.error(`Error scraping ${storeName}:`, { error: error.message });
      logger.scraping(storeConfig.searchUrl, false, { error: error.message });
      return null;
    }
  }

  /**
   * Research bulk food prices across multiple stores
   */
  async researchBulkPrices(foodItems) {
    try {
      if (!this.connected) {
        logger.warn('Browser not connected, using fallback estimates');
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
            storeConfig,
            `${item} wholesale bulk`
          );

          if (priceData) {
            prices.push(priceData);
          }

          // Rate limiting between stores
          await new Promise(resolve => setTimeout(resolve, 1500));
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
          pricesFound: prices.length,
          liveCount: prices.filter(p => p.source === 'live').length
        });
      }

      return {
        success: true,
        results,
        method: 'playwright_direct_real',
        liveResults: results.filter(r => r.source === 'live').length
      };

    } catch (error) {
      logger.error('Price research error:', { error: error.message });
      return this._getFallbackPrices(foodItems);
    }
  }

  /**
   * Fallback to estimated prices
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
   * Estimate bulk prices (same as fallback database)
   */
  estimateBulkPrice(item) {
    const priceMap = {
      'Ground Beef': { unit: 'per 10lb case', price: 35.00 },
      'Hamburger Buns': { unit: 'per 8-dozen case', price: 28.00 },
      'Potato Salad': { unit: 'per 5lb container', price: 12.00 },
      'Hot Dogs': { unit: 'per 5lb pack', price: 15.00 },
      'Chicken Breasts': { unit: 'per 10lb case', price: 28.00 },
      'Lettuce': { unit: 'per 24-count case', price: 32.00 },
      'Cheese Slices': { unit: 'per 5lb block', price: 20.00 }
    };

    // Exact match
    if (priceMap[item]) {
      return priceMap[item];
    }

    // Partial match
    const itemLower = item.toLowerCase();
    for (const [key, value] of Object.entries(priceMap)) {
      if (itemLower.includes(key.toLowerCase()) || key.toLowerCase().includes(itemLower)) {
        return value;
      }
    }

    return { unit: 'per bulk unit', price: 15.00 };
  }
}

export default RealPlaywrightClient;
