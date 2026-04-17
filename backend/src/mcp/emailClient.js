// Email Client - Mailtrap MCP for newsletters and campaigns
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class EmailClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Connect to Mailtrap MCP server
   */
  async connect() {
    if (this.connected) return;

    if (!process.env.MAILTRAP_API_TOKEN) {
      console.warn('⚠️ Mailtrap API token not configured (MAILTRAP_API_TOKEN)');
      this.connected = false;
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: [
          '-y',
          'mailtrap-mcp',
          process.env.MAILTRAP_API_TOKEN
        ]
      });

      this.client = new Client({
        name: 'mvoe-email-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      this.connected = true;
      console.log('✅ Mailtrap MCP client connected');
    } catch (error) {
      console.error('Failed to connect to Mailtrap MCP:', error);
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
      console.log('✅ Mailtrap MCP client disconnected');
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
        error: 'Mailtrap MCP not connected'
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
      console.error(`Mailtrap MCP tool error (${toolName}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send single email
   */
  async sendEmail(emailData) {
    const { from, to, subject, html, text, replyTo } = emailData;

    return await this.callTool('send_email', {
      from: from || process.env.MAILTRAP_FROM_EMAIL || 'noreply@yourdomain.com',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || text,
      text: text || '',
      reply_to: replyTo
    });
  }

  /**
   * Send newsletter to multiple recipients
   */
  async sendNewsletter(newsletterData) {
    const { recipients, subject, html, from, replyTo } = newsletterData;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return {
        success: false,
        error: 'No recipients provided'
      };
    }

    // Send in batches to avoid overwhelming the API
    const batchSize = 50;
    const results = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const result = await this.sendEmail({
        from,
        to: batch,
        subject,
        html,
        replyTo
      });

      results.push(result);

      // Rate limiting delay between batches
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: failCount === 0,
      sent: successCount,
      failed: failCount,
      totalRecipients: recipients.length,
      batchCount: results.length
    };
  }

  /**
   * Send campaign with A/B testing subject lines
   */
  async sendCampaign(campaignData) {
    const { recipients, subjectLines, htmlContent, from, replyTo } = campaignData;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return {
        success: false,
        error: 'No recipients provided'
      };
    }

    // A/B test: randomly select subject line for each recipient
    const subjectLine = Array.isArray(subjectLines)
      ? subjectLines[Math.floor(Math.random() * subjectLines.length)]
      : subjectLines;

    return await this.sendNewsletter({
      recipients,
      subject: subjectLine,
      html: htmlContent,
      from,
      replyTo
    });
  }

  /**
   * Send test email
   */
  async sendTestEmail(emailData) {
    const testRecipient = process.env.MAILTRAP_TEST_EMAIL || 'test@example.com';

    return await this.sendEmail({
      ...emailData,
      to: testRecipient,
      subject: `[TEST] ${emailData.subject}`
    });
  }

  /**
   * Generate email preview (when MCP unavailable)
   */
  generateEmailPreview(emailData) {
    return {
      success: true,
      preview: {
        ...emailData,
        note: 'Email preview generated. Configure MAILTRAP_API_TOKEN to send emails.',
        suggestedNextSteps: [
          'Sign up for Mailtrap (mailtrap.io)',
          'Get API token from account settings',
          'Add MAILTRAP_API_TOKEN to .env file',
          'Verify sender domain if needed'
        ]
      }
    };
  }
}

export default EmailClient;
