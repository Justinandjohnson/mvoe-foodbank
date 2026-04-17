// Price Research Agent - Automates bulk price comparison across stores
import ZenClient from '../mcp/zenClient.js';
import ChromeDevToolsClient from '../mcp/chromeDevToolsClient.js';

class PriceResearchAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.zenClient = new ZenClient();
    this.chromeMCP = new ChromeDevToolsClient(); // Chrome DevTools MCP client

    // Stores configuration (can be loaded from external config later)
    this.stores = process.env.PRICE_RESEARCH_STORES ?
      JSON.parse(process.env.PRICE_RESEARCH_STORES) : [
        { name: 'Costco', homepage: 'https://www.costco.com' },
        { name: 'Sam\'s Club', homepage: 'https://www.samsclub.com' },
        { name: 'Walmart', homepage: 'https://www.walmart.com' },
        { name: 'Restaurant Depot', homepage: 'https://www.restaurantdepot.com' }
      ];

    // Chrome MCP tools available to AI
    this.availableMCPTools = [
      'navigate_page(url) - Navigate to a URL',
      'take_snapshot() - Get page structure with element references',
      'click(uid) - Click an element by its uid from snapshot',
      'fill(uid, text) - Type text into an input by its uid',
      'wait_for(text, timeout) - Wait for text to appear',
      'evaluate_script(function) - Run JavaScript on page',
      'take_screenshot() - Capture page screenshot',
      'list_network_requests() - View all network requests'
    ];
  }

  /**
   * Execute price research for a list of items
   */
  async execute(jobData) {
    const { userId, sessionId, items, budget } = jobData;

    try {
      this.emitProgress(sessionId, '🔍 Starting AI-driven price research...');

      // Initialize Chrome MCP connection
      await this.chromeMCP.connect();

      const results = [];

      // Research each item across all stores
      for (const item of items) {
        this.emitProgress(sessionId, `Searching for: ${item.name}...`);

        const itemResults = await this.researchItem(item, sessionId);
        results.push({
          item: item.name,
          quantity: item.quantity || 'bulk',
          prices: itemResults
        });

        // Progress update
        this.emitProgress(sessionId, `Progress: ${results.length}/${items.length} items researched`);
      }

      // Close Chrome MCP connection
      await this.chromeMCP.disconnect();

      // Let AI analyze ALL results and generate complete summary
      this.emitProgress(sessionId, '🤖 AI analyzing all price data and calculating best deals...');
      const aiAnalysis = await this.getAICompleteAnalysis(results, items, budget, sessionId);

      const finalResult = {
        success: true,
        research: results,
        analysis: aiAnalysis,
        timestamp: new Date().toISOString()
      };

      this.emitComplete(sessionId, finalResult);
      return finalResult;

    } catch (error) {
      console.error('Price research agent error:', error);
      await this.chromeMCP.disconnect(); // Cleanup on error
      this.emitError(sessionId, error.message);
      throw error;
    }
  }

  /**
   * Research a single item across all stores using AI-driven navigation
   */
  async researchItem(item, sessionId) {
    const itemName = typeof item === 'string' ? item : item.name;
    const results = [];

    // Search each store
    for (const store of this.stores) {
      try {
        this.emitProgress(sessionId, `Checking ${store.name}...`);

        const priceData = await this.searchStoreForItem(store, itemName, sessionId);

        if (priceData) {
          results.push(priceData);
        }
      } catch (error) {
        console.error(`Failed to search ${store.name}:`, error.message);
        this.emitProgress(sessionId, `⚠️ ${store.name} search failed: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Search a specific store for an item using AI-driven navigation
   */
  async searchStoreForItem(store, itemName, sessionId) {
    // Build AI prompt with available Chrome MCP tools
    const navigationPrompt = this.buildNavigationPrompt(store, itemName);

    // Get AI's navigation plan
    const aiPlan = await this.getAINavigationPlan(navigationPrompt);

    // Execute the AI's plan using Chrome MCP tools
    const priceData = await this.executeNavigationPlan(aiPlan, store, itemName, sessionId);

    return priceData;
  }

  /**
   * Build prompt for AI to generate navigation plan
   */
  buildNavigationPrompt(store, itemName) {
    return `You are a web navigation AI. Your task is to find the price for "${itemName}" on ${store.name}.

AVAILABLE CHROME MCP TOOLS:
${this.availableMCPTools.map((tool, i) => `${i + 1}. ${tool}`).join('\n')}

REQUIREMENTS:
- Start by navigating to ${store.homepage}
- Use natural navigation (search bars, buttons) - NEVER manipulate URLs
- Find the search input, type "${itemName}", and submit
- Extract the first product's price from search results
- Return the price as a number

Generate a step-by-step navigation plan as a JSON array. Each step should have:
- "action": tool name (navigate_page, take_snapshot, click, fill, wait_for, evaluate_script)
- "params": parameters for the tool
- "description": what this step does

Example format:
[
  {"action": "navigate_page", "params": {"url": "${store.homepage}"}, "description": "Navigate to homepage"},
  {"action": "take_snapshot", "params": {}, "description": "Get page structure"},
  {"action": "click", "params": {"uid": "search-button-uid"}, "description": "Click search button"},
  {"action": "fill", "params": {"uid": "search-input-uid", "text": "${itemName}"}, "description": "Type search term"},
  {"action": "evaluate_script", "params": {"function": "() => { return document.querySelector('.price').textContent }"}, "description": "Extract price"}
]

Return ONLY the JSON array, no other text.`;
  }

  /**
   * Get AI's navigation plan using ZenClient
   */
  async getAINavigationPlan(prompt) {
    const zenResponse = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.3,
      systemPrompt: 'You are a web navigation AI. Return ONLY valid JSON arrays, no markdown formatting, no code blocks, no explanatory text.'
    });

    // Parse JSON response
    const responseText = zenResponse.text || zenResponse.content || '';

    try {
      // Remove markdown code blocks if present
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\n?/g, '');
      }

      // Extract JSON array from response
      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Try parsing directly
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('Failed to parse AI navigation plan. Response:', responseText);
      console.error('Parse error:', error.message);
      throw new Error('AI returned invalid navigation plan');
    }
  }

  /**
   * Execute AI's navigation plan using Chrome MCP tools
   */
  async executeNavigationPlan(plan, store, itemName, sessionId) {
    let snapshot = null;
    let price = null;

    for (const step of plan) {
      try {
        this.emitProgress(sessionId, `${store.name}: ${step.description}`);

        switch (step.action) {
          case 'navigate_page':
            const navResult = await this.chromeMCP.navigate(step.params.url);
            if (!navResult.success) {
              console.error('Navigation failed:', navResult.error);
            }
            break;

          case 'take_snapshot':
            const snapshotResult = await this.chromeMCP.takeSnapshot();
            if (snapshotResult.success && snapshotResult.data?.[0]?.text) {
              snapshot = snapshotResult.data[0].text;
            }
            break;

          case 'click':
            await this.chromeMCP.callTool('mcp__chrome-devtools__click', step.params);
            break;

          case 'fill':
            await this.chromeMCP.callTool('mcp__chrome-devtools__fill', step.params);
            break;

          case 'wait_for':
            await this.chromeMCP.callTool('mcp__chrome-devtools__wait_for', step.params);
            break;

          case 'evaluate_script':
            const evalResult = await this.chromeMCP.evaluate(step.params.function, step.params.args || []);
            if (evalResult.success && evalResult.data?.[0]?.text) {
              // Let AI parse the result
              price = await this.extractPriceViaAI(evalResult.data[0].text);
            }
            break;

          default:
            console.warn(`Unknown action: ${step.action}`);
        }

        // Small delay between actions to appear human-like
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      } catch (error) {
        console.error(`Step failed (${step.action}):`, error.message);
        // Continue with next step instead of failing completely
      }
    }

    // Return price data if found
    if (price && price > 0) {
      return {
        store: store.name,
        price,
        unit: 'bulk',
        availability: 'In Stock',
        url: store.homepage,
        source: 'live',
        method: 'AI-driven Chrome MCP'
      };
    }

    throw new Error(`No price found for ${itemName} at ${store.name}`);
  }

  /**
   * Extract price from text using AI (no regex)
   */
  async extractPriceViaAI(text) {
    const prompt = `Extract the price from this text: "${text}". Return ONLY the numeric price value, no currency symbol, no other text. Example: "45.99"`;
    const response = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.1
    });

    const priceValue = parseFloat(response.text.trim());
    if (isNaN(priceValue)) {
      throw new Error('AI could not extract price');
    }

    return priceValue;
  }

  /**
   * Get AI to perform complete analysis - finding best deals, calculating savings, recommendations
   */
  async getAICompleteAnalysis(results, items, budget, sessionId) {
    const prompt = `Analyze this price data: ${JSON.stringify(results)}. Items: ${items.length}. Budget: $${budget || 'none'}.

Find best deals, calculate savings, create shopping strategy. Return JSON:
{
  "itemAnalysis": [{"item": "name", "bestDeal": {"store": "name", "price": 0.00}, "potentialSavings": 0.00}],
  "overallAnalysis": {"totalPotentialSavings": 0.00, "bestStore": "name", "estimatedOptimalCost": 0.00},
  "shoppingStrategy": {"storeByStore": {}, "priorityOrder": []},
  "recommendations": [],
  "summary": "text"
}`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gemini-2.5-flash',
      temperature: 0.3
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI failed to analyze price data');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Emit progress updates via WebSocket
   */
  emitProgress(sessionId, message) {
    this.io.to(sessionId).emit('agent:progress', {
      type: 'progress',
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit completion via WebSocket
   */
  emitComplete(sessionId, result) {
    this.io.to(sessionId).emit('agent:complete', {
      type: 'complete',
      result,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Emit error via WebSocket
   */
  emitError(sessionId, error) {
    this.io.to(sessionId).emit('agent:error', {
      type: 'error',
      error,
      timestamp: new Date().toISOString()
    });
  }
}

export default PriceResearchAgent;
