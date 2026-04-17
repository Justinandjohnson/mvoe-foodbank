// Google Sheets MCP Client - Expense tracking and analysis
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class GoogleSheetsClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null;
  }

  /**
   * Connect to Google Sheets MCP server
   */
  async connect() {
    if (this.connected) return;

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@xing5/mcp-google-sheets']
      });

      this.client = new Client({
        name: 'mvoe-receipt-tracking',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      await this.client.connect(transport);
      this.connected = true;
      console.log('✅ Google Sheets MCP client connected');
    } catch (error) {
      console.error('Failed to connect to Google Sheets MCP:', error);
      this.connected = false;
    }
  }

  /**
   * Disconnect from Google Sheets MCP
   */
  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connected = false;
      console.log('Google Sheets MCP client disconnected');
    }
  }

  /**
   * Call Google Sheets MCP tool
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
      console.error(`Google Sheets MCP tool error (${toolName}):`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Append receipt data to spreadsheet
   */
  async appendReceipt(receiptData) {
    const { vendor, date, total, items, categories, organizationId } = receiptData;

    // Format row data
    const row = [
      new Date().toISOString(),
      organizationId || 'N/A',
      vendor || 'Unknown',
      date || new Date().toLocaleDateString(),
      total || 0,
      JSON.stringify(items),
      JSON.stringify(categories),
      'Manual Upload'
    ];

    return await this.callTool('sheets_append_values', {
      spreadsheetId: this.spreadsheetId,
      range: 'Receipts!A:H',
      values: [row]
    });
  }

  /**
   * Track AI agent purchase
   */
  async trackAIPurchase(agentName, vendor, items, total) {
    const row = [
      new Date().toISOString(),
      agentName,
      vendor,
      total,
      items.length,
      JSON.stringify(items),
      'AI Agent Purchase'
    ];

    return await this.callTool('sheets_append_values', {
      spreadsheetId: this.spreadsheetId,
      range: 'AI_Purchases!A:G',
      values: [row]
    });
  }

  /**
   * Get expense summary
   */
  async getExpenseSummary(organizationId) {
    const result = await this.callTool('sheets_get_values', {
      spreadsheetId: this.spreadsheetId,
      range: 'Receipts!A:H'
    });

    if (!result.success) return null;

    // Filter and analyze data for organization
    const rows = result.data[0]?.text ? JSON.parse(result.data[0].text) : [];
    const orgExpenses = rows.filter(row => row[1] === organizationId);

    return {
      totalExpenses: orgExpenses.reduce((sum, row) => sum + parseFloat(row[4] || 0), 0),
      receiptCount: orgExpenses.length,
      topVendors: this.getTopVendors(orgExpenses),
      categoryBreakdown: this.getCategoryBreakdown(orgExpenses)
    };
  }

  /**
   * Get top vendors
   */
  getTopVendors(expenses) {
    const vendors = {};
    expenses.forEach(row => {
      const vendor = row[2];
      const amount = parseFloat(row[4] || 0);
      vendors[vendor] = (vendors[vendor] || 0) + amount;
    });

    return Object.entries(vendors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([vendor, total]) => ({ vendor, total }));
  }

  /**
   * Get category breakdown
   */
  getCategoryBreakdown(expenses) {
    const categories = {};
    expenses.forEach(row => {
      try {
        const cats = JSON.parse(row[6] || '{}');
        Object.entries(cats).forEach(([category, items]) => {
          categories[category] = (categories[category] || 0) + items.length;
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });

    return categories;
  }

  /**
   * Create expense tracking spreadsheet
   */
  async createExpenseSheet(organizationName) {
    const result = await this.callTool('sheets_create', {
      title: `${organizationName} - Expense Tracking`,
      sheets: [
        {
          title: 'Receipts',
          headers: ['Timestamp', 'Organization ID', 'Vendor', 'Date', 'Total', 'Items', 'Categories', 'Source']
        },
        {
          title: 'AI_Purchases',
          headers: ['Timestamp', 'Agent Name', 'Vendor', 'Total', 'Item Count', 'Items', 'Type']
        },
        {
          title: 'Summary',
          headers: ['Month', 'Total Expenses', 'Receipt Count', 'AI Purchase Count']
        }
      ]
    });

    if (result.success && result.data[0]?.text) {
      const spreadsheetId = JSON.parse(result.data[0].text).spreadsheetId;
      console.log(`✅ Created expense tracking sheet: ${spreadsheetId}`);
      return spreadsheetId;
    }

    return null;
  }
}

export default GoogleSheetsClient;
