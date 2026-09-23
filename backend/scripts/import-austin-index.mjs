#!/usr/bin/env node
// Imports the merged Austin food index (frontend/src/data/austinFoodIndex.json) into
// FoodBankDirectoryEntry rows under the Austin, TX region.
//
// This is a SEED / re-seed script, not the live pipeline: it makes the directory stop
// depending on a JSON bundle that ships inside the frontend. Re-running it is safe - it
// upserts on the entry `fingerprint` (austin:<id>), so nothing is duplicated.
//
// Usage:
//   node scripts/import-austin-index.mjs              # dry run (default): reads the JSON,
//                                                     # prints exactly what WOULD be written
//   node scripts/import-austin-index.mjs --apply      # writes to Postgres (needs DATABASE_URL)
//   node scripts/import-austin-index.mjs --selftest   # offline assertions, exit 0/1
//   --file <path>   override the input JSON
//
// The pure mapping helpers are exported so they can be unit-tested without a database.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDomain,
  normalizePhone,
  normalizeText,
} from '../src/services/directoryFingerprint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT = path.resolve(__dirname, '..', '..', 'frontend', 'src', 'data', 'austinFoodIndex.json');

const REGION = { city: 'Austin', state: 'TX', country: 'US' };

// Kept in step with the VenueType enum in prisma/schema.prisma.
const VENUE_TYPES = new Set(['food_bank', 'pantry', 'community_fridge', 'meal', 'program', 'event']);

// Where each entry's information actually came from. Tier 1 wins a conflict, tier 3 loses.
const TIER1_DOMAINS = new Set([
  'centraltexasfoodbank.org',
  'austintexas.gov',
  'roundrocktexas.gov',
  'taylortx.gov',
  'hhs.texas.gov',
  'texaswic.org',
  'office.texaswic.org',
  'wcchd.org',
  'wilco.org',
  'hayscountytx.com',
]);

const TIER3_DOMAINS = new Set([
  'findhelp.org',
  'foodpantries.org',
  'freefood.org',
  'idealist.org',
  '7cups.com',
  'bancosdecomida.com',
  'yelp.com',
  'homelessshelterdirectory.org',
  'wicprograms.org',
  'businessyab.com',
  'snapoffices.com',
  'feedam.org',
  'serve.love',
  'kvue.com',
  '211texas.org',
]);

// "601 Westinghouse Rd, Georgetown, TX 78626 (exact address not confirmed)" ->
//   { address, city: 'Georgetown', state: 'TX', zipCode: '78626' }
// City-only input ("Pflugerville, TX 78660") still yields a city + zip.
export function parseAddress(raw) {
  if (!raw) return { address: null, city: null, state: null, zipCode: null };
  const cleaned = String(raw).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/,\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  if (!match) return { address: cleaned || null, city: null, state: null, zipCode: null };

  const beforeState = cleaned.slice(0, match.index).trim();
  const parts = beforeState.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts.length ? parts[parts.length - 1] : null;

  return { address: cleaned, city, state: match[1], zipCode: match[2] };
}

export function tierForDomain(domain) {
  if (!domain) return 3;
  if (domain.endsWith('.gov') || TIER1_DOMAINS.has(domain)) return 1;
  if (TIER3_DOMAINS.has(domain)) return 3;
  return 2;
}

export function sourcePriorityFor(tier) {
  if (tier === 1) return 10;
  if (tier === 2) return 50;
  return 100;
}

export function venueTypeFor(type) {
  return VENUE_TYPES.has(type) ? type : 'program';
}

export function discoveryStatusFor(status) {
  switch (status) {
    case 'active': return 'indexed';
    case 'stale': return 'stale';
    case 'closed': return 'ignored';
    default: return 'pending_review'; // 'unverified' and anything unknown
  }
}

export function reviewStatusFor(status) {
  switch (status) {
    case 'active': return 'auto_applied';
    case 'closed': return 'rejected';
    default: return 'pending';
  }
}

