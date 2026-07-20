import { config } from '../config/index.js';
import { getRedisClient } from '../utils/redis.js';
import foodBankDirectoryService from './foodBankDirectoryService.js';
import { addFoodBankDirectorySyncJob } from '../queue/agentQueue.js';

const SCHEDULER_LOCK_KEY = 'food-bank-directory:scheduler:lock';
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;

let schedulerInterval = null;

async function withSchedulerLock(callback) {
  const redis = getRedisClient();
  const lockValue = `${Date.now()}`;
  const acquired = await redis.set(SCHEDULER_LOCK_KEY, lockValue, 'EX', 300, 'NX');
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

async function queueDueRegionRuns() {
  return withSchedulerLock(async () => {
    await foodBankDirectoryService.syncRegionsFromConfig();
    const dueRegions = await foodBankDirectoryService.getDueRegions();

    for (const region of dueRegions) {
      const run = await foodBankDirectoryService.createScheduledRun(region.id);
      const sessionId = `food-bank-directory-${region.id}-${Date.now()}`;
      const job = await addFoodBankDirectorySyncJob({
        runId: run.id,
        regionId: region.id,
        sessionId,
        initiatedBy: 'scheduler',
      });

      await foodBankDirectoryService.attachJobToRun(run.id, job.jobId);
      await foodBankDirectoryService.markRegionQueued(region.id);
    }

    return dueRegions.length;
  });
}

export async function triggerFoodBankDirectorySchedulerPass() {
  return queueDueRegionRuns();
}

export function startFoodBankDirectoryScheduler() {
  if (schedulerInterval) {
    return schedulerInterval;
  }

  queueDueRegionRuns().catch((error) => {
    console.error('Initial food bank directory scheduler pass failed:', error.message);
  });

  schedulerInterval = setInterval(() => {
    queueDueRegionRuns().catch((error) => {
      console.error('Periodic food bank directory scheduler pass failed:', error.message);
    });
  }, SCHEDULER_INTERVAL_MS);

  return schedulerInterval;
}

export function stopFoodBankDirectoryScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export { SCHEDULER_INTERVAL_MS, SCHEDULER_LOCK_KEY };
