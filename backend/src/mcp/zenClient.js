// Zen MCP Client - Conversational AI for meal planning
// Supports both Claude (Anthropic) and OpenAI
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

class ZenClient {
  constructor() {
    // Try Claude first, fall back to OpenAI
    const claudeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (claudeKey) {
      this.provider = 'claude';
      this.anthropic = new Anthropic({ apiKey: claudeKey });
      console.log('✅ Using Claude API for AI agents');
    } else if (openaiKey) {
      this.provider = 'openai';
      this.openai = new OpenAI({ apiKey: openaiKey });
      console.log('✅ Using OpenAI API for AI agents');
    } else {
      console.warn('⚠️  No AI API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
      this.provider = 'none';
    }

    this.connected = true;
  }

  /**
   * Connect to AI service (no-op for direct API)
   */
  async connect() {
    // Direct API connection, always ready
    console.log('✅ Zen AI client ready (using direct OpenAI API)');
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

      if (this.provider === 'claude') {
        // Use Claude
        const response = await this.anthropic.messages.create({
          model: chatOptions.model || 'claude-3-5-sonnet-20241022',
          max_tokens: chatOptions.maxTokens || 2000,
          temperature: chatOptions.temperature || 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        });
        content = response.content[0].text;

      } else if (this.provider === 'openai') {
        // Use OpenAI - map non-OpenAI model names to OpenAI models
        let openaiModel = chatOptions.model || 'gpt-4o-mini';

        // Map Claude/Gemini models to OpenAI equivalents
        const modelMap = {
          'claude-3-5-sonnet-20241022': 'gpt-4o',
          'gemini-2.5-flash': 'gpt-4o-mini',
          'gemini-2.5-pro': 'gpt-4o'
        };

        if (modelMap[openaiModel]) {
          openaiModel = modelMap[openaiModel];
        }

        const response = await this.openai.chat.completions.create({
          model: openaiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: chatOptions.temperature || 0.7,
          max_tokens: chatOptions.maxTokens || 2000
        });
        content = response.choices[0].message.content;

      } else {
        throw new Error('No AI provider configured');
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
