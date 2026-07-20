import test from 'node:test';
import assert from 'node:assert/strict';

import { checkGuestRateLimit, getClientAddress } from '../routes/agentRouteUtils.js';

test('getClientAddress prefers x-forwarded-for when present', () => {
  const request = {
    headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    ip: '127.0.0.1',
  };

  assert.equal(getClientAddress(request), '203.0.113.10');
});

test('guest meal planner limiter allows only three attempts per window', () => {
  const ip = `test-ip-${Date.now()}`;
  const start = 1_000_000;

  assert.equal(checkGuestRateLimit(ip, start), true);
  assert.equal(checkGuestRateLimit(ip, start + 1), true);
  assert.equal(checkGuestRateLimit(ip, start + 2), true);
  assert.equal(checkGuestRateLimit(ip, start + 3), false);
  assert.equal(checkGuestRateLimit(ip, start + 16 * 60 * 1000), true);
});
