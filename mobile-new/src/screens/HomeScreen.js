import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Pressable
} from 'react-native';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import GymInfo from '../components/GymInfo';

export default function HomeScreen({ user, onUserUpdate }) {
  const [workout, setWorkout] = useState(null);
  const [wodError, setWodError] = useState(null);
  const [wodEmpty, setWodEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [attendance, setAttendance] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkinError, setCheckinError] = useState(null);

  const [gymInfo, setGymInfo] = useState(null);

  const isActive = user?.role === 'admin' || user?.status !== 'pending';

  async function load() {
    // Refresh approval status from the server (admin may have approved us).
    let current = user;
    try {
      current = await api.me();
      onUserUpdate?.(current);
    } catch {
      // keep cached user
    }

    const active = current?.role === 'admin' || current?.status !== 'pending';

    // Gym info + daily announcement (managed by the admin) — for everyone.
    try {
      setGymInfo(await api.getGymInfo());
    } catch {}

    if (active) {
      setWodError(null);
      setWodEmpty(false);
      try {
        setWorkout(await api.getTodayWorkout());
      } catch (err) {
        setWorkout(null);
        // 404 = no WOD published yet → empty state, not an error.
        if (err.status === 404) setWodEmpty(true);
        else setWodError(err.message);
      }
      try {
        setAttendance(await api.myAttendance());
      } catch {}
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, []);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  async function toggleCheckin() {
    setChecking(true);
    setCheckinError(null);
    try {
      if (attendance?.inGym) await api.checkOut();
      else await api.checkIn();
      setAttendance(await api.myAttendance());
    } catch (err) {
      setCheckinError(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.hello}>Hola,</Text>
        <Text style={styles.userName}>{user?.name || 'Atleta'} 💪</Text>
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}

      {/* Daily announcement / recommendation from the admin (everyone). */}
      {!loading && gymInfo?.announcement ? (
        <View style={styles.announce}>
          <Text style={styles.announceLabel}>📣 AVISO DEL GIMNASIO</Text>
          <Text style={styles.announceText}>{gymInfo.announcement}</Text>
        </View>
      ) : null}

      {/* PENDING: no WOD, only gym info + notice */}
      {!loading && !isActive && (
        <>
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>⏳ Cuenta pendiente</Text>
            <Text style={styles.pendingText}>
              Tu cuenta está en revisión. En cuanto el gimnasio te dé de alta, aquí
              aparecerá el WOD del día. Mientras tanto, revisa la info del box.
            </Text>
            <Text style={styles.pendingHint}>Desliza hacia abajo para actualizar.</Text>
          </View>
          <GymInfo info={gymInfo} />
        </>
      )}

      {/* ACTIVE: check-in + WOD */}
      {!loading && isActive && (
        <>
          <Pressable
            onPress={toggleCheckin}
            disabled={checking}
            style={[styles.checkin, attendance?.inGym ? styles.checkinIn : styles.checkinOut]}
          >
            {checking ? (
              <ActivityIndicator color={attendance?.inGym ? colors.accent : '#05230b'} />
            ) : attendance?.inGym ? (
              <View style={styles.checkinRow}>
                <View>
                  <View style={styles.liveRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.checkinInTitle}>ESTÁS EN EL BOX</Text>
                  </View>
                  <Text style={styles.checkinSince}>Entrada {formatTime(attendance.since)}</Text>
                </View>
                <Text style={styles.checkinAction}>Marcar salida</Text>
              </View>
            ) : (
              <Text style={styles.checkinOutText}>MARCAR ENTRADA AL BOX</Text>
            )}
          </Pressable>
          {checkinError && <Text style={styles.checkinError}>{checkinError}</Text>}

          <View style={styles.wodHeader}>
            <Text style={styles.label}>WOD</Text>
            <Text style={styles.date}>{formatDate(new Date())}</Text>
          </View>

          {wodEmpty && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Aún no hay WOD para hoy</Text>
              <Text style={styles.errorText}>El gimnasio todavía no ha publicado el entrenamiento de hoy.</Text>
              <Text style={styles.errorHint}>Desliza hacia abajo para actualizar.</Text>
            </View>
          )}

          {wodError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>No se pudo cargar el WOD</Text>
              <Text style={styles.errorText}>{wodError}</Text>
              <Text style={styles.errorHint}>Desliza hacia abajo para reintentar.</Text>
            </View>
          )}

          {workout && (
            <View style={styles.card}>
              <Text style={styles.title}>{workout.title}</Text>
              <View style={styles.divider} />
              <Text style={styles.description}>{workout.description}</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function formatDate(d) {
  return d.toLocaleDateString('es-MX', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}
function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  hello: { color: colors.textMuted, fontSize: 14 },
  userName: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', marginTop: 2 },

  announce: {
    backgroundColor: 'rgba(70,226,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  announceLabel: { color: colors.accent, fontSize: 11, letterSpacing: 2, fontWeight: '800', marginBottom: 4 },
  announceText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },

  pendingCard: {
    backgroundColor: 'rgba(242,192,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(242,192,55,0.4)',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.xl
  },
  pendingTitle: { color: '#F2C037', fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  pendingText: { color: colors.textPrimary, fontSize: 14, lineHeight: 21 },
  pendingHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md },

  checkin: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    justifyContent: 'center',
    minHeight: 64
  },
  checkinOut: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }
  },
  checkinOutText: { color: '#05230b', fontWeight: '800', fontSize: 15, letterSpacing: 1.5 },
  checkinIn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  checkinRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginRight: 7 },
  checkinInTitle: { color: colors.accent, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  checkinSince: { color: colors.textMuted, fontSize: 12 },
  checkinAction: { color: colors.textPrimary, fontSize: 13, textDecorationLine: 'underline' },
  checkinError: { color: colors.danger, fontSize: 13, marginTop: -spacing.sm, marginBottom: spacing.lg, textAlign: 'center' },

  wodHeader: { marginBottom: spacing.lg },
  label: { color: colors.accent, fontFamily: type.mono, fontSize: 14, letterSpacing: 4, marginBottom: spacing.xs },
  date: { color: colors.textPrimary, fontFamily: type.mono, fontSize: 12, letterSpacing: 2, opacity: 0.6 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent },
  title: { color: colors.textPrimary, fontSize: 32, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.md },
  description: { color: colors.textPrimary, fontFamily: type.mono, fontSize: 16, lineHeight: 26 },
  errorBox: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  errorTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: spacing.sm },
  errorText: { color: colors.textMuted, fontFamily: type.mono, fontSize: 13 },
  errorHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, opacity: 0.7 }
});
