#!/usr/bin/env node
// Rebuilds normalized availability rows for existing directory entries.
//
// Safe defaults:
//   node scripts/backfill-food-availability.mjs                  # dry run
//   node scripts/backfill-food-availability.mjs --apply          # write changes
//   node scripts/backfill-food-availability.mjs --batch-size 100
//   node scripts/backfill-food-availability.mjs --after <entry-id>
//
// The last completed entry id is printed after each batch. Pass it to --after to
// resume. Each entry is updated in its own transaction, and replacing child rows
// makes retries idempotent. Unknown schedules always project to zero windows.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAvailabilityWindows,
  inferVenueType,
} from '../src/services/foodBankDirectoryService.js';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1000;
const DEFAULT_TIMEZONE = 'America/Chicago';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstPresent(...values) {
  return values.find((value) => value != null && value !== '') ?? null;
}

export function buildBackfillProjection(entry, { defaultTimezone = DEFAULT_TIMEZONE } = {}) {
  const metadata = asObject(entry?.metadata);
  const regionConfig = asObject(entry?.region?.config);
  const category = inferVenueType({
    venueType: firstPresent(
      metadata.venueType,
      metadata.resourceType,
      metadata.category,
      entry?.venueType
    ),
    canonicalName: entry?.canonicalName,
    description: entry?.description,
    eligibilityNotes: entry?.eligibilityNotes,
    extractionReason: firstPresent(metadata.extractionReason, metadata.type, metadata.serviceType),
  });
  const timezone = firstPresent(
    metadata.timezone,
    metadata.timeZone,
    regionConfig.timezone,
    defaultTimezone
  );
  const scheduleSources = [
    ['hours', entry?.hours],
    ['metadata.availability', metadata.availability],
    ['metadata.hours', metadata.hours],
    ['metadata.schedule', metadata.schedule],
  ];

  for (const [scheduleSource, rawSchedule] of scheduleSources) {
    if (rawSchedule == null || rawSchedule === '') continue;
    const windows = buildAvailabilityWindows(rawSchedule, { category, timezone });
    if (windows.length > 0) {
      return { category, timezone, scheduleSource, windows };
    }
  }

  return {
    category,
    timezone,
    scheduleSource: null,
    windows: [],
  };
}

export function parseBackfillArgs(args = []) {
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    return value;
  };
  const rawBatchSize = valueAfter('--batch-size');
  const batchSize = rawBatchSize == null ? DEFAULT_BATCH_SIZE : Number(rawBatchSize);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be an integer from 1 to ${MAX_BATCH_SIZE}`);
  }

  return {
    apply: args.includes('--apply'),
    batchSize,
    after: valueAfter('--after'),
  };
}

async function applyProjection(prisma, entry, projection) {
  await prisma.$transaction(async (tx) => {
    await tx.foodBankDirectoryEntry.update({
      where: { id: entry.id },
      data: { venueType: projection.category },
    });
    await tx.foodBankAvailabilityWindow.deleteMany({
      where: { entryId: entry.id },
    });
    if (projection.windows.length > 0) {
      await tx.foodBankAvailabilityWindow.createMany({
        data: projection.windows.map((window) => ({
          ...window,
          entryId: entry.id,
        })),
      });
    }
  });
}

export async function runBackfill(prisma, options) {
  let cursor = options.after || null;
  let scanned = 0;
  let withWindows = 0;
  let withoutWindows = 0;

  for (;;) {
    const entries = await prisma.foodBankDirectoryEntry.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        id: true,
        venueType: true,
        canonicalName: true,
        description: true,
        eligibilityNotes: true,
        hours: true,
        metadata: true,
        region: { select: { config: true } },
      },
    });
    if (entries.length === 0) break;

    for (const entry of entries) {
      const projection = buildBackfillProjection(entry);
      if (projection.windows.length > 0) withWindows += 1;
      else withoutWindows += 1;

      try {
        if (options.apply) {
          await applyProjection(prisma, entry, projection);
        }
      } catch (error) {
        console.error(JSON.stringify({
          failedEntryId: entry.id,
          resumeAfter: cursor,
          message: error.message,
        }));
        throw error;
      }
      cursor = entry.id;
      scanned += 1;
    }

    console.log(JSON.stringify({
      mode: options.apply ? 'apply' : 'dry-run',
      scanned,
      withWindows,
      withoutWindows,
      resumeAfter: cursor,
    }));
  }

  return { scanned, withWindows, withoutWindows, resumeAfter: cursor };
}

async function main() {
  const options = parseBackfillArgs(process.argv.slice(2));
  const { getPrismaClient } = await import('../src/utils/database.js');
  const prisma = getPrismaClient();

  console.log(`food availability backfill: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  if (!options.apply) {
    console.log('No rows will be changed. Pass --apply to write.');
  }

  try {
    const result = await runBackfill(prisma, options);
    console.log(`food availability backfill complete: ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
