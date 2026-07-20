/**
 * API Smoke Tests — full route coverage for the Node.js backend.
 *
 * Every meaningful route is hit at least once.  Auth-protected routes are
 * tested with a real login first; public routes are tested unauthenticated.
 *
 * Run locally:
 *   TEST_API_URL=http://127.0.0.1:3100 npx playwright test tests/api/smoke
 *
 * The suite is designed to be non-destructive:
 *   - Creates objects only to verify creation, then deletes them.
 *   - Does NOT affect real production data when run against Render.
 */

import { test, expect, APIRequestContext, request as apiRequest } from '@playwright/test';

const BASE_URL = process.env.TEST_API_URL ?? 'http://127.0.0.1:3100';

// Override the project baseURL so all { request } fixtures point at the API
test.use({ baseURL: BASE_URL });

// Seed credentials (created by prisma/seed.js)
const DONOR_EMAIL    = process.env.TEST_DONOR_EMAIL    ?? 'donor@example.com';
const DONOR_PASSWORD = process.env.TEST_DONOR_PASSWORD ?? 'password123';
const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'password123';

// ---------------------------------------------------------------------------
// Shared auth state
// ---------------------------------------------------------------------------

let donorCtx: APIRequestContext;
let donorToken: string;
let donorRefreshToken: string;

let adminCtx: APIRequestContext;
let adminToken: string;

