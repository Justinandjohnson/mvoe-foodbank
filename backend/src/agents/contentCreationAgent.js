// Content Creation Agent - AI-driven content with OpenAI image generation & Email delivery
import ZenClient from '../mcp/zenClient.js';
import ImageClient from '../mcp/imageClient.js';
import EmailClient from '../mcp/emailClient.js';
import { recordAgentActivity } from '../services/agentActivityService.js';

class ContentCreationAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.zenClient = new ZenClient();
    this.imageClient = new ImageClient();
    this.emailClient = new EmailClient();

    // Available content creation tools for AI to orchestrate
    this.availableTools = [
      {
        name: 'create_social_media',
        description: 'Generate social media posts for Twitter, Facebook, Instagram, LinkedIn',
        params: ['organization', 'event', 'metrics', 'tone']
      },
      {
        name: 'generate_image',
        description: 'Generate any image using OpenAI DALLE with custom prompt',
        params: ['prompt', 'size', 'quality', 'saveFilename']
      },
      {
        name: 'generate_flyer_image',
        description: 'Generate flyer image using AI with event details',
        params: ['headline', 'subheadline', 'eventDetails', 'organization', 'date', 'location']
      },
      {
        name: 'generate_social_image',
        description: 'Generate social media image for specific platform',
        params: ['platform', 'message', 'organization']
      },
      {
        name: 'generate_blog_image',
        description: 'Generate blog featured image based on title and topic',
        params: ['title', 'topic', 'style']
      },
      {
        name: 'generate_newsletter_image',
        description: 'Generate newsletter header/banner image',
        params: ['title', 'organization', 'theme']
      },
      {
        name: 'create_newsletter',
        description: 'Create HTML email newsletter with donation highlights and events',
        params: ['organization', 'recentDonations', 'upcomingEvents', 'impactStories']
      },
      {
        name: 'send_newsletter',
        description: 'Send newsletter to email list using Resend/SendGrid',
        params: ['recipients', 'subject', 'html', 'from']
      },
      {
        name: 'create_blog_post',
        description: 'Write SEO-optimized blog post for website',
        params: ['topic', 'organization', 'keywords', 'targetLength']
      },
      {
        name: 'create_email_campaign',
        description: 'Design email campaign with A/B tested subject lines',
        params: ['campaignType', 'organization', 'goal', 'audience']
      },
      {
        name: 'send_campaign',
        description: 'Send email campaign to target audience',
        params: ['recipients', 'subjectLines', 'html', 'from']
      },
      {
        name: 'create_flyer',
        description: 'Generate flyer content with design suggestions',
        params: ['event', 'organization', 'date', 'location']
      },
      {
        name: 'edit_image',
        description: 'Edit or modify existing image using AI',
        params: ['prompt', 'imagePaths', 'maskPath']
      }
    ];
  }

  /**
   * Execute content creation - AI decides what content to create and how
   */
  async execute(jobData) {
    const { userId, sessionId, contentType, context } = jobData;

    try {
      this.emitProgress(sessionId, `🤖 AI analyzing content creation request...`);

      // If specific content type requested, use it
      if (contentType && contentType !== 'auto') {
        return await this.createSpecificContent(contentType, context, sessionId);
      }

      // Otherwise, let AI decide what content to create
      const executionPlan = await this.getAIContentPlan(context, sessionId);
      const results = await this.executeContentPlan(executionPlan, context, sessionId);

      const result = {
        success: true,
        contentCreated: results,
        aiPlan: executionPlan.map(step => step.description)
      };

      this.emitComplete(sessionId, result);
      return result;

    } catch (error) {
      console.error('Content creation agent error:', error);
      this.emitError(sessionId, error.message);
      throw error;
    }
  }

  /**
   * Create specific content type (original behavior)
   */
  async createSpecificContent(contentType, context, sessionId) {
    this.emitProgress(sessionId, `✍️ Creating ${contentType}...`);

    let result;

    switch (contentType) {
      case 'social_media':
        result = await this.createSocialMediaPost(context);
        break;

      case 'newsletter':
        result = await this.createNewsletter(context);
        break;

      case 'blog_post':
        result = await this.createBlogPost(context);
        break;

      case 'email_campaign':
        result = await this.createEmailCampaign(context);
        break;

      case 'flyer':
        result = await this.createFlyer(context);
        break;

      default:
        throw new Error(`Unknown content type: ${contentType}`);
    }

    this.emitComplete(sessionId, result);
    return result;
  }

  /**
   * Get AI's content creation plan
   */
  async getAIContentPlan(context, sessionId) {
    const prompt = `You are a content strategy AI. Analyze this request and decide what content to create:

CONTEXT: ${JSON.stringify(context, null, 2)}

AVAILABLE CONTENT TOOLS:
${this.availableTools.map((tool, i) => `${i + 1}. ${tool.name}: ${tool.description}`).join('\n')}

Create a content creation plan as a JSON array. Each step should:
- Use ONE content tool
- Include all required parameters from context
- Be ordered logically (e.g., social media after blog post to promote it)

Example format:
[
  {"tool": "create_blog_post", "params": {...}, "description": "Write blog about recent event"},
  {"tool": "create_social_media", "params": {...}, "description": "Promote blog on social media"}
]

Return ONLY the JSON array, no markdown, no explanatory text.`;

    const zenResponse = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.4,
      systemPrompt: 'You are a content strategy orchestrator. Return ONLY valid JSON arrays.'
    });

    const responseText = zenResponse.text || '';

    try {
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```\n?/g, '');
      }

      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return JSON.parse(cleanText);
    } catch (error) {
      console.error('Failed to parse AI content plan:', error.message);
      // Fallback: create social media by default
      return [{tool: 'create_social_media', params: context, description: 'Generate social media posts'}];
    }
  }

  /**
   * Execute AI's content plan
   */
  async executeContentPlan(plan, context, sessionId) {
    const results = [];

    for (const step of plan) {
      try {
        this.emitProgress(sessionId, `${step.description}...`);

        let content;
        const params = {...context, ...step.params, sessionId};

        switch (step.tool) {
          case 'create_social_media':
            content = await this.createSocialMediaPost(params);
            break;

          case 'generate_image':
            await this.imageClient.connect();
            content = await this.imageClient.generateImage(params);
            await this.imageClient.disconnect();
            break;

          case 'generate_flyer_image':
            await this.imageClient.connect();
            content = await this.imageClient.generateFlyer(params);
            await this.imageClient.disconnect();
            break;

          case 'generate_social_image':
            await this.imageClient.connect();
            content = await this.imageClient.generateSocialPost(params);
            await this.imageClient.disconnect();
            break;

          case 'generate_blog_image':
            await this.imageClient.connect();
            content = await this.imageClient.generateBlogImage(params);
            await this.imageClient.disconnect();
            break;

          case 'generate_newsletter_image':
            await this.imageClient.connect();
            content = await this.imageClient.generateNewsletterGraphic(params);
            await this.imageClient.disconnect();
            break;

          case 'edit_image':
            await this.imageClient.connect();
            content = await this.imageClient.editImage(params);
            await this.imageClient.disconnect();
            break;

          case 'create_newsletter':
            content = await this.createNewsletter(params);
            break;

          case 'send_newsletter':
            await this.emailClient.connect();
            content = await this.emailClient.sendNewsletter(params);
            await this.emailClient.disconnect();
            break;

          case 'create_blog_post':
            content = await this.createBlogPost(params);
            break;

          case 'create_email_campaign':
            content = await this.createEmailCampaign(params);
            break;

          case 'send_campaign':
            await this.emailClient.connect();
            content = await this.emailClient.sendCampaign(params);
            await this.emailClient.disconnect();
            break;

          case 'create_flyer':
            content = await this.createFlyer(params);
            break;


          default:
            console.warn(`Unknown tool: ${step.tool}`);
            continue;
        }

        results.push(content);
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Content creation step failed (${step.tool}):`, error.message);
        this.emitProgress(sessionId, `⚠️ ${step.description} failed - continuing...`);
      }
    }

    return results;
  }

  /**
   * Create social media posts for multiple platforms
   */
  async createSocialMediaPost(context) {
    const { organization, event, metrics, tone = 'inspiring' } = context;

    this.emitProgress(context.sessionId, '📱 Generating social media posts...');

    const prompt = `
      Create engaging social media posts for a food bank organization.

      Context:
      - Organization: ${organization || 'Community Food Bank'}
      - Event/News: ${event || 'Recent community meal'}
      - Impact Metrics: ${JSON.stringify(metrics)}
      - Tone: ${tone}

      Generate posts for:
      1. Twitter/X (280 characters, engaging hook)
      2. Facebook (longer format, story-driven)
      3. Instagram (visual-focused, hashtags)
      4. LinkedIn (professional, impact-focused)

      Include:
      - Compelling hooks
      - Relevant hashtags
      - Call to action
      - Emoji where appropriate
      - Impact statistics

      Return as JSON with separate posts for each platform.
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.8 // Higher for creativity
      });

      // Parse JSON response
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI failed to return social media posts JSON');
      }
      const posts = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        contentType: 'social_media',
        posts,
        metadata: {
          generatedAt: new Date().toISOString(),
          platforms: ['twitter', 'facebook', 'instagram', 'linkedin']
        }
      };

    } catch (error) {
      console.error('Social media generation error:', error);
      throw error;
    }
  }

  /**
   * Create email newsletter
   */
  async createNewsletter(context) {
    const { organization, recentDonations, upcomingEvents, impactStories } = context;

    this.emitProgress(context.sessionId, '📧 Writing newsletter content...');

    const prompt = `
      Create a monthly email newsletter for a food bank organization.

      Organization: ${organization || 'Community Food Bank'}

      Content to include:
      1. Opening message (warm, grateful tone)
      2. Recent impact highlights: ${JSON.stringify(recentDonations)}
      3. Upcoming events: ${JSON.stringify(upcomingEvents)}
      4. Success stories: ${JSON.stringify(impactStories)}
      5. Ways to get involved
      6. Call to action (donate, volunteer)

      Format in HTML with:
      - Clear sections with headers
      - Bullet points for easy scanning
      - Compelling CTAs
      - Professional but warm tone

      Return complete HTML newsletter.
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-pro',
        temperature: 0.7
      });

      // Extract subject line from AI response or generate via AI
      const subjectLine = await this.generateSubjectLineViaMCP(context, response.text);

      return {
        success: true,
        contentType: 'newsletter',
        html: response.text,
        subject: subjectLine,
        metadata: {
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Newsletter generation error:', error);
      throw error;
    }
  }

  /**
   * Create blog post
   */
  async createBlogPost(context) {
    const { topic, organization, keywords, targetLength = 800 } = context;

    this.emitProgress(context.sessionId, '✍️ Writing blog post...');

    const prompt = `
      Write an engaging blog post for a food bank organization.

      Topic: ${topic}
      Organization: ${organization}
      Target Length: ${targetLength} words
      SEO Keywords: ${keywords ? keywords.join(', ') : 'food bank, community, volunteer'}

      Structure:
      1. Catchy headline
      2. Engaging introduction (hook the reader)
      3. Main body (3-4 sections with subheadings)
      4. Personal stories or examples
      5. Impact statistics
      6. Conclusion with call to action

      Style:
      - Authentic and relatable
      - Include real-world examples
      - Data-driven where possible
      - Inspirational but not preachy
      - SEO-optimized

      Return as JSON with:
      {
        "headline": "",
        "subheadline": "",
        "content": "",
        "metaDescription": "",
        "suggestedImages": []
      }
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-pro',
        temperature: 0.75
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      const blogPost = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      return {
        success: true,
        contentType: 'blog_post',
        post: blogPost,
        metadata: {
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Blog post generation error:', error);
      throw error;
    }
  }

  /**
   * Create email campaign
   */
  async createEmailCampaign(context) {
    const { campaignType, organization, goal, audience } = context;

    this.emitProgress(context.sessionId, '📨 Creating email campaign...');

    const prompt = `
      Create a compelling email campaign for a food bank.

      Campaign Type: ${campaignType} (donation drive, volunteer recruitment, event invitation)
      Organization: ${organization}
      Goal: ${goal}
      Target Audience: ${audience}

      Generate:
      1. 3 subject line options (A/B testing)
      2. Preview text (50 characters)
      3. Email body (HTML format)
      4. Multiple CTAs throughout
      5. PS section (increases engagement)

      Best practices:
      - Personalization merge tags
      - Mobile-responsive
      - Clear hierarchy
      - Single primary CTA
      - Urgency without pressure

      Return as JSON with all components.
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.7
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      const campaign = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      return {
        success: true,
        contentType: 'email_campaign',
        campaign,
        metadata: {
          generatedAt: new Date().toISOString(),
          variants: campaign?.subjectLines?.length || 1
        }
      };

    } catch (error) {
      console.error('Email campaign generation error:', error);
      throw error;
    }
  }

  /**
   * Create event flyer
   */
  async createFlyer(context) {
    const { event, organization, date, location } = context;

    this.emitProgress(context.sessionId, '📄 Designing flyer content...');

    const prompt = `
      Create compelling flyer content for a food bank event.

      Event: ${event}
      Organization: ${organization}
      Date: ${date}
      Location: ${location}

      Generate:
      1. Headline (attention-grabbing)
      2. Subheadline (key benefit)
      3. Event details (formatted)
      4. What to bring/expect
      5. Call to action
      6. Contact information

      Also suggest:
      - Color scheme
      - Font pairings
      - Image suggestions
      - Layout tips

      Return as JSON with all content and design suggestions.
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-flash',
        temperature: 0.8
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      const flyer = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      return {
        success: true,
        contentType: 'flyer',
        flyer,
        metadata: {
          generatedAt: new Date().toISOString(),
          format: 'digital'
        }
      };

    } catch (error) {
      console.error('Flyer generation error:', error);
      throw error;
    }
  }

  /**
   * Generate email subject line via MCP (AI-driven)
   */
  async generateSubjectLineViaMCP(context, newsletterContent) {
    const prompt = `Create email subject line for this newsletter. Org: ${context.organization || 'Food Bank'}. Content: ${newsletterContent.substring(0, 500)}. Max 50 chars. Return ONLY the subject line.`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.7
    });

    return response.text.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Emit progress updates via WebSocket
   */
  emitProgress(sessionId, message) {
    const payload = {
      type: 'progress',
      agentType: 'content-creation',
      sessionId,
      message,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:progress', payload);
    this.io.emit('agent:progress', payload);
    recordAgentActivity({
      action: 'AGENT_PROGRESS',
      entityId: sessionId,
      details: { agentType: 'content-creation', message },
    });
  }

  /**
   * Emit completion via WebSocket
   */
  emitComplete(sessionId, result) {
    const payload = {
      type: 'complete',
      agentType: 'content-creation',
      sessionId,
      result,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:complete', payload);
    this.io.emit('agent:complete', payload);
    recordAgentActivity({
      action: 'AGENT_COMPLETE',
      entityId: sessionId,
      details: { agentType: 'content-creation' },
    });
  }

  /**
   * Emit error via WebSocket
   */
  emitError(sessionId, error) {
    const payload = {
      type: 'error',
      agentType: 'content-creation',
      sessionId,
      error,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:error', payload);
    this.io.emit('agent:error', payload);
    recordAgentActivity({
      action: 'AGENT_ERROR',
      entityId: sessionId,
      details: { agentType: 'content-creation', error },
    });
  }
}

export default ContentCreationAgent;
