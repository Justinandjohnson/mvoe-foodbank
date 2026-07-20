import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBrandIdentityProfile, extractBrandIdentityFromHtml } from '../services/brandIdentityService.js';

test('extractBrandIdentityFromHtml captures title, description, and body text', () => {
  const result = extractBrandIdentityFromHtml({
    url: 'https://hopepantry.org',
    html: '<html><head><title>Hope Pantry</title><meta name="description" content="Community-powered hunger relief"></head><body><h1>Hope Pantry</h1><p>We deliver food to seniors and families.</p></body></html>',
  });

  assert.equal(result.title, 'Hope Pantry');
  assert.equal(result.description, 'Community-powered hunger relief');
  assert.match(result.bodyText, /deliver food to seniors/i);
});

test('buildBrandIdentityProfile enriches request with website profile when URL is provided', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => '<html><head><title>Hope Pantry</title><meta property="og:description" content="Serving Austin families"></head><body>Food access for Austin.</body></html>',
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const profile = await buildBrandIdentityProfile({
    organizationName: 'Hope Pantry',
    mission: 'Fight hunger',
    location: 'Austin',
    websiteUrl: 'https://hopepantry.org',
  });

  assert.equal(profile.organizationName, 'Hope Pantry');
  assert.equal(profile.websiteProfile.title, 'Hope Pantry');
  assert.match(profile.websiteProfile.description, /Serving Austin families/i);
});
