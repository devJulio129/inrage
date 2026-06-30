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
  // Production builds honor the configured backend URL. In Expo development,
  // prefer the Metro LAN host so the phone talks to the backend running here.
  if (!__DEV__ && explicit && !/localhost|127\.0\.0\.1/.test(explicit)) return explicit;

  // Grab the dev machine host (e.g. "10.0.0.11:8081") from Expo.
  // Only use the current (non-deprecated) accessors to avoid SDK 54 throwing.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    '';

  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.split(':')[0];
    // Only use LAN IP — skip tunnel hostnames (e.g. exp.host, *.exp.direct)
    const isLanIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isLanIp) return `http://${host}:${API_PORT}`;
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
    err.code = body.status || body.code || null;
    err.payload = body;
    throw err;
  }
  return res.json();
}

function toQuery(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

export const api = {
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  getSupportWhatsappLink: () => request('/api/support/whatsapp-link'),

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

  // Apple solo entrega fullName/email la primera vez; los reenviamos para
  // guardarlos al crear la cuenta.
  loginWithApple: ({ identityToken, fullName, email }) =>
    request('/api/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, fullName, email })
    }),

  me: () => request('/api/auth/me'),
  getMyPublicProfile: () => request('/api/me/public-profile'),
  updateMyPublicProfile: (data) =>
    request('/api/me/public-profile', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  getPublicAthlete: (slug) =>
    request(`/api/public/athletes/${encodeURIComponent(slug)}`),

  getTodayWorkout: () => request('/api/workouts/today'),
  getRecentWorkouts: () => request('/api/workouts/recent'),
  // WODs en un rango de fechas (calendario): incluye los programados a futuro.
  getWorkoutsRange: (from, to) =>
    request(`/api/workouts/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Perfil (el propio miembro puede actualizar sus datos)
  updateMember: (id, data) =>
    request(`/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  // Comentarios unificados (workout | post) con respuestas
  getComments: (targetType, targetId) =>
    request(`/api/comments?targetType=${targetType}&targetId=${targetId}`),
  addComment: (targetType, targetId, text, parentId = null) =>
    request('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, text, parentId })
    }),
  deleteComment: (id) => request(`/api/comments/${id}`, { method: 'DELETE' }),

  getGymInfo: () => request('/api/gym-info'),
  getHomeHighlights: () => request('/api/home/highlights'),

  // Clases con cupo
  getClasses: (params = {}) => request(`/api/classes${toQuery(params)}`),
  getClassesCalendar: (params = {}) => request(`/api/classes/calendar${toQuery(params)}`),
  reserveClass: (id) => request(`/api/classes/${id}/reserve`, { method: 'POST' }),
  cancelClassReservation: (id) =>
    request(`/api/classes/${id}/reserve`, { method: 'DELETE' }),
  checkInWithQr: (token, options = {}) =>
    request('/api/attendances/check-in/qr', {
      method: 'POST',
      body: JSON.stringify({
        token,
        ...(options.confirmAutoReserve ? { confirmAutoReserve: true } : {})
      })
    }),

  // Publicaciones del gimnasio
  getPosts: () => request('/api/posts'),

  // Reacciones (post / comment / workout)
  reactSummary: (targetType, ids) =>
    request('/api/reactions/summary', {
      method: 'POST',
      body: JSON.stringify({ targetType, ids })
    }),
  react: (targetType, targetId, type) =>
    request('/api/reactions', {
      method: 'PUT',
      body: JSON.stringify({ targetType, targetId, type })
    }),
  reactWho: (targetType, targetId) =>
    request(`/api/reactions/who?targetType=${targetType}&targetId=${targetId}`),

  // Mensajería con el gimnasio (hilo propio)
  getMyMessages: () => request('/api/messages/me'),
  myUnreadCount: () => request('/api/messages/me/unread'),
  sendMyMessage: (data) =>
    request('/api/messages/me', { method: 'POST', body: JSON.stringify(data) }),

  // Notificaciones internas
  getNotifications: () => request('/api/notifications'),
  markNotificationRead: (id) =>
    request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  savePushToken: (data) =>
    request('/api/notifications/push-token', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  registerPushToken: (data) =>
    request('/api/push/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getPushPreferences: () => request('/api/push/preferences'),
  updatePushPreferences: (data) =>
    request('/api/push/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

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
