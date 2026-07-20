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

test('agent notifications screen shows approvals and activity and allows approval action', async ({ page }) => {
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

  await page.route('**/api/agents/active', async (route) => {
    await route.fulfill({ json: { success: true, jobs: [{ jobId: 'job-1', name: 'grant-writer', status: 'active' }] } });
  });

  await page.route('**/api/agents/activity**', async (route) => {
    await route.fulfill({ json: { success: true, entries: [{ id: '1', type: 'agent_job', message: 'Grant writer started', status: 'completed', created_at: '2026-04-20T00:00:00.000Z' }] } });
  });

  await page.route('**/agent/approvals**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { approvals: [{ id: 'approval-1', action_type: 'send_sms', payload: { message: 'Reminder body' }, created_at: '2026-04-20T00:00:00.000Z' }] } });
      return;
    }
    await route.fulfill({ json: { status: 'approved' } });
  });

  await page.route('**/agent/activity', async (route) => {
    await route.fulfill({ json: { entries: [{ id: 'p1', type: 'approval', message: 'Approval request: send_sms', status: 'pending', created_at: '2026-04-20T00:00:00.000Z' }] } });
  });

  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await expect(page.locator('a')).toHaveCount(7);
  await page.locator('a').nth(3).click({ timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.locator('text=Alerts').click();

  await expect(page.getByText('Action Required')).toBeVisible();
  await expect(page.getByText('Approval request: send_sms')).toBeVisible();
  await expect(page.getByText('Grant writer started')).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Action Required')).toBeVisible();
});
