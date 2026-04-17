// Stealth Playwright Client - Anti-detection web scraping
// Implements multiple evasion techniques to bypass bot detection systems

import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from '../utils/logger.js';

class StealthPlaywrightClient {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.connected = false;

    // User agent list for rotation
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    // Store configurations with updated selectors
    this.stores = {
      'Costco': {
        baseUrl: 'https://www.costco.com',
        searchUrl: 'https://www.costco.com/s?keyword=',
        waitSelectors: ['.product-tile', '.product', '[automation-id="productList"]'],
        priceSelectors: [
          'span[automation-id="productPriceOutput"]',
          '.price-current',
          '.price',
          '[data-price]'
        ]
      },
      'Walmart': {
        baseUrl: 'https://www.walmart.com',
        searchUrl: 'https://www.walmart.com/search?q=',
        waitSelectors: ['.search-result', '[data-item-id]', '.product-title'],
        priceSelectors: [
          'span[itemprop="price"]',
          '.price-characteristic',
          '[data-automation-id="product-price"]',
          'span.price'
        ]
      },
      'Sams Club': {
        baseUrl: 'https://www.samsclub.com',
        searchUrl: 'https://www.samsclub.com/s/',
        waitSelectors: ['.sc-product-card', '[data-locator="product-card"]'],
        priceSelectors: [
          'span[data-automation-id="productPrice"]',
          '.Price-characteristic',
          'span.sc-price'
        ]
      },
      'Instacart': {
        baseUrl: 'https://www.instacart.com',
        searchUrl: 'https://www.instacart.com/store/s?k=',
        waitSelectors: ['[data-testid="item-card"]', '.item-card'],
        priceSelectors: [
          'span[data-testid="price"]',
          '.item-price',
          '[class*="price"]'
        ]
      }
    };
  }

  /**
   * Get random delay for human-like behavior
   */
  getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Launch browser with stealth plugin and anti-detection measures
   */
  async connect(headless = false, useProxy = false, proxyConfig = null) {
    try {
      logger.info(`Launching stealth browser (headless: ${headless})...`);

      // Apply stealth plugin to avoid detection
      chromium.use(stealthPlugin());

      // Get random user agent
      const randomUA = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      logger.info(`Using User-Agent: ${randomUA.substring(0, 50)}...`);

      const launchOptions = {
        headless: headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled', // Hide automation
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080'
        ]
      };

      // Add proxy if configured
      if (useProxy && proxyConfig) {
        launchOptions.proxy = {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password
        };
        logger.info(`Using proxy: ${proxyConfig.server}`);
      }

      this.browser = await chromium.launch(launchOptions);

      // Create context with realistic settings
      this.context = await this.browser.newContext({
        userAgent: randomUA,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      this.page = await this.context.newPage();

      // Additional evasion: Override navigator.webdriver
      await this.page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
      });

      this.connected = true;
      logger.info('✅ Stealth browser launched successfully');

      return { success: true };
    } catch (error) {
      logger.error('Failed to launch stealth browser:', { error: error.message });
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

      logger.info('Stealth browser closed');
    } catch (error) {
      logger.error('Error closing browser:', { error: error.message });
    }
  }

  /**
   * Human-like page scrolling
   */
  async humanScroll(page) {
    try {
      // Scroll down in increments
      for (let i = 0; i < 3; i++) {
        await page.evaluate((scrollStep) => {
          window.scrollBy(0, scrollStep);
        }, this.getRandomDelay(200, 400));
        await page.waitForTimeout(this.getRandomDelay(500, 1500));
      }

      // Scroll back up a bit (human behavior)
      await page.evaluate(() => {
        window.scrollBy(0, -200);
      });
      await page.waitForTimeout(this.getRandomDelay(500, 1000));
    } catch (error) {
      logger.debug('Scroll error (non-critical):', error.message);
    }
  }

  /**
   * Search and extract price from a store website with anti-detection
   */
  async searchAndExtractPrice(storeName, storeConfig, searchQuery) {
    if (!this.connected || !this.page) {
      logger.warn('Browser not connected');
      return null;
    }

    try {
      const searchUrl = `${storeConfig.searchUrl}${encodeURIComponent(searchQuery)}`;
      logger.info(`🔍 Searching ${storeName} for "${searchQuery}"`);
      logger.scraping(searchUrl, false, { action: 'navigate_start' });

      // Random delay before navigation (human behavior)
      await this.page.waitForTimeout(this.getRandomDelay(1000, 3000));

      // Navigate with realistic settings
      const response = await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      // Check if we got blocked
      if (response.status() === 403 || response.status() === 429) {
        logger.warn(`Got ${response.status()} status from ${storeName}`);
        return null;
      }

      logger.scraping(searchUrl, true, { action: 'navigate_complete', status: response.status() });

      // Wait for initial load
      await this.page.waitForTimeout(this.getRandomDelay(2000, 4000));

      // Try to wait for product elements to appear
      let productsLoaded = false;
      for (const selector of storeConfig.waitSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
          productsLoaded = true;
          logger.debug(`Products loaded with selector: ${selector}`);
          break;
        } catch (e) {
          // Try next selector
        }
      }

      if (!productsLoaded) {
        logger.warn(`No products found on ${storeName} page`);
      }

      // Human-like scrolling to load dynamic content
      await this.humanScroll(this.page);

      // Additional wait for prices to render
      await this.page.waitForTimeout(this.getRandomDelay(2000, 3000));

      // Extract prices using multiple selectors
      const prices = await this.page.evaluate((selectors) => {
        const allPrices = [];

        // Try each selector
        for (const selector of selectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.textContent ||
                          el.getAttribute('data-price') ||
                          el.getAttribute('content') ||
                          el.getAttribute('aria-label');

              if (text) {
                // Extract price numbers - handle various formats
                const matches = text.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
                if (matches) {
                  for (const match of matches) {
                    const cleanPrice = match.replace(/[$,\s]/g, '');
                    const price = parseFloat(cleanPrice);

                    // Reasonable bulk price range: $1 to $500
                    if (price >= 1 && price <= 500 && !isNaN(price)) {
                      allPrices.push(price);
                    }
                  }
                }
              }
            }

            // If we found prices with this selector, stop trying
            if (allPrices.length > 0) {
              console.log(`Found ${allPrices.length} prices with selector: ${selector}`);
              break;
            }
          } catch (err) {
            console.error(`Error with selector ${selector}:`, err.message);
          }
        }

        return allPrices;
      }, storeConfig.priceSelectors);

      if (prices && prices.length > 0) {
        // Get the minimum price (best deal)
        const minPrice = Math.min(...prices);
        logger.info(`✅ Found ${prices.length} prices at ${storeName}, best: $${minPrice.toFixed(2)}`);

        return {
          store: storeName,
          price: minPrice,
          url: searchUrl,
          source: 'live',
          method: 'stealth_playwright',
          timestamp: new Date().toISOString(),
          pricesFound: prices.length,
          allPrices: prices.slice(0, 5) // Keep top 5 for debugging
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
   * Research bulk food prices with stealth techniques
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

        // Search each store with human-like delays
        for (const [storeName, storeConfig] of Object.entries(this.stores)) {
          const priceData = await this.searchAndExtractPrice(
            storeName,
            storeConfig,
            `${item} bulk wholesale`
          );

          if (priceData) {
            prices.push(priceData);
          }

          // Random delay between stores (rate limiting)
          const delay = this.getRandomDelay(3000, 7000);
          logger.debug(`Waiting ${delay}ms before next store...`);
          await this.page.waitForTimeout(delay);
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
        method: 'stealth_playwright_real',
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
   * Estimate bulk prices (fallback database)
   */
  estimateBulkPrice(item) {
    const priceMap = {
      'Ground Beef': { unit: 'per 10lb case', price: 35.00 },
      'Hamburger Buns': { unit: 'per 8-dozen case', price: 28.00 },
      'Potato Salad': { unit: 'per 5lb container', price: 12.00 },
      'Hot Dogs': { unit: 'per 5lb pack', price: 15.00 },
      'Chicken Breasts': { unit: 'per 10lb case', price: 28.00 }
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

export default StealthPlaywrightClient;
