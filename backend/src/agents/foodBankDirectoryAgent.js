import { recordAgentActivity } from '../services/agentActivityService.js';
import foodBankDirectoryService from '../services/foodBankDirectoryService.js';

export default class FoodBankDirectoryAgent {
  constructor(io) {
    this.io = io;
  }

  emitProgress(sessionId, userId, message) {
    const payload = {
      sessionId,
      userId,
      agentType: 'food-bank-directory',
      message,
      timestamp: new Date().toISOString(),
    };

    this.io?.to(sessionId).emit('agent:progress', payload);
    this.io?.emit('agent:progress', payload);

    recordAgentActivity({
      userId,
      action: 'AGENT_PROGRESS',
      entityType: 'agent_job',
      entityId: sessionId,
      details: {
        agentType: 'food-bank-directory',
        message,
      },
    });
  }

  async execute(jobData) {
    const sessionId = jobData.sessionId || `food-bank-directory-${Date.now()}`;
    const userId = jobData.userId || null;

    const result = await foodBankDirectoryService.runSync({
      regionId: jobData.regionId,
      runId: jobData.runId || null,
      onProgress: async (message) => {
        this.emitProgress(sessionId, userId, message);
      },
    });

    const payload = {
      sessionId,
      userId,
      agentType: 'food-bank-directory',
      result,
      timestamp: new Date().toISOString(),
    };

    this.io?.to(sessionId).emit('agent:complete', payload);
    this.io?.emit('agent:complete', payload);

    await recordAgentActivity({
      userId,
      action: 'AGENT_JOB_COMPLETED',
      entityType: 'agent_job',
      entityId: sessionId,
      details: {
        agentType: 'food-bank-directory',
        result,
      },
    });

    return result;
  }
}
