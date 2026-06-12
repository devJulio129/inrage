import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  Image,
  Animated,
  Easing,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import GymInfo from '../components/GymInfo';

// Cross-platform confirm (Alert.alert is a no-op on react-native-web).
function confirmAsync(title, msg, action = 'Eliminar') {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n${msg}`));
  }
  return new Promise((resolve) =>
    Alert.alert(title, msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) }
    ])
  );
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

// Foto del miembro (base64) o iniciales sobre el verde de la marca.
function Avatar({ uri, name, size = 36 }) {
  const initials = (name || 'A').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={round} />;
  return (
    <View style={[round, styles.avatarFallback]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

// ── Comentarios del WOD ─────────────────────────────────────────────
function WodComments({ workout, user }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.getWodComments(workout._id);
        if (alive) setComments(list);
      } catch {
        if (alive) setError('No se pudieron cargar los comentarios.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workout._id]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.addWodComment(workout._id, value);
      setComments((prev) => [...prev, created]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function remove(comment) {
    const ok = await confirmAsync('Eliminar comentario', '¿Seguro que quieres borrarlo?');
    if (!ok) return;
    try {
      await api.deleteWodComment(workout._id, comment._id);
      setComments((prev) => prev.filter((c) => c._id !== comment._id));
    } catch (err) {
      setError(err.message);
    }
  }

  const isAdmin = user?.role === 'admin';

  return (
    <View style={styles.commentsBlock}>
      <View style={styles.commentsHeader}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.accent} />
        <Text style={styles.commentsTitle}>COMENTARIOS</Text>
        {comments.length > 0 && <Text style={styles.commentsCount}>{comments.length}</Text>}
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />}

      {!loading && comments.length === 0 && (
        <Text style={styles.commentsEmpty}>Sé el primero en comentar el WOD de hoy 💬</Text>
      )}

      {comments.map((c) => {
        const own = String(c.member?._id) === String(user?._id);
        return (
          <View key={c._id} style={styles.commentRow}>
            <Avatar uri={c.member?.avatar} name={c.member?.name} />
            <View style={styles.commentBody}>
              <View style={styles.commentMeta}>
                <Text style={styles.commentName}>{c.member?.name || 'Atleta'}</Text>
                <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
              </View>
              <Text style={styles.commentText}>{c.text}</Text>
            </View>
            {(own || isAdmin) && (
              <Pressable onPress={() => remove(c)} hitSlop={8} style={styles.commentDelete}>
                <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        );
      })}

      {error && <Text style={styles.commentsError}>{error}</Text>}

      <View style={styles.composer}>
        <Avatar uri={user?.avatar} name={user?.name} size={32} />
        <TextInput
          style={styles.composerInput}
          placeholder="Comenta el WOD…"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          maxLength={500}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
        >
          {sending
            ? <ActivityIndicator size="small" color="#05230b" />
            : <Ionicons name="arrow-up" size={18} color="#05230b" />}
        </Pressable>
      </View>
    </View>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────
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
  const inGym = Boolean(attendance?.inGym);

  // Transición suave puerta → dentro del box.
  const insideAnim = useRef(new Animated.Value(0)).current;
  // Pulso del botón de entrada.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(insideAnim, {
      toValue: inGym ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [inGym]);

  useEffect(() => {
    if (inGym) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [inGym]);

  async function load() {
    let current = user;
    try {
      current = await api.me();
      onUserUpdate?.(current);
    } catch {
      // keep cached user
    }

    const active = current?.role === 'admin' || current?.status !== 'pending';

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

  async function checkIn() {
    if (checking) return;
    setChecking(true);
    setCheckinError(null);
    try {
      await api.checkIn();
      setAttendance(await api.myAttendance());
    } catch (err) {
      setCheckinError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function checkOut() {
    const ok = await confirmAsync('Marcar salida', '¿Terminaste tu entrenamiento por hoy?', 'Salir');
    if (!ok) return;
    setChecking(true);
    setCheckinError(null);
    try {
      await api.checkOut();
      setAttendance(await api.myAttendance());
    } catch (err) {
      setCheckinError(err.message);
    } finally {
      setChecking(false);
    }
  }

  const heroScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const heroGlow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const insideOpacity = insideAnim;
  const insideShift = insideAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{formatDate(new Date())}</Text>
          <Text style={styles.userName}>Hola, {firstName(user?.name)}</Text>
        </View>
        <Avatar uri={user?.avatar} name={user?.name} size={42} />
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}

      {!loading && gymInfo?.announcement ? (
        <View style={styles.announce}>
          <Text style={styles.announceLabel}>📣 AVISO DEL GIMNASIO</Text>
          <Text style={styles.announceText}>{gymInfo.announcement}</Text>
        </View>
      ) : null}

      {/* PENDING: sin WOD, solo info del gym */}
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

      {/* FUERA DEL BOX: la entrada es la puerta al entrenamiento */}
      {!loading && isActive && !inGym && (
        <>
          <View style={styles.gate}>
            <Animated.View style={[styles.heroGlow, { opacity: heroGlow, transform: [{ scale: heroScale }] }]} />
            <Animated.View style={{ transform: [{ scale: heroScale }] }}>
              <Pressable onPress={checkIn} disabled={checking} style={styles.heroBtn}>
                {checking ? (
                  <ActivityIndicator color="#05230b" size="large" />
                ) : (
                  <>
                    <Ionicons name="barbell" size={34} color="#05230b" />
                    <Text style={styles.heroBtnText}>ENTRAR{'\n'}AL BOX</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
            <Text style={styles.gateHint}>Marca tu entrada para desbloquear el WOD de hoy</Text>
            {checkinError && <Text style={styles.checkinError}>{checkinError}</Text>}
          </View>

          {/* WOD bloqueado: solo el título como teaser */}
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedLabel}>WOD DE HOY</Text>
              <Text style={styles.lockedTitle}>
                {wodEmpty ? 'Aún no publicado' : workout ? workout.title : wodError ? '—' : '…'}
              </Text>
            </View>
          </View>

          <GymInfo info={gymInfo} />
        </>
      )}

      {/* DENTRO DEL BOX: WOD completo + comentarios */}
      {!loading && isActive && inGym && (
        <Animated.View style={{ opacity: insideOpacity, transform: [{ translateY: insideShift }] }}>
          <View style={styles.statusRow}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <View>
                <Text style={styles.statusTitle}>EN EL BOX</Text>
                <Text style={styles.statusSince}>Entrada {formatTime(attendance.since)}</Text>
              </View>
            </View>
            <Pressable onPress={checkOut} disabled={checking} style={styles.checkoutBtn}>
              <Ionicons name="exit-outline" size={15} color={colors.textPrimary} />
              <Text style={styles.checkoutText}>Salida</Text>
            </Pressable>
          </View>
          {checkinError && <Text style={styles.checkinError}>{checkinError}</Text>}

          {wodEmpty && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Aún no hay WOD para hoy</Text>
              <Text style={styles.errorText}>El gimnasio todavía no ha publicado el entrenamiento.</Text>
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
            <>
              <View style={styles.card}>
                <Text style={styles.wodKicker}>WOD · {formatDate(new Date())}</Text>
                <Text style={styles.title}>{workout.title}</Text>
                <View style={styles.divider} />
                <Text style={styles.description}>{workout.description}</Text>
              </View>
              <WodComments workout={workout} user={user} />
            </>
          )}
        </Animated.View>
      )}
    </ScrollView>
  );
}

function firstName(name) {
  return (name || 'Atleta').split(' ')[0];
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  hello: { color: colors.textMuted, fontSize: 12, letterSpacing: 1.5 },
  userName: { color: colors.textPrimary, fontFamily: type.display, fontSize: 30, letterSpacing: 1, marginTop: 2 },

  avatarFallback: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarInitials: { color: '#05230b', fontWeight: '900' },

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

  /* Puerta de entrada */
  gate: { alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.md },
  heroGlow: {
    position: 'absolute',
    top: spacing.xl - 14,
    width: 178,
    height: 178,
    borderRadius: 89,
    backgroundColor: colors.accent
  },
  heroBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  heroBtnText: { color: '#05230b', fontFamily: type.display, fontSize: 22, letterSpacing: 2, textAlign: 'center', lineHeight: 24 },
  gateHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.lg, textAlign: 'center' },

  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg
  },
  lockedLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, marginBottom: 2 },
  lockedTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 24, letterSpacing: 1 },

  /* Dentro del box */
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.4)',
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  statusTitle: { color: colors.accent, fontFamily: type.display, fontSize: 17, letterSpacing: 2 },
  statusSince: { color: colors.textMuted, fontSize: 11 },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 12
  },
  checkoutText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  checkinError: { color: colors.danger, fontSize: 13, marginBottom: spacing.lg, textAlign: 'center' },

  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent },
  wodKicker: { color: colors.accent, fontFamily: type.mono, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 40, letterSpacing: 1.5, marginBottom: spacing.md },
  divider: { height: 1, backgroundColor: colors.border, marginBottom: spacing.md },
  description: { color: colors.textPrimary, fontFamily: type.mono, fontSize: 16, lineHeight: 26 },

  errorBox: { padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  errorTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: spacing.sm },
  errorText: { color: colors.textMuted, fontFamily: type.mono, fontSize: 13 },
  errorHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, opacity: 0.7 },

  /* Comentarios */
  commentsBlock: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md
  },
  commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  commentsTitle: { color: colors.accent, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  commentsCount: {
    color: colors.accent,
    backgroundColor: 'rgba(70,226,42,0.12)',
    fontSize: 11,
    fontWeight: '800',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden'
  },
  commentsEmpty: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.sm },
  commentRow: { flexDirection: 'row', gap: spacing.sm + 2, paddingVertical: spacing.sm + 2 },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  commentName: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  commentTime: { color: colors.textMuted, fontSize: 11 },
  commentText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, marginTop: 2 },
  commentDelete: { paddingTop: 4 },
  commentsError: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  composerInput: {
    flex: 1,
    color: colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 110
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendBtnDisabled: { opacity: 0.4 }
});
