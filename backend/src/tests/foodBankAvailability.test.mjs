import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { buildAvailabilityWindows, inferVenueType } = await import('../services/foodBankDirectoryService.js');
const { buildBackfillProjection, parseBackfillArgs } = await import('../../scripts/backfill-food-availability.mjs');

test('expands weekday ranges into queryable recurring windows', () => {
  const windows = buildAvailabilityWindows({
    'Mo-Fr': '9:00 AM - 5:00 PM',
  }, { category: 'pantry' });

  assert.equal(windows.length, 5);
  assert.deepEqual(windows.map((window) => window.dayOfWeek), [1, 2, 3, 4, 5]);
  assert.ok(windows.every((window) => (
    window.kind === 'recurring'
    && window.category === 'pantry'
    && window.startMinute === 540
    && window.endMinute === 1020
  )));
});

test('preserves multiple same-day windows', () => {
  const windows = buildAvailabilityWindows({
    saturday: '9:00 AM - 11:00 AM, 1:30 PM - 4:00 PM',
  });

  assert.deepEqual(
    windows.map(({ startMinute, endMinute }) => [startMinute, endMinute]),
    [[540, 660], [810, 960]]
  );
});

test('closed and unparseable schedules never become available windows', () => {
  assert.deepEqual(buildAvailabilityWindows({ monday: 'Closed' }), []);
  assert.deepEqual(buildAvailabilityWindows({ monday: 'Call for hours' }), []);
  assert.deepEqual(buildAvailabilityWindows({ monday: '9 - 5' }), []);
});

test('creates one recurring row for each safely expressible week ordinal', () => {
  const windows = buildAvailabilityWindows({
    tuesday: '10:00 AM - 12:00 PM (first and third weeks of the month)',
  });

  assert.deepEqual(windows.map((window) => window.recurrenceOrdinal), [1, 3]);
});

test('does not guess every-other-week recurrence without an anchor date', () => {
  const windows = buildAvailabilityWindows({
    thursday: '10:00 AM - 12:00 PM (every other week)',
  });

  assert.deepEqual(windows, []);
});

test('normalizes exact-date windows independently from recurring hours', () => {
  const windows = buildAvailabilityWindows({
    '2026-09-25': '11:00 AM - 2:00 PM',
  }, { category: 'pop_up', timezone: 'America/Chicago' });

  assert.equal(windows.length, 1);
  assert.equal(windows[0].kind, 'date_specific');
  assert.equal(windows[0].specificDate.toISOString().slice(0, 10), '2026-09-25');
  assert.equal(windows[0].dayOfWeek, null);
  assert.equal(windows[0].category, 'pop_up');
});

test('classifies the requested food resource categories without a generic community bucket', () => {
  assert.equal(inferVenueType({ canonicalName: 'Eastside Community Fridge' }), 'community_fridge');
  assert.equal(inferVenueType({ description: 'Saturday pop-up groceries' }), 'pop_up');
  assert.equal(inferVenueType({ description: 'Hot meal service' }), 'meal');
  assert.equal(inferVenueType({ canonicalName: 'Neighborhood Food Pantry' }), 'pantry');
  assert.equal(inferVenueType({ canonicalName: 'Central Food Bank' }), 'food_bank');
});

test('backfill projection derives category and windows without mutating raw hours', () => {
  const entry = {
    id: 'entry-1',
    canonicalName: 'Neighborhood Pantry',
    venueType: 'food_bank',
    hours: JSON.stringify({ monday: '9:00 AM - 11:00 AM' }),
    metadata: {},
    region: { config: { timezone: 'America/Chicago' } },
  };

  const projection = buildBackfillProjection(entry);
  assert.equal(projection.category, 'pantry');
  assert.equal(projection.scheduleSource, 'hours');
  assert.equal(projection.windows.length, 1);
  assert.equal(entry.hours, JSON.stringify({ monday: '9:00 AM - 11:00 AM' }));
});

test('backfill projection can use date-specific metadata and never opens unknown schedules', () => {
  const dated = buildBackfillProjection({
    canonicalName: 'Friday Pop Up',
    venueType: 'event',
    hours: 'hours vary; call first',
    metadata: {
      timezone: 'America/Chicago',
      availability: { '2026-09-25': '1:00 PM - 3:00 PM' },
    },
  });
  assert.equal(dated.category, 'pop_up');
  assert.equal(dated.scheduleSource, 'metadata.availability');
  assert.equal(dated.windows[0].kind, 'date_specific');

  const unknown = buildBackfillProjection({
    canonicalName: 'Unverified Food Bank',
    hours: 'Call for hours',
    metadata: {},
  });
  assert.deepEqual(unknown.windows, []);
  assert.equal(unknown.scheduleSource, null);
});

test('backfill CLI is dry-run by default and validates resumable batch options', () => {
  assert.deepEqual(parseBackfillArgs([]), { apply: false, batchSize: 100, after: null });
  assert.deepEqual(parseBackfillArgs(['--apply', '--batch-size', '25', '--after', 'abc']), {
    apply: true,
    batchSize: 25,
    after: 'abc',
  });
  assert.throws(() => parseBackfillArgs(['--batch-size', '0']), /integer from 1 to 1000/);
  assert.throws(() => parseBackfillArgs(['--after']), /requires a value/);
});
