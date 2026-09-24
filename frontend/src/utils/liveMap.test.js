import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBeaconMapItem,
  buildCommunityEventMapItem,
  buildFoodBankMapItem,
  collectChunkedPages,
  evaluateAvailabilityWindows,
  normalizeResourceCategory,
  partitionLiveFeedItems,
} from './liveMap.js';

const REFERENCE = new Date('2026-09-23T15:30:00.000Z'); // 10:30 AM in Austin

test('recorded directory windows resolve current and upcoming Austin availability', () => {
  const rows = [
    {
      id: 'window-current',
      entry_id: 'directory-entry-42',
      kind: 'recurring',
      category: 'pantry',
      day_of_week: 3,
      specific_date: null,
      start_minute: 600,
      end_minute: 720,
      timezone: 'America/Chicago',
      recurrence_ordinal: 4,
      source_text: 'Fourth Wednesday, 10 AM - noon',
    },
    {
      id: 'window-next',
      entry_id: 'directory-entry-42',
      kind: 'date_specific',
      category: 'pop_up',
      day_of_week: null,
      specific_date: '2026-09-24',
      start_minute: 540,
      end_minute: 600,
      timezone: 'America/Chicago',
      recurrence_ordinal: null,
      source_text: 'Thursday pop-up, 9-10 AM',
    },
  ];

  const result = evaluateAvailabilityWindows(rows, REFERENCE, 'food_bank');
  assert.equal(result.availabilityStatus, 'available_now');
  assert.equal(result.currentWindow.id, 'window-current');
  assert.equal(result.currentWindow.startTime, '2026-09-23T15:00:00.000Z');
  assert.equal(result.currentWindow.endTime, '2026-09-23T17:00:00.000Z');
  assert.equal(result.nextWindow.id, 'window-next');
  assert.equal(result.upcomingWithin24Hours.length, 1);
});

test('unknown or malformed directory hours never claim availability', () => {
  const noRows = evaluateAvailabilityWindows([], REFERENCE, 'pantry');
  const malformed = evaluateAvailabilityWindows([{
    id: 'bad-window',
    entry_id: 'directory-entry-42',
    kind: 'recurring',
    category: 'pantry',
    day_of_week: 3,
    start_minute: 900,
    end_minute: 600,
    timezone: 'America/Chicago',
  }], REFERENCE, 'pantry');

  assert.equal(noRows.availabilityStatus, 'unknown');
  assert.equal(noRows.isAvailableAtReferenceTime, false);
  assert.equal(malformed.availabilityStatus, 'unknown');
  assert.equal(malformed.currentWindow, null);
});

test('organization schedule is evaluated at the selected time, not wall-clock now', () => {
  const organization = {
    id: 'org-7',
    name: 'Neighborhood Pantry',
    type: 'pantry',
    latitude: 30.26,
    longitude: -97.74,
    hours: JSON.stringify({ wednesday: '10:00 AM - 12:00 PM' }),
    updatedAt: '2026-09-22T12:00:00.000Z',
  };

  const open = buildFoodBankMapItem(organization, new Date('2026-09-23T15:30:00.000Z'));
  const closed = buildFoodBankMapItem(organization, new Date('2026-09-23T18:00:00.000Z'));
  assert.equal(open.isAvailableAtReferenceTime, true);
  assert.equal(closed.isAvailableAtReferenceTime, false);
  assert.equal(closed.availabilityStatus, 'upcoming');
});

