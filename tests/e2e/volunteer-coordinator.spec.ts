import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

test('volunteer coordinator can load summary and answer a chat prompt', async ({ page }) => {
  await page.route('**/agent/volunteer-summary', async (route) => {
    await route.fulfill({
      json: {
        active_volunteers: 12,
        pending_opt_in: 3,
        total_volunteers: 15,
      },
    });
  });

  await page.route('**/agent/chat', async (route) => {
    await route.fulfill({
      json: {
        reply: 'You currently have 12 active volunteers and 3 pending opt-ins. I recommend sending reminders tomorrow at 4 PM.',
      },
    });
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.locator('a').filter({ hasText: 'AI Agents' }).first().click();
  await page.waitForTimeout(1000);
  await page.getByText('Volunteer Coordinator').click();
  await page.waitForTimeout(1000);

  await expect(page.getByText('12 volunteers')).toBeVisible();
  await expect(page.getByText('15')).toBeVisible();
  await expect(page.getByText('Total', { exact: true })).toBeVisible();

  const input = page.getByPlaceholder('Ask about your volunteers...');
  await input.fill('How many active volunteers do I have?');
  await page.getByRole('button', { name: 'Send volunteer coordinator message' }).click();

  await expect(page.getByText(/12 active volunteers/i)).toBeVisible();
});
