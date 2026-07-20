// Frontend Configuration
const isLocalBrowser =
  typeof window !== 'undefined' && ['127.0.0.1', 'localhost'].includes(window.location.hostname);

const DEFAULT_LOCAL_API_URL = 'http://127.0.0.1:3100';
const DEFAULT_LOCAL_WS_URL = 'ws://127.0.0.1:3100';
const DEFAULT_LOCAL_AGENT_API_URL = 'http://127.0.0.1:8001';

const DEFAULT_HOSTED_API_URL = 'https://mvoe-api.onrender.com';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (isLocalBrowser ? DEFAULT_LOCAL_API_URL : DEFAULT_HOSTED_API_URL);

export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ||
  (isLocalBrowser ? DEFAULT_LOCAL_WS_URL : 'wss://mvoe-api.onrender.com');

export const AGENT_API_URL =
  process.env.EXPO_PUBLIC_AGENT_API_URL ||
  process.env.EXPO_PUBLIC_VOLUNTEER_API_URL ||
  (isLocalBrowser ? DEFAULT_LOCAL_AGENT_API_URL : API_URL);

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
export const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
export const GOOGLE_EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || '';

export const config = {
  apiUrl: API_URL,
  agentApiUrl: AGENT_API_URL,
  wsUrl: WS_URL,
  googleWebClientId: GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: GOOGLE_IOS_CLIENT_ID,
  googleAndroidClientId: GOOGLE_ANDROID_CLIENT_ID,
  googleExpoClientId: GOOGLE_EXPO_CLIENT_ID,
  googleClientIds: [
    GOOGLE_WEB_CLIENT_ID,
    GOOGLE_IOS_CLIENT_ID,
    GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_EXPO_CLIENT_ID,
  ].filter(Boolean),
  stripePublishableKey:
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_STRIPE_KEY ||
    '',
  appEnv: process.env.EXPO_PUBLIC_APP_ENV || 'development',
};