test('beacons and meal events use the same half-open availability boundary', () => {
  const beacon = {
    id: 'beacon-1',
    title: 'Fresh produce table',
    isActive: true,
    availableFrom: '2026-09-23T15:00:00.000Z',
    availableUntil: '2026-09-23T16:00:00.000Z',
  };
  const event = {
    id: 'event-1',
    eventName: 'Community lunch',
    eventType: 'community_meal',
    startTime: '2026-09-23T15:00:00.000Z',
    endTime: '2026-09-23T16:00:00.000Z',
    status: 'planned',
  };

  assert.equal(buildBeaconMapItem(beacon, REFERENCE).availabilityStatus, 'available_now');
  assert.equal(buildCommunityEventMapItem(event, REFERENCE).availabilityStatus, 'available_now');
  assert.equal(buildBeaconMapItem(beacon, new Date('2026-09-23T16:00:00.000Z')).isAvailableAtReferenceTime, false);
  assert.equal(buildCommunityEventMapItem(event, new Date('2026-09-23T16:00:00.000Z')).isAvailableAtReferenceTime, false);
});

test('legacy directory types collapse into clear user-facing categories', () => {
  assert.equal(normalizeResourceCategory('program', 'ATX Free Fridge'), 'community_fridge');
  assert.equal(normalizeResourceCategory('event', 'Mobile distribution'), 'pop_up');
  assert.equal(normalizeResourceCategory('program', 'Daily food pantry'), 'pantry');
  assert.equal(normalizeResourceCategory('food_bank', 'Central Texas Food Bank'), 'food_bank');
  assert.equal(normalizeResourceCategory('program', 'Hot lunch'), 'meal');
});

test('organization hours use their timezone and normalize invalid zones to Austin', () => {
  const organization = {
    id: 'org-timezone',
    name: 'Morning pantry',
    type: 'pantry',
    hours: { wednesday: '10:00 AM - 12:00 PM' },
    timezone: 'America/Los_Angeles',
  };

  const losAngeles = buildFoodBankMapItem(organization, REFERENCE);
  const austin = buildFoodBankMapItem({ ...organization, timezone: 'America/Chicago' }, REFERENCE);
  const fallback = buildFoodBankMapItem({ ...organization, timezone: 'not/a-zone' }, REFERENCE);

  assert.equal(losAngeles.isAvailableAtReferenceTime, false);
  assert.equal(losAngeles.nextWindow.startTime, '2026-09-23T17:00:00.000Z');
  assert.equal(austin.isAvailableAtReferenceTime, true);
  assert.equal(fallback.isAvailableAtReferenceTime, true);
  assert.equal(fallback.timezone, 'America/Chicago');
});

test('feed partition keeps all resources while category arrays remain current-only', () => {
  const current = { id: 'current-pantry', isAvailableAtReferenceTime: true, nextWindow: null };
  const upcoming = {
    id: 'upcoming-meal',
    isAvailableAtReferenceTime: false,
    nextWindow: { startTime: '2026-09-24T14:00:00.000Z', endTime: '2026-09-24T15:00:00.000Z' },
  };
  const unknown = { id: 'unknown-fridge', isAvailableAtReferenceTime: false, nextWindow: null };
  const result = partitionLiveFeedItems({
    foodBanks: [current],
    events: [upcoming],
    austinIndex: [unknown],
  }, REFERENCE);

  assert.deepEqual(result.all.map((item) => item.id), ['current-pantry', 'upcoming-meal', 'unknown-fridge']);
  assert.deepEqual(result.foodBanks.map((item) => item.id), ['current-pantry']);
  assert.equal(result.events.length, 0);
  assert.equal(result.austinIndex.length, 0);
  assert.deepEqual(result.upcoming.map((item) => item.id), ['upcoming-meal']);
});

test('chunked page collector reads past a 5000-row response boundary', async () => {
  const fixture = Array.from({ length: 5105 }, (_, index) => ({ id: `window-${index}` }));
  const calls = [];
  const rows = await collectChunkedPages(['entry-1'], async (entryIds, from, to) => {
    calls.push({ entryIds, from, to });
    return { data: fixture.slice(from, to + 1), error: null };
  }, { chunkSize: 100, pageSize: 1000 });

  assert.equal(rows.length, 5105);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls.at(-1), { entryIds: ['entry-1'], from: 5000, to: 5999 });
});
