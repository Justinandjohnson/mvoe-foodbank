// AuthContext - Global authentication state management
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../api/services';
import { StorageService } from '../services/StorageService';

// Auth context
const AuthContext = createContext(null);

// Auth states
const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  REGISTER_START: 'REGISTER_START',
  REGISTER_SUCCESS: 'REGISTER_SUCCESS',
  REGISTER_FAILURE: 'REGISTER_FAILURE',
  RESTORE_SESSION: 'RESTORE_SESSION',
  UPDATE_USER: 'UPDATE_USER',
};

// Initial state
const initialState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Auth reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
    case AUTH_ACTIONS.REGISTER_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
    case AUTH_ACTIONS.REGISTER_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_FAILURE:
    case AUTH_ACTIONS.REGISTER_FAILURE:
      return {
        ...state,
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload.error,
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.RESTORE_SESSION:
      return {
        ...state,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload.user },
      };

    default:
      return state;
  }
}

// AuthProvider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Restore session on app start
  useEffect(() => {
    restoreSession();
  }, []);

  // Restore session from storage
  const restoreSession = async () => {
    try {
      const accessToken = await StorageService.getSecureItem('accessToken');
      const refreshToken = await StorageService.getSecureItem('refreshToken');
      const user = await StorageService.getItem('user');

      if (accessToken && refreshToken && user) {
        // Verify token is still valid
        try {
          const response = await authService.getCurrentUser(accessToken);
          dispatch({
            type: AUTH_ACTIONS.RESTORE_SESSION,
            payload: {
              user: response.data.user,
              accessToken,
              refreshToken,
            },
          });
        } catch (error) {
          // Token is invalid, try refresh
          try {
            const refreshResponse = await authService.refreshToken(refreshToken);
            dispatch({
              type: AUTH_ACTIONS.RESTORE_SESSION,
              payload: {
                user: JSON.parse(user),
                accessToken: refreshResponse.data.accessToken,
                refreshToken: refreshResponse.data.refreshToken,
              },
            });
          } catch (refreshError) {
            // Refresh failed, clear session
            await clearSession();
          }
        }
      } else {
        dispatch({ type: AUTH_ACTIONS.LOGOUT });
      }
    } catch (error) {
      console.error('Session restore error:', error);
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  // Login function
  const login = async (email, password) => {
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await authService.login({ email, password });
      const { user, accessToken, refreshToken } = response.data;

      // Store tokens securely
      await StorageService.setSecureItem('accessToken', accessToken);
      await StorageService.setSecureItem('refreshToken', refreshToken);
      await StorageService.setItem('user', JSON.stringify(user));

      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { user, accessToken, refreshToken },
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: { error: errorMessage },
      });
      return { success: false, error: errorMessage };
    }
  };

  // Register function
  const register = async (userData) => {
    dispatch({ type: AUTH_ACTIONS.REGISTER_START });

    try {
      const response = await authService.register(userData);
      const { user } = response.data;

      // Auto-login after successful registration
      const loginResult = await login(userData.email, userData.password);
      if (loginResult.success) {
        return { success: true };
      } else {
        return { success: false, error: 'Registration successful, but login failed' };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      dispatch({
        type: AUTH_ACTIONS.REGISTER_FAILURE,
        payload: { error: errorMessage },
      });
      return { success: false, error: errorMessage };
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const refreshToken = await StorageService.getSecureItem('refreshToken');
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }

    await clearSession();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  };

  // Clear session data
  const clearSession = async () => {
    await StorageService.removeItem('accessToken');
    await StorageService.removeItem('refreshToken');
    await StorageService.removeItem('user');
  };

  // Update user data
  const updateUser = (userData) => {
    dispatch({
      type: AUTH_ACTIONS.UPDATE_USER,
      payload: { user: userData },
    });
  };

  // Get fresh access token
  const getAccessToken = async () => {
    if (!state.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await authService.refreshToken(state.refreshToken);
      const { accessToken, refreshToken } = response.data;

      // Update stored tokens
      await StorageService.setSecureItem('accessToken', accessToken);
      await StorageService.setSecureItem('refreshToken', refreshToken);

      // Update state
      dispatch({
        type: AUTH_ACTIONS.RESTORE_SESSION,
        payload: {
          user: state.user,
          accessToken,
          refreshToken,
        },
      });

      return accessToken;
    } catch (error) {
      // Refresh failed, logout user
      await logout();
      throw error;
    }
  };

  // Check if user has specific role
  const hasRole = (role) => {
    return state.user?.userType === role;
  };

  // Check if user is staff member of organization
  const isStaffMember = (organizationId) => {
    // This would need to be implemented with organization member data
    // For now, return true if user is staff type
    return state.user?.userType === 'staff' || state.user?.userType === 'admin';
  };

  const value = {
    ...state,
    login,
    register,
    logout,
    updateUser,
    getAccessToken,
    hasRole,
    isStaffMember,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;