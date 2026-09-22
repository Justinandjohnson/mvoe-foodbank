#!/usr/bin/env node
// Weekly check: for every url in the sources-*.json files, fetch it, hash the
// normalized text, compare against the last known hash, and write CHANGES.md
// listing sources that changed / are new / failed since the last run.
// Then runs the merge (merge-austin-index.mjs) and updates the hash store.
//
// Usage:
//   node refresh-austin-index.mjs             run the real refresh (network)
//   node refresh-austin-index.mjs --selftest   run against fixtures with a fake fetch, assert, exit 0/1

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './merge-austin-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUSTIN_DIR = path.join(__dirname, '..', 'src', 'data', 'austin');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'austinFoodIndex.json');
const HASHES_PATH_NAME = 'source-hashes.json';
const CHANGES_PATH_NAME = 'CHANGES.md';

function readJsonArray(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${filePath}: expected a JSON array`);
  return parsed;
}

// Every sources-*.json in the data dir (base pantries/programs/events plus any
// sources-extra-<name>.json a newer scraper agent drops in) — globbed, not hardcoded,
// so new scraper agents need no changes here.
function listSourceFiles(dataDir) {
  let dirEntries = [];
  try {
    dirEntries = readdirSync(dataDir);
  } catch {
    return [];
  }
  return dirEntries.filter((name) => /^sources-.+\.json$/.test(name)).sort();
}

function readHashes(dir) {
  const p = path.join(dir, HASHES_PATH_NAME);
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeText(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(text) {
  return createHash('sha256').update(normalizeText(text), 'utf8').digest('hex');
}

function collectSourceUrls(dir) {
  const entries = [];
  const seen = new Set();
  for (const file of listSourceFiles(dir)) {
    const arr = readJsonArray(path.join(dir, file));
    for (const item of arr) {
      if (!item || !item.url) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      entries.push({ url: item.url, what: item.what || '', file });
    }
  }
  return entries;
}

export async function runRefresh(dir, { fetchImpl = fetch, now = new Date() } = {}) {
  const sources = collectSourceUrls(dir);
  const prevHashes = readHashes(dir);
  const newHashes = {};
  const changed = [];
  const added = [];
  const failed = [];
  const unchanged = [];

  for (const src of sources) {
    try {
      const res = await fetchImpl(src.url);
      if (!res.ok) {
        failed.push({ ...src, reason: `HTTP ${res.status}` });
        // keep previous hash if fetch failed
        if (prevHashes[src.url]) newHashes[src.url] = prevHashes[src.url];
        continue;
      }
      const text = await res.text();
      const hash = hashText(text);
      newHashes[src.url] = { hash, checked: now.toISOString() };
      const prev = prevHashes[src.url];
      if (!prev) {
        added.push(src);
      } else if (prev.hash !== hash) {
        changed.push(src);
      } else {
        unchanged.push(src);
      }
    } catch (err) {
      failed.push({ ...src, reason: err.message || String(err) });
      if (prevHashes[src.url]) newHashes[src.url] = prevHashes[src.url];
    }
  }

  const lines = [];
  lines.push(`# Austin Source Changes`);
  lines.push('');
  lines.push(`Checked: ${now.toISOString()}`);
  lines.push('');
  lines.push(`## Changed (${changed.length})`);
  for (const s of changed) lines.push(`- [${s.file}] ${s.url} — ${s.what}`);
  lines.push('');
  lines.push(`## New (${added.length})`);
  for (const s of added) lines.push(`- [${s.file}] ${s.url} — ${s.what}`);
  lines.push('');
  lines.push(`## Failed (${failed.length})`);
  for (const s of failed) lines.push(`- [${s.file}] ${s.url} — ${s.reason}`);
  lines.push('');
  lines.push(`## Unchanged (${unchanged.length})`);
  for (const s of unchanged) lines.push(`- [${s.file}] ${s.url}`);
  lines.push('');
  const changesMd = lines.join('\n');

  return { changesMd, newHashes, changed, added, failed, unchanged };
}

