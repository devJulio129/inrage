import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import HomeScreen from './HomeScreen';
import ProfileScreen from './ProfileScreen';

const TABS = [
  { key: 'home', label: 'Inicio', icon: 'barbell-outline', iconActive: 'barbell' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline', iconActive: 'person' }
];

// Las cuentas creadas con Google llegan sin teléfono ni fecha real de
// nacimiento (se rellenan con placeholders). Detectamos eso y pedimos los
// datos una vez, para que la base del gimnasio quede completa.
function needsProfileData(user) {
  const phone = (user?.phone || '').trim();
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

export default function MainApp({ user, onUserUpdate, onLogout }) {
  const [tab, setTab] = useState('home');
  const [skippedProfile, setSkippedProfile] = useState(false);

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
        {tab === 'home' ? (
          <HomeScreen user={user} onUserUpdate={onUserUpdate} />
        ) : (
          <ProfileScreen user={user} onLogout={onLogout} />
        )}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <View style={[styles.tabPill, active && styles.tabPillActive]}>
                <Ionicons
                  name={active ? t.iconActive : t.icon}
                  size={20}
                  color={active ? colors.accent : colors.textMuted}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  screen: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md
  },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 22
  },
  tabPillActive: { backgroundColor: 'rgba(70,226,42,0.12)' },
  tabLabel: { fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, fontWeight: '600' },
  tabLabelActive: { color: colors.accent, fontWeight: '800' }
});
