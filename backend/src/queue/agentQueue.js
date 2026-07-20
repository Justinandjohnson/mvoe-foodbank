// BullMQ Queue Configuration for AI Agents
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import crypto from 'node:crypto';

// Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

// Create agent job queue
const agentQueue = new Queue('agent-tasks', { connection });

function createGuestAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

function buildAgentJobOptions(overrides = {}) {
  return {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    ...overrides,
  };
}

async function addAgentJob(name, data, options = {}) {
  const job = await agentQueue.add(name, data, buildAgentJobOptions(options));

  return {
    jobId: job.id,
    status: 'queued'
  };
}

/**
 * Add a meal planning agent job to the queue
 */
async function addMealPlannerJob(data) {
  return addAgentJob('meal-planner', data);
}

async function addGuestMealPlannerJob(data) {
  const accessToken = createGuestAccessToken();
  const guestJobId = `guest-meal-${crypto.randomUUID()}`;

  const job = await addAgentJob('meal-planner', {
    ...data,
    jobOwnerType: 'guest',
    guestAccessToken: accessToken,
  }, {
    jobId: guestJobId,
  });

  return {
    ...job,
    accessToken,
  };
}

async function addGrantWriterJob(data) {
  return addAgentJob('grant-writer', data);
}

async function addGuestGrantWriterJob(data) {
  const accessToken = createGuestAccessToken();
  const guestJobId = `guest-grant-${crypto.randomUUID()}`;

  const job = await addAgentJob('grant-writer', {
    ...data,
    jobOwnerType: 'guest',
    guestAccessToken: accessToken,
  }, {
    jobId: guestJobId,
  });

  return {
    ...job,
    accessToken,
  };
}

async function addFoodBankDirectorySyncJob(data) {
  return addAgentJob('food-bank-directory-sync', data);
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
    failedReason: job.failedReason,
    data: job.data,
  };
}

async function getGuestJobStatus(jobId, accessToken) {
  const job = await agentQueue.getJob(jobId);

  if (!job) {
    return { status: 'not_found' };
  }

  if (job.data?.jobOwnerType !== 'guest') {
    return { status: 'forbidden', failedReason: 'Job is not guest-accessible' };
  }

  if (!accessToken || accessToken !== job.data?.guestAccessToken) {
    return { status: 'forbidden', failedReason: 'Valid guest access token required' };
  }

  return getJobStatus(jobId);
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
  addAgentJob,
  addMealPlannerJob,
  addGuestMealPlannerJob,
  addGrantWriterJob,
  addGuestGrantWriterJob,
  addFoodBankDirectorySyncJob,
  getJobStatus,
  getGuestJobStatus,
  getActiveJobs,
  connection,
  createGuestAccessToken,
  buildAgentJobOptions,
};
