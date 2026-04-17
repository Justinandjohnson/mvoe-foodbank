// ProtectedRoute - Route guard for authenticated users
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({
  children,
  requiredRole = null,
  fallbackScreen = 'Login',
  showLoading = true,
  navigation
}) {
  const { isAuthenticated, isLoading, user, hasRole } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading && showLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  // User is not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.accessDeniedContainer}>
        <Text style={styles.accessDeniedIcon}>🔒</Text>
        <Text style={styles.accessDeniedTitle}>Authentication Required</Text>
        <Text style={styles.accessDeniedMessage}>
          Please sign in to access this feature
        </Text>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => navigation?.navigate('Login')}
        >
          <Text style={styles.signInButtonText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.guestButton}
          onPress={() => navigation?.navigate('Main')}
        >
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Check role-based access
  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <View style={styles.accessDeniedContainer}>
        <Text style={styles.accessDeniedIcon}>⛔</Text>
        <Text style={styles.accessDeniedTitle}>Access Denied</Text>
        <Text style={styles.accessDeniedMessage}>
          You don't have permission to access this feature.{'\n'}
          Required role: {requiredRole}
        </Text>
        <Text style={styles.currentRoleText}>
          Your current role: {user?.userType || 'Unknown'}
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation?.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // User is authenticated and has required permissions
  return children;
}

// Higher-order component version for easier use
export function withProtectedRoute(Component, options = {}) {
  return function ProtectedComponent(props) {
    return (
      <ProtectedRoute {...options} navigation={props.navigation}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

// Hook for checking authentication status
export function useRequireAuth(requiredRole = null) {
  const { isAuthenticated, isLoading, user, hasRole } = useAuth();

  const isAuthorized = isAuthenticated && (
    !requiredRole || hasRole(requiredRole)
  );

  return {
    isAuthenticated,
    isAuthorized,
    isLoading,
    user,
    canAccess: isAuthorized,
  };
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  accessDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  accessDeniedIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  accessDeniedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  accessDeniedMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  currentRoleText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 32,
    fontStyle: 'italic',
  },
  signInButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  signInButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  guestButton: {
    paddingVertical: 12,
  },
  guestButtonText: {
    color: '#6B7280',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  backButton: {
    backgroundColor: '#6B7280',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});