# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Application Flow

**CRITICAL PATTERN**: This application follows a strict AI-agent orchestrated workflow:

```
User Request → AI Agent → MCP Tools → Result
```

**Every feature works this way:**
1. **User makes request** (via API/frontend)
2. **AI Agent processes request** (in `backend/src/agents/`)
3. **Agent uses ONLY MCP tools** (in `backend/src/mcp/`)
4. **Result returned to user** (with real-time progress via Socket.io)

**NO exceptions** - never implement direct API calls, hardcoded logic, or fallback methods. ALL external operations must go through MCP tools orchestrated by AI agents.

## MCP-First Architecture

This platform uses MCP (Model Context Protocol) tools as the primary execution method for ALL tasks. You MUST use MCP tools for every operation - no fallback methods or pre-hardcoded logic allowed.

### Available MCP Clients
- `zenClient.js` - AI reasoning and consensus building
- `playwrightClient.js` / `realPlaywrightClient.js` / `stealthPlaywrightClient.js` - Web automation
- `chromeDevToolsClient.js` - Browser debugging and performance
- `imageClient.js` - OpenAI DALLE image generation
- `emailClient.js` - Email delivery
- `googleSheetsClient.js` - Spreadsheet operations
- `usdaClient.js` - Food data API integration

### AI Agent Architecture
All agents in `backend/src/agents/` follow the core flow pattern:

**Example Flow - Content Creation:**
```
User: "Create social media post" → contentCreationAgent → zenClient + imageClient → Generated post with image
```

**Example Flow - Price Research:**
```
User: "Find food prices" → priceResearchAgent → playwrightClient → Scraped pricing data
```

**Example Flow - Receipt Processing:**
```
User: "Process receipt" → receiptProcessingAgent → imageClient (OCR) → Extracted expense data
```

**Available Agents:**
- `contentCreationAgent.js` - Social media, newsletters, images via zenClient + imageClient + emailClient
- `mealPlannerAgent.js` - Nutrition planning via zenClient + usdaClient
- `priceResearchAgent.js` - Web scraping via playwrightClient variants
- `receiptProcessingAgent.js` - OCR and expense tracking via imageClient + zenClient

Each agent exposes `availableTools` array that defines what MCP operations it can orchestrate.

## Development Commands

### Backend Setup
```bash
cd backend
npm install
npm run prisma:migrate     # Run database migrations
npm run prisma:seed        # Seed with test data
npm run dev               # Start with hot reload
npm run prisma:studio     # Database GUI
```

### Frontend Setup
```bash
cd frontend
npm install
npm run web              # Start web version
npm run start           # Start Expo development server
npm run build:web       # Build for web deployment
```

### Testing
```bash
# Backend
cd backend
npm test                # Run Jest tests (configuration in package.json)
npm run lint           # ESLint checking

# Agent Integration Tests (manual)
node src/tests/agent-integration-tests.js
node src/tests/test-real-agent-execution.js

# Web Scraping Tests (manual)
node src/tests/test-playwright-web-scraping.js
node src/tests/test-stealth-scraping.js

# No frontend tests configured yet
```

## Architecture Overview

### Backend (Node.js + Fastify)
- **Fastify** server with JWT authentication, CORS, Helmet security, rate limiting
- **Prisma ORM** with PostgreSQL database and connection pooling
- **Redis** for caching and session management (ioredis client)
- **Socket.io** for real-time agent progress and notifications
- **Stripe** integration for payment processing with webhooks
- **MCP clients** in `src/mcp/` for external integrations
- **Agent Worker** system in `src/workers/` for background task processing
- **Zod validation** for configuration and environment variables

### Frontend (React Native Web + Expo)
- **Expo** framework for cross-platform development
- **React Navigation** for routing
- **Zustand** for state management
- **React Query** for API state
- **React Native Paper** for UI components
- **Socket.io-client** for real-time features

