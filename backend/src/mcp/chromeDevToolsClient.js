// Chrome DevTools MCP Client - Live browser automation only
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
        name: 'mvoe-browser-automation',
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
      await this.client.close().catch(() => {});
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
}

export default ChromeDevToolsClient;
