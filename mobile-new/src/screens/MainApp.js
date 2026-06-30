import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Image, Switch, useColorScheme
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, themes, ThemeContext, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import { addNotificationTapListener, registerForPushNotificationsAsync } from '../services/pushNotifications';
import HomeScreen, { WodScreen, ClassesScreen } from './HomeScreen';
import ProfileScreen from './ProfileScreen';
import MessagesScreen from './MessagesScreen';
import NotificationsScreen from './NotificationsScreen';

const TABS = [
  { key: 'home', label: 'Hoy', icon: 'home-outline', iconActive: 'home' },
  { key: 'classes', label: 'Reservas', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'wod', label: 'WOD', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'profile', label: 'Progreso', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { key: 'settings', label: 'Cuenta', icon: 'person-outline', iconActive: 'person' }
];

const THEME_STORAGE_KEY = 'inrage_theme_mode';
const PUSH_PROMPT_PREFIX = 'inrage_push_prompt_';
const DEFAULT_PUSH_PREFERENCES = {
  enabled: true,
  posts: true,
  classReminders: true,
  classChanges: true,
  membership: true,
  branchPreference: 'all'
};

function pushAllOrNothingPatch(value) {
  const enabled = Boolean(value);
  return {
    enabled,
    posts: enabled,
    classReminders: enabled,
    classChanges: enabled,
    membership: enabled,
    branchPreference: 'all'
  };
}

function pushStatusLabel({ loading, error, permission, preferences, enabledTokenCount }) {
  if (loading) return 'Cargando';
  if (error) return 'Error';
  if (permission === 'denied') return 'Permiso denegado';
  if (permission === 'error') return 'Reintentar';
  if (preferences?.enabled === false) return 'Desactivadas';
  if (enabledTokenCount > 0) return 'Activadas';
  return 'Reintentar';
}

function pushPromptKey(user) {
  return `${PUSH_PROMPT_PREFIX}${user?._id || user?.email || 'me'}`;
}

// Las cuentas creadas con Google llegan sin teléfono real (placeholder N/A).
// OJO: el login normal responde SIN el campo phone — si aún no lo conocemos
// (undefined) NO preguntamos; primero se refresca el perfil con /auth/me.
function needsProfileData(user) {
  if (!user || user.phone === undefined) return false;
  const phone = String(user.phone || '').trim();
  return !phone || phone.toUpperCase() === 'N/A';
}

function CompleteProfile({ user, onDone, onSkip }) {
  const [phone, setPhone] = useState('');
  const [birth, setBirth] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function onBirthChange(text) {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setBirth(out);
  }

  function birthToISO(v) {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d.getFullYear() != yyyy || d.getMonth() + 1 != Number(mm)) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  async function save() {
    setError(null);
    if (phone.length < 10) {
      setError('Escribe tu teléfono a 10 dígitos');
      return;
    }
    const iso = birth ? birthToISO(birth) : null;
    if (birth && !iso) {
      setError('Fecha inválida (usa DD/MM/AAAA)');
      return;
    }
    setSaving(true);
    try {
      const payload = { phone };
      if (iso) payload.birthDate = iso;
      const updated = await api.updateMember(user._id, payload);
      onDone(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={cp.wrap} keyboardShouldPersistTaps="handled">
        <View style={cp.iconWrap}>
          <Ionicons name="person-add" size={28} color={colors.accent} />
        </View>
        <Text style={cp.title}>COMPLETA TU PERFIL</Text>
        <Text style={cp.sub}>
          Hola {String(user?.name || '').split(' ')[0]} 👋 Entraste con Google, así que nos faltan
          un par de datos para que el gimnasio pueda contactarte.
        </Text>

        <Text style={cp.label}>TELÉFONO</Text>
        <TextInput
          style={cp.input}
          placeholder="10 dígitos"
          placeholderTextColor={colors.textMuted}
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad"
        />

        <Text style={cp.label}>FECHA DE NACIMIENTO (opcional)</Text>
        <TextInput
          style={cp.input}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          value={birth}
          onChangeText={onBirthChange}
          keyboardType="number-pad"
        />

        {error && <Text style={cp.error}>{error}</Text>}

        <Pressable style={cp.primary} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#05230b" /> : <Text style={cp.primaryText}>GUARDAR</Text>}
        </Pressable>
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={cp.skip}>Ahora no</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PreferenceSwitch({ label, description, value, disabled, onValueChange, palette }) {
  return (
    <View style={st.prefSwitch}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.rowTitle}>{label}</Text>
        {description ? <Text style={st.rowSub}>{description}</Text> : null}
      </View>
      <Switch
        value={Boolean(value)}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.accentSoft }}
        thumbColor={value ? palette.accent : palette.textMuted}
        ios_backgroundColor={palette.border}
      />
    </View>
  );
}

function NotificationActivationPrompt({ user, onDone }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);

  async function remember(value) {
    try {
      await AsyncStorage.setItem(pushPromptKey(user), value);
    } catch {}
  }

  async function activate() {
    setLoading(true);
    setMessage(null);
    const result = await registerForPushNotificationsAsync();
    if (result.status !== 'granted' || !result.token) {
      await remember('denied');
      setMessage('No pudimos activar notificaciones. Puedes intentarlo despues desde Cuenta.');
      setDone(true);
      setLoading(false);
      return;
    }
    try {
      await api.registerPushToken({
        token: result.token,
        platform: ['android', 'ios'].includes(result.platform) ? result.platform : 'unknown',
        deviceName: result.deviceName || ''
      });
      await remember('enabled');
      setMessage('Notificaciones activadas.');
    } catch {
      await remember('error');
      setMessage('No pudimos activar notificaciones. Puedes intentarlo despues desde Cuenta.');
    } finally {
      setDone(true);
      setLoading(false);
    }
  }

  async function skip() {
    await remember('later');
    onDone?.();
  }

  return (
    <View style={np.root}>
      <View style={np.card}>
        <View style={np.icon}>
          <Ionicons name="notifications" size={28} color={colors.accent} />
        </View>
        <Text style={np.kicker}>INRAGE</Text>
        <Text style={np.title}>Activa las notificaciones</Text>
        <Text style={np.text}>
          Te avisaremos sobre tus reservas, cambios de clase, avisos del box y recordatorios de check-in.
        </Text>
        {message ? <Text style={np.message}>{message}</Text> : null}
        {done ? (
          <Pressable style={np.primary} onPress={onDone}>
            <Text style={np.primaryText}>CONTINUAR</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={np.primary} onPress={activate} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.accentText} /> : <Text style={np.primaryText}>ACTIVAR NOTIFICACIONES</Text>}
            </Pressable>
            <Pressable style={np.secondary} onPress={skip} disabled={loading}>
              <Text style={np.secondaryText}>Ahora no</Text>
            </Pressable>
          </>
        )}
        <Text style={np.hint}>Puedes cambiar esto despues en Cuenta.</Text>
      </View>
    </View>
  );
}

