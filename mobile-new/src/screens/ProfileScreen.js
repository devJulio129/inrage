import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, TextInput, Image, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';

// Nombres en inglés, como se publican en el pizarrón del box.
const MOVEMENTS = [
  {
    category: 'Olympic Lifting', items: [
      { key: 'snatch', label: 'Snatch', unit: 'kg' },
      { key: 'power_snatch', label: 'Power Snatch', unit: 'kg' },
      { key: 'clean', label: 'Clean', unit: 'kg' },
      { key: 'power_clean', label: 'Power Clean', unit: 'kg' },
      { key: 'clean_and_jerk', label: 'Clean & Jerk', unit: 'kg' },
      { key: 'jerk', label: 'Jerk', unit: 'kg' },
    ]
  },
  {
    category: 'Strength', items: [
      { key: 'back_squat', label: 'Back Squat', unit: 'kg' },
      { key: 'front_squat', label: 'Front Squat', unit: 'kg' },
      { key: 'overhead_squat', label: 'Overhead Squat', unit: 'kg' },
      { key: 'deadlift', label: 'Deadlift', unit: 'kg' },
      { key: 'bench_press', label: 'Bench Press', unit: 'kg' },
      { key: 'overhead_press', label: 'Strict Press', unit: 'kg' },
      { key: 'push_press', label: 'Push Press', unit: 'kg' },
      { key: 'thruster', label: 'Thruster', unit: 'kg' },
    ]
  },
  {
    category: 'Gymnastics · máx. reps', items: [
      { key: 'pull_ups', label: 'Pull Ups', unit: 'reps' },
      { key: 'chest_to_bar', label: 'Chest to Bar', unit: 'reps' },
      { key: 'muscle_ups', label: 'Muscle Ups', unit: 'reps' },
      { key: 'bar_muscle_ups', label: 'Bar Muscle Ups', unit: 'reps' },
      { key: 'handstand_push_ups', label: 'HSPU', unit: 'reps' },
      { key: 'toes_to_bar', label: 'Toes to Bar', unit: 'reps' },
      { key: 'push_ups', label: 'Push Ups', unit: 'reps' },
      { key: 'ring_dips', label: 'Ring Dips', unit: 'reps' },
      { key: 'double_unders', label: 'Double Unders', unit: 'reps' },
      { key: 'wall_balls', label: 'Wall Balls', unit: 'reps' },
      { key: 'pistols', label: 'Pistols', unit: 'reps' },
      { key: 'sit_ups', label: 'Sit Ups', unit: 'reps' },
      { key: 'burpees', label: 'Burpees', unit: 'reps' },
    ]
  },
  {
    category: 'Cardio · Distancias', items: [
      { key: 'run_400m', label: '400 m Run', unit: 'time' },
      { key: 'run_1k', label: '1 km Run', unit: 'time' },
      { key: 'run_1mile', label: '1 Mile Run', unit: 'time' },
      { key: 'run_5k', label: '5 km Run', unit: 'time' },
      { key: 'run_10k', label: '10 km Run', unit: 'time' },
      { key: 'row_500m', label: '500 m Row', unit: 'time' },
      { key: 'row_2k', label: '2 km Row', unit: 'time' },
      { key: 'ski_500m', label: '500 m Ski', unit: 'time' },
      { key: 'ski_1k', label: '1 km Ski', unit: 'time' },
    ]
  },
  {
    category: 'Cardio · Calorías (1 min)', items: [
      { key: 'assault_bike_cal', label: 'Assault Bike', unit: 'cal' },
      { key: 'echo_bike_cal', label: 'Echo Bike', unit: 'cal' },
      { key: 'bike_erg_cal', label: 'BikeErg', unit: 'cal' },
      { key: 'row_erg_cal', label: 'Row Erg', unit: 'cal' },
      { key: 'ski_erg_cal', label: 'SkiErg', unit: 'cal' },
    ]
  },
  {
    category: 'Tests de Rendimiento', items: [
      { key: 'cmj', label: 'Salto vertical (CMJ)', unit: 'cm' },
      { key: 'abalakov', label: 'Salto Abalakov', unit: 'cm' },
      { key: 'broad_jump', label: 'Salto horizontal', unit: 'cm' },
      { key: 'med_ball_throw', label: 'Lanzamiento balón', unit: 'm' },
      { key: 'cooper', label: 'Test de Cooper (12 min)', unit: 'm' },
      { key: 'vo2max', label: 'VO₂ máx', unit: 'ml' },
      { key: 'hr_rest', label: 'FC en reposo', unit: 'bpm' },
      { key: 'hr_max', label: 'FC máxima', unit: 'bpm' },
      { key: 'hr_recovery', label: 'FC recuperación (1 min)', unit: 'bpm' },
      { key: 'anaerobic_threshold', label: 'Umbral anaeróbico', unit: 'bpm' },
    ]
  },
  {
    category: 'Medidas Corporales', items: [
      { key: 'body_weight', label: 'Peso', unit: 'kg' },
      { key: 'height', label: 'Estatura', unit: 'cm' },
      { key: 'body_fat', label: '% de grasa', unit: 'pct' },
      { key: 'neck', label: 'Cuello', unit: 'cm' },
      { key: 'chest', label: 'Pecho', unit: 'cm' },
      { key: 'waist', label: 'Cintura', unit: 'cm' },
      { key: 'hip', label: 'Cadera', unit: 'cm' },
      { key: 'arm', label: 'Brazo', unit: 'cm' },
      { key: 'thigh', label: 'Muslo', unit: 'cm' },
      { key: 'calf', label: 'Pantorrilla', unit: 'cm' },
    ]
  },
];

