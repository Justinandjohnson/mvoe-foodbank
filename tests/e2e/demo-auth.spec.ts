import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:4173';

test.use({
  launchOptions: {
    args: ['--disable-web-security'],
  },
});

test.describe('demo auth flow', () => {
  test('profile login entry opens an email/password auth screen', async ({ page }) => {
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });

    await page.locator('a').filter({ hasText: 'Profile' }).first().click();
    await page.waitForTimeout(2000);

    await expect(page.getByText('Not Logged In')).toBeVisible();
    await page.locator('text=Log In').nth(1).click();
    await page.waitForTimeout(2000);

    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  });

  test('login stores user data when backend returns Node auth payload shape', async ({ page }) => {
    const fakeAccessToken = 'header.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.signature';

    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            user: {
              id: 'donor-id',
              fullName: 'Demo Donor',
              email: 'donor@example.com',
              userType: 'donor',
            },
            accessToken: fakeAccessToken,
            refreshToken: 'refresh-token',
          },
          message: 'Login successful',
        },
      });
    });

    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    await page.locator('a').filter({ hasText: 'Profile' }).first().click();
    await page.waitForTimeout(1500);
    await page.locator('text=Log In').nth(1).click();
    await page.waitForTimeout(1000);

    await page.getByPlaceholder('Enter your email').fill('donor@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: 'Submit sign in' }).click();

    await expect.poll(async () => page.evaluate(() => localStorage.getItem('user'))).not.toBeNull();
  });
});
