import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

test('guest user can launch the meal planner without logging in', async ({ page }) => {
  let statusPolls = 0;

  await page.route('**/api/agents/meal-planner/guest/start', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        jobId: 'guest-job-1',
        accessToken: 'guest-token',
        status: 'queued',
      },
    });
  });

  await page.route('**/api/agents/meal-planner/guest/status/guest-job-1', async (route) => {
    statusPolls += 1;
    if (statusPolls < 2) {
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
              suggestions: 'Guest plan: pasta bake, green salad, and fruit cups.',
            },
          },
        },
      },
    });
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.locator('a').filter({ hasText: 'AI Agents' }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Open AI Meal Planner' }).click();
  await page.waitForTimeout(1000);

  await expect(page.getByText('Guest mode enabled')).toBeVisible();
  await page.getByPlaceholder('Describe the meal you need planned...').fill('Plan a guest meal');
  await page.getByRole('button', { name: 'Submit meal planner request' }).click();

  await expect(page.getByText(/Guest plan: pasta bake/i)).toBeVisible();
});
