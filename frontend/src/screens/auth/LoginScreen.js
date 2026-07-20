// LoginScreen - Email/password authentication for donors and staff
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
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../../contexts/AuthContext';
import { config } from '../../../config';

WebBrowser.maybeCompleteAuthSession();

const DISABLED_GOOGLE_WEB_CLIENT_ID = 'disabled-google-web-client-id.apps.googleusercontent.com';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const { login, loginWithGoogle, isLoading } = useAuth();

  const googleConfigured = Boolean(config.googleClientIds.length);
  const googleAuthConfig = {
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
  };

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useIdTokenAuthRequest(googleAuthConfig);

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
      const result = await loginWithGoogle({ idToken });
      setIsGoogleLoading(false);

      if (result.success) {
        navigation.navigate('Main');
        return;
      }

      Alert.alert('Google Sign-In Failed', result.error || 'Please try again.');
    };

    processGoogleResponse();
  }, [googleResponse, loginWithGoogle, navigation]);

  const validate = () => {
    let valid = true;

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      setEmailError('Enter a valid email address');
      valid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    }

    return valid;
  };

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');

    if (!validate()) {
      return;
    }

    const result = await login({
      email: email.trim().toLowerCase(),
      password,
    });

    if (result.success) {
      navigation.navigate('Main');
      return;
    }

    Alert.alert('Sign In Failed', result.error || 'Please check your email and password.');
  };

  const handleGoogleLogin = async () => {
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
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>
            Use your MVOE email and password to continue
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setEmailError('');
              }}
              placeholder="Enter your email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setPasswordError('');
              }}
              placeholder="Enter your password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Submit sign in"
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.googleButton,
            (isLoading || isGoogleLoading || !googleRequest || !googleConfigured) &&
              styles.buttonDisabled,
          ]}
          onPress={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading || !googleRequest || !googleConfigured}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>

        <View style={styles.secondarySection}>
          <Text style={styles.secondaryText}>Need an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={isLoading}>
            <Text style={styles.linkText}>Create Account</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.guestButton}
          onPress={() => navigation.navigate('Main')}
          disabled={isLoading}
        >
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
        </TouchableOpacity>
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
    lineHeight: 22,
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'white',
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
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 18,
  },
  googleButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  secondarySection: {
    alignItems: 'center',
    gap: 8,
  },
  secondaryText: {
    fontSize: 14,
    color: '#6B7280',
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#9CA3AF',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  guestButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  guestButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
});
