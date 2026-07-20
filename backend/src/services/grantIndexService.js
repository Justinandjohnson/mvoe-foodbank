import { CacheService } from '../utils/redis.js';
import { GRANT_WRITER_EXAMPLES, GRANT_WRITER_SOURCES } from '../data/grantWriterKnowledge.js';

const GRANT_INDEX_CACHE_KEY = 'grant-writer:index-snapshot';
const GRANT_INDEX_TTL_SECONDS = 60 * 60 * 24;
const GRANT_INDEX_REFRESH_MS = 1000 * 60 * 60 * 6;

let refreshInterval = null;
let testSnapshot = null;

function getCache() {
  return new CacheService();
}

function extractSummary(html = '') {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

export async function fetchGrantSourceSnapshot(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'MVOE-Grant-Indexer/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return {
        ...source,
        status: 'error',
        summary: `Failed to fetch (${response.status})`,
      };
    }

    const html = await response.text();
    return {
      ...source,
      status: 'indexed',
      summary: extractSummary(html),
    };
  } catch (error) {
    return {
      ...source,
      status: 'error',
      summary: error.message,
    };
  }
}

export async function buildGrantIndexSnapshot() {
  const sources = await Promise.all(GRANT_WRITER_SOURCES.map(fetchGrantSourceSnapshot));
  return {
    refreshedAt: new Date().toISOString(),
    sourceCount: sources.length,
    sources,
    examples: GRANT_WRITER_EXAMPLES,
  };
}

export async function refreshGrantIndex() {
  const snapshot = await buildGrantIndexSnapshot();
  if (process.env.NODE_ENV === 'test') {
    testSnapshot = snapshot;
    return snapshot;
  }
  await getCache().set(GRANT_INDEX_CACHE_KEY, snapshot, GRANT_INDEX_TTL_SECONDS);
  return snapshot;
}

export async function getGrantIndexSnapshot() {
  if (process.env.NODE_ENV === 'test' && testSnapshot) {
    return testSnapshot;
  }

  const cached = await getCache().get(GRANT_INDEX_CACHE_KEY);
  if (cached) {
    return cached;
  }

  return refreshGrantIndex();
}

export function startGrantIndexScheduler() {
  if (refreshInterval) {
    return refreshInterval;
  }

  refreshGrantIndex().catch((error) => {
    console.error('Initial grant index refresh failed:', error.message);
  });

  refreshInterval = setInterval(() => {
    refreshGrantIndex().catch((error) => {
      console.error('Periodic grant index refresh failed:', error.message);
    });
  }, GRANT_INDEX_REFRESH_MS);

  return refreshInterval;
}

export function stopGrantIndexScheduler() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export { GRANT_INDEX_CACHE_KEY, GRANT_INDEX_TTL_SECONDS, GRANT_INDEX_REFRESH_MS };