export function confidenceFor(status) {
  switch (status) {
    case 'active': return 0.9;
    case 'unverified': return 0.5;
    case 'stale': return 0.4;
    case 'closed': return 0.2;
    default: return 0.5;
  }
}

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// Cross-source identity of a PLACE, not of its source.
//
// This deliberately does NOT use the domain-based `buildFingerprint` from the directory
// service: a locator page (e.g. centraltexasfoodbank.org) is the `website` of 21 different
// pantries, so domain-first matching collapses them into one place. Reconciliation needs
// "same name in the same postcode (or at the same coords)".
export function placeMatchKey({ normalizedName, city, state, zipCode, latitude, longitude }) {
  let locality = zipCode || normalizeText(city);
  if (!locality && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    locality = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  }
  if (!locality) locality = normalizeText(state);
  return `place:${normalizedName}|${locality}`;
}

// Maps one index entry to the row shape FoodBankDirectoryEntry expects. `now` is injected
// so the output is deterministic in tests.
export function buildRow(entry, { regionId, now = new Date() } = {}) {
  const { address, city, state, zipCode } = parseAddress(entry.address);
  const sourceDomain = extractDomain(entry.source_url);
  const websiteDomain = extractDomain(entry.website);
  const normalizedPhone = normalizePhone(entry.phone);
  const tier = tierForDomain(sourceDomain || websiteDomain);
  const lat = Number(entry.lat);
  const lng = Number(entry.lng);

  return {
    regionId,
    // Unique identity of THIS record. Prefixed so it can never collide with the
    // domain/phone-based fingerprints the live AccessFood sync produces.
    fingerprint: `austin:${entry.id}`,
    normalizedFingerprint: placeMatchKey({
      normalizedName: normalizeText(entry.name),
      city,
      state,
      zipCode,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    }),
    canonicalName: entry.name || 'Untitled location',
    normalizedName: normalizeText(entry.name),
    sourceUrl: entry.source_url || null,
    sourceDomain,
    website: entry.website || null,
    websiteDomain,
    phone: entry.phone || null,
    normalizedPhone,
    email: null,
    address,
    city,
    state,
    zipCode,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    hours: entry.hours || null,
    description: null,
    eligibilityNotes: entry.eligibility || null,
    venueType: venueTypeFor(entry.type),
    origin: 'scraped',
    confidence: confidenceFor(entry.status),
    sourcePriority: sourcePriorityFor(tier),
    disappearedAt: null,
    discoveryStatus: discoveryStatusFor(entry.status),
    reviewStatus: reviewStatusFor(entry.status),
    firstSeenAt: now,
    lastSeenAt: now,
    lastVerifiedAt: isValidDate(entry.last_verified) ? new Date(entry.last_verified) : null,
    nextReviewAt: null,
    metadata: {
      austinId: entry.id,
      venueType: entry.type || null,
      status: entry.status || null,
      statusNote: entry.status_note || null,
      infoDate: entry.info_date || null,
      eventDate: entry.event_date || null,
      lastVerified: entry.last_verified || null,
      sourceTier: tier,
      importedFrom: 'austinFoodIndex.json',
      importedAt: now.toISOString(),
    },
  };
}

function readIndex(filePath) {
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) throw new Error(`${filePath}: empty file`);
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : parsed.entries;
  if (!Array.isArray(entries)) throw new Error(`${filePath}: expected an array or { entries: [] }`);
  return entries;
}

function summarize(rows) {
  const count = (getter) => {
    const out = {};
    for (const row of rows) {
      const key = getter(row);
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };

  const fingerprints = new Set(rows.map((r) => r.fingerprint));
  const normalizedGroups = new Map();
  for (const row of rows) {
    normalizedGroups.set(row.normalizedFingerprint, (normalizedGroups.get(row.normalizedFingerprint) || 0) + 1);
  }
  const collisions = [...normalizedGroups.entries()].filter(([, n]) => n > 1);

  return {
    total: rows.length,
    uniqueFingerprints: fingerprints.size,
    byVenueType: count((r) => r.venueType),
    byDiscoveryStatus: count((r) => r.discoveryStatus),
    byReviewStatus: count((r) => r.reviewStatus),
    bySourcePriority: count((r) => r.sourcePriority),
    normalizedFingerprintCollisions: collisions.length,
    topCollisions: collisions
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, n]) => `${key} x${n}`),
    cityCoverage: rows.filter((r) => r.city).length,
    stateCoverage: rows.filter((r) => r.state).length,
    zipCoverage: rows.filter((r) => r.zipCode).length,
    coordCoverage: rows.filter((r) => r.latitude != null && r.longitude != null).length,
    missingCity: rows.filter((r) => !r.city).map((r) => r.fingerprint),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`SELFTEST FAILED: ${message}`);
}

