import { useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import HomeScreen, { WodScreen, ClassesScreen } from './HomeScreen';
import ProfileScreen from './ProfileScreen';
import MessagesScreen from './MessagesScreen';

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'home-outline', iconActive: 'home' },
  { key: 'classes', label: 'Clases', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'wod', label: 'WOD', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline', iconActive: 'person' },
  { key: 'settings', label: 'Ajustes', icon: 'settings-outline', iconActive: 'settings' }
];

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

// ── Ajustes ─────────────────────────────────────────────────────────
function SettingsScreen({ user, onLogout, onOpenMessages, unread }) {
  const initials = (user?.name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const version = Constants.expoConfig?.version || '1.0.0';
  const isActive = user?.role === 'admin' || user?.status !== 'pending';

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      <Text style={st.screenTitle}>AJUSTES</Text>

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

      <Text style={st.sectionLabel}>GIMNASIO</Text>
      <View style={st.group}>
        <Pressable style={[st.row, st.rowLast]} onPress={onOpenMessages}>
          <Ionicons name="chatbubbles-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Mensajes del gimnasio</Text>
            <Text style={st.rowSub}>Habla directo con el coach</Text>
          </View>
          {unread > 0 && <View style={st.unreadDot}><Text style={st.unreadText}>{unread}</Text></View>}
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
  }
  useEffect(() => { refreshUnread(); }, []);
  useEffect(() => { if (tab === 'settings') refreshUnread(); }, [tab]);

  if (user && needsProfileData(user) && !skippedProfile) {
    return (
      <CompleteProfile
        user={user}
        onDone={(updated) => onUserUpdate?.(updated)}
        onSkip={() => setSkippedProfile(true)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {tab === 'home' && <HomeScreen user={user} onUserUpdate={onUserUpdate} onGoToClasses={() => setTab('classes')} />}
        {tab === 'classes' && <ClassesScreen user={user} />}
        {tab === 'wod' && <WodScreen user={user} />}
        {tab === 'profile' && <ProfileScreen user={user} />}
        {tab === 'settings' && (
          <SettingsScreen user={user} onLogout={onLogout} unread={unread} onOpenMessages={() => setTab('messages')} />
        )}
        {tab === 'messages' && (
          <MessagesScreen user={user} onBack={() => setTab('settings')} onReadAll={() => setUnread(0)} />
        )}
      </View>

      {tab !== 'messages' && (
      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.key || (t.key === 'settings' && tab === 'messages');
          const showBadge = t.key === 'settings' && unread > 0;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <View style={[styles.tabPill, active && styles.tabPillActive]}>
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={21}
                  color={active ? colors.accent : colors.textMuted}
                />
                {showBadge && <View style={styles.tabBadge} />}
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </View>
  );
}

const cp = StyleSheet.create({
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

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  screenTitle: {
    color: colors.textPrimary, fontFamily: type.display, fontSize: 30,
    letterSpacing: 1.5, marginBottom: spacing.lg
  },
  accountCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.xl
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
    backgroundColor: colors.surface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, marginBottom: spacing.xl
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
  unreadDot: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5
  },
  unreadText: { color: '#05230b', fontSize: 11, fontWeight: '900' },
  foot: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.md }
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  screen: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingTop: 6,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: {
    paddingVertical: 5,
    paddingHorizontal: 18,
    borderRadius: 16
  },
  tabPillActive: { backgroundColor: 'rgba(70,226,42,0.12)' },
  tabBadge: {
    position: 'absolute', top: 2, right: 12,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.surfaceAlt
  },
  tabLabel: { fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.4, fontWeight: '600', marginTop: 1 },
  tabLabelActive: { color: colors.accent, fontWeight: '800' }
});
