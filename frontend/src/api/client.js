// API Client - Axios instance with interceptors
import axios from 'axios';
import { config } from '../../config';
import { StorageService } from '../services/StorageService';

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
    if (error.response?.status === 401) {
      // Token expired, try to refresh
      const refreshToken = await StorageService.getSecureItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post(`${config.apiUrl}/api/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data.data;
          await StorageService.setSecureItem('accessToken', accessToken);

          // Retry original request
          error.config.headers.Authorization = `Bearer ${accessToken}`;
          return axios(error.config);
        } catch (refreshError) {
          // Refresh failed, logout user
          await StorageService.removeSecureItem('accessToken');
          await StorageService.removeSecureItem('refreshToken');
          await StorageService.removeItem('user');
          // Navigate to login (handled by navigation context)
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