function selftest() {
  assert(JSON.stringify(parseAddress('601 Westinghouse Rd, Georgetown, TX 78626'))
    === JSON.stringify({ address: '601 Westinghouse Rd, Georgetown, TX 78626', city: 'Georgetown', state: 'TX', zipCode: '78626' }),
  'parseAddress street address');

  assert(parseAddress('Pflugerville, TX 78660').city === 'Pflugerville', 'parseAddress city-only');
  assert(parseAddress('St. Margaret Mary Catholic Church, Cedar Park, TX 78613 (exact street address not confirmed from source)').zipCode === '78613', 'parseAddress strips parenthetical');
  assert(parseAddress('Liberty Hill, TX 78642').state === 'TX', 'parseAddress state');
  assert(parseAddress('no address here').city === null, 'parseAddress unparseable -> null city');
  assert(parseAddress(null).address === null, 'parseAddress null');

  assert(tierForDomain('centraltexasfoodbank.org') === 1, 'tier1 known');
  assert(tierForDomain('austintexas.gov') === 1, 'tier1 .gov');
  assert(tierForDomain('some-random-gov-site.gov') === 1, 'tier1 .gov suffix');
  assert(tierForDomain('findhelp.org') === 3, 'tier3 aggregator');
  assert(tierForDomain('mysmallchurch.org') === 2, 'tier2 org site');
  assert(tierForDomain(null) === 3, 'tier null -> weakest');

  assert(sourcePriorityFor(1) === 10 && sourcePriorityFor(2) === 50 && sourcePriorityFor(3) === 100, 'sourcePriority bands');

  assert(venueTypeFor('pantry') === 'pantry', 'venueType passthrough');
  assert(venueTypeFor('soup_kitchen') === 'program', 'venueType unknown -> program');
  assert(venueTypeFor(undefined) === 'program', 'venueType undefined -> program');

  assert(discoveryStatusFor('active') === 'indexed', 'discovery active');
  assert(discoveryStatusFor('unverified') === 'pending_review', 'discovery unverified');
  assert(discoveryStatusFor('closed') === 'ignored', 'discovery closed');
  assert(discoveryStatusFor('stale') === 'stale', 'discovery stale');

  assert(reviewStatusFor('active') === 'auto_applied', 'review active');
  assert(reviewStatusFor('closed') === 'rejected', 'review closed');
  assert(reviewStatusFor('unverified') === 'pending', 'review unverified');

  const fix = new Date('2026-09-22T00:00:00Z');
  const row = buildRow({
    id: 'x1', name: '  Test Pantry!! ', type: 'pantry', address: '1 Main St, Austin, TX 78701',
    lat: 30.27, lng: -97.74, phone: '512-555-0100', website: 'https://www.example.org/pantry',
    source_url: 'https://www.example.org/pantry', hours: 'Mon 9-5', eligibility: 'none',
    event_date: null, last_verified: '2026-09-22', status: 'active', status_note: 'checked',
  }, { regionId: 'r1', now: fix });

  assert(row.fingerprint === 'austin:x1', 'unique fingerprint is namespaced');
  assert(row.normalizedName === 'test pantry', 'normalizedName');
  assert(row.websiteDomain === 'example.org', 'websiteDomain strips www');
  assert(row.normalizedFingerprint === 'place:test pantry|78701', 'normalizedFingerprint is place-based, not domain-based');
  assert(row.venueType === 'pantry' && row.origin === 'scraped', 'venueType/origin');
  assert(row.sourcePriority === 50, 'org site -> tier2 -> 50');
  assert(row.discoveryStatus === 'indexed' && row.reviewStatus === 'auto_applied', 'status mapping');
  assert(row.city === 'Austin' && row.state === 'TX' && row.zipCode === '78701', 'address parsed');
  assert(row.lastVerifiedAt instanceof Date, 'lastVerifiedAt is a Date');
  assert(row.metadata.austinId === 'x1', 'metadata carries austinId');

  // Same venue, two files, different source domains -> distinct unique fingerprints but
  // the SAME place key, which is exactly the signal reconciliation wants.
  const a = buildRow({ id: 'a', name: 'Same Place', type: 'pantry', address: '1 A St, Austin, TX 78701', lat: 30, lng: -97, website: 'https://shared.org', source_url: 'https://shared.org', status: 'active' }, { regionId: 'r1', now: fix });
  const b = buildRow({ id: 'b', name: 'Same Place', type: 'pantry', address: '1 A St, Austin, TX 78701', lat: 30, lng: -97, website: 'https://shared.org', source_url: 'https://findhelp.org/x', status: 'unverified' }, { regionId: 'r1', now: fix });
  assert(a.fingerprint !== b.fingerprint, 'distinct unique fingerprints');
  assert(a.normalizedFingerprint === b.normalizedFingerprint, 'same place -> shared place key');

  // The bug domain-first matching caused: two DIFFERENT pantries that merely share a
  // locator page as their `website` must NOT collide.
  const c = buildRow({ id: 'c', name: 'North Pantry', type: 'pantry', address: '1 N St, Austin, TX 78701', lat: 30.3, lng: -97.7, website: 'https://centraltexasfoodbank.org', source_url: 'https://centraltexasfoodbank.org/find-food-now', status: 'active' }, { regionId: 'r1', now: fix });
  const d = buildRow({ id: 'd', name: 'South Pantry', type: 'pantry', address: '1 S St, Austin, TX 78745', lat: 30.2, lng: -97.8, website: 'https://centraltexasfoodbank.org', source_url: 'https://centraltexasfoodbank.org/find-food-now', status: 'active' }, { regionId: 'r1', now: fix });
  assert(c.normalizedFingerprint !== d.normalizedFingerprint, 'different places sharing a source domain must not collide');

  console.log('import-austin-index selftest: PASS');
}

