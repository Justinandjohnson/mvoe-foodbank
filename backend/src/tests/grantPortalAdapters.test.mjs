import test from 'node:test';
import assert from 'node:assert/strict';

import { identifyGrantPortal } from '../services/grantPortalAdapters.js';

test('identifyGrantPortal recognizes supported portal domains', () => {
  const grantsGov = identifyGrantPortal('https://www.grants.gov/search-results-detail/12345');
  const submittable = identifyGrantPortal('https://submit.submittable.com/submit/abc123');

  assert.equal(grantsGov.portalType, 'grants.gov');
  assert.equal(grantsGov.strategy, 'supported-portal');
  assert.equal(submittable.portalType, 'submittable');
});

test('identifyGrantPortal falls back to document-first for PDFs', () => {
  const result = identifyGrantPortal('https://example.org/forms/application.pdf');
  assert.equal(result.portalType, 'downloadable-form');
  assert.equal(result.strategy, 'document-first');
});
