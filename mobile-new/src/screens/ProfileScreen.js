import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { colors, spacing, radii } from '../theme';
import { api } from '../api/client';

export default function ProfileScreen({ user, onLogout }) {
  const [profile, setProfile] = useState(user);
  const [visits, setVisits] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [me, att] = await Promise.all([
          api.me().catch(() => user),
          api.myAttendance().catch(() => null)
        ]);
        setProfile(me || user);
        setVisits(att?.totalVisits ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const initials = (profile?.name || 'A')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isActive = profile?.role === 'admin' || profile?.status !== 'pending';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
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
        <View style={styles.card}>
          <Row label="Teléfono" value={profile?.phone || '—'} />
          <Row label="Nacimiento" value={formatDate(profile?.birthDate)} />
          <Row label="Miembro desde" value={formatDate(profile?.joinedAt || profile?.createdAt)} />
          {visits != null && <Row label="Visitas totales" value={String(visits)} />}
          <Row label="Rol" value={profile?.role === 'admin' ? 'Admin' : 'Atleta'} last />
        </View>
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
  content: { padding: spacing.lg, paddingTop: spacing.xxl, alignItems: 'center' },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }
  },
  avatarText: { color: '#05230b', fontSize: 32, fontWeight: '900' },
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
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },

  logout: {
    width: '100%',
    borderWidth: 1, borderColor: 'rgba(255,75,75,0.4)',
    borderRadius: radii.md, paddingVertical: 15, alignItems: 'center'
  },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '700' }
});
