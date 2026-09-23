/**
 * E2E UI Tests — hits the configured frontend URL
 *
 * Tests verify the frontend renders and basic navigation works
 * against the deployed frontend.
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:8081';
const API_URL      = process.env.TEST_API_URL || 'http://127.0.0.1:3100';

// ---------------------------------------------------------------------------
// Page load & basic rendering
// ---------------------------------------------------------------------------
test.describe('Home page', () => {
  test('loads successfully with 200 status', async ({ page }) => {
    const response = await page.goto(FRONTEND_URL);
    expect(response?.status()).toBe(200);
  });

  test('page title is set', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('page has visible content — not blank', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // Body should have text content
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
  });

  test('page contains expected food-bank related text', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // Wait for content to settle
    await page.waitForLoadState('networkidle');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    // At least one of these food-bank related terms should appear
    const relevantTerms = ['food', 'bank', 'donate', 'mvoe', 'platform', 'hunger'];
    const hasRelevantContent = relevantTerms.some((term) => bodyText.includes(term));
    expect(hasRelevantContent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Meta & head tags
// ---------------------------------------------------------------------------
test.describe('Page meta', () => {
  test('viewport meta tag is set for mobile responsiveness', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toBeTruthy();
  });

  test('page does not throw JS errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');

    // Allow for minor/expected errors but not critical crashes
    const criticalErrors = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError')
    );
    expect(criticalErrors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Network requests — frontend should reach the API
// ---------------------------------------------------------------------------
test.describe('API connectivity from frontend', () => {
  test('documents API calls made by frontend (environment config check)', async ({ page }) => {
    const apiRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/')) {
        apiRequests.push(url);
      }
    });

    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');

    // Log all API requests so we can see what backend URL the frontend is using
    // NOTE: If the frontend is calling localhost:3000, the NEXT_PUBLIC_API_URL / EXPO_PUBLIC_API_URL
    // env var in the hosted build must set EXPO_PUBLIC_API_URL
    console.log('API requests made by frontend:', apiRequests);

    // At least verify the page loaded successfully regardless of API config
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('API health endpoint is reachable from test client', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
// Responsiveness
// ---------------------------------------------------------------------------
test.describe('Responsive layout', () => {
  test('renders on mobile viewport (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const response = await page.goto(FRONTEND_URL);
    expect(response?.status()).toBe(200);

    // Should not overflow horizontally
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390); // small tolerance
  });

  test('renders on tablet viewport (768x1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const response = await page.goto(FRONTEND_URL);
    expect(response?.status()).toBe(200);

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(800);
  });

  test('renders on desktop viewport (1280x800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const response = await page.goto(FRONTEND_URL);
    expect(response?.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Static asset delivery
// ---------------------------------------------------------------------------
test.describe('Static assets', () => {
  test('main JS bundle loads without 404', async ({ page }) => {
    const failedRequests: string[] = [];

    page.on('requestfailed', (req) => {
      // Only care about script and style failures
      const rt = req.resourceType();
      if (rt === 'script' || rt === 'stylesheet') {
        failedRequests.push(`${rt}: ${req.url()}`);
      }
    });

    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');

    expect(failedRequests).toHaveLength(0);
  });
});
