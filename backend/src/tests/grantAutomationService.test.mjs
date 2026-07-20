import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectGrantPortal } from '../services/grantAutomationService.js';

test('inspectGrantPortal falls back gracefully when browser automation cannot navigate', async () => {
  const result = await inspectGrantPortal('https://www.grants.gov/search-results-detail/12345');

  assert.equal(result.portalType, 'grants.gov');
  assert.ok('portalSummary' in result);
  assert.ok('strategy' in result);
});