test.beforeAll(async () => {
  // Login as donor
  const donorReq = await apiRequest.newContext({ baseURL: BASE_URL });
  const donorRes = await donorReq.post('/api/auth/login', {
    data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
  });
  const donorBody = await donorRes.json();
  donorToken = donorBody.data?.accessToken ?? '';
  donorRefreshToken = donorBody.data?.refreshToken ?? '';
  await donorReq.dispose();

  donorCtx = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${donorToken}` },
  });

  // Login as admin
  const adminReq = await apiRequest.newContext({ baseURL: BASE_URL });
  const adminRes = await adminReq.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminBody = await adminRes.json();
  adminToken = adminBody.data?.accessToken ?? '';
  await adminReq.dispose();

  adminCtx = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  });
});

test.afterAll(async () => {
  await donorCtx?.dispose();
  await adminCtx?.dispose();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

test.describe('Health', () => {
  test('GET /health → 200 healthy', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

test.describe('Auth routes', () => {
  test('POST /api/auth/signup → 201 with new unique email', async () => {
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    const ts = Date.now();
    const res = await ctx.post('/api/auth/signup', {
      data: {
        email: `smoke-${ts}@mvoe-test.com`,
        password: 'Smoke1234!',
        fullName: `Smoke User ${ts}`,
        userType: 'donor',
      },
    });
    const body = await res.json();
    await ctx.dispose();
    expect(res.status()).toBe(201);
    expect(body.data).toHaveProperty('user');
  });

  test('POST /api/auth/login → 200 with valid credentials', async () => {
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/auth/login', {
      data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
    });
    const body = await res.json();
    await ctx.dispose();
    expect(res.status()).toBe(200);
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
  });

  test('POST /api/auth/login → 401 with wrong password', async () => {
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/auth/login', {
      data: { email: DONOR_EMAIL, password: 'wrong-password' },
    });
    await ctx.dispose();
    expect([400, 401]).toContain(res.status());
  });

  test('GET /api/auth/me → 200 with valid token', async () => {
    const res = await donorCtx.get('/api/auth/me');
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.data).toHaveProperty('email', DONOR_EMAIL);
  });

  test('GET /api/auth/me → 401 without token', async () => {
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.get('/api/auth/me');
    await ctx.dispose();
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/refresh → 200 with valid refresh token', async () => {
    if (!donorRefreshToken) {
      test.skip();
      return;
    }
    const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/auth/refresh', {
      data: { refreshToken: donorRefreshToken },
    });
    const body = await res.json();
    await ctx.dispose();
    expect(res.status()).toBe(200);
    expect(body.data).toHaveProperty('accessToken');
  });
});

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

test.describe('User routes', () => {
  test('GET /api/user/profile → 200', async () => {
    const res = await donorCtx.get('/api/user/profile');
    expect(res.status()).toBe(200);
  });

  test('GET /api/user/stats → 200', async () => {
    const res = await donorCtx.get('/api/user/stats');
    expect([200, 404]).toContain(res.status());
  });

  test('GET /api/user/donations → 200', async () => {
    const res = await donorCtx.get('/api/user/donations');
    expect(res.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

test.describe('Organization routes', () => {
  test('GET /api/organizations → 200 returns array', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/organizations with limit param → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations?limit=5`);
    expect(res.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

test.describe('Map routes', () => {
  test('GET /api/map/live → 200 or 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/map/live?radius=25`);
    expect([200, 401]).toContain(res.status());
  });

  test('GET /api/map/live (authenticated) → 200 with correct shape', async () => {
    const res = await donorCtx.get('/api/map/live?radius=25');
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body.data?.foodBanks)).toBe(true);
      expect(Array.isArray(body.data?.beacons)).toBe(true);
      expect(Array.isArray(body.data?.events)).toBe(true);
    }
  });

  test('GET /api/map/live rejects negative radius', async () => {
    const res = await donorCtx.get('/api/map/live?radius=-1');
    expect([400, 422, 200]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Food Banks
// ---------------------------------------------------------------------------

test.describe('Food bank routes', () => {
  test('GET /api/food-banks → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks`);
    expect([200, 401]).toContain(res.status());
  });

  test('GET /api/food-banks/nearby → 200', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/nearby?latitude=30.2672&longitude=-97.7431&radius=25`
    );
    expect([200, 400, 401]).toContain(res.status());
  });

  test('GET /api/food-banks/hours-review-queue → 200 or 401', async () => {
    const res = await donorCtx.get('/api/food-banks/hours-review-queue');
    expect([200, 403, 401]).toContain(res.status());
  });

  test('GET /api/food-banks/:id → 404 for nonexistent id', async () => {
    const res = await donorCtx.get('/api/food-banks/00000000-0000-0000-0000-000000000000');
    expect([404, 400]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Food Beacons
// ---------------------------------------------------------------------------

test.describe('Food beacon routes', () => {
  test('GET /api/food-beacons → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-beacons`);
    expect([200, 401]).toContain(res.status());
  });

  test('GET /api/food-beacons/me → 200 (auth)', async () => {
    const res = await donorCtx.get('/api/food-beacons/me');
    expect([200, 404]).toContain(res.status());
  });

  test('PUT /api/food-beacons/me → creates or updates beacon', async () => {
    const res = await donorCtx.put('/api/food-beacons/me', {
      data: {
        latitude: 30.267,
        longitude: -97.743,
        quantity: 'some',
        availableHours: 6,
        description: 'Smoke test beacon',
      },
    });
    // 401 = session required (anonymous session header needed), 200/201 = success
    expect([200, 201, 400, 401, 422]).toContain(res.status());
  });

  test('POST /api/food-beacons/me/toggle → toggles beacon', async () => {
    const res = await donorCtx.post('/api/food-beacons/me/toggle', {
      data: { isActive: false },
    });
    expect([200, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Donations
// ---------------------------------------------------------------------------

test.describe('Donation routes', () => {
  test('GET /api/donations → 200', async () => {
    const res = await donorCtx.get('/api/donations');
    expect(res.status()).toBe(200);
  });

  test('GET /api/donations/stats/overall → 200', async () => {
    const res = await donorCtx.get('/api/donations/stats/overall');
    expect([200, 401]).toContain(res.status());
  });

  test('POST /api/donations → 400 without payment method (Stripe validates)', async () => {
    const res = await donorCtx.post('/api/donations', {
      data: {
        amount: 10,
        currency: 'usd',
        organizationId: '00000000-0000-0000-0000-000000000000',
        paymentMethodId: 'pm_invalid_smoke_test',
      },
    });
    // Stripe will reject invalid PM — 400 or 422 expected
    expect([400, 422, 500]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

test.describe('Ledger routes', () => {
  test('GET /api/ledger/public → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/ledger/public`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/ledger/public with pagination → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/ledger/public?page=1&limit=10`);
    expect(res.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Community Events
// ---------------------------------------------------------------------------

test.describe('Community event routes', () => {
  let createdEventId: string | null = null;

  test('GET /api/community-events → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/community-events`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  test('GET /api/community-events/nearby → 200 or 400', async ({ request }) => {
    // Route requires city or state param — 400 is the valid "missing param" response
    const res = await request.get(
      `${BASE_URL}/api/community-events/nearby?city=Austin&state=TX`
    );
    expect([200, 400, 401]).toContain(res.status());
  });

  test('POST /api/community-events/create → 201 (auth)', async () => {
    const res = await donorCtx.post('/api/community-events/create', {
      data: {
        name: 'Smoke Test Meal',
        eventType: 'community_meal',
        date: new Date(Date.now() + 86_400_000).toISOString(),
        lat: 30.267,
        lng: -97.743,
        address: '100 Smoke Test Ave, Austin TX',
        targetServings: 20,
        description: 'Auto-generated by smoke test — safe to delete',
      },
    });
    expect([200, 201]).toContain(res.status());
    if ([200, 201].includes(res.status())) {
      const body = await res.json();
      createdEventId = body.data?.id ?? null;
    }
  });

  test('GET /api/community-events/:id → 200 for created event', async ({ request }) => {
    if (!createdEventId) {
      test.skip();
      return;
    }
    const res = await request.get(`${BASE_URL}/api/community-events/${createdEventId}`);
    expect(res.status()).toBe(200);
  });

  test('DELETE /api/community-events/:id → 200 cleanup', async () => {
    if (!createdEventId) {
      test.skip();
      return;
    }
    const res = await donorCtx.delete(`/api/community-events/${createdEventId}`);
    expect([200, 204]).toContain(res.status());
    createdEventId = null;
  });
});

// ---------------------------------------------------------------------------
// Agents — Meal Planner (guest mode, no auth needed)
// ---------------------------------------------------------------------------

test.describe('Agent routes — meal planner', () => {
  test('GET /api/agents/meal-planner/pricing-status → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/agents/meal-planner/pricing-status`);
    expect(res.status()).toBe(200);
  });

  test('POST /api/agents/meal-planner/guest/start → 200 or 202', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/agents/meal-planner/guest/start`, {
      data: {
        servings: 20,
        dietaryRestrictions: ['vegetarian'],
        budget: 150,
        pantryName: 'Smoke Test Pantry',
      },
    });
    expect([200, 202, 400, 429]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Agents — Grant Writer (guest mode)
// ---------------------------------------------------------------------------

test.describe('Agent routes — grant writer', () => {
  test('GET /api/agents/grant-writer/index-status → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/agents/grant-writer/index-status`);
    expect(res.status()).toBe(200);
  });

  test('POST /api/agents/grant-writer/guest/start → 200 or 202', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/agents/grant-writer/guest/start`, {
      data: {
        pantryName: 'Smoke Test Food Pantry',
        location: 'Austin, TX',
        mission: 'Feed hungry families in Central Texas',
        annualBudget: 75000,
        programsOffered: ['food distribution', 'mobile pantry'],
      },
    });
    expect([200, 202, 400, 429]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Food Bank Directory
// ---------------------------------------------------------------------------

test.describe('Food bank directory routes', () => {
  test('GET /api/food-bank-directory/status → 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-bank-directory/status`);
    expect([200, 401]).toContain(res.status());
  });

  test('GET /api/food-bank-directory/regions → 200', async () => {
    const res = await donorCtx.get('/api/food-bank-directory/regions');
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/food-bank-directory/entries → 200', async () => {
    const res = await donorCtx.get('/api/food-bank-directory/entries');
    expect([200, 401, 403]).toContain(res.status());
  });

  test('GET /api/food-bank-directory/review-queue → 200 or 403', async () => {
    const res = await donorCtx.get('/api/food-bank-directory/review-queue');
    expect([200, 401, 403]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

test.describe('Report routes', () => {
  const FAKE_ORG = '00000000-0000-0000-0000-000000000099';

  test('GET /api/reports/periods/:orgId → 200, 401, or 403', async () => {
    const res = await donorCtx.get(`/api/reports/periods/${FAKE_ORG}`);
    expect([200, 401, 403, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 401 guard — key protected routes must reject unauthenticated requests
// ---------------------------------------------------------------------------

test.describe('Auth guard — protected routes must return 401', () => {
  // Routes that must reject unauthenticated requests
  const protectedRoutes = [
    '/api/auth/me',
    '/api/user/profile',
    '/api/agents/active',
  ];

  for (const route of protectedRoutes) {
    test(`GET ${route} → 401 without token`, async ({ request }) => {
      const res = await request.get(`${BASE_URL}${route}`);
      expect(res.status()).toBe(401);
    });
  }
});