### Database Schema (Prisma PostgreSQL)
**Phase 1 - Foundation:**
- `users` - Authentication and profiles with visibility preferences
- `organizations` - Food banks, churches, companies with geolocation
- `donations` - Stripe-integrated transactions with recurring support
- `ledger_entries` - Public transparency log with running balances
- `refresh_tokens` - JWT session management
- `audit_logs` - System activity tracking

**Phase 2 - Food Bank Integration:**
- `organization_members` - Staff/volunteer management with roles
- `food_bank_status` - Real-time capacity and wait times
- `food_needs` - Priority-based food requests
- `meals` - Meal planning with volunteer coordination
- `volunteer_shifts` - Shift management for meal prep/delivery
- `deliveries` - Meal delivery tracking

**Phase 3 - Community & Analytics:**
- `community_events` - Event organization with volunteer coordination
- `event_meal_plans` - AI-generated meal planning with nutrition analysis
- `detailed_expenses` - Categorized expense tracking with receipts
- `impact_metrics` - Automated impact calculations
- `receipt_photos` - OCR-processed receipt storage with transparency
- `nutrition_data_cache` - USDA nutrition data caching

### API Structure
All routes in `backend/src/routes/`:
- `/api/auth/*` - Authentication endpoints (signup, login, refresh, logout)
- `/api/donations/*` - Donation management with Stripe integration
- `/api/organizations/*` - Organization CRUD with geolocation
- `/api/ledger/*` - Public transparency ledger with balance tracking
- `/api/user/*` - User profile management
- `/api/foodbank/*` - Food bank status and capacity management
- `/api/community/*` - Community events and volunteer coordination
- `/api/agents/*` - AI agent task execution endpoints
- `/api/receipts/*` - Receipt processing and OCR
- `/api/reports/*` - Analytics and impact reporting

**Real-time Features:** Socket.io integration for live agent progress updates and system notifications.

## Implementation Requirements

When implementing ANY new feature, you MUST follow the core flow:

### 1. Route Handler Receives Request
```javascript
// In src/routes/*.routes.js
app.post('/api/agents/create-content', async (request, reply) => {
  const agent = new ContentCreationAgent(io); // Pass Socket.io for real-time updates
  const result = await agent.handleUserRequest(request.body);
  return result;
});
```

### 2. Agent Processes Request
```javascript
// In src/agents/*.js - Agent decides which MCP tools to use
async handleUserRequest(userInput) {
  this.io.emit('agent_progress', { status: 'processing', step: 'analyzing_request' });

  // Agent orchestrates MCP tools (NEVER direct API calls)
  const content = await this.zenClient.generateContent(userInput);
  const image = await this.imageClient.generateImage(content.imagePrompt);

  return { content, image };
}
```

### 3. MCP Tools Execute Tasks
```javascript
// In src/mcp/*.js - MCP clients handle external operations
async generateImage(prompt) {
  // This is the ONLY place external APIs are called
  return await openai.images.generate({ prompt });
}
```

### 4. Requirements Summary:
1. **Never bypass agents** - All user requests go through AI agents
2. **Never bypass MCP tools** - Agents only use MCP clients for external operations
3. **Real-time updates** - Use Socket.io for progress tracking
4. **Tool definitions** - Each agent exposes `availableTools` array
5. **Error handling** - MCP operations handle failures gracefully

## Environment Requirements

### Required Services
- PostgreSQL 15+ (database)
- Redis 7+ (job queue & caching)
- Node.js 18+ (runtime)

### Required API Keys
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection (optional, defaults to localhost)
- `STRIPE_SECRET_KEY` - Payment processing
- `OPENAI_API_KEY` - Image generation via imageClient
- `JWT_SECRET` - Authentication token signing (32+ char random string)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - S3 file storage (optional)
- Additional keys for MCP integrations as needed

