// Zen MCP Client - Conversational AI for meal planning
// Prefers OpenRouter MiniMax M2.7, with direct-provider fallback only if needed.
import OpenAI from 'openai';

export function resolveOpenRouterModel(requestedModel) {
  const modelMap = {
    'gpt-4o': 'minimax/minimax-m2.7',
    'gpt-4o-mini': 'minimax/minimax-m2.7',
    'claude-3-5-sonnet-20241022': 'minimax/minimax-m2.7',
    'claude-3-5-sonnet-latest': 'minimax/minimax-m2.7',
    'claude-sonnet-4-20250514': 'minimax/minimax-m2.7',
    'claude-3-haiku-20240307': 'minimax/minimax-m2.7',
    'claude-3-5-haiku-latest': 'minimax/minimax-m2.7',
    'gemini-2.5-flash': 'minimax/minimax-m2.7',
    'gemini-2.5-pro': 'minimax/minimax-m2.7',
    'minimax/minimax-m2.7': 'minimax/minimax-m2.7',
  };

  return modelMap[requestedModel] || requestedModel || 'minimax/minimax-m2.7';
}

export function resolveOpenAIModel(requestedModel) {
  const modelMap = {
    'claude-3-5-sonnet-20241022': 'gpt-4o',
    'claude-sonnet-4-20250514': 'gpt-4o',
    'claude-3-haiku-20240307': 'gpt-4o-mini',
    'gemini-2.5-flash': 'gpt-4o-mini',
    'gemini-2.5-pro': 'gpt-4o'
  };

  return modelMap[requestedModel] || requestedModel || 'gpt-4o-mini';
}

export function getZenRuntimeStatus() {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  if (openRouterKey) {
    return {
      provider: 'openrouter',
      configured: true,
      model: 'minimax/minimax-m2.7',
      message: 'OpenRouter is configured for live agent runs.',
    };
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      configured: true,
      model: 'gpt-4o',
      message: 'OpenAI is configured for live agent runs.',
    };
  }

  if (claudeKey) {
    return {
      provider: 'none',
      configured: false,
      model: null,
      message: 'Claude credentials exist, but OPENROUTER_API_KEY or OPENAI_API_KEY is required for live grant runs.',
    };
  }

  return {
    provider: 'none',
    configured: false,
    model: null,
    message: 'No AI provider key is configured for live grant runs.',
  };
}

class ZenClient {
  constructor() {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    this.openRouterClient = null;
    this.openAiClient = null;

    if (openRouterKey) {
      this.openRouterClient = new OpenAI({
        apiKey: openRouterKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://mvoe.org',
          'X-Title': 'MVOE Pantry Platform',
        },
      });
    }

    if (openaiKey) {
      this.openAiClient = new OpenAI({ apiKey: openaiKey });
    }

    // Primary provider - set for status reporting only
    if (this.openRouterClient) {
      this.provider = 'openrouter';
      console.log('✅ Using OpenRouter (with OpenAI fallback) for AI agents');
    } else if (this.openAiClient) {
      this.provider = 'openai';
      console.log('✅ Using OpenAI API for AI agents');
    } else {
      this.provider = 'none';
      console.warn('⚠️  No AI API key found. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env');
    }

