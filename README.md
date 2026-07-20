# Mvoe Food Bank Platform

Monorepo for the Mvoe food bank platform.

- `backend/`: Fastify + Prisma + BullMQ API
- `frontend/`: Expo / React Native / React Native Web app
- `python_backend/`: FastAPI service for volunteer-coordination and agent-chat flows
- `render.yaml`: Render Blueprint for the full stack

## What Runs Where

- Backend API: `backend/src/server.js`
- Python agent API: `python_backend/app/main.py`
- Frontend web build: `frontend/dist` after `npm run build:web`
- Database: PostgreSQL
- Queue/cache: Redis / Render Key Value

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Stripe test keys
- Mapbox public access token for the map screens

### Backend Setup

```bash
cd backend
npm ci
cp .env.example .env
```

Fill in at least these variables in `backend/.env`:

- `DATABASE_URL`
- `REDIS_URL`
- `FRONTEND_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` if you use Stripe webhooks
- `OPENROUTER_API_KEY` for local MiniMax M2.7 agent execution

Then initialize the database and start the API:

```bash
npm run prisma:generate
npx prisma db push
npm start
```

The backend listens on `http://localhost:3000` by default.

### Frontend Setup

```bash
cd frontend
npm ci
cp .env.example .env
```

Fill in at least these variables in `frontend/.env`:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_AGENT_API_URL`
- `EXPO_PUBLIC_WS_URL`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `EXPO_PUBLIC_APP_ENV`

Run the web app locally:

```bash
npm run web
```

Build the web export:

```bash
npm run build:web
```

Expo writes the web export to `frontend/dist`.

### Python Agent Backend Setup

```bash
cd python_backend
uv sync
cp .env.example .env
```

Fill in at least these variables in `python_backend/.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `FERNET_KEY`
- `OPENROUTER_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `FRONTEND_URL`

Start the Python API locally:

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The Python agent backend listens on `http://127.0.0.1:8001` by default.

### Local dual-backend runbook (validated)

Local validation currently uses:

- Node backend: `http://127.0.0.1:3000`
- Python backend: `http://127.0.0.1:8001`
- Frontend static web export: `http://127.0.0.1:4173`

Validated startup sequence:

```bash
# 1. Node backend
cd backend
npm run prisma:generate
npx prisma db push
npm start

# 2. Python backend
cd ../python_backend
set -a; source .env; set +a
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001

# 3. Frontend web export
cd ../frontend
npm run build:web
python3 -m http.server 4173 --directory dist
```

### Current local feature status

- Guest meal planner: **works locally** via the Node backend using guest-specific start/status endpoints
- Volunteer coordinator: **works locally** against the Python backend
- Grant writer MVP: **works locally** with source-backed draft generation, website brand-profile enrichment, and periodic curated grant-source indexing; it is significantly slower than the volunteer coordinator and can take ~1-2 minutes
- Grant search + application preparation: **works locally** as a browser-assisted flow that ranks top grant targets, prepares portal/application review steps, and stops before final submission
- Agent notifications/activity center: **works locally** and aggregates Node-side agent lifecycle activity plus Python-side approval/activity feeds in-app
- Node-side agent reasoning now prefers **MiniMax M2.7 via OpenRouter** when `OPENROUTER_API_KEY` is set.
- Python-side agent reasoning now uses **MiniMax M2.7 via OpenRouter** for both agent and draft workloads.

### Current MVP limitations

- **Guest meal planner** is fair-use only. It is rate-limited and should not be treated as anonymous unlimited AI access.
- **Grant writer** is a guided drafting assistant, not a live grant filing tool. It provides funding-fit guidance, checklist items, and draft sections, but users must still verify current deadlines, eligibility, and funder instructions against primary sources.
- **Grant writer indexing** is curated and periodic, not a blind crawl of the whole internet. It refreshes snapshots from known grant/compliance sources and uses those summaries plus built-in grant-writing examples as grounding context.
- **Brand identity enrichment** is lightweight. If the user provides a website URL, the agent extracts title/meta/body context and uses it as a brand profile input; this is not a full brand crawler.
- **Application automation** is best-effort and review-gated. The system can inspect application URLs, classify portal types, and generate an automation/review plan, but it intentionally stops before final submission.
- **Supported portal mode vs generic mode**: known portal families (for example Grants.gov/Submittable-style flows) are treated as supported-portal workflows; everything else falls back to generic browser-assisted inspection.
- **Dynamic grant data** (open opportunities, deadlines, exact award windows) should always be re-verified before submission.

## Render Deployment

This repo includes a Render Blueprint at `render.yaml`.

### Resources in the blueprint

- `mvoe-api`: Node web service for the Fastify API
- `mvoe-agent-api`: Python web service for volunteer + grant/agent support APIs
- `mvoe-web`: Static site for the Expo web build
- `mvoe-postgres`: PostgreSQL database
- `mvoe-redis`: Redis-compatible Key Value store

### Deployment flow

1. Create a new Render Blueprint from this repo.
2. Sync `render.yaml`.
3. When Render prompts for `sync: false` values, provide the production secrets and URLs.
4. Let Render provision the database and Redis instance.
5. Deploy the backend first, then the frontend.

### Required secrets and values

Backend service:

- `FRONTEND_URL` - the deployed frontend URL
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` if webhooks are enabled

Python agent service:

- `FRONTEND_URL` - the deployed frontend URL
- `DATABASE_URL`
- `JWT_SECRET`
- `FERNET_KEY`
- `OPENROUTER_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`

Frontend service:

- `EXPO_PUBLIC_API_URL` - the deployed backend URL
- `EXPO_PUBLIC_AGENT_API_URL` - the deployed Python agent API URL
- `EXPO_PUBLIC_WS_URL` - the backend WebSocket URL
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`

### Notes

- `backend/src/config/index.js` now reads Render's `PORT` automatically, so the API can run as a normal Render web service.
- The frontend accepts either `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` or the legacy `EXPO_PUBLIC_MAPBOX_TOKEN`.
- The legacy auth context file is now a compatibility re-export of the canonical context in `frontend/src/contexts/AuthContext.js`.

## Verification

- Frontend web export: passes
- Node backend startup: passes locally when PostgreSQL and Redis are running
- Python backend startup: passes locally when env vars are loaded from `python_backend/.env`
- Backend lint: blocked because the backend package does not currently include an ESLint config

## Useful Commands

```bash
# Backend
cd backend
npm run prisma:generate
npx prisma db push
npm start

# Frontend
cd frontend
npm run web
npm run build:web

# Render blueprint validation, after logging in to Render CLI
render blueprints validate render.yaml
```
