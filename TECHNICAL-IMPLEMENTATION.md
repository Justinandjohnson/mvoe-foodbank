# Food Bank Platform - Complete Technical Implementation Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Database Design](#database-design)
4. [AI Agent System](#ai-agent-system)
5. [MCP Integration](#mcp-integration)
6. [Deployment Guide](#deployment-guide)
7. [Code Examples](#code-examples)
8. [Security & Performance](#security--performance)

---

## Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                React Native App (iOS/Android/Web)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐  │
│  │  Home    │  │  Donate  │  │  AI Agent Dashboard      │  │
│  │  Feed    │  │  Flow    │  │  (10 agents)             │  │
│  └──────────┘  └──────────┘  └──────────────────────────┘  │
│          │              │                │                   │
│          └──────────────┴────────────────┘                   │
│                         │                                    │
│                    REST + WebSocket                          │
└─────────────────────────┼────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Main Backend (Fastify + Node.js)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Routes                                           │  │
│  │  POST /api/donations → Stripe payment               │  │
│  │  POST /api/agents/:type → Queue agent job           │  │
│  │  GET /api/jobs/active → Get user's active jobs      │  │
│  │  GET /api/ledger → Public transparency feed         │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│        ┌─────────────────┼─────────────────┐                │
│        ▼                 ▼                 ▼                │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │PostgreSQL│  │  Redis       │  │  BullMQ      │         │
│  │(Prisma)  │  │  - Cache     │  │  - Job Queue │         │
│  │- Users   │  │  - Sessions  │  │  - Workers   │         │
│  │- Donations│ │  - Results   │  │  - Scheduler │         │
│  │- Ledger  │  │              │  │              │         │
│  └──────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────┘
                          │
                     Job Queue
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              MCP Agent Server (Node.js Service)              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Agent Orchestrator                                   │  │
│  │  - Receives jobs from BullMQ                          │  │
│  │  - Routes to appropriate agent handler                │  │
│  │  - Manages MCP tool connections                       │  │
│  │  - Stores results in Redis + PostgreSQL               │  │
│  │  - Sends WebSocket notifications                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MCP Tool Connections                                 │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Chrome DevTools MCP                            │ │  │
│  │  │  - Browser automation for price research        │ │  │
│  │  │  - Web scraping for partner outreach            │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Zen MCP                                        │ │  │
│  │  │  - AI reasoning (chat, thinkdeep, planner)     │ │  │
│  │  │  - Content generation                           │ │  │
│  │  │  - Data analysis                                │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend (React Native)

```json
{
  "react-native": "^0.77.0",
  "@react-navigation/native": "^6.1.0",
  "react-native-paper": "^5.11.0",
  "zustand": "^4.4.0",
  "@tanstack/react-query": "^5.17.0",
  "@stripe/stripe-react-native": "^0.35.0",
  "@react-native-firebase/messaging": "^18.7.0",
  "socket.io-client": "^4.6.0",
  "react-native-maps": "^1.10.0",
  "react-native-reanimated": "^3.6.0"
}
```

### Backend (Node.js + Fastify)

```json
{
  "fastify": "^4.25.0",
  "@fastify/cors": "^8.5.0",
  "@fastify/jwt": "^7.2.0",
  "@fastify/websocket": "^8.3.0",
  "@prisma/client": "^5.8.0",
  "bullmq": "^5.1.0",
  "ioredis": "^5.3.2",
  "socket.io": "^4.6.0",
  "stripe": "^14.10.0",
  "@modelcontextprotocol/sdk": "latest"
}
```

### Database & Storage
- **PostgreSQL 15+** with Prisma ORM
- **Redis 7.x** for caching and job queue
- **AWS S3** for receipt photos
- **Firebase** for push notifications

---

## Database Design

### Complete Schema Evolution

#### Phase 1 Foundation Tables

```sql
-- Core user system
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    user_type TEXT NOT NULL, -- 'donor', 'volunteer', 'admin'
    visibility_preference TEXT DEFAULT 'first_name',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organizations (food banks, churches, companies)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'food_bank', 'church', 'company'
    verification_status TEXT DEFAULT 'pending',
    stripe_account_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All donations
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    amount_cents BIGINT NOT NULL,
    stripe_charge_id TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'succeeded',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable transparency ledger
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id UUID REFERENCES donations(id),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    entry_type TEXT NOT NULL, -- 'FUNDS_CAPTURED', 'FUNDS_SPENT'
    amount_cents BIGINT NOT NULL,
    description TEXT,
    category TEXT, -- 'food', 'delivery', 'overhead'
    receipt_url TEXT,
    vendor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Phase 2 Multi-Stakeholder Tables

```sql
-- Organization membership
CREATE TABLE organization_members (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'admin', 'volunteer', 'member'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, organization_id)
);

-- Food bank needs
CREATE TABLE food_needs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    item_name TEXT NOT NULL,
    quantity TEXT,
    priority TEXT DEFAULT 'medium', -- 'urgent', 'high', 'medium', 'low'
    status TEXT DEFAULT 'needed', -- 'needed', 'purchased', 'received'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Meal planning
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) NOT NULL,
    meal_name TEXT NOT NULL,
    meal_date DATE NOT NULL,
    servings INTEGER NOT NULL,
    delivery_required BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Volunteer shifts
CREATE TABLE volunteer_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    volunteer_id UUID REFERENCES users(id),
    shift_type TEXT NOT NULL, -- 'meal_prep', 'delivery', 'cleanup'
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery tracking
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES meals(id) NOT NULL,
    volunteer_id UUID REFERENCES users(id),
    recipient_address TEXT NOT NULL,
    delivery_order INTEGER, -- Route optimization
    status TEXT DEFAULT 'pending',
    delivered_at TIMESTAMPTZ,
    delivery_photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Phase 3 AI Agent Tables

```sql
-- AI agent job tracking
CREATE TABLE agent_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    agent_type TEXT NOT NULL, -- 'PRICE_RESEARCH', 'PARTNER_OUTREACH', etc.
    status TEXT DEFAULT 'QUEUED', -- 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'
    input_data JSONB NOT NULL,
    result_data JSONB,
    error TEXT,
    progress INTEGER DEFAULT 0, -- 0-100
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Agent result storage
CREATE TABLE agent_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES agent_jobs(id),
    agent_type TEXT NOT NULL,
    result_type TEXT NOT NULL, -- 'price_comparison', 'partner_list', etc.
    data JSONB NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI insights and recommendations
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_type TEXT NOT NULL, -- 'donation_trend', 'optimization', etc.
    data JSONB NOT NULL,
    relevance_score DECIMAL(3,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Performance Indexes

```sql
-- Essential indexes for fast queries
CREATE INDEX idx_donations_donor ON donations(donor_id);
CREATE INDEX idx_donations_org ON donations(organization_id);
CREATE INDEX idx_donations_created ON donations(created_at DESC);
CREATE INDEX idx_ledger_org ON ledger_entries(organization_id);
CREATE INDEX idx_ledger_created ON ledger_entries(created_at DESC);
CREATE INDEX idx_agent_jobs_user ON agent_jobs(user_id);
CREATE INDEX idx_agent_jobs_status ON agent_jobs(status);
CREATE INDEX idx_meals_date ON meals(meal_date);
CREATE INDEX idx_volunteer_shifts_volunteer ON volunteer_shifts(volunteer_id);
```

---

## AI Agent System

### 11 Specialized Agents

#### Agent → MCP Tool Matrix

| Agent # | Agent Name | Primary MCP Tool | Secondary MCP | Workflow |
|---------|------------|------------------|---------------|----------|
| 1 | Price Research | chrome-devtools | zen/chat | Browse sites → Extract prices → Analyze |
| 2 | Partner Outreach | chrome-devtools | zen/chat | Search orgs → Extract contacts → Generate emails |
| 3 | Content Creation | zen/chat | context7 | Generate copy → Create variations |
| 4 | Grant Research | chrome-devtools | zen/planner | Search databases → Extract details |
| 5 | Data Analysis | zen/chat | - | Query DB → Analyze patterns |
| 6 | Receipt Processing | zen/chat | - | OCR extract → Categorize items |
| 7 | Community Meal Planner | zen/chat | chrome-devtools | Plan events → Research prices → Coordinate volunteers |
| 8 | Volunteer Coordinator | zen/planner | chrome-devtools | Match availability → Optimize routes |
| 9 | Competitor Analysis | chrome-devtools | zen/chat | Browse competitors → Extract features |
| 10 | Legal/Compliance | chrome-devtools | zen/chat | Monitor regulations → Summarize |
| 11 | Social Media | zen/chat | zen/consensus | Generate posts → Get perspectives |

---

## MCP Integration

### MCP Client Setup

```javascript
// src/services/mcp-client.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPAgentClient {
  constructor() {
    this.clients = new Map();
    this.connections = new Map();
  }

  async getClient(toolName) {
    if (this.clients.has(toolName)) {
      return this.clients.get(toolName);
    }

    let command, args;

    switch (toolName) {
      case 'chrome-devtools':
        command = 'npx';
        args = ['@modelcontextprotocol/server-chrome-devtools'];
        break;
      case 'zen':
        command = 'npx';
        args = ['@zen-mcp/server'];
        break;
      case 'context7':
        command = 'npx';
        args = ['@context7/mcp-server'];
        break;
      case 'usda-nutrition':
        // Custom USDA FoodData Central API integration
        return await this.createUSDAClient();
      default:
        throw new Error(`Unknown MCP tool: ${toolName}`);
    }

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env }
    });

    const client = new Client(
      {
        name: 'food-bank-agent',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    await client.connect(transport);
    this.clients.set(toolName, client);
    this.connections.set(toolName, transport);

    return client;
  }

  async createUSDAClient() {
    // Create a custom USDA FoodData Central API client
    const usdaClient = {
      request: async ({ method, params }) => {
        switch (method) {
          case 'usda_search_foods':
            return await this.searchFoods(params.query, params.pageSize || 10);
          case 'usda_get_food_details':
            return await this.getFoodDetails(params.fdcId);
          case 'usda_analyze_nutrition':
            return await this.analyzeNutrition(params.ingredients);
          default:
            throw new Error(`Unknown USDA method: ${method}`);
        }
      }
    };

    // Cache the client
    this.clients.set('usda-nutrition', usdaClient);
    return usdaClient;
  }

  async searchFoods(query, pageSize = 10) {
    const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=${pageSize}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        foods: data.foods || [],
        totalResults: data.totalHits || 0
      };
    } catch (error) {
      console.error('USDA search error:', error);
      return { success: false, error: error.message, foods: [] };
    }
  }

  async getFoodDetails(fdcId) {
    const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
    const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        food: data,
        nutrition: this.processNutritionData(data.foodNutrients || [])
      };
    } catch (error) {
      console.error('USDA food details error:', error);
      return { success: false, error: error.message };
    }
  }

  async analyzeNutrition(ingredients) {
    // Analyze multiple ingredients and sum nutrition
    const results = [];
    let totalNutrition = {};

    for (const ingredient of ingredients) {
      const { quantity, unit, foodName } = ingredient;

      // Search for the food item
      const searchResult = await this.searchFoods(foodName, 1);

      if (searchResult.success && searchResult.foods.length > 0) {
        const food = searchResult.foods[0];
        const detailsResult = await this.getFoodDetails(food.fdcId);

        if (detailsResult.success) {
          const scaledNutrition = this.scaleNutrition(detailsResult.nutrition, quantity, unit);
          results.push({
            ingredient: foodName,
            nutrition: scaledNutrition,
            fdcId: food.fdcId
          });

          // Sum up total nutrition
          this.addNutritionValues(totalNutrition, scaledNutrition);
        }
      }
    }

    return {
      success: true,
      ingredients: results,
      totalNutrition,
      perServing: ingredients.servings ? this.divideNutrition(totalNutrition, ingredients.servings) : null
    };
  }

  processNutritionData(foodNutrients) {
    const nutrition = {};

    foodNutrients.forEach(nutrient => {
      const name = nutrient.nutrient?.name?.toLowerCase();
      if (name) {
        nutrition[name] = {
          amount: nutrient.amount || 0,
          unit: nutrient.nutrient?.unitName || 'g'
        };
      }
    });

    return nutrition;
  }

  scaleNutrition(nutrition, quantity, unit) {
    // Scale nutrition values based on quantity and unit
    // This is a simplified version - production would need comprehensive unit conversion
    const scaleFactor = this.getScaleFactor(quantity, unit);
    const scaled = {};

    Object.keys(nutrition).forEach(key => {
      scaled[key] = {
        amount: nutrition[key].amount * scaleFactor,
        unit: nutrition[key].unit
      };
    });

    return scaled;
  }

  getScaleFactor(quantity, unit) {
    // Simplified scaling - assumes USDA data is per 100g
    const baseAmount = 100; // grams

    switch (unit.toLowerCase()) {
      case 'g':
      case 'grams':
        return quantity / baseAmount;
      case 'oz':
      case 'ounces':
        return (quantity * 28.35) / baseAmount; // oz to grams
      case 'lb':
      case 'pounds':
        return (quantity * 453.592) / baseAmount; // lb to grams
      case 'cup':
      case 'cups':
        return (quantity * 240) / baseAmount; // approximate cup to grams
      default:
        return quantity / baseAmount;
    }
  }

  addNutritionValues(total, addition) {
    Object.keys(addition).forEach(key => {
      if (!total[key]) {
        total[key] = { amount: 0, unit: addition[key].unit };
      }
      total[key].amount += addition[key].amount;
    });
  }

  divideNutrition(nutrition, servings) {
    const perServing = {};
    Object.keys(nutrition).forEach(key => {
      perServing[key] = {
        amount: nutrition[key].amount / servings,
        unit: nutrition[key].unit
      };
    });
    return perServing;
  }

  async closeAll() {
    for (const [toolName, client] of this.clients) {
      try {
        await client.close();
        const transport = this.connections.get(toolName);
        if (transport) {
          await transport.close();
        }
      } catch (error) {
        console.error(`Error closing ${toolName}:`, error);
      }
    }
    this.clients.clear();
    this.connections.clear();
  }
}
```

### BullMQ Job Processing

```javascript
// src/workers/agent-worker.js
import { Worker } from 'bullmq';
import { MCPAgentClient } from '../services/mcp-client.js';
import { AIService } from '../services/ai-service.js';