// 'time' PRs viajan en segundos; el atleta los escribe y ve como mm:ss.
export function parseTimeToSecs(t) {
  const m = String(t).trim().match(/^(\d{1,2}):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = parseFloat(t);
  return Number.isNaN(n) || n <= 0 ? null : n;
}
export function fmtSecs(s) {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Sufijo visible por unidad.
const UNIT_SUFFIX = {
  kg: 'kg', lb: 'lb', reps: 'reps', cal: 'cal', cm: 'cm',
  bpm: 'bpm', ml: 'ml/kg/min', pct: '%', m: 'm'
};
function unitPlaceholder(unit) {
  if (unit === 'time') return 'mm:ss';
  if (unit === 'reps') return 'reps';
  if (unit === 'kg') return 'kg o lb';
  return UNIT_SUFFIX[unit] || '';
}
export function fmtPR(pr) {
  if (!pr) return '—';
  if (pr.unit === 'time') return `${fmtSecs(pr.value)} min`;
  const suffix = UNIT_SUFFIX[pr.unit] || pr.unit;
  return `${pr.value} ${suffix}`;
}

export default function ProfileScreen({ user }) {
  const [profile, setProfile] = useState(user);
  const [visits, setVisits] = useState(null);
  const [prs, setPrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  // Secciones colapsables: arranca abierta solo la primera.
  const [openCats, setOpenCats] = useState(() => new Set([MOVEMENTS[0].category]));

  function toggleCat(category) {
    setOpenCats(prev => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });
  }

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
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setAvatarUploading(true);
    try {
      // Reduce a 256px antes de subir: una foto de cámara en base64 pesa
      // varios MB y el servidor la rechazaba. Así viaja en ~30-60 KB.
      const small = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const dataUri = `data:image/jpeg;base64,${small.base64}`;
      await api.updateAvatar(dataUri);
      setProfile(prev => ({ ...prev, avatar: dataUri }));
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function startEdit(key, currentValue, unit) {
    setEditingKey(key);
    if (currentValue == null) return setEditValue('');
    setEditValue(unit === 'time' ? fmtSecs(currentValue) : String(currentValue));
  }

  async function saveEdit(key, unit) {
    setEditingKey(null);
    if (!editValue.trim()) return;
    const num = unit === 'time' ? parseTimeToSecs(editValue) : parseFloat(editValue);
    if (num == null || isNaN(num) || num <= 0) return;
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

          <Text style={styles.sectionTitle}>Récords y Mediciones</Text>
          <Text style={styles.sectionHint}>Toca una sección para abrirla · toca un valor para editarlo</Text>

          {MOVEMENTS.map(({ category, items }) => {
            const open = openCats.has(category);
            const filled = items.filter(it => prs[it.key]).length;
            return (
              <View key={category} style={styles.prGroup}>
                <Pressable style={styles.prCatHead} onPress={() => toggleCat(category)}>
                  <Text style={styles.prCategory}>{category}</Text>
                  <View style={styles.prCatRight}>
                    <Text style={styles.prCatCount}>{filled}/{items.length}</Text>
                    <Text style={styles.prChevron}>{open ? '▾' : '▸'}</Text>
                  </View>
                </Pressable>
                {open && items.map(({ key, label, unit }, idx) => {
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
                            keyboardType={unit === 'time' ? 'numbers-and-punctuation' : 'numeric'}
                            autoFocus
                            placeholder={unitPlaceholder(unit)}
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
                        <Pressable style={styles.prValueRow} onPress={() => startEdit(key, pr?.value, unit)}>
                          <Text style={[styles.prValue, !pr && { color: colors.textMuted }]}>
                            {fmtPR(pr)}
                          </Text>
                          <Text style={styles.prEditIcon}>✎</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </>
      )}

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

  name: { color: colors.textPrimary, fontFamily: type.display, fontSize: 32, letterSpacing: 1 },
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
    color: colors.textPrimary, fontFamily: type.display, fontSize: 24, letterSpacing: 1,
    alignSelf: 'flex-start', marginBottom: 2
  },
  sectionHint: {
    color: colors.textMuted, fontSize: 12, alignSelf: 'flex-start', marginBottom: spacing.md
  },
  prGroup: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radii.md, paddingHorizontal: spacing.lg, marginBottom: spacing.sm + 2
  },
  prCatHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14
  },
  prCategory: {
    color: colors.accent, fontSize: 12, fontWeight: '800',
    letterSpacing: 1, textTransform: 'uppercase'
  },
  prCatRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prCatCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  prChevron: { color: colors.textMuted, fontSize: 12 },
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
