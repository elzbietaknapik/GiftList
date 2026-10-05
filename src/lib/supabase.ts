import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.local).',
  );
}

// EXPO_PUBLIC_* trafia do bundla — tylko publiczny klucz (publishable), nigdy service_role (Risk #7).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Static web export renderuje się w Node bez `window` — AsyncStorage dostępny tylko w runtime.
    ...(Platform.OS !== 'web' || typeof window !== 'undefined' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Risk #11 — RN, nie web
    flowType: 'pkce',
  },
});

// Risk #5 — tokeny wygasają, gdy urządzenie śpi; wznawiaj odświeżanie, gdy app jest aktywna.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