const agentClient = new MCPAgentClient();
const aiService = new AIService();

const agentWorker = new Worker(
  'agent-jobs',
  async (job) => {
    const { agentType, inputData, userId } = job.data;

    console.log(`🤖 Starting ${agentType} agent for user ${userId}`);

    try {
      // Update job progress
      await job.updateProgress(0);

      let result;

      switch (agentType) {
        case 'PRICE_RESEARCH':
          result = await processPriceResearch(inputData, job);
          break;
        case 'PARTNER_OUTREACH':
          result = await processPartnerOutreach(inputData, job);
          break;
        case 'CONTENT_CREATION':
          result = await processContentCreation(inputData, job);
          break;
        case 'COMMUNITY_MEAL_PLANNER':
          result = await processCommunityMealPlanner(inputData, job);
          break;
        default:
          throw new Error(`Unknown agent type: ${agentType}`);
      }

      await job.updateProgress(100);
      return result;

    } catch (error) {
      console.error(`Agent ${agentType} failed:`, error);
      throw error;
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    },
    concurrency: 3,
    removeOnComplete: 50,
    removeOnFail: 20,
  }
);

async function processPriceResearch(inputData, job) {
  const { foodItem, quantity, zipCode } = inputData;

  await job.updateProgress(10);

  // Step 1: Use Chrome DevTools MCP to search multiple stores
  const chromeClient = await agentClient.getClient('chrome-devtools');

  const stores = ['costco.com', 'walmart.com', 'samsclub.com', 'restaurantdepot.com'];
  const priceData = [];

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    await job.updateProgress(20 + (i * 15));

    try {
      console.log(`🔍 Searching ${store} for ${foodItem}...`);

      // Navigate to store and search
      await chromeClient.request({
        method: 'mcp__chrome-devtools__navigate_page',
        params: { url: `https://${store}` }
      });

      // Perform search
      const searchResults = await chromeClient.request({
        method: 'mcp__chrome-devtools__evaluate_script',
        params: {
          function: `async () => {
            // Search for the food item
            const searchBox = document.querySelector('input[type="search"], input[name="q"]');
            if (searchBox) {
              searchBox.value = '${foodItem}';
              searchBox.form.submit();
              await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // Extract product data
            const products = [];
            const productElements = document.querySelectorAll('[data-testid="product"], .product-item, .search-result-product-title');

            for (let i = 0; i < Math.min(productElements.length, 5); i++) {
              const element = productElements[i];
              const titleEl = element.querySelector('h3, h4, .product-title, .product-name');
              const priceEl = element.querySelector('.price, [data-testid="price"], .current-price');

              if (titleEl && priceEl) {
                products.push({
                  title: titleEl.textContent.trim(),
                  price: priceEl.textContent.trim(),
                  store: '${store}'
                });
              }
            }

            return products;
          }`
        }
      });

      if (searchResults && searchResults.length > 0) {
        priceData.push(...searchResults);
      }

    } catch (error) {
      console.error(`Failed to search ${store}:`, error);
    }
  }

  await job.updateProgress(80);

  // Step 2: Use AI to analyze the price data
  const zenClient = await agentClient.getClient('zen');

  const analysis = await zenClient.request({
    method: 'mcp__zen__chat',
    params: {
      prompt: `Analyze these bulk food prices and recommend the best deal:

      Food Item: ${foodItem}
      Quantity Needed: ${quantity}
      Location: ${zipCode}

      Price Data:
      ${JSON.stringify(priceData, null, 2)}

      Consider:
      1. Price per unit ($/lb or $/oz)
      2. Membership costs and requirements
      3. Distance and convenience
      4. Bulk purchase requirements
      5. Quality and brand reputation

      Provide:
      1. Clear recommendation for the best deal
      2. 2-3 alternative options
      3. Reasoning for your recommendation
      4. Total cost breakdown including any fees
      5. Estimated savings vs regular retail price`,
      model: 'gemini-2.5-pro'
    }
  });

  await job.updateProgress(95);

  return {
    success: true,
    agent_type: 'PRICE_RESEARCH',
    input: { foodItem, quantity, zipCode },
    raw_data: priceData,
    analysis: analysis,
    stores_checked: stores.length,
    products_found: priceData.length,
    timestamp: new Date().toISOString()
  };
}

