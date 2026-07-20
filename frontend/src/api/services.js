// API Services - All API endpoint functions
import apiClient from './client';
import { config } from '../../config';

const agentApiRequest = (method, url, options = {}) =>
  apiClient.request({
    method,
    url,
    baseURL: config.agentApiUrl,
    ...options,
  });

// Authentication — Node backend uses email/password + JWT
export const authService = {
  register: (data) => apiClient.post('/api/auth/signup', data),
  login: (data) => apiClient.post('/api/auth/login', data),
  googleLogin: (data) => apiClient.post('/api/auth/google', data),
  refresh: (refreshToken) => apiClient.post('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken) => apiClient.post('/api/auth/logout', { refreshToken }),
  me: () => apiClient.get('/api/auth/me'),

  // Legacy OTP methods kept as explicit unsupported calls
  sendOtp: () => Promise.reject(new Error('Email/password auth is the supported flow')),
  verifyOtp: () => Promise.reject(new Error('Email/password auth is the supported flow')),
};

// Organizations
export const organizationService = {
  getAll: (params) => apiClient.get('/api/organizations', { params }),
  getById: (id) => apiClient.get(`/api/organizations/${id}`),
  getStats: (id) => apiClient.get(`/api/organizations/${id}/stats`),
};

// Donations
export const donationService = {
  create: (data) => apiClient.post('/api/donations', data),
  getAll: (params) => apiClient.get('/api/donations', { params }),
  getById: (id) => apiClient.get(`/api/donations/${id}`),
  getStats: () => apiClient.get('/api/donations/stats/overall'),
};

// Ledger (Transparency)
export const ledgerService = {
  getPublic: (params) => apiClient.get('/api/ledger/public', { params }),
  getById: (id) => apiClient.get(`/api/ledger/${id}`),
  getBalance: (orgId) => apiClient.get(`/api/ledger/balance/${orgId}`),
  getSpending: (orgId) => apiClient.get(`/api/ledger/spending/${orgId}`),
};

// Food Banks (Phase 2)
export const foodBankService = {
  getAll: (params) => apiClient.get('/api/food-banks', { params }),
  getNearby: (params) => apiClient.get('/api/food-banks/nearby', { params }),
  getById: (id) => apiClient.get(`/api/food-banks/${id}`),
  getStatus: (id) => apiClient.get(`/api/food-banks/${id}/status`),
  updateStatus: (id, data) => apiClient.put(`/api/food-banks/${id}/status`, data),
  getHoursReviewQueue: () => apiClient.get('/api/food-banks/hours-review-queue'),
  verifyHours: (id, data) => apiClient.post(`/api/food-banks/${id}/verify-hours`, data),
};

// User
export const userService = {
  getProfile: () => apiClient.get('/api/user/profile'),
  updateProfile: (data) => apiClient.put('/api/user/profile', data),
  getDonations: (params) => apiClient.get('/api/user/donations', { params }),
  getStats: () => apiClient.get('/api/user/stats'),
};

// Volunteers
export const volunteerService = {
  getAll: (params) => agentApiRequest('get', '/volunteers', { params }),
  create: (data) => agentApiRequest('post', '/volunteers', { data }),
  update: (id, data) => agentApiRequest('patch', `/volunteers/${id}`, { data }),
  delete: (id) => agentApiRequest('delete', `/volunteers/${id}`),
  sendSms: (id, message) => agentApiRequest('post', `/volunteers/${id}/sms`, { data: { message } }),
  broadcast: (message) => agentApiRequest('post', '/volunteers/broadcast', { data: { message } }),
};

// Community Events (Phase 3B)
export const communityService = {
  // Events
  createEvent: (data) => apiClient.post('/api/community-events/create', data),
  getEvents: (params) => apiClient.get('/api/community-events', { params }),
  getEventById: (id) => apiClient.get(`/api/community-events/${id}`),
  updateEvent: (id, data) => apiClient.put(`/api/community-events/${id}`, data),
  deleteEvent: (id) => apiClient.delete(`/api/community-events/${id}`),

  // Volunteers
  joinEvent: (eventId, data) => apiClient.post(`/api/community-events/${eventId}/volunteers`, data),
  leaveEvent: (eventId) => apiClient.delete(`/api/community-events/${eventId}/volunteers`),
  getEventVolunteers: (eventId) => apiClient.get(`/api/community-events/${eventId}/volunteers`),

  // Resources
  addResource: (eventId, data) => apiClient.post(`/api/community-events/${eventId}/resources`, data),
  getEventResources: (eventId) => apiClient.get(`/api/community-events/${eventId}/resources`),
  updateResource: (eventId, resourceId, data) => apiClient.put(`/api/community-events/${eventId}/resources/${resourceId}`, data),
  deleteResource: (eventId, resourceId) => apiClient.delete(`/api/community-events/${eventId}/resources/${resourceId}`),
};

export const mapService = {
  getLiveFeed: (params) => apiClient.get('/api/map/live', { params }),
};

export const foodBeaconService = {
  getAll: () => apiClient.get('/api/food-beacons'),
  getMine: () => apiClient.get('/api/food-beacons/me'),
  upsertMine: (data) => apiClient.put('/api/food-beacons/me', data),
  toggleMine: (isActive) => apiClient.post('/api/food-beacons/me/toggle', { isActive }),
  deleteMine: () => apiClient.delete('/api/food-beacons/me'),
};

export const foodBankDirectoryService = {
  getStatus: () => apiClient.get('/api/food-bank-directory/status'),
  getRegions: () => apiClient.get('/api/food-bank-directory/regions'),
  createRegion: (data) => apiClient.post('/api/food-bank-directory/regions', data),
  getRuns: (params) => apiClient.get('/api/food-bank-directory/runs', { params }),
  startRun: (data) => apiClient.post('/api/food-bank-directory/runs/start', data),
  triggerScheduler: () => apiClient.post('/api/food-bank-directory/scheduler/trigger'),
  getEntries: (params) => apiClient.get('/api/food-bank-directory/entries', { params }),
  getReviewQueue: (params) => apiClient.get('/api/food-bank-directory/review-queue', { params }),
  approveChange: (id, data = {}) => apiClient.post(`/api/food-bank-directory/review/${id}/approve`, data),
  rejectChange: (id, data = {}) => apiClient.post(`/api/food-bank-directory/review/${id}/reject`, data),
};
