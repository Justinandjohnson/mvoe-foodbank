#!/usr/bin/env node
// Merges frontend/src/data/austin/{pantries,programs,events}.json into
// frontend/src/data/austinFoodIndex.json — validated, deduped, expired events dropped,
// closed entries dropped (freshness status).
//
// Usage:
//   node merge-austin-index.mjs            run the real merge
//   node merge-austin-index.mjs --selftest  run against fixture data, assert, exit 0/1

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUSTIN_DIR = path.join(__dirname, '..', 'src', 'data', 'austin');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'austinFoodIndex.json');

// Base entry files, plus every extra-*.json a scraper agent drops in (same schema).
const BASE_ENTRY_FILES = ['pantries.json', 'programs.json', 'events.json'];
const VALID_TYPES = new Set(['food_bank', 'pantry', 'community_fridge', 'meal', 'program', 'event']);
const VALID_STATUSES = new Set(['active', 'stale', 'closed', 'unverified']);

function listEntryFiles(dataDir) {
  const files = new Set(BASE_ENTRY_FILES);
  let dirEntries = [];
  try {
    dirEntries = readdirSync(dataDir);
  } catch {
    // dataDir doesn't exist yet — base files list still returned, readJsonArray treats missing as []
    return [...files];
  }
  for (const name of dirEntries) {
    if (/^extra-.+\.json$/.test(name)) files.add(name);
  }
  return [...files];
}
const BBOX = { latMin: 29.6, latMax: 31.0, lngMin: -98.4, lngMax: -97.1 };

