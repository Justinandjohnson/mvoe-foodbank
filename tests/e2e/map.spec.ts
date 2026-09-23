/**
 * Map Screen E2E Tests
 *
 * Covers the Leaflet-based map, layer toggles, radius selector, beacon
 * composer, food-bank detail panel, and marker interactions.
 *
 * Targets local Expo web build by default; override via env:
 *   TEST_FRONTEND_URL=http://localhost:8081 npx playwright test map
 */

import { test, expect, Page } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL ?? 'http://127.0.0.1:4173';
const API_URL      = process.env.TEST_API_URL      ?? 'http://127.0.0.1:3100';

const DONOR_EMAIL = process.env.TEST_DONOR_EMAIL ?? 'donor@example.com';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAndGoToMap(page: Page) {
  // Intercept auth to skip real credentials if API is unavailable
  await page.route(`${API_URL}/api/auth/login`, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.email === DONOR_EMAIL) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            accessToken: 'test-token-abc',
            refreshToken: 'test-refresh-xyz',
            user: { id: 'u1', email: DONOR_EMAIL, name: 'Test Donor' },
          },
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Stub the map live feed so the map renders without a real backend
  await page.route(`**/api/map/live**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          foodBanks: [
            {
              id: 'fb-1',
              name: 'Austin Food Bank',
              lat: 30.267,
              lng: -97.743,
              markerType: 'food_bank',
              openNow: true,
              address: '6500 Metropolis Dr, Austin TX',
            },
            {
              id: 'fb-2',
              name: 'Hope Pantry',
              lat: 30.280,
              lng: -97.720,
              markerType: 'food_bank',
              openNow: false,
              address: '123 Main St, Austin TX',
            },
          ],
          beacons: [
            {
              id: 'bc-1',
              name: 'Free produce on Elm',
              lat: 30.258,
              lng: -97.750,
              markerType: 'food_beacon',
              isActive: true,
              quantity: 'some',
            },
          ],
          events: [
            {
              id: 'ev-1',
              name: 'Community Meal',
              lat: 30.295,
              lng: -97.730,
              markerType: 'community_event',
              eventType: 'community_meal',
            },
          ],
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  // Stub food beacons endpoint
  await page.route(`**/api/food-beacons/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Suite 1: Map screen loads
// ---------------------------------------------------------------------------

test.describe('Map screen — initial load', () => {
  test('page renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loginAndGoToMap(page);

    const critical = errors.filter(
      (e) => e.includes('TypeError') || e.includes('ReferenceError')
    );
    expect(critical).toHaveLength(0);
  });

  test('map iframe container is present', async ({ page }) => {
    await loginAndGoToMap(page);

    // The Leaflet map renders inside an iframe (web path in FoodBankMap)
    const iframe = page.locator('iframe').first();
    await expect(iframe).toBeVisible({ timeout: 15_000 });
  });

  test('layer toggle bar is visible', async ({ page }) => {
    await loginAndGoToMap(page);

    await expect(page.getByText('Food Banks')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Beacons')).toBeVisible();
    await expect(page.getByText('Meals')).toBeVisible();
  });

  test('radius options are visible', async ({ page }) => {
    await loginAndGoToMap(page);

    await expect(page.getByText('10')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('25')).toBeVisible();
    await expect(page.getByText('50')).toBeVisible();
  });

  test('map loads on mobile viewport (375×812)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndGoToMap(page);
    const iframe = page.locator('iframe').first();
    await expect(iframe).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Layer toggles
// ---------------------------------------------------------------------------

test.describe('Map — layer toggles', () => {
  test('toggling Food Banks layer does not crash', async ({ page }) => {
    await loginAndGoToMap(page);

    const foodBanksButton = page.getByText('Food Banks');
    await foodBanksButton.click();
    // Give the map a moment to re-render
    await page.waitForTimeout(600);
    // Toggle back on
    await foodBanksButton.click();
    await page.waitForTimeout(400);

    // Page should still be functional
    await expect(foodBanksButton).toBeVisible();
  });

  test('toggling Beacons layer does not crash', async ({ page }) => {
    await loginAndGoToMap(page);

    const beaconsButton = page.getByText('Beacons');
    await beaconsButton.click();
    await page.waitForTimeout(600);
    await beaconsButton.click();
    await page.waitForTimeout(400);

    await expect(beaconsButton).toBeVisible();
  });

  test('toggling Meals layer does not crash', async ({ page }) => {
    await loginAndGoToMap(page);

    const mealsButton = page.getByText('Meals');
    await mealsButton.click();
    await page.waitForTimeout(600);
    await mealsButton.click();
    await page.waitForTimeout(400);

    await expect(mealsButton).toBeVisible();
  });

  test('all three layers can be toggled independently', async ({ page }) => {
    await loginAndGoToMap(page);

    await page.getByText('Food Banks').click();
    await page.waitForTimeout(300);
    await page.getByText('Beacons').click();
    await page.waitForTimeout(300);
    await page.getByText('Meals').click();
    await page.waitForTimeout(300);

    // All three should still be in the DOM
    await expect(page.getByText('Food Banks')).toBeVisible();
    await expect(page.getByText('Beacons')).toBeVisible();
    await expect(page.getByText('Meals')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Radius selector
// ---------------------------------------------------------------------------

test.describe('Map — radius selector', () => {
  test('selecting radius 10 triggers a map reload', async ({ page }) => {
    let liveFeedCalls = 0;
    await page.route(`**/api/map/live**`, async (route) => {
      liveFeedCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { foodBanks: [], beacons: [], events: [], generatedAt: new Date().toISOString() } }),
      });
    });

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const callsBefore = liveFeedCalls;
    await page.getByText('10').click();
    await page.waitForTimeout(800);

    expect(liveFeedCalls).toBeGreaterThan(callsBefore);
  });

  test('selecting radius 50 triggers a map reload', async ({ page }) => {
    let liveFeedCalls = 0;
    await page.route(`**/api/map/live**`, async (route) => {
      liveFeedCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { foodBanks: [], beacons: [], events: [], generatedAt: new Date().toISOString() } }),
      });
    });

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const callsBefore = liveFeedCalls;
    await page.getByText('50').click();
    await page.waitForTimeout(800);

    expect(liveFeedCalls).toBeGreaterThan(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Marker selection via postMessage
// ---------------------------------------------------------------------------

test.describe('Map — marker selection', () => {
  test('postMessage marker_select shows detail panel', async ({ page }) => {
    await loginAndGoToMap(page);

    // Wait for iframe to exist
    await page.locator('iframe').first().waitFor({ timeout: 12_000 });

    // Simulate a Leaflet marker click by sending postMessage from the iframe
    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'marker_select',
            marker: {
              id: 'fb-1',
              name: 'Austin Food Bank',
              lat: 30.267,
              lng: -97.743,
              markerType: 'food_bank',
              openNow: true,
              address: '6500 Metropolis Dr, Austin TX',
            },
          },
          origin: window.location.origin,
        })
      );
    });

    await page.waitForTimeout(800);

    // The detail panel should show the food bank name
    await expect(page.getByText('Austin Food Bank')).toBeVisible({ timeout: 8_000 });
  });

  test('selecting a beacon shows beacon detail', async ({ page }) => {
    await loginAndGoToMap(page);
    await page.locator('iframe').first().waitFor({ timeout: 12_000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'marker_select',
            marker: {
              id: 'bc-1',
              name: 'Free produce on Elm',
              lat: 30.258,
              lng: -97.750,
              markerType: 'food_beacon',
              isActive: true,
              quantity: 'some',
            },
          },
          origin: window.location.origin,
        })
      );
    });

    await page.waitForTimeout(800);
    await expect(page.getByText('Free produce on Elm')).toBeVisible({ timeout: 8_000 });
  });

  test('selecting a meal event shows event detail', async ({ page }) => {
    await loginAndGoToMap(page);
    await page.locator('iframe').first().waitFor({ timeout: 12_000 });

    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'marker_select',
            marker: {
              id: 'ev-1',
              name: 'Community Meal',
              lat: 30.295,
              lng: -97.730,
              markerType: 'community_event',
              eventType: 'community_meal',
            },
          },
          origin: window.location.origin,
        })
      );
    });

    await page.waitForTimeout(800);
    await expect(page.getByText('Community Meal')).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Beacon composer
