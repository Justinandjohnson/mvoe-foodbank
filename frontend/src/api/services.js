// API Services - All API endpoint functions
import apiClient from './client';

// Authentication
export const authService = {
  register: (data) => apiClient.post('/api/auth/signup', data),
  login: (credentials) => apiClient.post('/api/auth/login', credentials),
  logout: (refreshToken) => apiClient.post('/api/auth/logout', { refreshToken }),
  refreshToken: (refreshToken) => apiClient.post('/api/auth/refresh', { refreshToken }),
  getCurrentUser: (token) => apiClient.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }),
  changePassword: (data) => apiClient.post('/api/auth/change-password', data),
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
};

// User
export const userService = {
  getProfile: () => apiClient.get('/api/user/profile'),
  updateProfile: (data) => apiClient.put('/api/user/profile', data),
  getDonations: (params) => apiClient.get('/api/user/donations', { params }),
  getStats: () => apiClient.get('/api/user/stats'),
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
  joinEvent: (eventId) => apiClient.post(`/api/community-events/${eventId}/volunteers`),
  leaveEvent: (eventId) => apiClient.delete(`/api/community-events/${eventId}/volunteers`),
  getEventVolunteers: (eventId) => apiClient.get(`/api/community-events/${eventId}/volunteers`),

  // Resources
  addResource: (eventId, data) => apiClient.post(`/api/community-events/${eventId}/resources`, data),
  getEventResources: (eventId) => apiClient.get(`/api/community-events/${eventId}/resources`),
  updateResource: (eventId, resourceId, data) => apiClient.put(`/api/community-events/${eventId}/resources/${resourceId}`, data),
  deleteResource: (eventId, resourceId) => apiClient.delete(`/api/community-events/${eventId}/resources/${resourceId}`),
};
