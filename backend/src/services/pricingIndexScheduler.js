import { getRedisClient } from '../utils/redis.js';
import pricingIndexService from './pricingIndexService.js';

const SCHEDULER_LOCK_KEY = 'pricing-index:scheduler:lock';
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;

let schedulerInterval = null;

async function withSchedulerLock(callback) {
  const redis = getRedisClient();
  const lockValue = `${Date.now()}`;
  const acquired = await redis.set(SCHEDULER_LOCK_KEY, lockValue, 'EX', 600, 'NX');

  if (acquired !== 'OK') {
    return null;
  }

  try {
    return await callback();
  } finally {
    const currentValue = await redis.get(SCHEDULER_LOCK_KEY);
    if (currentValue === lockValue) {
      await redis.del(SCHEDULER_LOCK_KEY);
    }
  }
}

async function refreshDueCatalogItems() {
  return withSchedulerLock(async () => {
    const dueItems = await pricingIndexService.getDueCatalogItems();
    if (dueItems.length === 0) {
      return 0;
    }

    await pricingIndexService.refreshStapleCatalog({
      trigger: 'scheduler',
      requestedBy: 'scheduler',
      forceFresh: true,
      items: dueItems,
    });

    return dueItems.length;
  });
}

export async function triggerPricingIndexSchedulerPass() {
  return refreshDueCatalogItems();
}

export function startPricingIndexScheduler() {
  if (schedulerInterval) {
    return schedulerInterval;
  }

  refreshDueCatalogItems().catch((error) => {
    console.error('Initial pricing index scheduler pass failed:', error.message);
  });

  schedulerInterval = setInterval(() => {
    refreshDueCatalogItems().catch((error) => {
      console.error('Periodic pricing index scheduler pass failed:', error.message);
    });
  }, SCHEDULER_INTERVAL_MS);

  return schedulerInterval;
}

export function stopPricingIndexScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export { SCHEDULER_INTERVAL_MS, SCHEDULER_LOCK_KEY };
