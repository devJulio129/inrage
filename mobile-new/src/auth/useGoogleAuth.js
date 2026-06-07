import { useEffect } from 'react';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { api, saveSession } from '../api/client';

// Ensures the auth popup/redirect closes cleanly on web/native.
WebBrowser.maybeCompleteAuthSession();

// Google Sign-In, wired end-to-end to the backend (POST /api/auth/google).
//
// To activate, add your OAuth client IDs (from Google Cloud Console →
// APIs & Services → Credentials) to app.json under expo.extra:
//   "googleClientId":        "<Web client ID>",          // Expo Go / web
//   "googleIosClientId":     "<iOS client ID>",          // native iOS build
//   "googleAndroidClientId": "<Android client ID>"        // native Android build
// Also set the same Web client ID as GOOGLE_CLIENT_ID in the backend .env so
// the server validates the token's audience.
//
// With no client ID configured, `ready` is false and the button shows a
// friendly "not configured" message instead of failing.
export function useGoogleAuth(onAuthed) {
  const extra = Constants.expoConfig?.extra || {};
  const clientId = extra.googleClientId || undefined;
  const iosClientId = extra.googleIosClientId || undefined;
  const androidClientId = extra.googleAndroidClientId || undefined;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId,
    iosClientId,
    androidClientId
  });

  const ready = Boolean(clientId || iosClientId || androidClientId) && Boolean(request);

  // Exchange the Google id_token for our own JWT when the popup returns.
  useEffect(() => {
    (async () => {
      if (response?.type !== 'success') return;
      const idToken =
        response.params?.id_token || response.authentication?.idToken;
      if (!idToken) return;
      try {
        const data = await api.loginWithGoogle(idToken);
        await saveSession(data.token, data.user);
        onAuthed?.(data.user);
      } catch (err) {
        console.warn('[google] login failed:', err.message);
      }
    })();
  }, [response]);

  async function signIn() {
    if (!ready) {
      throw new Error('Google Sign-In no configurado (falta el Client ID)');
    }
    const res = await promptAsync();
    if (res?.type === 'cancel' || res?.type === 'dismiss') {
      return null; // user closed the popup
    }
    if (res?.type !== 'success') {
      throw new Error('No se pudo iniciar sesión con Google');
    }
    // The useEffect above completes the backend exchange and calls onAuthed.
    return null;
  }

  return { ready, signIn };
}