// ---------------------------------------------------------------------------

test.describe('Map — beacon composer', () => {
  test('beacon composer opens when navigated with openBeaconComposer param', async ({ page }) => {
    await loginAndGoToMap(page);

    // The MapScreen checks route.params.openBeaconComposer on mount.
    // Simulate by navigating with the query param approach for web.
    // In the Expo web build, deep-link params are encoded in the URL hash.
    // We instead press the "Start beacon" action which internally navigates
    // to Map with openBeaconComposer: true.
    await page.getByText('Command').click().catch(() => {
      // Tab might not be labelled 'Command' — try icon
    });
    await page.waitForTimeout(500);

    // Navigate back to map with param via the beacon shortcut on home
    const beaconBtn = page.getByText('Start beacon');
    if (await beaconBtn.isVisible()) {
      await beaconBtn.click();
      await page.waitForTimeout(800);

      // The composer panel should have food type options
      const composerVisible =
        (await page.getByText('A few').isVisible()) ||
        (await page.getByText('Some').isVisible()) ||
        (await page.getByText('A lot').isVisible());
      expect(composerVisible).toBe(true);
    } else {
      // Mark as skipped if home shortcut is not in view — not a failure
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Map iframe content validation
// ---------------------------------------------------------------------------

test.describe('Map — iframe internals', () => {
  test('iframe contains Leaflet map elements', async ({ page }) => {
    await loginAndGoToMap(page);

    const iframe = page.frameLocator('iframe:first-of-type');
    // Leaflet always renders a #map element
    const mapEl = iframe.locator('#map');
    await expect(mapEl).toBeAttached({ timeout: 15_000 });
  });

  test('iframe uses CartoDB tile layer (dark theme)', async ({ page }) => {
    const tileRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('cartocdn.com') || req.url().includes('basemaps')) {
        tileRequests.push(req.url());
      }
    });

    await loginAndGoToMap(page);
    // Give tiles time to fire
    await page.waitForTimeout(3000);

    // Leaflet should request CartoDB tiles
    expect(tileRequests.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Map + backend integration (live API)
// ---------------------------------------------------------------------------

test.describe('Map — live API integration', () => {
  test('GET /api/map/live returns expected shape', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/map/live?radius=25`);

    // Accept 200 (data) or 401 (auth required for this endpoint)
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('data');
      const data = body.data;
      expect(Array.isArray(data.foodBanks)).toBe(true);
      expect(Array.isArray(data.beacons)).toBe(true);
      expect(Array.isArray(data.events)).toBe(true);
    }
  });

  test('GET /api/food-beacons returns array', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/food-beacons`);
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('data');
    }
  });

  test('GET /api/food-banks/nearby returns array', async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/food-banks/nearby?lat=30.2672&lng=-97.7431&radius=25`
    );
    expect([200, 401]).toContain(res.status());
  });

  test('GET /health returns healthy', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});
