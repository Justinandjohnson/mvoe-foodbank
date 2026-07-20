/**
 * Food Bank API Tests — hits live https://mvoe-api.onrender.com
 *
 * Seed data created via API (2026-04-17):
 *   Users  : donor@mvoe-test.com / TestDonor123!
 *            admin@mvoe-test.com / TestAdmin123!
 *   Orgs   : 5 food banks seeded (pending verification status)
 *     SF   : 1e4cb7dc-bf1c-4173-8b91-1da645493cdd
 *     CHI  : b846ff38-8974-40dc-a257-ac0f271f4010
 *     HOU  : 2ec91484-a8aa-4505-941b-e34cfcaeeea1
 *     NYC  : 8ee39015-0e32-4cd9-bbba-46cc88702a1d
 *     ATL  : 55d1871d-b7b3-4897-b94e-be076eef86ae
 */

import { test, expect, request as apiRequest } from '@playwright/test';

const BASE_URL = 'https://mvoe-api.onrender.com';

// Known seeded IDs
const SF_ORG_ID  = '1e4cb7dc-bf1c-4173-8b91-1da645493cdd';
const CHI_ORG_ID = 'b846ff38-8974-40dc-a257-ac0f271f4010';

const DONOR_EMAIL    = 'donor@mvoe-test.com';
const DONOR_PASSWORD = 'TestDonor123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function loginDonor(): Promise<{ accessToken: string; refreshToken: string }> {
  const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.post('/api/auth/login', {
    data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
  });
  const status = res.status();
  const body = await res.json();
  await ctx.dispose();

  if (status !== 200) {
    throw new Error(
      `loginDonor: expected 200 but got ${status}. Body: ${JSON.stringify(body)}`
    );
  }
  if (!body.data?.accessToken) {
    throw new Error(`loginDonor: no accessToken in response: ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.data.accessToken as string,
    refreshToken: body.data.refreshToken as string,
  };
}

// Cached token — obtained once before the auth-dependent describe blocks run.
// This avoids making multiple login calls which can trigger rate limiting.
let _cachedTokens: { accessToken: string; refreshToken: string } | null = null;
async function getCachedTokens() {
  if (!_cachedTokens) {
    _cachedTokens = await loginDonor();
  }
  return _cachedTokens;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
test.describe('Health check', () => {
  test('GET /health returns healthy status', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/health`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('environment');
  });
});

