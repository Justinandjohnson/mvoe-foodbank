// AI Agent Service - Handles meal planning agent interactions
import apiClient from './client';

/**
 * Start a meal planning agent job
 */
export const startMealPlannerAgent = async (request) => {
  try {
    const response = await apiClient.post('/agents/meal-planner/start', {
      request
    });
    return response.data;
  } catch (error) {
    console.error('Error starting meal planner:', error);
    throw error;
  }
};

/**
 * Get agent job status
 */
export const getAgentJobStatus = async (jobId) => {
  try {
    const response = await apiClient.get(`/agents/status/${jobId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting job status:', error);
    throw error;
  }
};

/**
 * Get all active agent jobs
 */
export const getActiveAgentJobs = async () => {
  try {
    const response = await apiClient.get('/agents/active');
    return response.data;
  } catch (error) {
    console.error('Error getting active jobs:', error);
    throw error;
  }
};

/**
 * Test USDA API connection
 */
export const testUSDAConnection = async () => {
  try {
    const response = await apiClient.get('/agents/test/usda');
    return response.data;
  } catch (error) {
    console.error('Error testing USDA connection:', error);
    throw error;
  }
};
