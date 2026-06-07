import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, TextInput, Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, radii } from '../theme';
import { api } from '../api/client';

const MOVEMENTS = [
  {
    category: 'Levantamiento Olímpico', items: [
      { key: 'snatch', label: 'Arrancada', unit: 'kg' },
      { key: 'clean_and_jerk', label: 'Envión', unit: 'kg' },
    ]
  },
  {
    category: 'Powerlifting', items: [
      { key: 'back_squat', label: 'Sentadilla', unit: 'kg' },
      { key: 'front_squat', label: 'Sentadilla Frontal', unit: 'kg' },
      { key: 'deadlift', label: 'Peso Muerto', unit: 'kg' },
      { key: 'bench_press', label: 'Press Banca', unit: 'kg' },
      { key: 'overhead_press', label: 'Press Militar', unit: 'kg' },
    ]
  },
  {
    category: 'Gimnasia', items: [
      { key: 'pull_ups', label: 'Pull-ups', unit: 'reps' },
      { key: 'handstand_push_ups', label: 'HSPU', unit: 'reps' },
      { key: 'muscle_ups', label: 'Muscle-ups', unit: 'reps' },
      { key: 'toes_to_bar', label: 'Toes to Bar', unit: 'reps' },
    ]
  },
];

export default function ProfileScreen({ user, onLogout }) {
  const [profile, setProfile] = useState(user);
  const [visits, setVisits] = useState(null);
  const [prs, setPrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [me, att, prList] = await Promise.all([
          api.me().catch(() => user),
          api.myAttendance().catch(() => null),
          api.getPRs().catch(() => []),
        ]);
        setProfile(me || user);
        setVisits(att?.totalVisits ?? null);
        const map = {};
        for (const pr of (prList || [])) map[pr.movement] = { value: pr.value, unit: pr.unit };
        setPrs(map);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function pickAvatar() {
    if (avatarUploading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para cambiar la foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    const dataUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
    setAvatarUploading(true);
    try {
      await api.updateAvatar(dataUri);
      setProfile(prev => ({ ...prev, avatar: dataUri }));
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function startEdit(key, currentValue) {
    setEditingKey(key);
    setEditValue(currentValue != null ? String(currentValue) : '');
  }

  async function saveEdit(key, unit) {
    const num = parseFloat(editValue);
    setEditingKey(null);
    if (!editValue.trim() || isNaN(num) || num <= 0) return;
    try {
      const updated = await api.upsertPR(key, num, unit);
      setPrs(prev => ({ ...prev, [key]: { value: updated.value, unit: updated.unit } }));
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  const initials = (profile?.name || 'A')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const isActive = profile?.role === 'admin' || profile?.status !== 'pending';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.avatarWrap} onPress={pickAvatar} disabled={avatarUploading}>
        {profile?.avatar ? (
          <Image source={{ uri: profile.avatar }} style={styles.avatarImg} />
        ) : (
          <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        {avatarUploading && (
          <View style={styles.avatarOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>✎</Text>
        </View>
      </Pressable>

      <Text style={styles.name}>{profile?.name || 'Atleta'}</Text>
      <Text style={styles.email}>{profile?.email}</Text>

      <View style={[styles.statusChip, isActive ? styles.statusActive : styles.statusPending]}>
        <View style={[styles.statusDot, { backgroundColor: isActive ? colors.accent : '#F2C037' }]} />
        <Text style={[styles.statusText, { color: isActive ? colors.accent : '#F2C037' }]}>
          {profile?.role === 'admin' ? 'Administrador' : isActive ? 'Miembro activo' : 'Pendiente de alta'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <View style={styles.card}>
            <Row label="Teléfono" value={profile?.phone || '—'} />
            <Row label="Nacimiento" value={formatDate(profile?.birthDate)} />
            <Row label="Miembro desde" value={formatDate(profile?.joinedAt || profile?.createdAt)} />
            {visits != null && <Row label="Visitas totales" value={String(visits)} />}
            <Row label="Rol" value={profile?.role === 'admin' ? 'Admin' : 'Atleta'} last />
          </View>

          <Text style={styles.sectionTitle}>Récords Personales</Text>

          {MOVEMENTS.map(({ category, items }) => (
            <View key={category} style={styles.prGroup}>
              <Text style={styles.prCategory}>{category}</Text>
              {items.map(({ key, label, unit }, idx) => {
                const pr = prs[key];
                const isEditing = editingKey === key;
                const isLast = idx === items.length - 1;
                return (
                  <View key={key} style={[styles.prRow, isLast && { borderBottomWidth: 0 }]}>
                    <Text style={styles.prLabel}>{label}</Text>
                    {isEditing ? (
                      <View style={styles.prEditRow}>
                        <TextInput
                          style={styles.prInput}
                          value={editValue}
                          onChangeText={setEditValue}
                          keyboardType="numeric"
                          autoFocus
                          placeholder={unit === 'reps' ? 'reps' : 'kg'}
                          placeholderTextColor={colors.textMuted}
                          onSubmitEditing={() => saveEdit(key, unit)}
                          returnKeyType="done"
                        />
                        <Pressable style={styles.prSaveBtn} onPress={() => saveEdit(key, unit)}>
                          <Text style={styles.prSaveTxt}>✓</Text>
                        </Pressable>
                        <Pressable style={styles.prCancelBtn} onPress={() => setEditingKey(null)}>
                          <Text style={styles.prCancelTxt}>✕</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={styles.prValueRow} onPress={() => startEdit(key, pr?.value)}>
                        <Text style={[styles.prValue, !pr && { color: colors.textMuted }]}>
                          {pr ? `${pr.value} ${pr.unit}` : '—'}
                        </Text>
                        <Text style={styles.prEditIcon}>✎</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </>
      )}

      <Pressable style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value, last }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingTop: spacing.xxl, alignItems: 'center', paddingBottom: spacing.xxl },

  avatarWrap: { width: 96, height: 96, borderRadius: 48, marginBottom: spacing.md },
  avatarImg: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }
  },
  avatarText: { color: '#05230b', fontSize: 34, fontWeight: '900' },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center'
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.base,
    alignItems: 'center', justifyContent: 'center'
  },
  avatarBadgeText: { color: colors.textPrimary, fontSize: 13 },

  name: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
  email: { color: colors.textMuted, fontSize: 14, marginTop: 2 },

  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderRadius: 20, marginTop: spacing.md, marginBottom: spacing.lg, borderWidth: 1
  },
  statusActive: { backgroundColor: 'rgba(70,226,42,0.1)', borderColor: 'rgba(70,226,42,0.4)' },
  statusPending: { backgroundColor: 'rgba(242,192,55,0.1)', borderColor: 'rgba(242,192,55,0.4)' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  statusText: { fontSize: 13, fontWeight: '700' },

  card: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radii.md, paddingHorizontal: spacing.lg, marginBottom: spacing.xl
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  sectionTitle: {
    color: colors.textPrimary, fontSize: 18, fontWeight: '800',
    alignSelf: 'flex-start', marginBottom: spacing.md
  },
  prGroup: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radii.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md
  },
  prCategory: {
    color: colors.accent, fontSize: 11, fontWeight: '800',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  prLabel: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  prValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prValue: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  prEditIcon: { color: colors.textMuted, fontSize: 13 },
  prEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prInput: {
    color: colors.textPrimary, backgroundColor: colors.surfaceAlt,
    borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 14, fontWeight: '700', minWidth: 70, textAlign: 'right',
    borderWidth: 1, borderColor: colors.accent
  },
  prSaveBtn: {
    backgroundColor: colors.accent, borderRadius: radii.sm,
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center'
  },
  prSaveTxt: { color: '#05230b', fontWeight: '900', fontSize: 16 },
  prCancelBtn: {
    backgroundColor: colors.surface, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border,
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center'
  },
  prCancelTxt: { color: colors.textMuted, fontSize: 14 },

  logout: {
    width: '100%', marginTop: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,75,75,0.4)',
    borderRadius: radii.md, paddingVertical: 15, alignItems: 'center'
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' }
});
