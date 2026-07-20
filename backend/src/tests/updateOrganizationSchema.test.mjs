import test from 'node:test';
import assert from 'node:assert/strict';

import { updateOrganizationSchema } from '../utils/validators.js';

test('updateOrganizationSchema preserves demo-critical activation fields', () => {
  const parsed = updateOrganizationSchema.parse({
    verificationStatus: 'verified',
    isActive: true,
    latitude: 37.7583,
    longitude: -122.3892,
    hours: '{"monday":"9:00 AM - 5:00 PM"}',
    stripeAccountId: 'acct_1234567890demo',
  });

  assert.equal(parsed.verificationStatus, 'verified');
  assert.equal(parsed.isActive, true);
  assert.equal(parsed.latitude, 37.7583);
  assert.equal(parsed.longitude, -122.3892);
  assert.equal(parsed.hours, '{"monday":"9:00 AM - 5:00 PM"}');
  assert.equal(parsed.stripeAccountId, 'acct_1234567890demo');
});