### Configuration Management
Uses centralized config in `src/config/index.js` with Zod validation for:
- Environment-specific settings (development, production, test)
- Database and Redis connection parameters
- JWT token expiration settings
- Stripe webhook configuration
- Rate limiting parameters
- Logging levels

## Test Accounts
After seeding:
- Donor: `donor@example.com` / `password123`
- Admin: `admin@example.com` / `password123`

## Common Development Patterns

### Adding New Agent
1. Create agent class in `src/agents/` extending base pattern
2. Define `availableTools` array with MCP capabilities and parameter descriptions
3. Implement MCP client orchestration methods (never direct API calls)
4. Add Socket.io progress updates using `this.io.emit()`
5. Create route handlers in `src/routes/` that invoke the agent
6. Add agent worker registration in `src/workers/agentWorker.js`

### MCP Client Pattern
```javascript
// Always use MCP tools, never direct implementations
const result = await this.mcpClient.executeTask({
  tool: 'specific_tool_name',
  params: { /* tool parameters */ }
});

// Example from contentCreationAgent:
const image = await this.imageClient.generateImage({
  prompt: flyer_prompt,
  size: '1024x1024',
  quality: 'standard',
  saveFilename: filename
});
```

### Real-time Updates
```javascript
// Emit progress for long-running MCP operations
this.io.emit('agent_progress', {
  agentType: 'content_creation',
  status: 'processing',
  step: 'generating_image',
  progress: 45,
  message: 'Generating promotional image...'
});

// Socket.io server setup in server.js
const io = new SocketIOServer(server);
io.on('connection', (socket) => {
  console.log('Client connected to real-time updates');
});
```

### Database Patterns
```javascript
// Use Prisma client from utils/database.js
import { getPrismaClient } from '../utils/database.js';
const prisma = getPrismaClient();

// Transaction example for ledger entries
const result = await prisma.$transaction(async (tx) => {
  const donation = await tx.donation.create({ data: donationData });
  const ledgerEntry = await tx.ledgerEntry.create({ data: ledgerData });
  return { donation, ledgerEntry };
});
```

### Caching Patterns
```javascript
// Use CacheService from utils/redis.js
import CacheService from '../utils/redis.js';

// Cache expensive operations
const cacheKey = `nutrition:${fdcId}`;
const cached = await CacheService.get(cacheKey);
if (cached) return JSON.parse(cached);

const freshData = await this.usdaClient.getNutritionData(fdcId);
await CacheService.set(cacheKey, JSON.stringify(freshData), 3600); // 1 hour TTL
```
## How work runs on this project (JJ's standing rules)

- **The main Claude only orchestrates.** All work (coding, scraping, verifying) goes to **Sonnet 5 subagents** (`model: sonnet`), run in parallel and in the background, each owning separate files.
- **Agents never sleep or idle-wait**: no `sleep`, no polling loops, no waiting on slow pages. Grab results and come back fast; drop anything that doesn't answer quickly (hard ceiling 3 min on any one thing) and move on. Run independent fetches in parallel. Geocode in one batch (US Census addressbatch, no key), not Nominatim 1-req/sec.
- **Goal is that it works, not that things get skipped.** If a site/step is slow, blocked, or fails, get the same result another way right away (alternate URL, sitemap, API/JSON/iCal endpoint, WebFetch vs curl, secondary directory). Only mark skipped after the alternates fail too.
- **Speed first; index as much as possible.** Scrapers save their output after every source so no progress is lost.
- **Token budget: up to 1M tokens per agent.** Don't cut agents off below that.
- Austin food index: scrapers write `frontend/src/data/austin/{pantries,programs,events}.json` (+ `sources-*.json`); `npm --prefix frontend run index:merge` builds `frontend/src/data/austinFoodIndex.json`; `index:refresh` is the weekly source-change check (`CHANGES.md`).
- Live app is **mvoe.pages.dev (Cloudflare Pages)**, not Vercel. GitHub `main` is older than the live build.