// ── Ajustes ─────────────────────────────────────────────────────────
function SettingsScreen({
  user,
  onLogout,
  onOpenMessages,
  messageUnread,
  onOpenNotifications,
  notificationUnread,
  themeMode,
  activeTheme,
  onThemeModeChange
}) {
  const palette = activeTheme || colors;
  const initials = (user?.name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const version = Constants.expoConfig?.extra?.releaseLabel || Constants.expoConfig?.version || '1.3.0';
  const isActive = user?.role === 'admin' || user?.status !== 'pending';
  const [push, setPush] = useState({
    loading: true,
    saving: false,
    registering: false,
    error: null,
    permission: 'unknown',
    preferences: DEFAULT_PUSH_PREFERENCES,
    tokenCount: 0,
    enabledTokenCount: 0
  });

  function mergePushResponse(data) {
    setPush((prev) => ({
      ...prev,
      loading: false,
      saving: false,
      registering: false,
      error: null,
      preferences: { ...DEFAULT_PUSH_PREFERENCES, ...(data?.preferences || {}) },
      tokenCount: Number(data?.tokenCount || 0),
      enabledTokenCount: Number(data?.enabledTokenCount || 0)
    }));
  }

  function loadPushPreferences() {
    setPush((prev) => ({ ...prev, loading: true, error: null }));
    api.getPushPreferences()
      .then(mergePushResponse)
      .catch((err) => {
        setPush((prev) => ({
          ...prev,
          loading: false,
          saving: false,
          registering: false,
          error: err.message || 'No se pudieron cargar las preferencias'
        }));
      });
  }

  useEffect(() => {
    loadPushPreferences();
  }, []);

  async function updatePushPreference(patch) {
    setPush((prev) => ({
      ...prev,
      saving: true,
      error: null,
      preferences: { ...prev.preferences, ...patch }
    }));
    try {
      const data = await api.updatePushPreferences(patch);
      mergePushResponse(data);
    } catch (err) {
      setPush((prev) => ({
        ...prev,
        saving: false,
        error: err.message || 'No se pudo guardar'
      }));
      loadPushPreferences();
    }
  }

  async function activatePush() {
    setPush((prev) => ({ ...prev, registering: true, error: null }));
    const result = await registerForPushNotificationsAsync();
    if (result.status !== 'granted' || !result.token) {
      setPush((prev) => ({
        ...prev,
        registering: false,
        permission: result.status,
        error: result.message || (result.status === 'denied' ? 'Permiso denegado' : 'No se pudo activar notificaciones')
      }));
      return;
    }

    try {
      await api.registerPushToken({
        token: result.token,
        platform: ['android', 'ios'].includes(result.platform) ? result.platform : 'unknown',
        deviceName: result.deviceName || ''
      });
      const data = await api.getPushPreferences();
      setPush((prev) => ({ ...prev, permission: 'granted' }));
      mergePushResponse(data);
    } catch (err) {
      setPush((prev) => ({
        ...prev,
        registering: false,
        permission: 'error',
        error: err.message || 'No se pudo activar notificaciones'
      }));
    }
  }

  const status = pushStatusLabel(push);

  return (
    <ScrollView style={[st.container, { backgroundColor: palette.base }]} contentContainerStyle={st.content}>
      <View style={st.settingsHero}>
        <View style={{ flex: 1 }}>
          <Text style={st.screenKicker}>CUENTA Y GIMNASIO</Text>
          <Text style={st.screenTitle}>CUENTA</Text>
          <Text style={st.screenSub}>Mensajes, sesión y detalles de la app.</Text>
        </View>
        <View style={st.settingsAvatarWrap}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={st.settingsAvatar} />
          ) : (
            <View style={[st.settingsAvatar, st.avatarFallback]}>
              <Text style={st.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={st.settingsAvatarDot} />
        </View>
      </View>

      <View style={st.accountCard}>
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={st.avatar} />
        ) : (
          <View style={[st.avatar, st.avatarFallback]}>
            <Text style={st.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{user?.name || 'Atleta'}</Text>
          <Text style={st.email}>{user?.email}</Text>
        </View>
        <View style={[st.badge, { borderColor: isActive ? 'rgba(70,226,42,0.4)' : 'rgba(242,192,55,0.4)' }]}>
          <Text style={[st.badgeText, { color: isActive ? colors.accent : '#F2C037' }]}>
            {user?.role === 'admin' ? 'ADMIN' : isActive ? 'ACTIVO' : 'PENDIENTE'}
          </Text>
        </View>
      </View>

      <Text style={st.sectionLabel}>NOTIFICACIONES</Text>
      <View style={st.group}>
        <View style={st.row}>
          <Ionicons name="notifications" size={18} color={palette.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Estado</Text>
            <Text style={st.rowSub}>
              {push.enabledTokenCount} dispositivo(s) activo(s)
            </Text>
          </View>
          {push.loading ? <ActivityIndicator size="small" color={palette.accent} /> : <Text style={st.rowValue}>{status}</Text>}
        </View>

        {push.error && (
          <View style={st.noticeRow}>
            <Ionicons name="alert-circle-outline" size={16} color={palette.textMuted} />
            <Text style={st.noticeText}>{push.error}</Text>
            <Pressable onPress={loadPushPreferences} hitSlop={8}>
              <Text style={st.noticeAction}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        <PreferenceSwitch
          label="Recibir notificaciones"
          description="Recibe avisos del box, cambios de clase, recordatorios y mensajes importantes."
          value={push.preferences.enabled}
          disabled={push.loading || push.saving}
          palette={palette}
          onValueChange={(value) => updatePushPreference(pushAllOrNothingPatch(value))}
        />

        <Pressable style={[st.row, st.rowLast]} onPress={activatePush} disabled={push.registering}>
          <Ionicons name="phone-portrait-outline" size={18} color={palette.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>{push.enabledTokenCount > 0 ? 'Actualizar dispositivo' : 'Activar en este dispositivo'}</Text>
            <Text style={st.rowSub}>Recibe avisos importantes en este celular.</Text>
          </View>
          {push.registering ? <ActivityIndicator size="small" color={palette.accent} /> : <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />}
        </Pressable>
      </View>

      <Text style={st.sectionLabel}>APARIENCIA</Text>
      <View style={st.group}>
        <View style={[st.prefBlock, st.rowLast]}>
          <Text style={st.rowTitle}>Tema</Text>
          <View style={st.segmentWrap}>
            {[
              ['system', 'Sistema'],
              ['dark', 'Oscuro'],
              ['light', 'Claro']
            ].map(([value, label]) => {
              const active = themeMode === value;
              return (
                <Pressable
                  key={value}
                  style={[st.segmentBtn, active && st.segmentBtnActive]}
                  onPress={() => onThemeModeChange?.(value)}
                >
                  <Text style={[st.segmentText, active && st.segmentTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <Text style={st.sectionLabel}>GIMNASIO</Text>
      <View style={st.group}>
        <Pressable style={st.row} onPress={onOpenMessages}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Mensajes del gimnasio</Text>
            <Text style={st.rowSub}>Habla directo con el coach</Text>
          </View>
          {messageUnread > 0 && <View style={st.unreadDot}><Text style={st.unreadText}>{messageUnread}</Text></View>}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable style={[st.row, st.rowLast]} onPress={onOpenNotifications}>
          <Ionicons name="notifications-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Notificaciones</Text>
            <Text style={st.rowSub}>Activadas o desactivadas</Text>
          </View>
          {notificationUnread > 0 && <View style={st.unreadDot}><Text style={st.unreadText}>{notificationUnread}</Text></View>}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={st.sectionLabel}>SESIÓN</Text>
      <View style={st.group}>
        <View style={st.row}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Sesión por visita</Text>
            <Text style={st.rowSub}>Al cerrar la app, tu sesión se cierra automáticamente</Text>
          </View>
        </View>
        <Pressable style={[st.row, st.rowLast]} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[st.rowTitle, { color: colors.danger }]}>Cerrar sesión ahora</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={st.sectionLabel}>ACERCA DE</Text>
      <View style={st.group}>
        <View style={st.row}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={st.rowTitle}>Versión</Text>
          <Text style={st.rowValue}>{version}</Text>
        </View>
        <View style={[st.row, st.rowLast]}>
          <Ionicons name="barbell-outline" size={18} color={colors.textMuted} />
          <Text style={st.rowTitle}>InRage CrossFit</Text>
          <Text style={st.rowValue}>Tampico, MX</Text>
        </View>
      </View>

      <Text style={st.foot}>Hecho con 💚 para la comunidad InRage</Text>
    </ScrollView>
  );
}

export default function MainApp({ user, onUserUpdate, onLogout }) {
  const [tab, setTab] = useState('home');
  const [skippedProfile, setSkippedProfile] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [pushPromptState, setPushPromptState] = useState('checking');
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('system');
  const activeThemeName = themeMode === 'system'
    ? (systemScheme === 'light' ? 'light' : 'dark')
    : themeMode;
  const activeTheme = themes[activeThemeName] || colors;
  const themeValue = useMemo(() => ({
    colors: activeTheme,
    themeMode,
    activeThemeName,
    setThemeMode: changeThemeMode
  }), [activeTheme, themeMode, activeThemeName]);
  const styleSets = useMemo(() => ({
    cp: createCompleteProfileStyles(activeTheme),
    np: createNotificationPromptStyles(activeTheme),
    st: createSettingsStyles(activeTheme),
    styles: createMainStyles(activeTheme)
  }), [activeTheme]);
  cp = styleSets.cp;
  np = styleSets.np;
  st = styleSets.st;
  styles = styleSets.styles;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (alive && ['system', 'dark', 'light'].includes(stored)) setThemeMode(stored);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function changeThemeMode(mode) {
    const safeMode = ['system', 'dark', 'light'].includes(mode) ? mode : 'system';
    setThemeMode(safeMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, safeMode).catch(() => {});
  }

  // El login responde sin phone: se refresca el perfil completo UNA vez para
  // saber si de verdad faltan datos (solo pasa con cuentas de Google nuevas).
  useEffect(() => {
    if (user?.phone !== undefined) return;
    let alive = true;
    api.me()
      .then((fresh) => { if (alive) onUserUpdate?.(fresh); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Mensajes sin leer del gimnasio (badge). Se refresca al volver a Ajustes.
  function refreshUnread() {
    api.myUnreadCount().then((r) => setUnread(r.count || 0)).catch(() => {});
    api.getNotifications().then((r) => setNotificationUnread(r.unread || 0)).catch(() => {});
  }
  useEffect(() => { refreshUnread(); }, []);
  useEffect(() => { if (tab === 'settings') refreshUnread(); }, [tab]);

  useEffect(() => {
    let alive = true;
    async function decidePushPrompt() {
      if (!user) {
        setPushPromptState('hidden');
        return;
      }
      setPushPromptState('checking');
      try {
        const asked = await AsyncStorage.getItem(pushPromptKey(user));
        if (asked) {
          if (alive) setPushPromptState('hidden');
          return;
        }
        const prefs = await api.getPushPreferences().catch(() => null);
        if (prefs?.enabledTokenCount > 0) {
          await AsyncStorage.setItem(pushPromptKey(user), 'enabled');
          if (alive) setPushPromptState('hidden');
          return;
        }
        if (alive) setPushPromptState('show');
      } catch {
        if (alive) setPushPromptState('hidden');
      }
    }
    decidePushPrompt();
    return () => { alive = false; };
  }, [user?._id, user?.email]);

  useEffect(() => {
    const subscription = addNotificationTapListener((data) => {
      const type = String(data?.type || '');
      const target = String(data?.target || '');
      if (target === 'classes' || type.startsWith('class_') || type === 'special_class') {
        setTab('classes');
        return;
      }
      if (target === 'profile' || type === 'membership_reminder') {
        setTab('profile');
        return;
      }
      setTab('home');
    });
    return () => subscription?.remove?.();
  }, []);

  const barStyle = activeThemeName === 'light' ? 'dark' : 'light';

  if (user && needsProfileData(user) && !skippedProfile) {
    return (
      <ThemeContext.Provider value={themeValue}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.base }]} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={barStyle} backgroundColor={activeTheme.base} />
      <CompleteProfile
        user={user}
        onDone={(updated) => onUserUpdate?.(updated)}
        onSkip={() => setSkippedProfile(true)}
      />
      </SafeAreaView>
      </ThemeContext.Provider>
    );
  }

  if (pushPromptState === 'show') {
    return (
      <ThemeContext.Provider value={themeValue}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.base }]} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={barStyle} backgroundColor={activeTheme.base} />
        <NotificationActivationPrompt user={user} onDone={() => setPushPromptState('hidden')} />
      </SafeAreaView>
      </ThemeContext.Provider>
    );
  }

  if (pushPromptState === 'checking') {
    return (
      <ThemeContext.Provider value={themeValue}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.base }]} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={barStyle} backgroundColor={activeTheme.base} />
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', backgroundColor: activeTheme.base }]}>
        <ActivityIndicator color={activeTheme.accent} size="large" />
      </View>
      </SafeAreaView>
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={themeValue}>
    <SafeAreaView style={[styles.safeArea, { backgroundColor: activeTheme.base }]} edges={['top', 'left', 'right', 'bottom']}>
    <StatusBar style={barStyle} backgroundColor={activeTheme.base} />
    <View style={[styles.container, { backgroundColor: activeTheme.base }]}>
      <View style={styles.screen}>
        {tab === 'home' && (
          <HomeScreen
            user={user}
            onUserUpdate={onUserUpdate}
            onGoToClasses={() => setTab('classes')}
            onGoToWod={() => setTab('wod')}
          />
        )}
        {tab === 'classes' && <ClassesScreen user={user} />}
        {tab === 'wod' && <WodScreen user={user} onGoToClasses={() => setTab('classes')} />}
        {tab === 'profile' && <ProfileScreen user={user} onUserUpdate={onUserUpdate} />}
        {tab === 'settings' && (
          <SettingsScreen
            user={user}
            onLogout={onLogout}
            messageUnread={unread}
            notificationUnread={notificationUnread}
            themeMode={themeMode}
            activeTheme={activeTheme}
            onThemeModeChange={changeThemeMode}
            onOpenMessages={() => setTab('messages')}
            onOpenNotifications={() => setTab('notifications')}
          />
        )}
        {tab === 'messages' && (
          <MessagesScreen user={user} onBack={() => setTab('settings')} onReadAll={() => setUnread(0)} />
        )}
        {tab === 'notifications' && (
          <NotificationsScreen
            onBack={() => setTab('settings')}
            onUnreadChange={setNotificationUnread}
          />
        )}
      </View>

      {tab !== 'messages' && tab !== 'notifications' && (
      <View style={[styles.tabbar, { backgroundColor: activeTheme.baseElevated, borderTopColor: activeTheme.borderStrong }]}>
        {TABS.map((t) => {
          const active = tab === t.key || (t.key === 'settings' && (tab === 'messages' || tab === 'notifications'));
          const showBadge = t.key === 'settings' && (unread > 0 || notificationUnread > 0);
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <View style={[styles.tabPill, active && styles.tabPillActive]}>
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={21}
                  color={active ? activeTheme.accent : activeTheme.textMuted}
                />
                {showBadge && <View style={styles.tabBadge} />}
              </View>
              <Text style={[styles.tabLabel, { color: active ? activeTheme.accent : activeTheme.textMuted }, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </View>
    </SafeAreaView>
    </ThemeContext.Provider>
  );
}

function createCompleteProfileStyles(colors) {
  return StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingBottom: spacing.xxl },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32, alignSelf: 'center',
    backgroundColor: 'rgba(70,226,42,0.12)', alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md
  },
  title: {
    color: colors.textPrimary, fontFamily: type.display, fontSize: 30,
    letterSpacing: 1.5, textAlign: 'center', marginBottom: spacing.sm
  },
  sub: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: spacing.xl },
  label: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 6, marginLeft: 2 },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 16, marginBottom: spacing.md
  },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  primary: {
    backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 15,
    alignItems: 'center', marginTop: spacing.sm,
    shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }
  },
  primaryText: { color: '#05230b', fontWeight: '800', fontSize: 15, letterSpacing: 1.5 },
  skip: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, fontSize: 14 }
  });
}

let cp = createCompleteProfileStyles(colors);

function createNotificationPromptStyles(colors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.base,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm
  },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1.2, textAlign: 'center' },
  text: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: spacing.sm },
  message: { color: colors.accent, fontSize: 13, lineHeight: 19, textAlign: 'center', marginVertical: spacing.sm },
  primary: {
    width: '100%',
    minHeight: 48,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm
  },
  primaryText: { color: colors.accentText, fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  secondary: {
    width: '100%',
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm }
  });
}

let np = createNotificationPromptStyles(colors);

function createSettingsStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  settingsHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  settingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  screenKicker: { color: colors.accent, fontSize: 10, letterSpacing: 1.8, fontWeight: '900', marginBottom: 3 },
  screenTitle: {
    color: colors.textPrimary, fontFamily: type.display, fontSize: 34,
    letterSpacing: 1.2, lineHeight: 38
  },
  screenSub: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  accountCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderStrong,
    padding: spacing.md, marginBottom: spacing.lg
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#05230b', fontWeight: '900', fontSize: 19 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  email: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  badge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  sectionLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm },
  group: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.lg
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border
  },
  rowLast: { borderBottomWidth: 0 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowValue: { color: colors.textMuted, fontSize: 13 },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  noticeText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, flex: 1 },
  noticeAction: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  prefSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  prefBlock: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: spacing.sm
  },
  segmentBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  segmentBtnActive: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentSoft
  },
  segmentText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: colors.accent },
  unreadDot: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5
  },
  unreadText: { color: '#05230b', fontSize: 11, fontWeight: '900' },
  foot: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.md },

  /* Premium Cuenta */
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  settingsHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    marginBottom: spacing.lg,
    shadowOpacity: 0,
    elevation: 0
  },
  settingsAvatarWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8
  },
  settingsAvatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: 'rgba(70,226,42,0.6)' },
  settingsAvatarDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.base
  },
  screenKicker: { color: colors.accent, fontSize: 12, letterSpacing: 2.7, fontWeight: '900', marginBottom: 2 },
  screenTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 62, letterSpacing: 1.4, lineHeight: 66 },
  screenSub: { color: colors.textMuted, fontSize: 18, lineHeight: 24, marginTop: 0 },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginBottom: spacing.lg
  },
  avatar: { width: 62, height: 62, borderRadius: 31 },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '900' },
  email: { color: colors.textMuted, fontSize: 15, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  sectionLabel: { color: colors.textMuted, fontFamily: type.mono, fontSize: 12, letterSpacing: 3, marginBottom: spacing.sm, marginLeft: spacing.xs },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 74,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 },
  rowSub: { color: colors.textMuted, fontSize: 14, marginTop: 3, lineHeight: 19 },
  rowValue: { color: colors.textMuted, fontSize: 15 },
  prefSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 70,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  segmentBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 13
  },
  segmentBtnActive: { borderColor: colors.borderStrong, backgroundColor: colors.accentSoft },
  segmentTextActive: { color: colors.accent },
  unreadDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  }
  });
}

let st = createSettingsStyles(colors);

function createMainStyles(colors) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.base },
  container: { flex: 1, backgroundColor: colors.base },
  screen: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.baseElevated,
    paddingTop: 8,
    paddingBottom: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12
  },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: {
    paddingVertical: 5,
    paddingHorizontal: 18,
    borderRadius: 16
  },
  tabPillActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.22)'
  },
  tabBadge: {
    position: 'absolute', top: 2, right: 12,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surfaceAlt
  },
  tabLabel: { fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.4, fontWeight: '600', marginTop: 1 },
  tabLabelActive: { color: colors.accent, fontWeight: '800' }
  });
}

let styles = createMainStyles(colors);
