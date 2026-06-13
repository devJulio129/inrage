import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Port your backend listens on (matches backend/.env PORT).
const API_PORT = 4000;

// Resolve the API base URL.
//
// On a physical device `localhost` means the phone itself, so we auto-detect
// your computer's LAN IP from the Metro bundler host (the same IP Expo Go
// connects to). This works without hardcoding anything and survives IP changes.
function resolveApiUrl() {
  const explicit = Constants.expoConfig?.extra?.apiUrl;
  // Honor an explicit, non-localhost URL if you set one in app.json.
  if (explicit && !/localhost|127\.0\.0\.1/.test(explicit)) return explicit;

  // Grab the dev machine host (e.g. "10.0.0.11:8081") from Expo.
  // Only use the current (non-deprecated) accessors to avoid SDK 54 throwing.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    '';

  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost') return `http://${host}:${API_PORT}`;
  }

  // Web / fallback.
  return explicit || `http://localhost:${API_PORT}`;
}

const API_URL = resolveApiUrl();

const TOKEN_KEY = 'inrage_token';
const USER_KEY = 'inrage_user';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveSession(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user || null)]
  ]);
}

export async function getStoredUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

async function request(path, options = {}) {
  const token = await getToken();

  // Abort the request if the server takes too long, so the UI never hangs
  // forever on a spinner (e.g. backend slow to reach the database).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado. Revisa tu conexión e inténtalo de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor.');
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  register: (data) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  loginWithGoogle: (idToken) =>
    request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken })
    }),

  me: () => request('/api/auth/me'),

  getTodayWorkout: () => request('/api/workouts/today'),
  getRecentWorkouts: () => request('/api/workouts/recent'),

  // Perfil (el propio miembro puede actualizar sus datos)
  updateMember: (id, data) =>
    request(`/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  // WOD comments
  getWodComments: (workoutId) => request(`/api/workouts/${workoutId}/comments`),
  addWodComment: (workoutId, text) =>
    request(`/api/workouts/${workoutId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
  deleteWodComment: (workoutId, commentId) =>
    request(`/api/workouts/${workoutId}/comments/${commentId}`, { method: 'DELETE' }),

  getGymInfo: () => request('/api/gym-info'),

  // Clases con cupo
  getClasses: () => request('/api/classes'),
  reserveClass: (id) => request(`/api/classes/${id}/reserve`, { method: 'POST' }),
  cancelClassReservation: (id) =>
    request(`/api/classes/${id}/reserve`, { method: 'DELETE' }),

  // Publicaciones del gimnasio
  getPosts: () => request('/api/posts'),

  // Gym presence
  myAttendance: () => request('/api/attendances/me'),
  checkIn: () => request('/api/attendances/checkin', { method: 'POST' }),
  checkOut: () => request('/api/attendances/checkout', { method: 'POST' }),

  // Avatar
  updateAvatar: (avatar) =>
    request('/api/auth/avatar', {
      method: 'PATCH',
      body: JSON.stringify({ avatar })
    }),

  // Personal records
  getPRs: () => request('/api/prs'),
  upsertPR: (movement, value, unit) =>
    request(`/api/prs/${encodeURIComponent(movement)}`, {
      method: 'PUT',
      body: JSON.stringify({ value, unit })
    }),
  deletePR: (movement) =>
    request(`/api/prs/${encodeURIComponent(movement)}`, { method: 'DELETE' })
};

export { API_URL };
