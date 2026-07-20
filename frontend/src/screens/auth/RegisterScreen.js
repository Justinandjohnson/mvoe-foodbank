// RegisterScreen - New staff and user registration
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../../contexts/AuthContext';
import { config } from '../../../config';

WebBrowser.maybeCompleteAuthSession();

const DISABLED_GOOGLE_WEB_CLIENT_ID = 'disabled-google-web-client-id.apps.googleusercontent.com';

export default function RegisterScreen({ navigation }) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    userType: 'donor',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { register, loginWithGoogle, isLoading } = useAuth();
  const googleConfigured = Boolean(config.googleClientIds.length);

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest({
    clientId:
      config.googleExpoClientId ||
      config.googleWebClientId ||
      (Platform.OS === 'web' ? DISABLED_GOOGLE_WEB_CLIENT_ID : undefined),
    expoClientId: config.googleExpoClientId || undefined,
    webClientId:
      config.googleWebClientId ||
      (Platform.OS === 'web' ? DISABLED_GOOGLE_WEB_CLIENT_ID : undefined),
    iosClientId: config.googleIosClientId || undefined,
    androidClientId: config.googleAndroidClientId || undefined,
    selectAccount: true,
  });

  useEffect(() => {
    const processGoogleResponse = async () => {
      if (googleResponse?.type !== 'success') {
        return;
      }

      const idToken = googleResponse.params?.id_token;
      if (!idToken) {
        Alert.alert('Google Sign-In Failed', 'Google did not return an ID token.');
        return;
      }

      setIsGoogleLoading(true);
      const result = await loginWithGoogle({ idToken, userType: formData.userType });
      setIsGoogleLoading(false);

      if (result.success) {
        navigation.navigate('Main');
        return;
      }

      Alert.alert('Google Sign-In Failed', result.error || 'Please try again.');
    };

    processGoogleResponse();
  }, [formData.userType, googleResponse, loginWithGoogle, navigation]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.userType) {
      newErrors.userType = 'Please select account type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    const registrationData = {
      fullName: formData.fullName.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password,
      userType: formData.userType,
    };

    const result = await register(registrationData);
    if (result.success) {
      navigation.navigate('Main');
      return;
    }

    Alert.alert(
      'Registration Failed',
      result.error || 'Please check your information and try again.'
    );
  };

  const handleGoogleRegister = async () => {
    if (!config.googleClientIds.length) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and optional iOS/Android IDs) to enable Google sign-in.',
      );
      return;
    }

    try {
      await promptGoogleSignIn();
    } catch (error) {
      Alert.alert('Google Sign-In Failed', error?.message || 'Unable to start Google sign-in.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the food access network</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={[styles.input, errors.fullName && styles.inputError]}
              value={formData.fullName}
              onChangeText={(value) => handleInputChange('fullName', value)}
              placeholder="Enter your full name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isLoading}
            />
            {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={formData.email}
              onChangeText={(value) => handleInputChange('email', value)}
              placeholder="Enter your email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Type</Text>
            <View style={[styles.pickerContainer, errors.userType && styles.inputError]}>
              <Picker
                selectedValue={formData.userType}
                onValueChange={(value) => handleInputChange('userType', value)}
                style={styles.picker}
                enabled={!isLoading}
              >
                <Picker.Item label="Donor" value="donor" />
                <Picker.Item label="Volunteer" value="volunteer" />
              </Picker>
            </View>
            {errors.userType && <Text style={styles.errorText}>{errors.userType}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  errors.password && styles.inputError,
                ]}
                value={formData.password}
                onChangeText={(value) => handleInputChange('password', value)}
                placeholder="Create a password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            <Text style={styles.passwordHint}>
              Must be 8+ characters with uppercase, lowercase, and number
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  errors.confirmPassword && styles.inputError,
                ]}
                value={formData.confirmPassword}
                onChangeText={(value) => handleInputChange('confirmPassword', value)}
                placeholder="Confirm your password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
              >
                <Text style={styles.passwordToggleText}>
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.registerButton, isLoading && styles.registerButtonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.registerButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.googleButton,
              (isLoading || isGoogleLoading || !googleRequest || !googleConfigured) &&
                styles.registerButtonDisabled,
            ]}
            onPress={handleGoogleRegister}
            disabled={isLoading || isGoogleLoading || !googleRequest || !googleConfigured}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.loginSection}>
          <Text style={styles.loginText}>Already have an account?</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.termsSection}>
          <Text style={styles.termsText}>
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
  },
  picker: {
    height: 50,
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 72,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  passwordToggleText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  passwordHint: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  googleButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  loginSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  loginText: {
    color: '#6B7280',
    fontSize: 14,
    marginBottom: 8,
  },
  loginButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  loginButtonText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  termsSection: {
    alignItems: 'center',
  },
  termsText: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});
