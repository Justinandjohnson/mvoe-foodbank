// Frontend Configuration
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mvoe-api.onrender.com';
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://mvoe-api.onrender.com';

export const config = {
  apiUrl: API_URL,
  wsUrl: WS_URL,
  stripePublishableKey:
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_STRIPE_KEY ||
    '',
};
