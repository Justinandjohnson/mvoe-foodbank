import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

function buildClientSideJwt() {
  const payload = {
    sub: 'test-user-id',
    tenant_id: 'test-tenant-id',
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };

  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test.describe('meal planner agent flow', () => {
  test('signed-in user can launch the live meal planner and receive a completed plan', async ({ page }) => {
    const fakeToken = buildClientSideJwt();

    await page.addInitScript(({ token }) => {
      localStorage.setItem('secure_accessToken', token);
      localStorage.setItem('secure_refreshToken', 'refresh-token');
      localStorage.setItem('user', JSON.stringify({
        id: 'test-user-id',
        fullName: 'Demo Director',
        email: 'director@mvoe-test.com',
        userType: 'staff',
      }));
    }, { token: fakeToken });

    let statusPolls = 0;

    await page.route('**/api/agents/active', async (route) => {
      await route.fulfill({ json: { success: true, jobs: [] } });
    });

    await page.route('**/api/agents/meal-planner/start', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          jobId: 'job-123',
          sessionId: 'session-123',
          status: 'queued',
        },
      });
    });

    await page.route('**/api/agents/status/job-123', async (route) => {
      statusPolls += 1;

      if (statusPolls === 1) {
        await route.fulfill({ json: { success: true, status: 'active' } });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          status: 'completed',
          result: {
            plan: {
              menu: {
                suggestions: 'Menu: grilled chicken, roasted vegetables, fruit salad. Budget: $6.40 per person. Timeline: prep the night before and grill day-of.',
              },
            },
          },
        },
      });
    });

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    await page.locator('a').filter({ hasText: 'AI Agents' }).first().click();
    await page.waitForTimeout(1000);
    await page.getByText('AI Meal Planner').nth(1).click();
    await page.waitForTimeout(1000);

    const input = page.getByPlaceholder('Describe the meal you need planned...');
    await input.fill('Plan lunch for 80 people with a $500 budget');
    await page.getByRole('button', { name: 'Submit meal planner request' }).click();

    await expect(page.getByText(/Job job-123 accepted/i)).toBeVisible();
    await expect(page.getByText(/Menu: grilled chicken/i)).toBeVisible();
  });
});
