# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api/smoke.spec.ts >> Auth routes >> POST /api/auth/signup → 201 with new unique email
- Location: tests/api/smoke.spec.ts:93:7

# Error details

```
Error: apiResponse.json: Response has been disposed
```

# Test source

```ts
  6   |  *
  7   |  * Run locally:
  8   |  *   TEST_API_URL=http://127.0.0.1:3100 npx playwright test tests/api/smoke
  9   |  *
  10  |  * The suite is designed to be non-destructive:
  11  |  *   - Creates objects only to verify creation, then deletes them.
  12  |  *   - Does NOT affect real production data when run against Render.
  13  |  */
  14  | 
  15  | import { test, expect, APIRequestContext, request as apiRequest } from '@playwright/test';
  16  | 
  17  | const BASE_URL = process.env.TEST_API_URL ?? 'http://127.0.0.1:3100';
  18  | 
  19  | // Override the project baseURL so all { request } fixtures point at the API
  20  | test.use({ baseURL: BASE_URL });
  21  | 
  22  | // Seed credentials (created by prisma/seed.js)
  23  | const DONOR_EMAIL    = process.env.TEST_DONOR_EMAIL    ?? 'donor@example.com';
  24  | const DONOR_PASSWORD = process.env.TEST_DONOR_PASSWORD ?? 'password123';
  25  | const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@example.com';
  26  | const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'password123';
  27  | 
  28  | // ---------------------------------------------------------------------------
  29  | // Shared auth state
  30  | // ---------------------------------------------------------------------------
  31  | 
  32  | let donorCtx: APIRequestContext;
  33  | let donorToken: string;
  34  | let donorRefreshToken: string;
  35  | 
  36  | let adminCtx: APIRequestContext;
  37  | let adminToken: string;
  38  | 
  39  | test.beforeAll(async () => {
  40  |   // Login as donor
  41  |   const donorReq = await apiRequest.newContext({ baseURL: BASE_URL });
  42  |   const donorRes = await donorReq.post('/api/auth/login', {
  43  |     data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
  44  |   });
  45  |   const donorBody = await donorRes.json();
  46  |   donorToken = donorBody.data?.accessToken ?? '';
  47  |   donorRefreshToken = donorBody.data?.refreshToken ?? '';
  48  |   await donorReq.dispose();
  49  | 
  50  |   donorCtx = await apiRequest.newContext({
  51  |     baseURL: BASE_URL,
  52  |     extraHTTPHeaders: { Authorization: `Bearer ${donorToken}` },
  53  |   });
  54  | 
  55  |   // Login as admin
  56  |   const adminReq = await apiRequest.newContext({ baseURL: BASE_URL });
  57  |   const adminRes = await adminReq.post('/api/auth/login', {
  58  |     data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  59  |   });
  60  |   const adminBody = await adminRes.json();
  61  |   adminToken = adminBody.data?.accessToken ?? '';
  62  |   await adminReq.dispose();
  63  | 
  64  |   adminCtx = await apiRequest.newContext({
  65  |     baseURL: BASE_URL,
  66  |     extraHTTPHeaders: { Authorization: `Bearer ${adminToken}` },
  67  |   });
  68  | });
  69  | 
  70  | test.afterAll(async () => {
  71  |   await donorCtx?.dispose();
  72  |   await adminCtx?.dispose();
  73  | });
  74  | 
  75  | // ---------------------------------------------------------------------------
  76  | // Health
  77  | // ---------------------------------------------------------------------------
  78  | 
  79  | test.describe('Health', () => {
  80  |   test('GET /health → 200 healthy', async ({ request }) => {
  81  |     const res = await request.get(`${BASE_URL}/health`);
  82  |     expect(res.status()).toBe(200);
  83  |     const body = await res.json();
  84  |     expect(body.status).toBe('healthy');
  85  |   });
  86  | });
  87  | 
  88  | // ---------------------------------------------------------------------------
  89  | // Auth
  90  | // ---------------------------------------------------------------------------
  91  | 
  92  | test.describe('Auth routes', () => {
  93  |   test('POST /api/auth/signup → 201 with new unique email', async () => {
  94  |     const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  95  |     const ts = Date.now();
  96  |     const res = await ctx.post('/api/auth/signup', {
  97  |       data: {
  98  |         email: `smoke-${ts}@mvoe-test.com`,
  99  |         password: 'Smoke1234!',
  100 |         fullName: `Smoke User ${ts}`,
  101 |         userType: 'donor',
  102 |       },
  103 |     });
  104 |     await ctx.dispose();
  105 |     expect(res.status()).toBe(201);
> 106 |     const body = await res.json();
      |                            ^ Error: apiResponse.json: Response has been disposed
  107 |     expect(body.data).toHaveProperty('user');
  108 |   });
  109 | 
  110 |   test('POST /api/auth/login → 200 with valid credentials', async () => {
  111 |     const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  112 |     const res = await ctx.post('/api/auth/login', {
  113 |       data: { email: DONOR_EMAIL, password: DONOR_PASSWORD },
  114 |     });
  115 |     await ctx.dispose();
  116 |     expect(res.status()).toBe(200);
  117 |     const body = await res.json();
  118 |     expect(body.data).toHaveProperty('accessToken');
  119 |     expect(body.data).toHaveProperty('refreshToken');
  120 |   });
  121 | 
  122 |   test('POST /api/auth/login → 401 with wrong password', async () => {
  123 |     const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  124 |     const res = await ctx.post('/api/auth/login', {
  125 |       data: { email: DONOR_EMAIL, password: 'wrong-password' },
  126 |     });
  127 |     await ctx.dispose();
  128 |     expect([400, 401]).toContain(res.status());
  129 |   });
  130 | 
  131 |   test('GET /api/auth/me → 200 with valid token', async () => {
  132 |     const res = await donorCtx.get('/api/auth/me');
  133 |     expect(res.status()).toBe(200);
  134 |     const body = await res.json();
  135 |     expect(body.data).toHaveProperty('email', DONOR_EMAIL);
  136 |   });
  137 | 
  138 |   test('GET /api/auth/me → 401 without token', async () => {
  139 |     const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  140 |     const res = await ctx.get('/api/auth/me');
  141 |     await ctx.dispose();
  142 |     expect(res.status()).toBe(401);
  143 |   });
  144 | 
  145 |   test('POST /api/auth/refresh → 200 with valid refresh token', async () => {
  146 |     if (!donorRefreshToken) {
  147 |       test.skip();
  148 |       return;
  149 |     }
  150 |     const ctx = await apiRequest.newContext({ baseURL: BASE_URL });
  151 |     const res = await ctx.post('/api/auth/refresh', {
  152 |       data: { refreshToken: donorRefreshToken },
  153 |     });
  154 |     await ctx.dispose();
  155 |     expect(res.status()).toBe(200);
  156 |     const body = await res.json();
  157 |     expect(body.data).toHaveProperty('accessToken');
  158 |   });
  159 | });
  160 | 
  161 | // ---------------------------------------------------------------------------
  162 | // User profile
  163 | // ---------------------------------------------------------------------------
  164 | 
  165 | test.describe('User routes', () => {
  166 |   test('GET /api/user/profile → 200', async () => {
  167 |     const res = await donorCtx.get('/api/user/profile');
  168 |     expect(res.status()).toBe(200);
  169 |   });
  170 | 
  171 |   test('GET /api/user/stats → 200', async () => {
  172 |     const res = await donorCtx.get('/api/user/stats');
  173 |     expect([200, 404]).toContain(res.status());
  174 |   });
  175 | 
  176 |   test('GET /api/user/donations → 200', async () => {
  177 |     const res = await donorCtx.get('/api/user/donations');
  178 |     expect(res.status()).toBe(200);
  179 |   });
  180 | });
  181 | 
  182 | // ---------------------------------------------------------------------------
  183 | // Organizations
  184 | // ---------------------------------------------------------------------------
  185 | 
  186 | test.describe('Organization routes', () => {
  187 |   test('GET /api/organizations → 200 returns array', async ({ request }) => {
  188 |     const res = await request.get(`${BASE_URL}/api/organizations`);
  189 |     expect(res.status()).toBe(200);
  190 |     const body = await res.json();
  191 |     expect(body).toHaveProperty('data');
  192 |   });
  193 | 
  194 |   test('GET /api/organizations with limit param → 200', async ({ request }) => {
  195 |     const res = await request.get(`${BASE_URL}/api/organizations?limit=5`);
  196 |     expect(res.status()).toBe(200);
  197 |   });
  198 | });
  199 | 
  200 | // ---------------------------------------------------------------------------
  201 | // Map
  202 | // ---------------------------------------------------------------------------
  203 | 
  204 | test.describe('Map routes', () => {
  205 |   test('GET /api/map/live → 200 or 401', async ({ request }) => {
  206 |     const res = await request.get(`${BASE_URL}/api/map/live?radius=25`);
```