async function processPartnerOutreach(inputData, job) {
  const { partnerType, zipCode, radiusMiles } = inputData;

  await job.updateProgress(10);

  // Step 1: Search for organizations using Chrome DevTools MCP
  const chromeClient = await agentClient.getClient('chrome-devtools');

  const searchQuery = `${partnerType} organizations near ${zipCode}`;

  await chromeClient.request({
    method: 'mcp__chrome-devtools__navigate_page',
    params: { url: 'https://www.google.com' }
  });

  await job.updateProgress(30);

  const organizationData = await chromeClient.request({
    method: 'mcp__chrome-devtools__evaluate_script',
    params: {
      function: `async () => {
        // Search Google for organizations
        const searchBox = document.querySelector('input[name="q"]');
        if (searchBox) {
          searchBox.value = '${searchQuery}';
          searchBox.form.submit();
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Extract organization data
        const organizations = [];
        const resultElements = document.querySelectorAll('.g, .result');

        for (let i = 0; i < Math.min(resultElements.length, 20); i++) {
          const element = resultElements[i];
          const titleEl = element.querySelector('h3');
          const linkEl = element.querySelector('a');
          const snippetEl = element.querySelector('.VwiC3b, .s');

          if (titleEl && linkEl) {
            organizations.push({
              name: titleEl.textContent.trim(),
              url: linkEl.href,
              description: snippetEl ? snippetEl.textContent.trim() : '',
              type: '${partnerType}'
            });
          }
        }

        return organizations;
      }`
    }
  });

  await job.updateProgress(60);

  // Step 2: Use AI to filter and generate outreach emails
  const zenClient = await agentClient.getClient('zen');

  const emailGeneration = await zenClient.request({
    method: 'mcp__zen__chat',
    params: {
      prompt: `Generate personalized outreach emails for food bank partnerships:

      Partner Type: ${partnerType}
      Location: ${zipCode}
      Organizations Found: ${JSON.stringify(organizationData, null, 2)}

      For the top 5 most promising organizations:
      1. Filter for best partnership potential
      2. Generate personalized outreach emails
      3. Include specific approach strategy for each

      Email format:
      - Subject line
      - Warm, professional tone (200-250 words)
      - Mention their organization specifically
      - Explain transparent food bank platform
      - Highlight mutual benefits
      - Clear call-to-action

      Return structured data with emails and strategies.`,
      model: 'gemini-2.5-pro'
    }
  });

  await job.updateProgress(90);

  return {
    success: true,
    agent_type: 'PARTNER_OUTREACH',
    input: { partnerType, zipCode, radiusMiles },
    organizations_found: organizationData.length,
    organizations: organizationData.slice(0, 20),
    outreach_emails: emailGeneration,
    timestamp: new Date().toISOString()
  };
}

