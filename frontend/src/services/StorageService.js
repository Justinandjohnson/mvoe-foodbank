// StorageService - Secure storage for tokens and user data
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export class StorageService {
  // Store sensitive data (tokens) securely
  static async setSecureItem(key, value) {
    try {
      if (typeof value !== 'string') {
        value = JSON.stringify(value);
      }

      // Use SecureStore for native platforms, AsyncStorage for web
      const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
      if (isSecureStoreAvailable) {
        await SecureStore.setItemAsync(key, value);
      } else {
        // Fallback to AsyncStorage for web
        await AsyncStorage.setItem(`secure_${key}`, value);
      }
    } catch (error) {
      console.error(`Error storing secure item ${key}:`, error);
      // Fallback to AsyncStorage if SecureStore fails
      await AsyncStorage.setItem(`secure_${key}`, value);
    }
  }

  // Get sensitive data (tokens) securely
  static async getSecureItem(key) {
    try {
      let value;

      // Use SecureStore for native platforms, AsyncStorage for web
      const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
      if (isSecureStoreAvailable) {
        value = await SecureStore.getItemAsync(key);
      } else {
        // Fallback to AsyncStorage for web
        value = await AsyncStorage.getItem(`secure_${key}`);
      }

      return value;
    } catch (error) {
      console.error(`Error getting secure item ${key}:`, error);
      // Fallback to AsyncStorage if SecureStore fails
      try {
        return await AsyncStorage.getItem(`secure_${key}`);
      } catch (fallbackError) {
        console.error(`Fallback storage also failed for ${key}:`, fallbackError);
        return null;
      }
    }
  }

  // Remove sensitive data
  static async removeSecureItem(key) {
    try {
      // Use SecureStore for native platforms, AsyncStorage for web
      const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
      if (isSecureStoreAvailable) {
        await SecureStore.deleteItemAsync(key);
      } else {
        // Fallback to AsyncStorage for web
        await AsyncStorage.removeItem(`secure_${key}`);
      }
    } catch (error) {
      console.error(`Error removing secure item ${key}:`, error);
      // Fallback cleanup
      try {
        await AsyncStorage.removeItem(`secure_${key}`);
      } catch (fallbackError) {
        console.error(`Fallback removal failed for ${key}:`, fallbackError);
      }
    }
  }

  // Store non-sensitive data
  static async setItem(key, value) {
    try {
      if (typeof value !== 'string') {
        value = JSON.stringify(value);
      }
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error storing item ${key}:`, error);
      throw error;
    }
  }

  // Get non-sensitive data
  static async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(key);
      return value;
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  // Remove non-sensitive data
  static async removeItem(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
    }
  }

  // Clear all storage (useful for logout)
  static async clear() {
    try {
      await AsyncStorage.clear();
      // Note: SecureStore items need to be removed individually
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
}