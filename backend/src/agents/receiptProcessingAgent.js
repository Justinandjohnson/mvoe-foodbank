// Receipt Processing Agent - AI-driven OCR and Google Sheets tracking
import ZenClient from '../mcp/zenClient.js';
import GoogleSheetsClient from '../mcp/googleSheetsClient.js';
import { recordAgentActivity } from '../services/agentActivityService.js';

class ReceiptProcessingAgent {
  constructor(socketIo) {
    this.io = socketIo;
    this.zenClient = new ZenClient();
    this.sheetsClient = new GoogleSheetsClient();

    // Available processing tools for AI to orchestrate
    this.availableTools = [
      {
        name: 'optimize_image',
        description: 'Enhance image quality for better OCR (grayscale, normalize, sharpen)',
        params: ['receiptUrl']
      },
      {
        name: 'extract_text',
        description: 'Use AI vision to extract all text from receipt image',
        params: ['imageData']
      },
      {
        name: 'parse_receipt_data',
        description: 'Parse extracted text into structured data (vendor, date, items, total)',
        params: ['extractedText']
      },
      {
        name: 'categorize_expenses',
        description: 'Categorize receipt items into expense categories',
        params: ['parsedData']
      },
      {
        name: 'detect_anomalies',
        description: 'Detect unusual expenses or suspicious patterns',
        params: ['categorizedData', 'organizationId']
      },
      {
        name: 'generate_report',
        description: 'Generate formatted expense report',
        params: ['parsedData', 'categories', 'anomalies']
      },
      {
        name: 'save_to_sheets',
        description: 'Save receipt data to Google Sheets for tracking and analysis',
        params: ['receiptData', 'organizationId']
      },
      {
        name: 'track_ai_purchase',
        description: 'Track purchases made by AI agents automatically',
        params: ['agentName', 'vendor', 'items', 'total']
      }
    ];
  }

  /**
   * Execute receipt processing - AI decides processing steps
   */
  async execute(jobData) {
    const { userId, sessionId, receiptUrl, organizationId } = jobData;

    try {
      this.emitProgress(sessionId, '🤖 AI analyzing receipt processing workflow...');

      // Get AI's processing plan
      const executionPlan = await this.getAIProcessingPlan(receiptUrl, organizationId, sessionId);

      // Execute the plan
      const results = await this.executeProcessingPlan(executionPlan, receiptUrl, organizationId, sessionId);

      const result = {
        success: true,
        receipt: {
          ...results,
          aiProcessingPlan: executionPlan.map(step => step.description)
        }
      };

      this.emitComplete(sessionId, result);
      return result;

    } catch (error) {
      console.error('Receipt processing agent error:', error);
      this.emitError(sessionId, error.message);
      throw error;
    }
  }

