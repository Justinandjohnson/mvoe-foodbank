// Supabase client - the app talks straight to Supabase, there is no API server.
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mkieomckexbocfozbaex.supabase.co';

// Publishable key — safe in the bundle. Row Level Security is what actually
// guards the data, not this key.
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raWVvbWNrZXhib2Nmb3piYWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0ODY0OTIsImV4cCI6MjEwMDA2MjQ5Mn0.LVppHfpg3Yw9fNOcqqhs10fdyzDN1fAfetgWr-MHNC0';

export const BEACON_PHOTO_BUCKET = 'beacon-photos';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Every visitor gets an invisible identity so they can own the pin they post
 * without ever making an account.
 */
export async function ensureAnonymousSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  return data.user;
}

export function publicPhotoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  const { data } = supabase.storage.from(BEACON_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
