import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../api/services';
import { SessionService } from '../services/SessionService';
import { StorageService } from '../services/StorageService';

const AuthContext = createContext(null);

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

const getErrorMessage = (error, fallback = 'Request failed. Please try again.') =>
  error?.response?.data?.error?.message ||
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  fallback;

const isAuthFailure = (error) => {
  const status = error?.response?.status;
  return status === 400 || status === 401 || status === 403;
};

const parseStoredUser = (serialized) => {
  if (!serialized) return null;

  try {
    return JSON.parse(serialized);
  } catch (_error) {
    return null;
  }
};

async function persistAuthSession({ user, accessToken, refreshToken }) {
  const operations = [];
  if (accessToken) operations.push(StorageService.setSecureItem(ACCESS_TOKEN_KEY, accessToken));
  if (refreshToken) operations.push(StorageService.setSecureItem(REFRESH_TOKEN_KEY, refreshToken));
  if (user) operations.push(StorageService.setItem(USER_KEY, JSON.stringify(user)));
  await Promise.all(operations);
}

async function clearAuthSessionStorage() {
  await Promise.all([
    StorageService.removeSecureItem(ACCESS_TOKEN_KEY),
    StorageService.removeSecureItem(REFRESH_TOKEN_KEY),
    StorageService.removeItem(USER_KEY),
  ]);
}

async function fetchCurrentUser() {
  const meResponse = await authService.me();
  return meResponse?.data?.user || null;
}

export function AuthProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const restoreSession = async () => {
    const [storedAccessToken, storedRefreshToken, storedUserRaw] = await Promise.all([
      StorageService.getSecureItem(ACCESS_TOKEN_KEY),
      StorageService.getSecureItem(REFRESH_TOKEN_KEY),
      StorageService.getItem(USER_KEY),
    ]);

    const fallbackUser = parseStoredUser(storedUserRaw);

    if (!storedAccessToken && !storedRefreshToken) {
      return { user: null };
    }

    try {
      const currentUser = await fetchCurrentUser();
      if (currentUser) {
        await StorageService.setItem(USER_KEY, JSON.stringify(currentUser));
      }
      return { user: currentUser || fallbackUser };
    } catch (meError) {
      if (!storedRefreshToken) {
        if (isAuthFailure(meError)) {
          await clearAuthSessionStorage();
          return { user: null };
        }
        return { user: fallbackUser };
      }
    }

    try {
      const refreshResponse = await authService.refresh(storedRefreshToken);
      const refreshedTokens = refreshResponse?.data || {};
      if (!refreshedTokens.accessToken) {
        throw new Error('Failed to refresh session');
      }

      await StorageService.setSecureItem(ACCESS_TOKEN_KEY, refreshedTokens.accessToken);
      if (refreshedTokens.refreshToken) {
        await StorageService.setSecureItem(REFRESH_TOKEN_KEY, refreshedTokens.refreshToken);
      }
      if (refreshedTokens.user) {
        await StorageService.setItem(USER_KEY, JSON.stringify(refreshedTokens.user));
      }

      let currentUser = null;
      try {
        currentUser = await fetchCurrentUser();
      } catch (_fetchUserError) {
        currentUser = refreshedTokens.user || fallbackUser;
      }
      if (currentUser) {
        await StorageService.setItem(USER_KEY, JSON.stringify(currentUser));
      }

      return { user: currentUser || fallbackUser };
    } catch (refreshError) {
      if (isAuthFailure(refreshError)) {
        await clearAuthSessionStorage();
        return { user: null };
      }
      return { user: fallbackUser };
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const nextSessionId = await SessionService.ensureSessionId();
        const restoredAuth = await restoreSession();
        if (cancelled) return;

        setSessionId(nextSessionId);
        setUser(restoredAuth.user);
        setError(null);
      } catch (startupError) {
        if (!cancelled) {
          setError(getErrorMessage(startupError, 'Failed to initialize session.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async ({ email, password }) => {
    setError(null);

    try {
      const response = await authService.login({ email, password });
      const payload = response?.data || {};
      if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
        throw new Error('Login response did not include auth tokens');
      }

      await persistAuthSession(payload);
      setUser(payload.user);

      return { success: true };
    } catch (loginError) {
      const message = getErrorMessage(loginError, 'Unable to sign in.');
      setError(message);
      return { success: false, error: message };
    }
  };

  const loginWithGoogle = async ({ idToken, userType }) => {
    setError(null);

    try {
      const response = await authService.googleLogin({ idToken, userType });
      const payload = response?.data || {};
      if (!payload?.accessToken || !payload?.refreshToken || !payload?.user) {
        throw new Error('Google login response did not include auth tokens');
      }

      await persistAuthSession(payload);
      setUser(payload.user);

      return { success: true };
    } catch (googleError) {
      const message = getErrorMessage(googleError, 'Google sign-in failed.');
      setError(message);
      return { success: false, error: message };
    }
  };

  const register = async ({ fullName, email, password, userType }) => {
    setError(null);

    try {
      const response = await authService.register({ fullName, email, password, userType });
      const payload = response?.data || {};
      if (payload?.accessToken && payload?.refreshToken && payload?.user) {
        await persistAuthSession(payload);
        setUser(payload.user);
        return { success: true };
      }
      return login({ email, password });
    } catch (registerError) {
      const message = getErrorMessage(registerError, 'Unable to create account.');
      setError(message);
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    const refreshToken = await StorageService.getSecureItem(REFRESH_TOKEN_KEY);

    if (refreshToken) {
      try {
        await authService.logout(refreshToken);
      } catch (_logoutError) {
        // Continue local logout even if backend revocation fails
      }
    }

    await clearAuthSessionStorage();
    setUser(null);
    setError(null);
  };

  const resetSession = async () => {
    await logout();
    const nextSessionId = await SessionService.resetSessionId();
    setSessionId(nextSessionId);
    return nextSessionId;
  };

  const updateUser = async (nextUser) => {
    setUser(nextUser);
    if (nextUser) {
      await StorageService.setItem(USER_KEY, JSON.stringify(nextUser));
      return;
    }

    await StorageService.removeItem(USER_KEY);
  };

  const isAuthenticated = Boolean(user);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      error,
      sessionId,
      mode: isAuthenticated ? 'authenticated' : 'guest',
      login,
      loginWithGoogle,
      register,
      logout,
      resetSession,
      updateUser,
      hasRole: (allowedRoles = []) => {
        if (!user?.userType) return false;
        if (typeof allowedRoles === 'string') return user.userType === allowedRoles;
        if (Array.isArray(allowedRoles)) return allowedRoles.includes(user.userType);
        return false;
      },
      isStaffMember: () => user?.userType === 'staff' || user?.userType === 'admin',
    }),
    [error, isAuthenticated, isLoading, sessionId, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
