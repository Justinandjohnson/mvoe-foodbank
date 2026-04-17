// Community Meal Planner Agent - AI-driven MCP tool orchestration
import USDAClient from '../mcp/usdaClient.js';
import ZenClient from '../mcp/zenClient.js';
import ChromeDevToolsClient from '../mcp/chromeDevToolsClient.js';

class MealPlannerAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.usdaClient = new USDAClient();
    this.zenClient = new ZenClient();
    this.chromeDevToolsClient = new ChromeDevToolsClient();

    // Available MCP tools for AI to orchestrate
    this.availableTools = [
      {
        name: 'usda_analyze_nutrition',
        description: 'Analyze nutrition data for ingredients using USDA database',
        client: 'usdaClient',
        params: ['ingredients (array of {foodName, quantity, unit})', 'servings (number)']
      },
      {
        name: 'usda_verify_allergens',
        description: 'Verify ingredients are free from specified allergens',
        client: 'usdaClient',
        params: ['ingredients (array)', 'allergens (array)']
      },
      {
        name: 'chrome_research_prices',
        description: 'Research bulk food prices online using web scraping',
        client: 'chromeDevToolsClient',
        params: ['foodItems (array of item names)']
      },
      {
        name: 'chrome_get_best_deals',
        description: 'Find best deals for shopping list across stores',
        client: 'chromeDevToolsClient',
        params: ['shoppingList (grouped by category)']
      },
      {
        name: 'zen_plan_meal',
        description: 'Generate meal plan suggestions using AI',
        client: 'zenClient',
        params: ['requirements (people, budget, dietary, allergens)']
      }
    ];
  }

  /**
   * Main agent execution - AI decides which tools to use and in what order
   */
  async execute(jobData) {
    const { userId, sessionId, request } = jobData;

    this.emitProgress(sessionId, '🤖 AI analyzing your meal planning request...');

    // Step 1: Ask AI to parse request and create execution plan
    const executionPlan = await this.getAIExecutionPlan(request, sessionId);

    // Step 2: Execute the AI's plan
    const results = await this.executeAIPlan(executionPlan, request, sessionId);

    // Step 3: Return final result
    const result = {
      success: true,
      plan: results
    };

    this.emitComplete(sessionId, result);
    return result;
  }

  /**
   * Get AI's execution plan - which tools to use and in what order
   */
  async getAIExecutionPlan(userRequest, sessionId) {
    const prompt = `You are a meal planning orchestrator. Analyze this request and create an execution plan:

USER REQUEST: "${userRequest}"

AVAILABLE MCP TOOLS:
${this.availableTools.map((tool, i) => `${i + 1}. ${tool.name}: ${tool.description} (params: ${tool.params.join(', ')})`).join('\n')}

YOUR TASKS:
1. Parse the user request to extract: number of people, budget, dietary restrictions, allergens
2. Create a step-by-step execution plan using the available MCP tools
3. Each step should use ONE tool and include all required parameters

Return JSON:
{
  "parsedRequest": {
    "people": number,
    "budget": number,
    "dietary": [],
    "allergens": []
  },
  "executionPlan": [
    {"tool": "tool_name", "params": {...}, "description": "what this step does"}
  ]
}

Return ONLY valid JSON, no markdown.`;

    const zenResponse = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.3
    });

    const jsonMatch = zenResponse.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI failed to return valid execution plan JSON');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Execute the AI's plan step by step
   */
  async executeAIPlan(planData, userRequest, sessionId) {
    const { parsedRequest, executionPlan } = planData;
    const results = {};

    for (const step of executionPlan) {
      this.emitProgress(sessionId, `${step.description}...`);

      switch (step.tool) {
        case 'zen_plan_meal':
          results.menu = await this.zenClient.planCommunityMeal(step.params);
          break;

        case 'usda_analyze_nutrition':
          results.nutrition = await this.usdaClient.request({
            method: 'usda_analyze_nutrition',
            params: step.params
          });
          break;

        case 'usda_verify_allergens':
          results.allergenVerification = await this.usdaClient.request({
            method: 'usda_verify_allergens',
            params: step.params
          });
          break;

        case 'chrome_research_prices':
          results.priceResearch = await this.chromeDevToolsClient.researchBulkPrices(step.params.foodItems);
          break;

        case 'chrome_get_best_deals':
          results.bestDeals = await this.chromeDevToolsClient.getBestDeals(step.params.shoppingList);
          break;

        case 'zen_plan_meal':
          results[step.tool] = await this.zenClient.chat({
            prompt: `Execute this task: ${step.description}. Context: ${JSON.stringify(step.params)}`,
            model: 'gpt-4o-mini'
          });
          break;

        default:
          throw new Error(`Unknown MCP tool: ${step.tool}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      ...results,
      parsedRequest,
      executionPlan: executionPlan.map(s => s.description)
    };
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

export default MealPlannerAgent;