async function apply(entries) {
  const { getPrismaClient } = await import('../src/utils/database.js');
  const prisma = getPrismaClient();

  let region = await prisma.foodBankIndexRegion.findFirst({
    where: { city: REGION.city, state: REGION.state, country: REGION.country },
  });
  if (!region) {
    region = await prisma.foodBankIndexRegion.create({
      data: {
        ...REGION,
        searchQueries: ['food pantry', 'food bank', 'free food', 'community fridge', 'free meal'],
        config: { note: 'Seeded by import-austin-index.mjs', bbox: { minLat: 29.6, maxLat: 31.0, minLng: -98.4, maxLng: -97.1 } },
      },
    });
    console.log(`created region ${region.city}, ${region.state}`);
  } else {
    console.log(`using existing region ${region.city}, ${region.state} (${region.id})`);
  }

  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const data = buildRow(entry, { regionId: region.id });
    const existing = await prisma.foodBankDirectoryEntry.findUnique({ where: { fingerprint: data.fingerprint } });
    if (existing) {
      await prisma.foodBankDirectoryEntry.update({ where: { fingerprint: data.fingerprint }, data });
      updated += 1;
    } else {
      await prisma.foodBankDirectoryEntry.create({ data });
      created += 1;
    }
  }

  console.log(`import-austin-index: created ${created}, updated ${updated} entries in region ${region.city}, ${region.state}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    try {
      selftest();
    } catch (error) {
      console.error(error.message || error);
      process.exit(1);
    }
    return;
  }

  const fileArgIndex = args.indexOf('--file');
  const inputPath = fileArgIndex >= 0 ? path.resolve(args[fileArgIndex + 1]) : DEFAULT_INPUT;
  const entries = readIndex(inputPath);
  const rows = entries.map((entry) => buildRow(entry, { regionId: 'PENDING' }));
  const summary = summarize(rows);

  console.log(`import-austin-index: read ${inputPath}`);
  console.log(JSON.stringify(summary, null, 2));

  if (args.includes('--apply')) {
    await apply(entries);
  } else {
    console.log('import-austin-index: DRY RUN - nothing written. Pass --apply to write.');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}