  /**
   * Get AI's processing plan
   */
  async getAIProcessingPlan(receiptUrl, organizationId, sessionId) {
    const prompt = `You are a receipt processing orchestrator. Plan the steps to process this receipt:

RECEIPT URL: ${receiptUrl}
ORGANIZATION ID: ${organizationId}

AVAILABLE MCP TOOLS:
${this.availableTools.map((tool, i) => `${i + 1}. ${tool.name}: ${tool.description}`).join('\n')}

Create a step-by-step processing plan as a JSON array. Each step should use ONE tool.

Return JSON array only:
[
  {"tool": "tool_name", "params": {...}, "description": "what this does"}
]`;

    const zenResponse = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.2
    });

    const jsonMatch = zenResponse.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI failed to return valid processing plan');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Execute AI's processing plan
   */
  async executeProcessingPlan(plan, receiptUrl, organizationId, sessionId) {
    const results = {
      vendor: null,
      date: null,
      total: null,
      items: [],
      categories: {},
      anomalies: [],
      report: null,
      confidence: 0
    };

    let optimizedImage = null;
    let extractedText = null;
    let parsedData = null;
    let categorizedData = null;

    for (const step of plan) {
      try {
        this.emitProgress(sessionId, `${step.description}...`);

        switch (step.tool) {
          case 'optimize_image':
            // Image optimization now handled by AI vision - just pass URL
            optimizedImage = receiptUrl;
            break;

          case 'extract_text':
            if (optimizedImage) {
              extractedText = await this.extractText(optimizedImage);
            }
            break;

          case 'parse_receipt_data':
            if (extractedText) {
              parsedData = await this.parseReceiptData(extractedText);
              results.vendor = parsedData.vendor;
              results.date = parsedData.date;
              results.total = parsedData.total;
              results.items = parsedData.items;
              results.confidence = parsedData.confidence;
            }
            break;

          case 'categorize_expenses':
            if (parsedData) {
              categorizedData = await this.categorizeExpenses(parsedData);
              results.categories = categorizedData;
            }
            break;

          case 'detect_anomalies':
            if (categorizedData) {
              results.anomalies = await this.detectAnomaliesViaMCP(categorizedData, organizationId);
            }
            break;

          case 'generate_report':
            if (parsedData && categorizedData) {
              results.report = await this.generateReportViaMCP(parsedData, categorizedData, results.anomalies);
            }
            break;

          case 'save_to_sheets':
            if (parsedData) {
              await this.sheetsClient.connect();
              const sheetResult = await this.sheetsClient.appendReceipt({
                ...results,
                organizationId
              });
              results.savedToSheets = sheetResult.success;
              await this.sheetsClient.disconnect();
            }
            break;

          case 'track_ai_purchase':
            const { agentName, vendor, items, total } = step.params;
            await this.sheetsClient.connect();
            const trackResult = await this.sheetsClient.trackAIPurchase(agentName, vendor, items, total);
            results.trackedPurchase = trackResult.success;
            await this.sheetsClient.disconnect();
            break;

          default:
            console.warn(`Unknown tool: ${step.tool}`);
        }

        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (error) {
        console.error(`Processing step failed (${step.tool}):`, error.message);
        throw new Error(`MCP tool execution failed: ${step.tool} - ${error.message}`);
      }
    }

    return results;
  }



  /**
   * Extract text from receipt using Zen AI vision
   */
  async extractText(imageData) {
    const prompt = `
      Analyze this receipt image and extract all text.

      Please identify and return:
      1. Store/vendor name
      2. Date of purchase
      3. All line items with prices
      4. Subtotal, tax, and total
      5. Payment method (if visible)

      Return the data in JSON format.
    `;

    try {
      const response = await this.zenClient.chat({
        prompt,
        model: 'gemini-2.5-flash',
        images: [imageData],
        temperature: 0.1 // Low temperature for accuracy
      });

      return response.text || '';
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error('Failed to extract text from receipt');
    }
  }

  /**
   * Parse receipt data using AI
   */
  async parseReceiptData(extractedText) {
    const prompt = `Parse this receipt text and extract structured data: ${extractedText}

Return JSON:
{
  "vendor": "store name",
  "date": "YYYY-MM-DD",
  "items": [{"name": "item", "quantity": 1, "price": 0.00}],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "confidence": 0.95
}`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gemini-2.5-flash',
      temperature: 0.1
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI failed to parse receipt data');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Categorize expenses automatically
   */
  async categorizeExpenses(receiptData) {
    const prompt = `Categorize these receipt items for a food bank. Vendor: ${receiptData.vendor}. Items: ${JSON.stringify(receiptData.items)}

Categories: food, delivery, overhead, equipment, other

Return JSON array:
[{"item": "name", "category": "food", "confidence": 0.95}]`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gemini-2.5-flash',
      temperature: 0.2
    });

    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI failed to categorize expenses');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Detect anomalies in expenses via MCP (AI-driven)
   */
  async detectAnomaliesViaMCP(categorizedExpenses, organizationId) {
    const prompt = `Analyze these expenses for anomalies: ${JSON.stringify(categorizedExpenses)}. Org: ${organizationId}

Return JSON array:
[{"type": "high_price|duplicate|suspicious", "severity": "info|warning|alert", "item": "name", "message": "desc"}]`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.2
    });

    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('AI failed to detect anomalies');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Generate expense report via MCP (AI-driven)
   */
  async generateReportViaMCP(receiptData, categorized, anomalies) {
    const prompt = `Generate expense report. Receipt: ${JSON.stringify(receiptData)}. Categorized: ${JSON.stringify(categorized)}. Anomalies: ${JSON.stringify(anomalies)}

Return JSON:
{
  "summary": "text",
  "date": "YYYY-MM-DD",
  "totalAmount": 0.00,
  "categorizedExpenses": {},
  "anomalyCount": 0,
  "anomalies": [],
  "confidence": 0.95,
  "needsReview": false,
  "insights": "text"
}`;

    const response = await this.zenClient.chat({
      prompt,
      model: 'gpt-4o-mini',
      temperature: 0.2
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI failed to generate report');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Emit progress updates via WebSocket
   */
  emitProgress(sessionId, message) {
    const payload = {
      type: 'progress',
      agentType: 'receipt-processing',
      sessionId,
      message,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:progress', payload);
    this.io.emit('agent:progress', payload);
    recordAgentActivity({
      action: 'AGENT_PROGRESS',
      entityId: sessionId,
      details: { agentType: 'receipt-processing', message },
    });
  }

  /**
   * Emit completion via WebSocket
   */
  emitComplete(sessionId, result) {
    const payload = {
      type: 'complete',
      agentType: 'receipt-processing',
      sessionId,
      result,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:complete', payload);
    this.io.emit('agent:complete', payload);
    recordAgentActivity({
      action: 'AGENT_COMPLETE',
      entityId: sessionId,
      details: { agentType: 'receipt-processing' },
    });
  }

  /**
   * Emit error via WebSocket
   */
  emitError(sessionId, error) {
    const payload = {
      type: 'error',
      agentType: 'receipt-processing',
      sessionId,
      error,
      timestamp: new Date().toISOString()
    };
    this.io.to(sessionId).emit('agent:error', payload);
    this.io.emit('agent:error', payload);
    recordAgentActivity({
      action: 'AGENT_ERROR',
      entityId: sessionId,
      details: { agentType: 'receipt-processing', error },
    });
  }
}

export default ReceiptProcessingAgent;
