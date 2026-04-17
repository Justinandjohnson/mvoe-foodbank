# Mvoe Food Bank Platform

Monorepo for the Mvoe food bank platform.

- `backend/`: Fastify + Prisma + BullMQ API
- `frontend/`: Expo / React Native / React Native Web app
- `render.yaml`: Render Blueprint for the full stack

## What Runs Where

- Backend API: `backend/src/server.js`
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

## Render Deployment

This repo includes a Render Blueprint at `render.yaml`.

### Resources in the blueprint

- `mvoe-api`: Node web service for the Fastify API
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

Frontend service:

- `EXPO_PUBLIC_API_URL` - the deployed backend URL
- `EXPO_PUBLIC_WS_URL` - the backend WebSocket URL
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`

### Notes

- `backend/src/config/index.js` now reads Render's `PORT` automatically, so the API can run as a normal Render web service.
- The frontend accepts either `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` or the legacy `EXPO_PUBLIC_MAPBOX_TOKEN`.
- The legacy auth context file is now a compatibility re-export of the canonical context in `frontend/src/contexts/AuthContext.js`.

## Verification

- Frontend web export: passes
- Backend startup: blocked locally until PostgreSQL and Redis are running
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