async function processContentCreation(inputData, job) {
  const { contentType, topic, targetAudience } = inputData;

  await job.updateProgress(20);

  // Use Zen MCP for content generation
  const zenClient = await agentClient.getClient('zen');

  let prompt;
  switch (contentType) {
    case 'social_media':
      prompt = `Create engaging social media content for a transparent food bank platform:

      Topic: ${topic}
      Target Audience: ${targetAudience}

      Generate:
      1. Facebook post (100-150 words)
      2. Instagram post with hashtags (50-80 words)
      3. Twitter/X thread (3-5 tweets)

      Focus on:
      - Community impact
      - Transparency benefits
      - Call-to-action for donations
      - Hopeful, inspiring tone`;
      break;

    case 'email_newsletter':
      prompt = `Create an email newsletter for food bank donors:

      Topic: ${topic}
      Target Audience: ${targetAudience}

      Include:
      1. Subject line
      2. Email body (300-400 words)
      3. Impact statistics
      4. Transparency highlights
      5. Clear donation call-to-action

      Tone: Warm, grateful, impact-focused`;
      break;

    default:
      prompt = `Create ${contentType} content about ${topic} for ${targetAudience}`;
  }

  await job.updateProgress(50);

  const content = await zenClient.request({
    method: 'mcp__zen__chat',
    params: {
      prompt: prompt,
      model: 'gemini-2.5-pro'
    }
  });

  await job.updateProgress(90);

  return {
    success: true,
    agent_type: 'CONTENT_CREATION',
    input: { contentType, topic, targetAudience },
    generated_content: content,
    timestamp: new Date().toISOString()
  };
}

async function processCommunityMealPlanner(inputData, job) {
  const { eventDetails, budget, targetServings } = inputData;

  await job.updateProgress(10);

  // Step 1: Use AI to understand the event requirements
  const zenClient = await agentClient.getClient('zen');

  const eventPlanning = await zenClient.request({
    method: 'mcp__zen__planner',
    params: {
      step: `Plan a community cookout event: ${eventDetails}

      Target servings: ${targetServings} people
      Budget: $${budget}

      I need you to:
      1. Suggest appropriate menu items for the group size
      2. Create a shopping list with estimated quantities
      3. Plan a cooking timeline with volunteer assignments
      4. Identify equipment needs (grills, tables, utensils)
      5. Suggest venue requirements`,
      step_number: 1,
      total_steps: 4,
      next_step_required: true,
      model: 'gemini-2.5-pro'
    }
  });

  await job.updateProgress(20);

  // Step 2: Analyze nutrition using USDA FoodData Central
  const usdaClient = await agentClient.getClient('usda-nutrition');

  console.log('📊 Analyzing nutrition data...');

  const menuItems = extractMenuItems(eventPlanning.step); // Parse menu items from AI response
  const nutritionAnalysis = [];

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    await job.updateProgress(25 + (i * 5));

    try {
      const nutritionResult = await usdaClient.request({
        method: 'usda_analyze_nutrition',
        params: {
          ingredients: [{
            quantity: item.quantity,
            unit: item.unit,
            foodName: item.name
          }],
          servings: targetServings
        }
      });

      if (nutritionResult.success) {
        nutritionAnalysis.push({
          item: item.name,
          nutrition: nutritionResult.totalNutrition,
          perServing: nutritionResult.perServing,
          fdcId: nutritionResult.ingredients[0]?.fdcId
        });
      }
    } catch (error) {
      console.error(`Failed to analyze nutrition for ${item.name}:`, error);
    }
  }

  await job.updateProgress(45);

  // Step 3: Research bulk food prices using Chrome DevTools
  const chromeClient = await agentClient.getClient('chrome-devtools');

  console.log('🛒 Researching bulk food prices...');

  const foodItems = extractFoodItems(eventPlanning.step);
  const priceData = [];

  for (let i = 0; i < foodItems.length; i++) {
    const item = foodItems[i];
    await job.updateProgress(50 + (i * 10));

    try {
      // Search for bulk prices at major retailers
      await chromeClient.request({
        method: 'mcp__chrome-devtools__navigate_page',
        params: { url: 'https://costco.com' }
      });

      const itemPrices = await chromeClient.request({
        method: 'mcp__chrome-devtools__evaluate_script',
        params: {
          function: `async () => {
            const searchBox = document.querySelector('input[type="search"]');
            if (searchBox) {
              searchBox.value = '${item}';
              searchBox.form.submit();
              await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const products = [];
            const productElements = document.querySelectorAll('[data-testid="product"]');

            for (let i = 0; i < Math.min(productElements.length, 3); i++) {
              const element = productElements[i];
              const titleEl = element.querySelector('h3');
              const priceEl = element.querySelector('.price');

              if (titleEl && priceEl) {
                products.push({
                  item: '${item}',
                  title: titleEl.textContent.trim(),
                  price: priceEl.textContent.trim(),
                  store: 'Costco'
                });
              }
            }
            return products;
          }`
        }
      });

      if (itemPrices && itemPrices.length > 0) {
        priceData.push(...itemPrices);
      }
    } catch (error) {
      console.error(`Failed to research prices for ${item}:`, error);
    }
  }

  await job.updateProgress(70);

  // Step 4: Generate final meal plan with pricing, nutrition, and coordination
  const finalPlan = await zenClient.request({
    method: 'mcp__zen__chat',
    params: {
      prompt: `Create a comprehensive community cookout plan with these details:

      Event Requirements: ${eventDetails}
      Target Servings: ${targetServings} people
      Budget: $${budget}

      Initial Planning: ${eventPlanning.step}

      Price Research Results:
      ${JSON.stringify(priceData, null, 2)}

      USDA Nutrition Analysis:
      ${JSON.stringify(nutritionAnalysis, null, 2)}

      Generate a complete plan including:

      1. **OPTIMIZED MENU** (within budget using researched prices)
      2. **NUTRITION SUMMARY** (calories, protein, nutrients per serving)
      3. **ALLERGEN WARNINGS** (identify common allergens in ingredients)
      4. **DIETARY COMPLIANCE** (vegetarian, vegan, gluten-free options)
      5. **SHOPPING LIST** with specific quantities and best store locations
      6. **COOKING TIMELINE** (hour-by-hour schedule)
      7. **VOLUNTEER ASSIGNMENTS** (cooking, setup, cleanup roles)
      8. **EQUIPMENT CHECKLIST** (grills, tables, utensils, etc.)
      9. **VENUE REQUIREMENTS** (space for ${targetServings} people)
      10. **INVITATION TEMPLATE** for community members

      Format as structured JSON for easy app integration.`,
      model: 'gemini-2.5-pro'
    }
  });

  await job.updateProgress(95);

  return {
    success: true,
    agent_type: 'COMMUNITY_MEAL_PLANNER',
    input: { eventDetails, budget, targetServings },
    initial_planning: eventPlanning,
    nutrition_analysis: nutritionAnalysis,
    price_research: priceData,
    final_plan: finalPlan,
    items_researched: foodItems.length,
    nutrition_items_analyzed: nutritionAnalysis.length,
    stores_checked: 1, // Expandable to multiple stores
    timestamp: new Date().toISOString()
  };
}

