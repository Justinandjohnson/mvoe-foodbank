// BullMQ Queue Configuration for AI Agents
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

// Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

// Create agent job queue
const agentQueue = new Queue('agent-tasks', { connection });

/**
 * Add a meal planning agent job to the queue
 */
async function addMealPlannerJob(data) {
  const job = await agentQueue.add('meal-planner', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });

  return {
    jobId: job.id,
    status: 'queued'
  };
}

/**
 * Get job status and result
 */
async function getJobStatus(jobId) {
  const job = await agentQueue.getJob(jobId);

  if (!job) {
    return { status: 'not_found' };
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    jobId: job.id,
    status: state,
    progress,
    result: job.returnvalue,
    failedReason: job.failedReason
  };
}

/**
 * Get all active jobs
 */
async function getActiveJobs() {
  const jobs = await agentQueue.getJobs(['active', 'waiting']);
  return jobs.map(job => ({
    jobId: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress
  }));
}

export {
  agentQueue,
  addMealPlannerJob,
  getJobStatus,
  getActiveJobs,
  connection
};
