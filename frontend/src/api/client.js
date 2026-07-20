// API Client - Axios instance with interceptors
import axios from 'axios';
import { config } from '../../config';
import { StorageService } from '../services/StorageService';
import { SessionService } from '../services/SessionService';

const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/signup', '/api/auth/refresh', '/api/auth/google'];

let isRefreshing = false;
let pendingRequests = [];

const isAuthFailureStatus = (status) => status === 400 || status === 401 || status === 403;

const processPendingRequests = (error, accessToken) => {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
      return;
    }

    resolve(accessToken);
  });
  pendingRequests = [];
};

const clearStoredAuth = async () => {
  await Promise.all([
    StorageService.removeSecureItem('accessToken'),
    StorageService.removeSecureItem('refreshToken'),
    StorageService.removeItem('user'),
  ]);
};

const shouldSkipAuthRefresh = (requestConfig = {}) => {
  if (requestConfig.skipAuthRefresh) return true;
  const url = requestConfig.url || '';
  return AUTH_ENDPOINTS.some((path) => url.includes(path));
};

// Create axios instance
const apiClient = axios.create({
  baseURL: config.apiUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  async (config) => {
    const sessionId = await SessionService.ensureSessionId();
    if (sessionId) {
      config.headers['x-mvoe-session-id'] = sessionId;
    }

    const token = await StorageService.getSecureItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry && !shouldSkipAuthRefresh(originalRequest)) {
      const refreshToken = await StorageService.getSecureItem('refreshToken');
      if (!refreshToken) {
        if (isAuthFailureStatus(status)) {
          await clearStoredAuth();
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then((accessToken) => {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          originalRequest._retry = true;
          return apiClient.request(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const sessionId = await SessionService.ensureSessionId();
        const refreshResponse = await axios.post(
          `${config.apiUrl}/api/auth/refresh`,
          { refreshToken },
          {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              'x-mvoe-session-id': sessionId,
            },
          },
        );

        const refreshedTokens = refreshResponse?.data?.data || {};
        const nextAccessToken = refreshedTokens.accessToken;
        const nextRefreshToken = refreshedTokens.refreshToken || refreshToken;

        if (!nextAccessToken) {
          throw new Error('Refresh response did not include a new access token');
        }

        await StorageService.setSecureItem('accessToken', nextAccessToken);
        if (nextRefreshToken && nextRefreshToken !== refreshToken) {
          await StorageService.setSecureItem('refreshToken', nextRefreshToken);
        }

        processPendingRequests(null, nextAccessToken);

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return apiClient.request(originalRequest);
      } catch (refreshError) {
        processPendingRequests(refreshError, null);
        const refreshStatus = refreshError?.response?.status;
        if (isAuthFailureStatus(refreshStatus)) {
          await clearStoredAuth();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Log API errors for debugging
    console.error('[API Client] Request failed:', {
      url: originalRequest?.url,
      method: originalRequest?.method,
      status,
      message: error.message,
      data: error.response?.data,
    });

    return Promise.reject(error);
  }
);

export default apiClient;