// Helper function to extract food items from AI planning response
function extractFoodItems(planningText) {
  // Simple extraction - in production would use more sophisticated parsing
  const commonItems = ['hamburgers', 'hot dogs', 'chips', 'buns', 'drinks', 'salad'];
  const mentionedItems = commonItems.filter(item =>
    planningText.toLowerCase().includes(item)
  );

  // Default fallback items if none found
  return mentionedItems.length > 0 ? mentionedItems : ['hamburgers', 'hot dogs', 'buns', 'chips'];
}

// Helper function to extract menu items with quantities for nutrition analysis
function extractMenuItems(planningText) {
  // Enhanced parsing to extract items with quantities and units
  // In production, would use NLP to parse "20 lbs hamburger meat" -> {name: "ground beef", quantity: 20, unit: "lb"}

  const commonMenuItems = [
    { name: 'ground beef', quantity: 10, unit: 'lb' },
    { name: 'hot dogs', quantity: 50, unit: 'pieces' },
    { name: 'hamburger buns', quantity: 50, unit: 'pieces' },
    { name: 'lettuce', quantity: 2, unit: 'heads' },
    { name: 'tomatoes', quantity: 5, unit: 'lb' },
    { name: 'potato chips', quantity: 3, unit: 'bags' },
    { name: 'sodas', quantity: 100, unit: 'cans' }
  ];

  // Simple keyword matching - production version would use proper NLP
  const detectedItems = commonMenuItems.filter(item =>
    planningText.toLowerCase().includes(item.name.toLowerCase()) ||
    planningText.toLowerCase().includes(item.name.split(' ')[0])
  );

  return detectedItems.length > 0 ? detectedItems : [
    { name: 'ground beef', quantity: 10, unit: 'lb' },
    { name: 'hot dogs', quantity: 50, unit: 'pieces' },
    { name: 'hamburger buns', quantity: 50, unit: 'pieces' }
  ];
}

export { agentWorker };
```

---

## Deployment Guide

### OpenAI/Claude Integration

#### AI Service Class

```javascript
// src/services/ai-service.js
const OpenAI = require('openai');
const Anthropic = require('anthropic');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.requestCounts = {
      openai: 0,
      anthropic: 0
    };
  }

  /**
   * Use Claude for complex reasoning and analysis
   */
  async reasonWithClaude(prompt, context = {}) {
    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022", // Latest Sonnet 4.5
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for reasoning
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nContext: ${JSON.stringify(context, null, 2)}`
          }
        ]
      });

      this.requestCounts.anthropic++;

      return {
        content: response.content[0].text,
        model: "claude-3-5-sonnet",
        usage: response.usage,
        cost: this.calculateAnthropicCost(response.usage)
      };

    } catch (error) {
      console.error('Claude API error:', error);
      throw new Error(`Claude reasoning failed: ${error.message}`);
    }
  }

  /**
   * Use GPT-4 for content generation and creative tasks
   */
  async generateWithGPT4(prompt, options = {}) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: options.systemPrompt || "You are a helpful assistant for a food bank platform."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9
      });

      this.requestCounts.openai++;

      return {
        content: response.choices[0].message.content,
        model: "gpt-4-turbo",
        usage: response.usage,
        cost: this.calculateOpenAICost(response.usage, "gpt-4-turbo")
      };

    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`GPT-4 generation failed: ${error.message}`);
    }
  }

  /**
   * Intelligent model selection based on task type
   */
  async processWithBestModel(task, prompt, context = {}) {
    const taskTypeMapping = {
      'price_analysis': 'claude',      // Complex reasoning
      'data_analysis': 'claude',       // Pattern recognition
      'legal_analysis': 'claude',      // Complex reasoning
      'content_creation': 'gpt4',      // Creative writing
      'email_generation': 'gpt4',      // Conversational
      'social_media': 'gpt4',          // Creative & trendy
      'grant_writing': 'claude',       // Analytical writing
      'partner_outreach': 'gpt4'       // Persuasive writing
    };

    const preferredModel = taskTypeMapping[task] || 'claude';

    if (preferredModel === 'claude') {
      return await this.reasonWithClaude(prompt, context);
    } else {
      return await this.generateWithGPT4(prompt, {
        systemPrompt: this.getSystemPromptForTask(task)
      });
    }
  }

  calculateOpenAICost(usage, model) {
    const pricing = {
      'gpt-4-turbo': {
        input: 0.01 / 1000,   // $0.01 per 1K input tokens
        output: 0.03 / 1000   // $0.03 per 1K output tokens
      }
    };

    const modelPricing = pricing[model] || pricing['gpt-4-turbo'];
    return (usage.prompt_tokens * modelPricing.input) +
           (usage.completion_tokens * modelPricing.output);
  }

  calculateAnthropicCost(usage) {
    const pricing = {
      input: 0.003 / 1000,   // $0.003 per 1K input tokens
      output: 0.015 / 1000   // $0.015 per 1K output tokens
    };

    return (usage.input_tokens * pricing.input) +
           (usage.output_tokens * pricing.output);
  }

  getSystemPromptForTask(task) {
    const prompts = {
      'content_creation': 'You are a skilled content creator for a nonprofit food bank platform. Write engaging, empathetic content that motivates action.',
      'email_generation': 'You are writing professional outreach emails for food bank partnerships. Be warm, professional, and focus on community impact.',
      'social_media': 'You create inspiring social media content for food banks. Use a hopeful tone, include call-to-actions, and highlight community impact.',
      'partner_outreach': 'You help food banks build partnerships with local organizations. Be persuasive, professional, and focus on mutual benefits.'
    };

    return prompts[task] || 'You are a helpful assistant for a transparent food bank platform.';
  }

  // Usage statistics
  getUsageStats() {
    return {
      requests: this.requestCounts,
      total_requests: this.requestCounts.openai + this.requestCounts.anthropic
    };
  }
}

module.exports = { AIService };
```

### Railway Deployment (Recommended)

#### Package.json Configuration

```json
{
  "name": "food-bank-mcp-agents",
  "version": "1.0.0",
  "main": "src/main.js",
  "scripts": {
    "start": "node src/main.js",
    "dev": "nodemon src/main.js",
    "build": "echo 'No build step required'"
  },
  "dependencies": {
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.5.0",
    "@fastify/websocket": "^8.3.0",
    "mcp": "latest",
    "openai": "^4.20.0",
    "anthropic": "^0.17.0",
    "playwright": "^1.40.0",
    "redis": "^4.6.0",
    "pg": "^8.11.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  },
  "engines": {
    "node": "18.x"
  }
}
```

#### Railway Configuration

Create `railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### Setup Commands

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
mkdir food-bank-mcp-agents
cd food-bank-mcp-agents

# Initialize Railway project
railway init

# Add services
railway add postgresql
railway add redis

# Set environment variables
railway variables set OPENAI_API_KEY=sk-your-key-here
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key-here
railway variables set NODE_ENV=production

# Deploy
railway up
```

### Docker Deployment

#### Multi-Stage Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Runtime stage
FROM node:18-alpine AS runtime

# Install system dependencies for Playwright
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Playwright to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node healthcheck.js

CMD ["npm", "start"]
```

---

## Code Examples

### React Native Frontend

#### Agent Dashboard Component

```javascript
// src/components/AgentDashboard.js
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Card, Button, Text, ProgressBar, Chip, FAB } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