async function main() {
  const { changesMd, newHashes } = await runRefresh(AUSTIN_DIR);
  writeFileSync(path.join(AUSTIN_DIR, CHANGES_PATH_NAME), changesMd, 'utf8');
  writeFileSync(path.join(AUSTIN_DIR, HASHES_PATH_NAME), JSON.stringify(newHashes, null, 2) + '\n', 'utf8');
  console.log(`refresh-austin-index: wrote ${path.join('src', 'data', 'austin', CHANGES_PATH_NAME)}`);

  const { output, errors } = buildIndex(AUSTIN_DIR);
  if (errors.length) {
    console.warn(`refresh-austin-index: skipped ${errors.length} invalid entries during merge`);
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`refresh-austin-index: merged ${output.count} entries into ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error('SELFTEST FAILED: ' + msg);
}

async function selftest() {
  const dir = mkdtempSync(path.join(tmpdir(), 'austin-refresh-selftest-'));
  try {
    writeFileSync(
      path.join(dir, 'sources-pantries.json'),
      JSON.stringify([
        { url: 'https://example.com/a', what: 'Pantry A page', how_to_scrape: 'table' },
        { url: 'https://example.com/b', what: 'Pantry B page', how_to_scrape: 'list' },
      ])
    );
    writeFileSync(
      path.join(dir, 'sources-programs.json'),
      JSON.stringify([{ url: 'https://example.com/c', what: 'Program C page', how_to_scrape: 'list' }])
    );
    writeFileSync(path.join(dir, 'sources-events.json'), JSON.stringify([]));
    // sources-extra-*.json from a newer scraper agent: should be glob-picked-up, not hardcoded.
    writeFileSync(
      path.join(dir, 'sources-extra-church-directory.json'),
      JSON.stringify([{ url: 'https://example.com/d', what: 'Church directory page', how_to_scrape: 'table' }])
    );

    // pre-seed a hash for /a so it registers as "unchanged", and a stale one for /b so it registers as "changed"
    const prevHashes = {
      'https://example.com/a': { hash: hashText('Content A'), checked: '2020-01-01T00:00:00.000Z' },
      'https://example.com/b': { hash: hashText('OLD CONTENT B'), checked: '2020-01-01T00:00:00.000Z' },
    };
    writeFileSync(path.join(dir, HASHES_PATH_NAME), JSON.stringify(prevHashes));

    const fakeFetch = async (url) => {
      if (url === 'https://example.com/a') return { ok: true, status: 200, text: async () => 'Content A' };
      if (url === 'https://example.com/b') return { ok: true, status: 200, text: async () => 'NEW CONTENT B' };
      if (url === 'https://example.com/c') return { ok: false, status: 500, text: async () => '' };
      if (url === 'https://example.com/d') return { ok: true, status: 200, text: async () => 'Content D' };
      throw new Error('unexpected url ' + url);
    };

    const now = new Date('2026-06-01T00:00:00Z');
    const { changesMd, newHashes, changed, added, failed, unchanged } = await runRefresh(dir, { fetchImpl: fakeFetch, now });

    assert(unchanged.length === 1 && unchanged[0].url === 'https://example.com/a', `expected /a unchanged, got ${JSON.stringify(unchanged)}`);
    assert(changed.length === 1 && changed[0].url === 'https://example.com/b', `expected /b changed, got ${JSON.stringify(changed)}`);
    assert(failed.length === 1 && failed[0].url === 'https://example.com/c', `expected /c failed, got ${JSON.stringify(failed)}`);
    assert(added.length === 1 && added[0].url === 'https://example.com/d', `expected /d (from sources-extra-*.json) picked up as new, got ${JSON.stringify(added)}`);
    assert(changesMd.includes('example.com/b'), 'CHANGES.md text should mention changed url');
    assert(changesMd.includes('example.com/d'), 'CHANGES.md text should mention the source found via sources-extra-*.json glob');
    assert(newHashes['https://example.com/a'].hash === hashText('Content A'), 'hash for /a should be recomputed and match');
    assert(!newHashes['https://example.com/c'], 'no new hash stored for failed fetch without prior hash');

    console.log('refresh-austin-index selftest: PASS');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    selftest().catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
  } else {
    main().catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
  }
}