// ---------------------------------------------------------------------------
// Auth — POST /api/auth/*
// ---------------------------------------------------------------------------
test.describe('Auth endpoints', () => {
  test('POST /api/auth/login with valid credentials returns tokens', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Login successful');
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.accessToken.length).toBeGreaterThan(20);
  });

  test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: DONOR_EMAIL, password: 'wrong-password-xyz' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/login with unknown email returns 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'nobody@nowhere.com', password: 'irrelevant' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/signup with duplicate email returns 4xx', async ({ request }) => {
    // donor@mvoe-test.com already exists
    const res = await request.post(`${BASE_URL}/api/auth/signup`, {
      data: {
        email: DONOR_EMAIL,
        password: 'TestDonor123!',
        fullName: 'Duplicate Donor',
      },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('GET /api/auth/me without token returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/auth/me`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/auth/me with valid token returns user object', async ({ request }) => {
    const { accessToken: token } = await getCachedTokens();
    const res = await request.get(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toHaveProperty('id');
    expect(body.data.user.email).toBe(DONOR_EMAIL);
  });

  test('POST /api/auth/refresh with valid refresh token returns new access token', async ({ request }) => {
    // Reuse the cached refresh token to avoid an extra login call
    const { refreshToken } = await getCachedTokens();

    const refreshRes = await request.post(`${BASE_URL}/api/auth/refresh`, {
      data: { refreshToken },
    });
    expect(refreshRes.status()).toBe(200);

    const body = await refreshRes.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('accessToken');

    // Cache the new tokens so subsequent tests use the refreshed access token
    _cachedTokens = {
      accessToken: body.data.accessToken as string,
      refreshToken: body.data.refreshToken ?? refreshToken,
    };
  });
});

// ---------------------------------------------------------------------------
// Organizations — GET /api/organizations/*
// ---------------------------------------------------------------------------
test.describe('Organization endpoints', () => {
  test('GET /api/organizations returns paginated structure', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('organizations');
    expect(body.data).toHaveProperty('total');
    expect(body.data).toHaveProperty('limit');
    expect(body.data).toHaveProperty('offset');
    expect(body.data).toHaveProperty('hasMore');
    expect(Array.isArray(body.data.organizations)).toBe(true);
  });

  test('GET /api/organizations/:id returns SF food bank', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations/${SF_ORG_ID}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.organization.id).toBe(SF_ORG_ID);
    expect(body.data.organization.name).toBe('SF-Marin Food Bank');
    expect(body.data.organization.city).toBe('San Francisco');
    expect(body.data.organization.state).toBe('CA');
    expect(body.data.organization.type).toBe('food_bank');
  });

  test('GET /api/organizations/:id returns Chicago food bank', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations/${CHI_ORG_ID}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.organization.name).toBe('Chicago Food Depository');
    expect(body.data.organization.state).toBe('IL');
  });

  test('GET /api/organizations/:id with nonexistent UUID returns 404', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/organizations/00000000-0000-0000-0000-000000000000`
    );
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  test('GET /api/organizations with limit param respects limit', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/organizations?limit=5`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.limit).toBe(5);
    expect(body.data.organizations.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Food Banks — GET /api/food-banks/*
// ---------------------------------------------------------------------------
test.describe('Food bank list endpoint', () => {
  test('GET /api/food-banks returns success shape with foodBanks array', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('foodBanks');
    expect(body.data).toHaveProperty('count');
    expect(Array.isArray(body.data.foodBanks)).toBe(true);
    expect(typeof body.data.count).toBe('number');
  });

  test('GET /api/food-banks count matches foodBanks array length', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks`);
    const body = await res.json();
    expect(body.data.count).toBe(body.data.foodBanks.length);
  });

  test('GET /api/food-banks with city=SanFrancisco returns filtered result', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks?city=San%20Francisco`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Every returned item should be in San Francisco
    for (const fb of body.data.foodBanks) {
      expect(fb.city).toBe('San Francisco');
    }
  });

  test('GET /api/food-banks with state=TX returns filtered result', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks?state=TX`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    for (const fb of body.data.foodBanks) {
      expect(fb.state).toBe('TX');
    }
  });

  test('GET /api/food-banks with limit param is respected', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks?limit=2`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.foodBanks.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Food Bank by ID — GET /api/food-banks/:id
// ---------------------------------------------------------------------------
test.describe('Food bank by ID endpoint', () => {
  test('GET /api/food-banks/:id returns food bank with expected shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks/${SF_ORG_ID}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('foodBank');

    const fb = body.data.foodBank;
    expect(fb.id).toBe(SF_ORG_ID);
    expect(fb.name).toBe('SF-Marin Food Bank');
    expect(fb.city).toBe('San Francisco');
    expect(fb.state).toBe('CA');
    expect(fb.type).toBe('food_bank');
  });

  test('GET /api/food-banks/:id response includes status and foodNeeds fields', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks/${SF_ORG_ID}`);
    const body = await res.json();
    const fb = body.data.foodBank;

    // These fields are always present (null or object)
    expect(fb).toHaveProperty('status');
    expect(fb).toHaveProperty('foodNeeds');
    expect(Array.isArray(fb.foodNeeds)).toBe(true);
  });

  test('GET /api/food-banks/:id with nonexistent ID returns 404', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/00000000-0000-0000-0000-000000000000`
    );
    expect(res.status()).toBe(404);
  });

  test('GET /api/food-banks/:id/status returns status shape', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks/${SF_ORG_ID}/status`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('status');
    expect(body.data).toHaveProperty('foodNeeds');
    expect(Array.isArray(body.data.foodNeeds)).toBe(true);
  });

  test('All five seeded food banks are retrievable by ID', async ({ request }) => {
    const ids = [
      { id: '1e4cb7dc-bf1c-4173-8b91-1da645493cdd', name: 'SF-Marin Food Bank' },
      { id: 'b846ff38-8974-40dc-a257-ac0f271f4010', name: 'Chicago Food Depository' },
      { id: '2ec91484-a8aa-4505-941b-e34cfcaeeea1', name: 'Houston Food Bank' },
      { id: '8ee39015-0e32-4cd9-bbba-46cc88702a1d', name: 'City Harvest NYC' },
      { id: '55d1871d-b7b3-4897-b94e-be076eef86ae', name: 'Atlanta Community Food Bank' },
    ];

    for (const { id, name } of ids) {
      const res = await request.get(`${BASE_URL}/api/food-banks/${id}`);
      expect(res.status(), `Expected 200 for ${name}`).toBe(200);

      const body = await res.json();
      expect(body.data.foodBank.name, `Name mismatch for ${id}`).toBe(name);
    }
  });
});

// ---------------------------------------------------------------------------
// Nearby — GET /api/food-banks/nearby
// ---------------------------------------------------------------------------
test.describe('Food bank nearby endpoint', () => {
  test('GET /api/food-banks/nearby without coords returns 400', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/food-banks/nearby`);
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/latitude|longitude/i);
  });

  test('GET /api/food-banks/nearby with SF coords returns success shape', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/nearby?latitude=37.7749&longitude=-122.4194&radius=25`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('foodBanks');
    expect(body.data).toHaveProperty('count');
    expect(Array.isArray(body.data.foodBanks)).toBe(true);
    expect(body.data.count).toBe(body.data.foodBanks.length);
  });

  test('GET /api/food-banks/nearby with NYC coords and large radius returns success', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/nearby?latitude=40.7128&longitude=-74.0060&radius=50`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.foodBanks)).toBe(true);
  });

  test('GET /api/food-banks/nearby results include distance field when data present', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/nearby?latitude=37.7749&longitude=-122.4194&radius=100`
    );
    const body = await res.json();

    // If any results returned, they must have distance
    for (const fb of body.data.foodBanks) {
      expect(fb).toHaveProperty('distance');
      expect(typeof fb.distance).toBe('number');
    }
  });

  test('GET /api/food-banks/nearby with limit param limits results', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/food-banks/nearby?latitude=37.7749&longitude=-122.4194&radius=5000&limit=2`
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.data.foodBanks.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Status update — PUT /api/food-banks/:id/status (auth required)
// ---------------------------------------------------------------------------
test.describe('Food bank status update (authenticated)', () => {
  test('PUT /api/food-banks/:id/status without auth returns 401', async ({ request }) => {
    const res = await request.put(`${BASE_URL}/api/food-banks/${SF_ORG_ID}/status`, {
      data: { foodAvailable: 'available', waitTimeMinutes: 20 },
    });
    expect(res.status()).toBe(401);
  });

  test('PUT /api/food-banks/:id/status with valid token updates status', async ({ request }) => {
    const { accessToken: token } = await getCachedTokens();
    const res = await request.put(`${BASE_URL}/api/food-banks/${SF_ORG_ID}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        foodAvailable: 'available',
        waitTimeMinutes: 15,
        capacityPercentage: 60,
        notes: 'Test update from Playwright suite',
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('status');
    expect(body.message).toBe('Food bank status updated successfully');
  });

  test('Status update is reflected in subsequent GET', async ({ request }) => {
    const { accessToken: token } = await getCachedTokens();

    // Update status
    await request.put(`${BASE_URL}/api/food-banks/${CHI_ORG_ID}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        foodAvailable: 'low',
        waitTimeMinutes: 30,
        notes: 'Playwright persistence check',
      },
    });

    // Verify it persisted
    const getRes = await request.get(`${BASE_URL}/api/food-banks/${CHI_ORG_ID}/status`);
    const body = await getRes.json();
    expect(body.data.status).not.toBeNull();
    expect(body.data.status.foodAvailable).toBe('low');
  });
});
