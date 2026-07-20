// AI Agent Service — all LLM calls proxied through backend (keys never exposed client-side)
import apiClient from './client';
import { config } from '../../config';

const agentRequest = (method, url, options = {}) =>
  apiClient.request({
    method,
    url,
    baseURL: config.agentApiUrl,
    ...options,
  });

export const getAgentJobStatus = (jobId) =>
  apiClient.get(`/api/agents/status/${jobId}`);

export const startGrantWriterAgent = (request) =>
  apiClient.post('/api/agents/grant-writer/start', { request });

export const startGuestGrantWriterAgent = (request) =>
  apiClient.post('/api/agents/grant-writer/guest/start', { request });

export const getGuestGrantWriterJobStatus = (jobId, accessToken) =>
  apiClient.get(`/api/agents/grant-writer/guest/status/${jobId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

export const searchGrantWriterOpportunities = (request) =>
  apiClient.post('/api/agents/grant-writer/start', { request: { ...request, mode: 'search' } });

export const searchGuestGrantWriterOpportunities = (request) =>
  apiClient.post('/api/agents/grant-writer/guest/start', { request: { ...request, mode: 'search' } });

export const prepareGrantWriterApplication = (request) =>
  apiClient.post('/api/agents/grant-writer/start', { request: { ...request, mode: 'prepare-application' } });

export const prepareGuestGrantWriterApplication = (request) =>
  apiClient.post('/api/agents/grant-writer/guest/start', { request: { ...request, mode: 'prepare-application' } });

export const getGrantWriterIndexStatus = () =>
  apiClient.get('/api/agents/grant-writer/index-status');

export const refreshGrantWriterIndex = () =>
  apiClient.post('/api/agents/grant-writer/index-refresh');

export const listGrantWriterWorkspaces = () =>
  apiClient.get('/api/agents/grant-writer/workspaces');

export const createGrantWriterWorkspace = (data = {}) =>
  apiClient.post('/api/agents/grant-writer/workspaces', data);

export const getGrantWriterWorkspace = (workspaceId) =>
  apiClient.get(`/api/agents/grant-writer/workspaces/${workspaceId}`);

export const updateGrantWriterWorkspace = (workspaceId, data = {}) =>
  apiClient.patch(`/api/agents/grant-writer/workspaces/${workspaceId}`, data);

export const sendGrantWriterWorkspaceMessage = (workspaceId, data = {}) =>
  apiClient.post(`/api/agents/grant-writer/workspaces/${workspaceId}/messages`, data);

export const selectGrantWriterOpportunity = (workspaceId, opportunity) =>
  apiClient.post(`/api/agents/grant-writer/workspaces/${workspaceId}/select-opportunity`, { opportunity });

export const reviewGrantWriterDraft = (workspaceId, draftId, data = {}) =>
  apiClient.post(`/api/agents/grant-writer/workspaces/${workspaceId}/drafts/${draftId}/review`, data);

export const updateGrantWriterDraft = (workspaceId, draftId, data = {}) =>
  apiClient.patch(`/api/agents/grant-writer/workspaces/${workspaceId}/drafts/${draftId}`, data);

export const getGrantWriterDriveStatus = (workspaceId) =>
  apiClient.get(`/api/agents/grant-writer/workspaces/${workspaceId}/drive/status`);

export const connectGrantWriterDrive = (workspaceId) =>
  apiClient.post(`/api/agents/grant-writer/workspaces/${workspaceId}/drive/connect`);

export const syncGrantWriterDraftToDrive = (workspaceId, draftId) =>
  apiClient.post(`/api/agents/grant-writer/workspaces/${workspaceId}/drafts/${draftId}/drive/sync`);

export const getActiveAgentJobs = () => apiClient.get('/api/agents/active');
export const getAgentActivity = (limit = 50) => apiClient.get('/api/agents/activity', { params: { limit } });

export const testUSDAConnection = () => apiClient.get('/api/agents/test/usda');

// Volunteer-coordination agent routes (Python backend)
export const getVolunteerSummary = () => agentRequest('get', '/agent/volunteer-summary');
export const draftReminders = (eventId) => agentRequest('post', `/events/${eventId}/reminders/draft`);
export const getApprovals = () => agentRequest('get', '/agent/approvals');
export const decideApproval = (approvalId, approved) =>
  agentRequest('post', `/agent/approvals/${approvalId}/decide`, { data: { approved } });
export const getVolunteerAgentActivity = () => agentRequest('get', '/agent/activity');
export const sendVolunteerChatMessage = (message) =>
  agentRequest('post', '/agent/chat', { data: { message } });
export const listVolunteers = (params = {}) => agentRequest('get', '/volunteers', { params });
export const createVolunteer = (data) => agentRequest('post', '/volunteers', { data });
export const updateVolunteer = (volunteerId, data) =>
  agentRequest('patch', `/volunteers/${volunteerId}`, { data });
export const deleteVolunteer = (volunteerId) => agentRequest('delete', `/volunteers/${volunteerId}`);
export const sendVolunteerSms = (volunteerId, message) =>
  agentRequest('post', `/volunteers/${volunteerId}/sms`, { data: { message } });
export const broadcastVolunteerSms = (message) =>
  agentRequest('post', '/volunteers/broadcast', { data: { message } });
export const listVolunteerTags = () => agentRequest('get', '/volunteers/tags');
export const assignVolunteerTags = (data) => agentRequest('post', '/volunteers/tags/assign', { data });
export const assignVolunteerGroup = (data) => agentRequest('post', '/volunteers/groups/assign', { data });
export const broadcastVolunteerSmsByTag = (message, tags = [], matchMode = 'any') =>
  agentRequest('post', '/volunteers/broadcast/by-tag', {
    data: { message, tags, match_mode: matchMode },
  });
export const getVolunteerSignupShare = () => agentRequest('get', '/volunteers/signup-share');

// Returns the SSE URL for Maria's conversational agent chat (connect via EventSource, not fetch)
export const getAgentChatUrl = () => {
  const base = config.agentApiUrl;
  return `${base}/agent/chat`;
};

// Legacy stubs — kept so old imports don't break during the transition
export const callGLMAgent = async () => {
  throw new Error('Direct client-side LLM calls are disabled. Use the backend meal planner agent.');
};

export const searchWithPerplexity = async () => {
  throw new Error('Direct client-side search calls are disabled. Use a backend agent route instead.');
};
