// OpenAI Image Generation MCP Client - DALLE-3 and latest models
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class ImageClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Connect to OpenAI Image Generation MCP server
   */
  async connect() {
    if (this.connected) return;

    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OpenAI API key not configured (OPENAI_API_KEY)');
      this.connected = false;
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: [
          '-y',
          'chatgpt-native-image-gen-mcp'
        ],
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY
        }
      });

      this.client = new Client({
        name: 'mvoe-image-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      this.connected = true;
      console.log('✅ OpenAI Image Generation MCP client connected');
    } catch (error) {
      console.error('Failed to connect to OpenAI Image MCP:', error);
      this.connected = false;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      console.log('✅ OpenAI Image MCP client disconnected');
    }
  }

  /**
   * Call MCP tool
   */
  async callTool(toolName, args) {
    if (!this.connected) {
      await this.connect();
    }

    if (!this.connected) {
      return {
        success: false,
        error: 'OpenAI Image MCP not connected'
      };
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
      console.error(`OpenAI Image MCP tool error (${toolName}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate image using latest OpenAI model (DALLE-3/gpt-image-1)
   */
  async generateImage(imageData) {
    const {
      prompt,
      model = 'gpt-image-1',  // Use latest model
      size = 'auto',
      quality = 'high',       // Use high quality by default
      n = 1,
      saveFilename = null,
      user = null
    } = imageData;

    return await this.callTool('generate_image', {
      prompt,
      model,
      size,
      quality,
      n,
      save_filename: saveFilename,
      user
    });
  }

  /**
   * Edit/modify existing image
   */
  async editImage(editData) {
    const {
      prompt,
      imagePaths,
      maskPath = null,
      model = 'gpt-image-1',
      size = 'auto',
      quality = 'high',
      n = 1,
      saveFilename = null,
      user = null
    } = editData;

    return await this.callTool('edit_image', {
      prompt,
      image_paths: imagePaths,
      mask_path: maskPath,
      model,
      size,
      quality,
      n,
      save_filename: saveFilename,
      user
    });
  }

  /**
   * Generate flyer image with AI-optimized prompt
   */
  async generateFlyer(content) {
    const { headline, subheadline, eventDetails, organization, date, location } = content;

    // Let AI create optimized prompt for flyer
    const prompt = `Create a professional event flyer design with:
- Bold headline: "${headline}"
- Subheadline: "${subheadline}"
- Event details: "${eventDetails}"
- Date: "${date}"
- Location: "${location}"
- Organization: "${organization}"

Style: Modern, eye-catching, professional layout with clear typography hierarchy, appropriate colors, and space for text readability. High-quality design suitable for printing and digital distribution.`;

    return await this.generateImage({
      prompt,
      size: '1024x1536',  // Portrait flyer format
      quality: 'high',
      saveFilename: `flyer_${headline.replace(/\s+/g, '_').toLowerCase()}`
    });
  }

  /**
   * Generate social media graphic
   */
  async generateSocialPost(content) {
    const { platform, message, organization } = content;

    // Platform-specific sizing
    const platformSizes = {
      instagram: '1024x1024',
      facebook: '1536x1024',
      twitter: '1536x1024',
      linkedin: '1536x1024'
    };

    const size = platformSizes[platform] || '1024x1024';

    const prompt = `Create a ${platform} social media post graphic with:
- Main message: "${message}"
- Organization: "${organization}"

Style: Eye-catching, modern social media design optimized for ${platform}, vibrant colors, engaging typography, professional branding, high visual impact for social engagement.`;

    return await this.generateImage({
      prompt,
      size,
      quality: 'high',
      saveFilename: `social_${platform}_${message.replace(/\s+/g, '_').toLowerCase().substring(0, 30)}`
    });
  }

  /**
   * Generate newsletter header/banner
   */
  async generateNewsletterGraphic(content) {
    const { title, organization, theme = 'professional' } = content;

    const prompt = `Create a newsletter header/banner graphic with:
- Title: "${title}"
- Organization: "${organization}"
- Theme: ${theme}

Style: Professional newsletter header design, clean layout, appropriate branding, suitable for email newsletters and digital communication.`;

    return await this.generateImage({
      prompt,
      size: '1536x1024',  // Wide banner format
      quality: 'high',
      saveFilename: `newsletter_${title.replace(/\s+/g, '_').toLowerCase()}`
    });
  }

  /**
   * Generate blog post featured image
   */
  async generateBlogImage(content) {
    const { title, topic, style = 'modern' } = content;

    const prompt = `Create a blog post featured image for:
- Title: "${title}"
- Topic: "${topic}"
- Style: ${style}

Style: Engaging blog featured image, visually appealing, relevant to the topic, professional quality suitable for web publication.`;

    return await this.generateImage({
      prompt,
      size: '1536x1024',  // Blog header format
      quality: 'high',
      saveFilename: `blog_${title.replace(/\s+/g, '_').toLowerCase()}`
    });
  }

  /**
   * Fallback - generate design instructions (when MCP unavailable)
   */
  generateImageInstructions(designType, content) {
    return {
      success: true,
      instructions: {
        designType,
        content,
        note: 'OpenAI API not configured. Configure OPENAI_API_KEY to generate images.',
        suggestedSteps: [
          '1. Sign up for OpenAI API at https://platform.openai.com/',
          '2. Get API key from your OpenAI dashboard',
          '3. Add OPENAI_API_KEY to .env file',
          '4. Install MCP server: npx -y chatgpt-native-image-gen-mcp'
        ],
        promptSuggestion: this.generatePromptSuggestion(designType, content),
        modelInfo: {
          recommended: 'gpt-image-1',
          alternatives: ['dall-e-3'],
          sizes: ['1024x1024', '1536x1024', '1024x1536'],
          qualities: ['low', 'medium', 'high']
        }
      }
    };
  }

  /**
   * Generate prompt suggestion based on content
   */
  generatePromptSuggestion(designType, content) {
    const prompts = {
      flyer: `Professional event flyer with "${content.headline || 'Event Title'}", modern design, clear typography`,
      social: `${content.platform || 'Social media'} post with "${content.message || 'Message'}", engaging and vibrant`,
      newsletter: `Newsletter header with "${content.title || 'Newsletter Title'}", clean professional design`,
      blog: `Blog featured image for "${content.title || 'Blog Post'}", relevant and engaging`
    };

    return prompts[designType] || `Professional ${designType} design with modern styling`;
  }
}

export default ImageClient;