    // Legacy: expose this.openai so other code that reads it still works
    this.openai = this.openRouterClient || this.openAiClient;
    this.connected = true;
  }

  /**
   * Connect to AI service (no-op for direct API)
   */
  async connect() {
    // Direct API connection, always ready
    console.log(`✅ Zen AI client ready (provider: ${this.provider})`);
  }

  /**
   * Disconnect from AI service (no-op for direct API)
   */
  async disconnect() {
    // Direct API, nothing to disconnect
    console.log('Zen AI client closed');
  }

  /**
   * Use AI (Claude or OpenAI) for conversational tasks
   */
  async chat(options = {}) {
    try {
      // Handle both old format (prompt as first arg) and new format (options object)
      const prompt = typeof options === 'string' ? options : options.prompt;
      const chatOptions = typeof options === 'string' ? {} : options;

      const systemPrompt = chatOptions.systemPrompt ||
        'You are an expert meal planner, content creator, and nutritionist specializing in community events, food banks, and bulk food preparation. Provide detailed, practical, and actionable advice.';

      let content;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];
      const temperature = chatOptions.temperature || 0.7;
      const max_tokens = chatOptions.maxTokens || 2000;

      // Try OpenRouter first, fall back to OpenAI on any auth/rate error
      if (this.openRouterClient) {
        try {
          const response = await this.openRouterClient.chat.completions.create({
            model: resolveOpenRouterModel(chatOptions.model),
            messages,
            temperature,
            max_tokens,
          });
          content = response.choices[0].message.content;
        } catch (routerErr) {
          const isAuthError = routerErr.status === 401 || routerErr.status === 403
            || (routerErr.message || '').toLowerCase().includes('user not found')
            || (routerErr.message || '').toLowerCase().includes('authentication');

          if (isAuthError && this.openAiClient) {
            console.warn('OpenRouter auth failed, falling back to OpenAI:', routerErr.message);
            const response = await this.openAiClient.chat.completions.create({
              model: resolveOpenAIModel(chatOptions.model),
              messages,
              temperature,
              max_tokens,
            });
            content = response.choices[0].message.content;
          } else {
            throw routerErr;
          }
        }
      } else if (this.openAiClient) {
        const response = await this.openAiClient.chat.completions.create({
          model: resolveOpenAIModel(chatOptions.model),
          messages,
          temperature,
          max_tokens,
        });
        content = response.choices[0].message.content;
      } else {
        throw new Error('No AI provider configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
      }

      return {
        success: true,
        text: content,
        data: [{ text: content }],
        recommendations: content
      };
    } catch (error) {
      console.error(`${this.provider} API error:`, error);
      return {
        success: false,
        error: error.message,
        text: ''
      };
    }
  }

  /**
   * Use Claude for complex meal planning
   */
  async plan(step, stepNumber, totalSteps, findings, options = {}) {
    const planningPrompt = `You are working on step ${stepNumber} of ${totalSteps} in a meal planning process.

Current step: ${step}
Previous findings: ${findings}
Next step needed: ${stepNumber < totalSteps}

Provide detailed planning advice for this step, considering previous findings and the overall meal planning goal.`;

    return await this.chat({ prompt: planningPrompt, ...options });
  }

  /**
   * Plan a community meal using AI planning capabilities
   */
  async planCommunityMeal(requirements) {
    const prompt = `You are a professional meal planner. Create a detailed community meal plan with these requirements:

**Event Details:**
- People to serve: ${requirements.people}
- Budget: $${requirements.budget} ($${(requirements.budget / requirements.people).toFixed(2)} per person)
- Dietary restrictions: ${requirements.dietary.join(', ') || 'None'}
- Allergens to avoid: ${requirements.allergens.join(', ') || 'None'}

**Please provide a structured response with:**

1. **MENU RECOMMENDATIONS:**
   - Main dishes (consider dietary restrictions)
   - Side dishes
   - Beverages
   - Specific quantities needed

2. **BUDGET BREAKDOWN:**
   - Cost estimates per category
   - Money-saving tips
   - Bulk purchasing recommendations

3. **SHOPPING STRATEGY:**
   - Best stores for bulk buying
   - Timing recommendations
   - Alternative ingredients if budget is tight

4. **PREPARATION TIMELINE:**
   - Day-before tasks
   - Day-of schedule
   - Volunteer coordination suggestions

5. **DIETARY COMPLIANCE:**
   - How menu accommodates all restrictions
   - Alternative options for special diets
   - Safety considerations for allergens

Be specific with quantities, realistic with costs, and practical with timing.`;

    const result = await this.chat({
      prompt: prompt,
      model: 'gpt-4o', // Will work with both OpenAI and Claude
      temperature: 0.7,
      maxTokens: 2000
    });

    if (result.success) {
      return this.parseMealPlanResponse(result.data);
    }

    return null;
  }

  /**
   * Parse Zen's meal plan response
   */
  parseMealPlanResponse(data) {
    try {
      // Zen returns content as array of text blocks
      const text = data.map(block => block.text || '').join('\n');

      return {
        suggestions: text,
        rawText: text
      };
    } catch (error) {
      console.error('Error parsing Zen response:', error);
      return {
        suggestions: 'Unable to parse meal plan suggestions',
        rawText: ''
      };
    }
  }
}

export default ZenClient;