function readJsonArray(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${filePath}: expected a JSON array`);
  return parsed;
}

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Freshness status. A missing or unrecognized status is unknown, never a reason to drop.
function statusOf(entry) {
  return VALID_STATUSES.has(entry.status) ? entry.status : 'unknown';
}

// Haversine distance in meters
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function validateEntry(entry, errors, idx, sourceFile) {
  const where = `${sourceFile}[${idx}] (id=${entry && entry.id})`;
  if (!entry || typeof entry !== 'object') {
    errors.push(`${where}: not an object`);
    return false;
  }
  const required = ['id', 'name', 'type', 'address', 'lat', 'lng'];
  for (const f of required) {
    if (entry[f] === undefined || entry[f] === null || entry[f] === '') {
      errors.push(`${where}: missing required field "${f}"`);
      return false;
    }
  }
  if (!VALID_TYPES.has(entry.type)) {
    errors.push(`${where}: invalid type "${entry.type}"`);
    return false;
  }
  const lat = Number(entry.lat);
  const lng = Number(entry.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.push(`${where}: lat/lng not numeric`);
    return false;
  }
  if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) {
    errors.push(`${where}: lat/lng (${lat}, ${lng}) outside Austin bbox`);
    return false;
  }
  if (entry.event_date !== null && entry.event_date !== undefined && !isValidDateString(entry.event_date)) {
    errors.push(`${where}: invalid event_date "${entry.event_date}"`);
    return false;
  }
  if (entry.last_verified !== undefined && entry.last_verified !== null && !isValidDateString(entry.last_verified)) {
    errors.push(`${where}: invalid last_verified "${entry.last_verified}"`);
    return false;
  }
  return true;
}

function countNonNullFields(entry) {
  return Object.values(entry).filter((v) => v !== null && v !== undefined && v !== '').length;
}

function dedupe(entries) {
  const kept = [];
  const seenIds = new Set();
  for (const e of entries) {
    if (seenIds.has(e.id)) continue; // exact id dup, drop
    const normName = normalizeName(e.name);
    let dupIdx = -1;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      if (normalizeName(k.name) === normName) {
        const d = distMeters(Number(e.lat), Number(e.lng), Number(k.lat), Number(k.lng));
        if (d <= 150) {
          dupIdx = i;
          break;
        }
      }
    }
    if (dupIdx === -1) {
      kept.push(e);
      seenIds.add(e.id);
    } else if (countNonNullFields(e) > countNonNullFields(kept[dupIdx])) {
      // same place (name+proximity) duplicate — keep whichever record is more complete
      seenIds.add(e.id);
      kept[dupIdx] = e;
    }
  }
  return kept;
}

function isPastEvent(entry, now) {
  if (entry.type !== 'event') return false;
  if (!entry.event_date) return false;
  const d = new Date(entry.event_date + 'T23:59:59');
  return d.getTime() < now.getTime();
}

export function buildIndex(dataDir, { now = new Date() } = {}) {
  const errors = [];
  let all = [];
  for (const file of listEntryFiles(dataDir)) {
    const filePath = path.join(dataDir, file);
    const arr = readJsonArray(filePath);
    arr.forEach((e, i) => {
      if (validateEntry(e, errors, i, file)) all.push(e);
    });
  }
  all = all.filter((e) => !isPastEvent(e, now));
  // Freshness: closed entries are dropped before dedupe so a closed record can't
  // out-rich an active one and then vanish.
  let closedDropped = 0;
  all = all.filter((e) => {
    if (e.status === 'closed') {
      closedDropped++;
      return false;
    }
    return true;
  });
  all = dedupe(all);
  const statusCounts = { active: 0, stale: 0, unverified: 0, unknown: 0 };
  for (const e of all) statusCounts[statusOf(e)]++;
  const output = {
    generated: now.toISOString(),
    count: all.length,
    entries: all,
  };
  return { output, errors, statusCounts, closedDropped };
}

function main() {
  const { output, errors, statusCounts, closedDropped } = buildIndex(AUSTIN_DIR);
  if (errors.length) {
    console.warn(`merge-austin-index: skipped ${errors.length} invalid entr${errors.length === 1 ? 'y' : 'ies'}:`);
    for (const e of errors) console.warn('  - ' + e);
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`merge-austin-index: wrote ${output.count} entries to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`merge-austin-index: status active=${statusCounts.active} stale=${statusCounts.stale} unverified=${statusCounts.unverified} unknown=${statusCounts.unknown} closed_dropped=${closedDropped}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error('SELFTEST FAILED: ' + msg);
}

function selftest() {
  const dir = mkdtempSync(path.join(tmpdir(), 'austin-merge-selftest-'));
  try {
    const pantries = [
      { id: 'p1', name: 'Central Food Pantry', type: 'pantry', address: '123 Main St, Austin, TX', lat: 30.27, lng: -97.74, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01' },
      // near-duplicate of p1 (same normalized name, within 150m)
      { id: 'p1-dup', name: 'CENTRAL   Food Pantry!!', type: 'pantry', address: '123 Main St, Austin, TX', lat: 30.2701, lng: -97.7401, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01' },
      // out of Austin bbox -> dropped
      { id: 'p2', name: 'Dallas Pantry', type: 'pantry', address: 'Dallas, TX', lat: 32.77, lng: -96.79, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01' },
      // missing required field -> dropped
      { id: 'p3', name: 'No Address Pantry', type: 'pantry', lat: 30.3, lng: -97.7 },
      // invalid type -> dropped
      { id: 'p4', name: 'Weird Type', type: 'soup_kitchen', address: 'x', lat: 30.3, lng: -97.7 },
      // exact id dup of p1 -> dropped (second occurrence)
      { id: 'p1', name: 'Central Food Pantry Duplicate Id', type: 'pantry', address: '123 Main St', lat: 30.28, lng: -97.75 },
      // freshness: closed -> dropped by the merge
      { id: 'p5', name: 'Shuttered Pantry', type: 'pantry', address: '500 Closed St, Austin, TX', lat: 30.31, lng: -97.73, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01', status: 'closed', status_note: 'permanently closed', info_date: '2026-04-01' },
      // freshness: no status field -> kept, counted as unknown
      { id: 'p6', name: 'Unlabeled Pantry', type: 'pantry', address: '600 Unknown St, Austin, TX', lat: 30.32, lng: -97.73, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01' },
    ];
    const programs = [
      { id: 'pr1', name: 'SNAP Outreach', type: 'program', address: '456 Congress Ave, Austin, TX', lat: 30.26, lng: -97.74, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com', last_verified: '2026-01-01' },
    ];
    const events = [
      // future event -> kept
      { id: 'e1', name: 'Food Drive', type: 'event', address: '789 5th St, Austin, TX', lat: 30.27, lng: -97.75, phone: '', website: '', hours: '', eligibility: '', event_date: '2099-01-01', source_url: 'https://example.com', last_verified: '2026-01-01' },
      // past event -> dropped
      { id: 'e2', name: 'Old Drive', type: 'event', address: '789 5th St, Austin, TX', lat: 30.27, lng: -97.75, phone: '', website: '', hours: '', eligibility: '', event_date: '2020-01-01', source_url: 'https://example.com', last_verified: '2026-01-01' },
    ];
    writeFileSync(path.join(dir, 'pantries.json'), JSON.stringify(pantries));
    writeFileSync(path.join(dir, 'programs.json'), JSON.stringify(programs));
    writeFileSync(path.join(dir, 'events.json'), JSON.stringify(events));

    // extra-*.json from newer scraper agents: same schema, glob-picked-up (not hardcoded).
    // "Riverside Church" here is a fuller near-duplicate of the sparse one in extra-two below,
    // and lands within 150m under a differently-formatted name -> dedupe should keep this richer one.
    const extraChurch = [
      { id: 'ex1-church', name: 'Riverside Church Pantry', type: 'pantry', address: '999 River Rd, Austin, TX', lat: 30.29, lng: -97.72, phone: '512-555-0100', website: 'https://riverside.example', hours: 'Tue/Thu 9-12', eligibility: 'none', event_date: null, source_url: 'https://example.com/extra1', last_verified: '2026-05-01' },
    ];
    const extraTwo = [
      // sparse duplicate of extraChurch (same normalized name, within 150m, fewer fields) -> should be dropped in favor of the richer record
      { id: 'ex2-church-sparse', name: 'Riverside   Church Pantry', type: 'pantry', address: '999 River Rd', lat: 30.2901, lng: -97.7201 },
      // San Marcos entry, only valid now that the bbox was widened — confirms extra file is actually being read
      { id: 'ex2-sanmarcos', name: 'San Marcos Community Fridge', type: 'community_fridge', address: '1 LBJ Dr, San Marcos, TX', lat: 29.88, lng: -97.94, phone: '', website: '', hours: '', eligibility: '', event_date: null, source_url: 'https://example.com/extra2', last_verified: '2026-05-01' },
    ];
    writeFileSync(path.join(dir, 'extra-church-directory.json'), JSON.stringify(extraChurch));
    writeFileSync(path.join(dir, 'extra-second-scraper.json'), JSON.stringify(extraTwo));

    const now = new Date('2026-06-01T00:00:00Z');
    const { output, errors, statusCounts, closedDropped } = buildIndex(dir, { now });

    assert(errors.length === 3, `expected 3 validation errors (p2 bbox, p3 missing, p4 type), got ${errors.length}: ${JSON.stringify(errors)}`);
    assert(output.count === 6, `expected 6 entries (p1, pr1, e1, ex1-church, ex2-sanmarcos, p6) after dedupe+expiry+freshness, got ${output.count}: ${JSON.stringify(output.entries.map((e) => e.id))}`);
    const ids = output.entries.map((e) => e.id).sort();
    assert(JSON.stringify(ids) === JSON.stringify(['e1', 'ex1-church', 'ex2-sanmarcos', 'p1', 'p6', 'pr1']), `unexpected surviving ids: ${JSON.stringify(ids)}`);
    assert(!output.entries.some((e) => e.id === 'e2'), 'past event e2 should have been dropped');
    assert(!output.entries.some((e) => e.id === 'p1-dup'), 'near-duplicate p1-dup should have been dropped');
    assert(!output.entries.some((e) => e.id === 'ex2-church-sparse'), 'sparser cross-file duplicate should have been dropped in favor of the richer record');
    assert(output.entries.some((e) => e.id === 'ex2-sanmarcos'), 'San Marcos entry from extra-*.json should survive with the widened bbox — proves extra-*.json glob is actually read');
    assert(!output.entries.some((e) => e.id === 'p5'), 'closed entry p5 should have been dropped');
    assert(output.entries.some((e) => e.id === 'p6'), 'entry with no status should be kept and treated as unknown');
    assert(closedDropped === 1, `expected closed_dropped=1, got ${closedDropped}`);
    assert(statusCounts.unknown === 6, `expected 6 unknown-status entries, got ${statusCounts.unknown}`);
    assert(typeof output.generated === 'string' && !Number.isNaN(Date.parse(output.generated)), 'generated must be a valid ISO date');

    // missing files case: should still write empty entries, no throw
    const emptyDir = mkdtempSync(path.join(tmpdir(), 'austin-merge-selftest-empty-'));
    try {
      const { output: emptyOut, errors: emptyErrors } = buildIndex(emptyDir, { now });
      assert(emptyErrors.length === 0, 'expected no errors for missing files');
      assert(emptyOut.count === 0 && Array.isArray(emptyOut.entries), 'expected empty entries array when source files are missing');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }

    console.log('merge-austin-index selftest: PASS');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    try {
      selftest();
    } catch (err) {
      console.error(err.message || err);
      process.exit(1);
    }
  } else {
    main();
  }
}