const agents = [
  {
    id: 'PRICE_RESEARCH',
    name: 'Price Research',
    icon: '🛒',
    description: 'Find best bulk food deals',
    estimatedTime: '5-10 minutes'
  },
  {
    id: 'PARTNER_OUTREACH',
    name: 'Partner Outreach',
    icon: '🤝',
    description: 'Find and contact local partners',
    estimatedTime: '8-12 minutes'
  },
  {
    id: 'CONTENT_CREATION',
    name: 'Content Creation',
    icon: '✍️',
    description: 'Generate marketing materials',
    estimatedTime: '3-5 minutes'
  },
  // ... other agents
];

export const AgentDashboard = () => {
  const [socket, setSocket] = useState(null);
  const [jobUpdates, setJobUpdates] = useState({});
  const queryClient = useQueryClient();

  // Fetch active jobs
  const { data: activeJobs = [] } = useQuery({
    queryKey: ['agent-jobs', 'active'],
    queryFn: async () => {
      const response = await fetch('/api/agents/jobs/active');
      return response.json();
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Start agent mutation
  const startAgentMutation = useMutation({
    mutationFn: async ({ agentType, inputData }) => {
      const response = await fetch(`/api/agents/${agentType}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['agent-jobs']);
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const newSocket = io(process.env.EXPO_PUBLIC_API_URL, {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    newSocket.on('job-progress', (data) => {
      setJobUpdates(prev => ({
        ...prev,
        [data.jobId]: data
      }));
    });

    newSocket.on('job-completed', (data) => {
      setJobUpdates(prev => ({
        ...prev,
        [data.jobId]: data
      }));
      queryClient.invalidateQueries(['agent-jobs']);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [queryClient]);

  const startAgent = (agentType) => {
    // Show input form based on agent type
    switch (agentType) {
      case 'PRICE_RESEARCH':
        showPriceResearchForm();
        break;
      case 'PARTNER_OUTREACH':
        showPartnerOutreachForm();
        break;
      default:
        startAgentMutation.mutate({
          agentType,
          inputData: { source: 'dashboard' }
        });
    }
  };

  const showPriceResearchForm = () => {
    Alert.prompt(
      'Price Research',
      'Enter food item to research:',
      (foodItem) => {
        if (foodItem) {
          Alert.prompt(
            'Quantity Needed',
            'How much do you need?',
            (quantity) => {
              if (quantity) {
                Alert.prompt(
                  'Location',
                  'Enter ZIP code:',
                  (zipCode) => {
                    if (zipCode) {
                      startAgentMutation.mutate({
                        agentType: 'PRICE_RESEARCH',
                        inputData: { foodItem, quantity, zipCode }
                      });
                    }
                  }
                );
              }
            }
          );
        }
      }
    );
  };

  const getJobForAgent = (agentType) => {
    return activeJobs.find(job => job.agent_type === agentType);
  };

  const getJobProgress = (job) => {
    const update = jobUpdates[job?.id];
    return update ? update.progress : job?.progress || 0;
  };

  const getJobStatus = (job) => {
    const update = jobUpdates[job?.id];
    return update ? update.status : job?.status || 'idle';
  };

  const renderAgentCard = (agent) => {
    const job = getJobForAgent(agent.id);
    const progress = getJobProgress(job);
    const status = getJobStatus(job);
    const isRunning = status === 'RUNNING';
    const isQueued = status === 'QUEUED';

    return (
      <Card key={agent.id} style={styles.agentCard}>
        <Card.Content>
          <View style={styles.agentHeader}>
            <Text style={styles.agentIcon}>{agent.icon}</Text>
            <View style={styles.agentInfo}>
              <Text variant="titleMedium">{agent.name}</Text>
              <Text variant="bodySmall" style={styles.agentDescription}>
                {agent.description}
              </Text>
            </View>
            <Chip
              mode="outlined"
              style={[
                styles.statusChip,
                isRunning && styles.runningChip,
                isQueued && styles.queuedChip
              ]}
            >
              {isRunning ? 'Working' : isQueued ? 'Queued' : 'Ready'}
            </Chip>
          </View>

          {(isRunning || isQueued) && (
            <View style={styles.progressSection}>
              <ProgressBar
                progress={progress / 100}
                style={styles.progressBar}
              />
              <Text variant="bodySmall" style={styles.progressText}>
                {isQueued ? 'In queue...' : `${progress}% • ${agent.estimatedTime} remaining`}
              </Text>
              {jobUpdates[job?.id]?.currentTask && (
                <Text variant="bodySmall" style={styles.currentTask}>
                  {jobUpdates[job?.id].currentTask}
                </Text>
              )}
            </View>
          )}

          <Button
            mode="contained"
            onPress={() => startAgent(agent.id)}
            disabled={isRunning || isQueued}
            style={styles.startButton}
          >
            {isRunning ? 'Working...' : isQueued ? 'Queued' : 'Start Agent'}
          </Button>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text variant="headlineMedium" style={styles.title}>
          AI Agent Dashboard
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Automate repetitive tasks with intelligent AI agents
        </Text>

        {agents.map(renderAgentCard)}
      </ScrollView>

      <FAB
        icon="refresh"
        style={styles.fab}
        onPress={() => queryClient.invalidateQueries(['agent-jobs'])}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    padding: 16,
  },
  title: {
    marginBottom: 8,
    fontWeight: 'bold',
  },
  subtitle: {
    marginBottom: 24,
    color: '#666',
  },
  agentCard: {
    marginBottom: 16,
    elevation: 2,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agentIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  agentInfo: {
    flex: 1,
  },
  agentDescription: {
    color: '#666',
    marginTop: 4,
  },
  statusChip: {
    backgroundColor: '#e8f5e8',
  },
  runningChip: {
    backgroundColor: '#fff3cd',
  },
  queuedChip: {
    backgroundColor: '#d1ecf1',
  },
  progressSection: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  progressText: {
    color: '#666',
    textAlign: 'center',
  },
  currentTask: {
    color: '#007bff',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 4,
  },
  startButton: {
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
```

### Backend API Routes

```javascript
// src/routes/agents.js
import { FastifyPluginAsync } from 'fastify';
import { Queue } from 'bullmq';
import { z } from 'zod';

const agentQueue = new Queue('agent-jobs', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // Start agent job
  fastify.post('/agents/:agentType/start', {
    schema: {
      params: z.object({
        agentType: z.enum([
          'PRICE_RESEARCH',
          'PARTNER_OUTREACH',
          'CONTENT_CREATION',
          'GRANT_RESEARCH',
          'DATA_ANALYSIS',
          'RECEIPT_PROCESSING',
          'COMMUNITY_MEAL_PLANNER',
          'VOLUNTEER_COORDINATOR',
          'COMPETITOR_ANALYSIS',
          'LEGAL_COMPLIANCE',
          'SOCIAL_MEDIA'
        ])
      }),
      body: z.object({
        inputData: z.record(z.any())
      })
    }
  }, async (request, reply) => {
    const { agentType } = request.params;
    const { inputData } = request.body;
    const userId = request.user.id;

    try {
      // Add job to queue
      const job = await agentQueue.add(
        `${agentType}-${Date.now()}`,
        {
          agentType,
          inputData,
          userId,
        },
        {
          priority: getAgentPriority(agentType),
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );

      // Store job in database
      const agentJob = await fastify.prisma.agentJob.create({
        data: {
          id: job.id,
          userId,
          agentType,
          status: 'QUEUED',
          inputData: inputData as any,
          progress: 0,
        },
      });

      reply.send({
        success: true,
        jobId: job.id,
        status: 'QUEUED',
        estimatedTime: getEstimatedTime(agentType),
      });

    } catch (error) {
      fastify.log.error('Failed to start agent:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to start agent job'
      });
    }
  });

  // Get active jobs for user
  fastify.get('/agents/jobs/active', async (request, reply) => {
    const userId = request.user.id;

    try {
      const activeJobs = await fastify.prisma.agentJob.findMany({
        where: {
          userId,
          status: {
            in: ['QUEUED', 'RUNNING']
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      reply.send(activeJobs);

    } catch (error) {
      fastify.log.error('Failed to fetch active jobs:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch jobs'
      });
    }
  });

  // Get specific job status
  fastify.get('/agents/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const userId = request.user.id;

    try {
      const job = await fastify.prisma.agentJob.findFirst({
        where: {
          id: jobId,
          userId
        },
        include: {
          results: true
        }
      });

      if (!job) {
        return reply.status(404).send({
          success: false,
          error: 'Job not found'
        });
      }

      reply.send({
        success: true,
        job
      });

    } catch (error) {
      fastify.log.error('Failed to fetch job:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch job'
      });
    }
  });

  // Cancel job
  fastify.delete('/agents/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const userId = request.user.id;

    try {
      // Cancel job in queue
      const job = await agentQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }

      // Update job status in database
      await fastify.prisma.agentJob.updateMany({
        where: {
          id: jobId,
          userId
        },
        data: {
          status: 'CANCELLED',
          completedAt: new Date()
        }
      });

      reply.send({
        success: true,
        message: 'Job cancelled'
      });

    } catch (error) {
      fastify.log.error('Failed to cancel job:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to cancel job'
      });
    }
  });

  // Get agent results
  fastify.get('/agents/results', async (request, reply) => {
    const userId = request.user.id;
    const { agentType, limit = 10, offset = 0 } = request.query;

    try {
      const where = {
        userId,
        status: 'COMPLETED',
        ...(agentType && { agentType })
      };

      const [results, total] = await Promise.all([
        fastify.prisma.agentJob.findMany({
          where,
          include: {
            results: true
          },
          orderBy: {
            completedAt: 'desc'
          },
          take: limit,
          skip: offset
        }),
        fastify.prisma.agentJob.count({ where })
      ]);

      reply.send({
        success: true,
        results,
        total,
        hasMore: offset + results.length < total
      });

    } catch (error) {
      fastify.log.error('Failed to fetch results:', error);
      reply.status(500).send({
        success: false,
        error: 'Failed to fetch results'
      });
    }
  });
};

function getAgentPriority(agentType: string): number {
  const priorities = {
    'PRICE_RESEARCH': 10,
    'PARTNER_OUTREACH': 8,
    'CONTENT_CREATION': 6,
    'GRANT_RESEARCH': 7,
    'DATA_ANALYSIS': 5,
    'RECEIPT_PROCESSING': 9,
    'COMMUNITY_MEAL_PLANNER': 7,
    'VOLUNTEER_COORDINATOR': 8,
    'COMPETITOR_ANALYSIS': 4,
    'LEGAL_COMPLIANCE': 6,
    'SOCIAL_MEDIA': 5
  };
  return priorities[agentType] || 5;
}

function getEstimatedTime(agentType: string): string {
  const times = {
    'PRICE_RESEARCH': '5-8 minutes',
    'PARTNER_OUTREACH': '8-12 minutes',
    'CONTENT_CREATION': '3-5 minutes',
    'GRANT_RESEARCH': '10-15 minutes',
    'DATA_ANALYSIS': '2-4 minutes',
    'RECEIPT_PROCESSING': '1-2 minutes',
    'COMMUNITY_MEAL_PLANNER': '8-15 minutes',
    'VOLUNTEER_COORDINATOR': '5-8 minutes',
    'COMPETITOR_ANALYSIS': '6-10 minutes',
    'LEGAL_COMPLIANCE': '4-7 minutes',
    'SOCIAL_MEDIA': '2-4 minutes'
  };
  return times[agentType] || '5-10 minutes';
}

export default agentRoutes;
```

---

## Security & Performance

### Security Best Practices

#### Authentication & Authorization

```javascript
// src/middleware/auth.js
import jwt from 'jsonwebtoken';

export const authenticateToken = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return reply.status(401).send({ error: 'Access token required' });
    }

    const user = jwt.verify(token, process.env.JWT_SECRET);
    request.user = user;

  } catch (error) {
    return reply.status(403).send({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles) => {
  return async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!roles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
};
```

#### Rate Limiting

```javascript
// src/middleware/rate-limit.js
import rateLimit from '@fastify/rate-limit';

export const agentRateLimit = {
  max: 10, // 10 requests
  timeWindow: '1 minute',
  keyGenerator: (request) => request.user.id,
  errorResponseBuilder: (request, context) => ({
    code: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded, retry in ${context.ttl}ms`,
    retryAfter: context.ttl
  })
};

export const donationRateLimit = {
  max: 5, // 5 donations
  timeWindow: '1 minute',
  keyGenerator: (request) => request.user.id
};
```

#### Input Validation

```javascript
// src/schemas/validation.js
import { z } from 'zod';

export const priceResearchSchema = z.object({
  foodItem: z.string().min(1).max(100),
  quantity: z.string().min(1).max(50),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  budget: z.number().positive().optional()
});

export const partnerOutreachSchema = z.object({
  partnerType: z.enum(['churches', 'companies', 'nonprofits', 'restaurants']),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  radiusMiles: z.number().min(1).max(50).default(10),
  maxResults: z.number().min(1).max(100).default(20)
});

export const donationSchema = z.object({
  amount: z.number().min(1).max(10000), // $1 to $10,000
  organizationId: z.string().uuid(),
  recurring: z.boolean().default(false),
  anonymousDonation: z.boolean().default(false)
});
```

### Performance Optimization

#### Database Query Optimization

```javascript
// src/services/database.js
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

const redis = new Redis(process.env.REDIS_URL);

export class DatabaseService {
  // Cached queries for frequently accessed data
  async getOrganizations(useCache = true) {
    const cacheKey = 'organizations:all';

    if (useCache) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const organizations = await prisma.organization.findMany({
      where: {
        verificationStatus: 'verified'
      },
      select: {
        id: true,
        name: true,
        type: true,
        createdAt: true
      },
      orderBy: {
        name: 'asc'
      }
    });

    if (useCache) {
      await redis.setex(cacheKey, 300, JSON.stringify(organizations)); // 5 min cache
    }

    return organizations;
  }

  // Optimized ledger queries with pagination
  async getPublicLedger(page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    return await prisma.ledgerEntry.findMany({
      select: {
        id: true,
        entryType: true,
        amountCents: true,
        description: true,
        category: true,
        receiptUrl: true,
        vendor: true,
        createdAt: true,
        donation: {
          select: {
            donor: {
              select: {
                id: true,
                fullName: true,
                visibilityPreference: true
              }
            }
          }
        },
        organization: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });
  }

  // Bulk operations for better performance
  async createBulkLedgerEntries(entries) {
    return await prisma.ledgerEntry.createMany({
      data: entries,
      skipDuplicates: true
    });
  }
}
```

#### Caching Strategy

```javascript
// src/services/cache.js
import Redis from 'ioredis';

export class CacheService {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.defaultTTL = 300; // 5 minutes
  }

  // Cache agent results
  async cacheAgentResult(jobId, result, ttl = 3600) { // 1 hour for agent results
    const key = `agent:result:${jobId}`;
    await this.redis.setex(key, ttl, JSON.stringify(result));
  }

  async getAgentResult(jobId) {
    const key = `agent:result:${jobId}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Cache price data from agent research
  async cachePriceData(foodItem, zipCode, data, ttl = 1800) { // 30 minutes
    const key = `price:${foodItem.toLowerCase()}:${zipCode}`;
    await this.redis.setex(key, ttl, JSON.stringify(data));
  }

  async getPriceData(foodItem, zipCode) {
    const key = `price:${foodItem.toLowerCase()}:${zipCode}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Cache organization data
  async cacheOrganizationData(orgId, data, ttl = this.defaultTTL) {
    const key = `org:${orgId}`;
    await this.redis.setex(key, ttl, JSON.stringify(data));
  }

  // Invalidate cache patterns
  async invalidatePattern(pattern) {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Clear all agent results for a user
  async clearUserAgentResults(userId) {
    await this.invalidatePattern(`agent:result:*:${userId}`);
  }
}
```

#### WebSocket Optimization

```javascript
// src/services/websocket.js
import { Server } from 'socket.io';

export class WebSocketService {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupConnectionHandling();
    this.userSockets = new Map(); // Track user connections
  }

  setupConnectionHandling() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('authenticate', (token) => {
        try {
          const user = jwt.verify(token, process.env.JWT_SECRET);
          socket.userId = user.id;

          // Map user to socket for targeted updates
          this.userSockets.set(user.id, socket.id);

          socket.join(`user:${user.id}`);
          console.log(`User ${user.id} authenticated and joined room`);

        } catch (error) {
          socket.emit('auth-error', { message: 'Invalid token' });
          socket.disconnect();
        }
      });

      socket.on('disconnect', () => {
        if (socket.userId) {
          this.userSockets.delete(socket.userId);
        }
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  // Send agent progress updates to specific user
  sendAgentProgress(userId, jobId, progress, currentTask) {
    this.io.to(`user:${userId}`).emit('job-progress', {
      jobId,
      progress,
      currentTask,
      timestamp: Date.now()
    });
  }

  // Send agent completion notification
  sendAgentComplete(userId, jobId, result) {
    this.io.to(`user:${userId}`).emit('job-completed', {
      jobId,
      result,
      timestamp: Date.now()
    });
  }

  // Send donation updates to public feed
  sendDonationUpdate(donation) {
    this.io.emit('donation-update', {
      type: 'new-donation',
      data: donation,
      timestamp: Date.now()
    });
  }

  // Send ledger updates to public feed
  sendLedgerUpdate(entry) {
    this.io.emit('ledger-update', {
      type: 'new-expense',
      data: entry,
      timestamp: Date.now()
    });
  }
}
```

---

This comprehensive technical implementation guide provides everything needed to build and deploy the food bank platform with AI agent automation. The architecture uses proven technologies, follows security best practices, and is optimized for performance and scalability.