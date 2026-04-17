// Chrome DevTools MCP Client - Web automation for price research
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class ChromeDevToolsClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.serverPath = process.env.CHROME_DEVTOOLS_MCP_PATH || 'npx';
    this.serverArgs = ['-y', 'chrome-devtools-mcp'];
  }

  /**
   * Connect to Chrome DevTools MCP server
   */
  async connect() {
    if (this.connected) {
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: this.serverPath,
        args: this.serverArgs,
      });

      this.client = new Client({
        name: 'mvoe-price-research',
        version: '1.0.0',
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      this.connected = true;
      console.log('✅ Chrome DevTools MCP client connected');
    } catch (error) {
      console.error('Failed to connect to Chrome DevTools MCP:', error);
      this.connected = false;
    }
  }

  /**
   * Disconnect from Chrome DevTools MCP server
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connected = false;
      console.log('Chrome DevTools MCP client disconnected');
    }
  }

  /**
   * Call Chrome DevTools MCP tool
   */
  async callTool(toolName, args) {
    if (!this.connected) {
      await this.connect();
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return {
        success: true,
        data: result.content
      };
    } catch (error) {
      console.error(`Chrome DevTools MCP tool error (${toolName}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url) {
    return await this.callTool('mcp__chrome-devtools__navigate_page', { url });
  }

  /**
   * Take a snapshot of the page
   */
  async takeSnapshot() {
    return await this.callTool('mcp__chrome-devtools__take_snapshot', {});
  }

  /**
   * Evaluate JavaScript on the page
   */
  async evaluate(functionCode, args = []) {
    return await this.callTool('mcp__chrome-devtools__evaluate_script', {
      function: functionCode,
      args
    });
  }

  /**
   * Search and extract price from a website
   */
  async searchAndExtractPrice(storeName, storeUrl, searchQuery) {
    try {
      console.log(`🔍 Searching ${storeName} for "${searchQuery}"...`);

      // Navigate to search page
      const searchUrl = `${storeUrl}${encodeURIComponent(searchQuery)}`;
      const navResult = await this.navigate(searchUrl);

      if (!navResult.success) {
        console.log(`⚠️ Failed to navigate to ${storeName}`);
        return null;
      }

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Take snapshot to see page structure
      const snapshot = await this.takeSnapshot();

      if (!snapshot.success) {
        console.log(`⚠️ Failed to take snapshot of ${storeName}`);
        return null;
      }

      // Extract price information from snapshot
      const snapshotText = snapshot.data?.[0]?.text || '';

      // Look for price patterns in the snapshot
      const priceMatch = snapshotText.match(/\$(\d+\.?\d*)/);

      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        console.log(`✅ Found price at ${storeName}: $${price}`);

        return {
          store: storeName,
          price: price,
          url: searchUrl,
          source: 'live'
        };
      }

      // If no price found in snapshot, try evaluating JavaScript
      const evalResult = await this.evaluate(`
        () => {
          // Common price selectors across different stores
          const selectors = [
            '[data-price]',
            '.price',
            '.product-price',
            '[class*="price"]',
            '[class*="Price"]',
            'span[itemprop="price"]'
          ];

          for (const selector of selectors) {
            const priceElement = document.querySelector(selector);
            if (priceElement) {
              const priceText = priceElement.textContent || priceElement.getAttribute('data-price');
              const match = priceText.match(/\\$?(\\d+\\.?\\d*)/);
              if (match) {
                return {
                  price: parseFloat(match[1]),
                  found: true
                };
              }
            }
          }

          // Try to find any price in the page
          const bodyText = document.body.innerText;
          const priceMatches = bodyText.match(/\\$\\d+\\.?\\d*/g);
          if (priceMatches && priceMatches.length > 0) {
            return {
              price: parseFloat(priceMatches[0].replace('$', '')),
              found: true,
              method: 'body_scan'
            };
          }

          return { found: false };
        }
      `);

      if (evalResult.success && evalResult.data?.[0]?.text) {
        const result = JSON.parse(evalResult.data[0].text);
        if (result.found) {
          console.log(`✅ Found price at ${storeName} via JS: $${result.price}`);
          return {
            store: storeName,
            price: result.price,
            url: searchUrl,
            source: 'live',
            method: result.method || 'selector'
          };
        }
      }

      console.log(`⚠️ No price found at ${storeName} for "${searchQuery}"`);
      return null;

    } catch (error) {
      console.error(`Error searching ${storeName}:`, error.message);
      return null;
    }
  }

  /**
   * Research bulk food prices online
   */
  async researchBulkPrices(foodItems) {
    try {
      const results = [];

      // Stores with search URLs
      const stores = [
        {
          name: 'Costco',
          url: 'https://www.costco.com/s?keyword=',
          enabled: true
        },
        {
          name: 'Sam\'s Club',
          url: 'https://www.samsclub.com/s/',
          enabled: true
        },
        {
          name: 'Walmart',
          url: 'https://www.walmart.com/search?q=',
          enabled: true
        },
        {
          name: 'Instacart',
          url: 'https://www.instacart.com/store/search_v3/',
          enabled: true
        }
      ];

      // Ensure connection
      if (!this.connected) {
        await this.connect();
      }

      for (const item of foodItems.slice(0, 3)) { // Limit to 3 items to avoid long wait
        console.log(`\n🔍 Researching prices for: ${item}`);

        const itemPrices = [];

        // Search each store
        for (const store of stores.filter(s => s.enabled)) {
          try {
            const priceData = await this.searchAndExtractPrice(
              store.name,
              store.url,
              item
            );

            if (priceData) {
              itemPrices.push(priceData);
            }

            // Rate limiting between searches
            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (error) {
            console.error(`Failed to check ${store.name}:`, error.message);
          }
        }

        // If we found live prices, use them
        if (itemPrices.length > 0) {
          results.push({
            item,
            prices: itemPrices,
            bestPrice: Math.min(...itemPrices.map(p => p.price)),
            bestStore: itemPrices.reduce((min, p) => p.price < min.price ? p : min).store,
            source: 'live'
          });
        } else {
          // Fallback to estimated prices
          const estimatedPrice = this.estimateBulkPrice(item);
          results.push({
            item,
            prices: [{
              store: 'Estimated',
              price: estimatedPrice.price,
              unit: estimatedPrice.unit,
              source: 'estimate'
            }],
            bestPrice: estimatedPrice.price,
            bestStore: 'Bulk Wholesaler',
            source: 'estimated',
            note: 'Live prices unavailable, using estimates'
          });
        }
      }

      return {
        success: true,
        results
      };
    } catch (error) {
      console.error('Price research error:', error);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }

  /**
   * Estimate bulk prices (fallback when browser automation not available)
   */
  estimateBulkPrice(item) {
    // Simplified bulk pricing estimates
    const priceMap = {
      'Hamburger Patties': { unit: 'per 10lb case', price: 35.00 },
      'Hamburger Buns': { unit: 'per dozen', price: 3.50 },
      'Hot Dogs': { unit: 'per 5lb pack', price: 15.00 },
      'Hot Dog Buns': { unit: 'per dozen', price: 3.00 },
      'Potato Salad': { unit: 'per 5lb container', price: 12.00 },
      'Coleslaw': { unit: 'per 5lb container', price: 10.00 },
      'Chips': { unit: 'per case (24 bags)', price: 18.00 },
      'Lettuce': { unit: 'per head', price: 2.00 },
      'Tomatoes': { unit: 'per 25lb case', price: 30.00 },
      'Cheese Slices': { unit: 'per 5lb block', price: 20.00 },
      'Lemonade': { unit: 'per gallon', price: 4.50 },
      'Bottled Water': { unit: 'per case (24)', price: 5.00 }
    };

    return priceMap[item] || { unit: 'per unit', price: 5.00 };
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
          savings: Math.max(0, item.estimatedCost * 0.15), // Estimate 15% bulk savings
          recommendation: `Buy ${pricing.unit} at bulk wholesaler`
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

export default ChromeDevToolsClient;
