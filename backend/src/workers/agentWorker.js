// BullMQ Worker for processing agent jobs
import { Worker } from 'bullmq';
import { connection } from '../queue/agentQueue.js';
import MealPlannerAgent from '../agents/mealPlannerAgent.js';
import PriceResearchAgent from '../agents/priceResearchAgent.js';
import ReceiptProcessingAgent from '../agents/receiptProcessingAgent.js';
import ContentCreationAgent from '../agents/contentCreationAgent.js';

let agentWorker = null;

/**
 * Start the agent worker
 */
function startAgentWorker(socketIo) {
  if (agentWorker) {
    console.log('Agent worker already running');
    return agentWorker;
  }

  console.log('Starting agent worker...');

  // Initialize all agents
  const mealPlannerAgent = new MealPlannerAgent(socketIo);
  const priceResearchAgent = new PriceResearchAgent(socketIo);
  const receiptProcessingAgent = new ReceiptProcessingAgent(socketIo);
  const contentCreationAgent = new ContentCreationAgent(socketIo);

  agentWorker = new Worker(
    'agent-tasks',
    async (job) => {
      console.log(`Processing job ${job.id}: ${job.name}`);

      try {
        switch (job.name) {
          case 'meal-planner':
            return await mealPlannerAgent.execute(job.data);

          case 'price-research':
            return await priceResearchAgent.execute(job.data);

          case 'receipt-processing':
            return await receiptProcessingAgent.execute(job.data);

          case 'content-creation':
            return await contentCreationAgent.execute(job.data);

          default:
            throw new Error(`Unknown agent type: ${job.name}`);
        }
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 jobs concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000 // per minute
      }
    }
  );

  agentWorker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  agentWorker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  agentWorker.on('error', (err) => {
    console.error('Agent worker error:', err);
  });

  console.log('Agent worker started successfully');
  return agentWorker;
}

/**
 * Stop the agent worker
 */
async function stopAgentWorker() {
  if (agentWorker) {
    console.log('Stopping agent worker...');
    await agentWorker.close();
    agentWorker = null;
    console.log('Agent worker stopped');
  }
}

export {
  startAgentWorker,
  stopAgentWorker
};
