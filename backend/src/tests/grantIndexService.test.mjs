import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { buildGrantIndexSnapshot, fetchGrantSourceSnapshot } = await import('../services/grantIndexService.js');

test('fetchGrantSourceSnapshot returns indexed summary for reachable HTML', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => '<html><head><title>Grant Page</title></head><body>Funding for food banks and hunger relief efforts.</body></html>',
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const snapshot = await fetchGrantSourceSnapshot({
    label: 'Test Source',
    url: 'https://example.org/grants',
    category: 'test',
    note: 'note',
  });

  assert.equal(snapshot.status, 'indexed');
  assert.match(snapshot.summary, /Funding for food banks/i);
});

test('buildGrantIndexSnapshot includes source metadata and examples', async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => '<html><body>Example grant source content.</body></html>',
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const snapshot = await buildGrantIndexSnapshot();

  assert.ok(snapshot.refreshedAt);
  assert.ok(snapshot.sourceCount > 0);
  assert.equal(snapshot.sources.length, snapshot.sourceCount);
  assert.ok(snapshot.examples.length > 0);
});
