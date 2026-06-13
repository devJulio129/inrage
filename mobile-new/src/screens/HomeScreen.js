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
  Platform,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, type } from '../theme';
import { api } from '../api/client';
import GymInfo from '../components/GymInfo';
import { fmtSecs } from './ProfileScreen';

// ── "TU WOD": prescripción personalizada a partir de los PRs ─────────
// El coach escribe líneas con porcentaje — "30 power cleans (55%)" — y la
// app calcula la dosis de cada atleta con SUS récords.
const PR_LABELS = {
  snatch: 'Snatch', power_snatch: 'Power Snatch', clean: 'Clean', power_clean: 'Power Clean',
  clean_and_jerk: 'Clean & Jerk', jerk: 'Jerk', thruster: 'Thruster', push_press: 'Push Press',
  overhead_press: 'Strict Press', overhead_squat: 'Overhead Squat', front_squat: 'Front Squat',
  back_squat: 'Back Squat', deadlift: 'Deadlift', bench_press: 'Bench Press',
  pull_ups: 'Pull Ups', chest_to_bar: 'Chest to Bar', muscle_ups: 'Muscle Ups',
  bar_muscle_ups: 'Bar Muscle Ups', handstand_push_ups: 'HSPU', toes_to_bar: 'Toes to Bar',
  push_ups: 'Push Ups', ring_dips: 'Ring Dips', double_unders: 'Double Unders',
  wall_balls: 'Wall Balls', pistols: 'Pistols', sit_ups: 'Sit Ups', burpees: 'Burpees',
  run_400m: '400 m Run', row_500m: '500 m Row'
};

// Catálogo de movimientos del pizarrón (inglés + sinónimos en español).
// El orden importa: lo específico va antes de lo genérico.
const MOVES = [
  // Cardio por calorías → solo intensidad (RPE), no requiere PR.
  { re: /cal\b.*(row|bike|ski|assault|echo)|(row|bike|ski|assault|echo).*\bcal/, kind: 'rpe' },
  { re: /(assault|echo)\s*bike|bike\s*erg|\bbike\b|\bski\b/, kind: 'rpe' },
  // Cardio por metros → ritmo según el PR de referencia.
  { re: /run|carrera|corre/, key: 'run_400m', kind: 'run', base: 400 },
  { re: /row|remo/, key: 'row_500m', kind: 'run', base: 500 },
  // Halterofilia y fuerza (peso) — específico primero.
  { re: /power\s*snatch/, key: 'power_snatch', kind: 'weight' },
  { re: /snatch|arrancada/, key: 'snatch', kind: 'weight' },
  { re: /clean\s*(&|and|y)?\s*jerk|envi[oó]n/, key: 'clean_and_jerk', kind: 'weight' },
  { re: /power\s*clean/, key: 'power_clean', kind: 'weight' },
  { re: /clean/, key: 'clean', kind: 'weight' },
  { re: /jerk/, key: 'jerk', kind: 'weight' },
  { re: /thruster/, key: 'thruster', kind: 'weight' },
  { re: /push\s*press/, key: 'push_press', kind: 'weight' },
  { re: /(strict|shoulder)\s*press|press militar|ohp/, key: 'overhead_press', kind: 'weight' },
  { re: /overhead\s*squat|ohs/, key: 'overhead_squat', kind: 'weight' },
  { re: /front\s*squat|sentadilla frontal/, key: 'front_squat', kind: 'weight' },
  { re: /(back\s*)?squat|sentadilla/, key: 'back_squat', kind: 'weight' },
  { re: /deadlift|peso muerto/, key: 'deadlift', kind: 'weight' },
  { re: /bench|banca/, key: 'bench_press', kind: 'weight' },
  // Gimnasia (máx. reps de corrido) — específico primero.
  { re: /chest.?to.?bar|c2b/, key: 'chest_to_bar', kind: 'reps' },
  { re: /bar\s*muscle.?up/, key: 'bar_muscle_ups', kind: 'reps' },
  { re: /muscle.?up/, key: 'muscle_ups', kind: 'reps' },
  { re: /pull.?up|dominada/, key: 'pull_ups', kind: 'reps' },
  { re: /hspu|handstand\s*push/, key: 'handstand_push_ups', kind: 'reps' },
  { re: /toes.?to.?bar|t2b|knees.?to/, key: 'toes_to_bar', kind: 'reps' },
  { re: /push.?up|lagartija/, key: 'push_ups', kind: 'reps' },
  { re: /dip/, key: 'ring_dips', kind: 'reps' },
  { re: /double.?under|\bdu\b/, key: 'double_unders', kind: 'reps' },
  { re: /wall\s*ball/, key: 'wall_balls', kind: 'reps' },
  { re: /pistol/, key: 'pistols', kind: 'reps' },
  { re: /sit.?up/, key: 'sit_ups', kind: 'reps' },
  { re: /burpee/, key: 'burpees', kind: 'reps' }
];

function matchMovement(text) {
  const t = text.toLowerCase();
  for (const mov of MOVES) {
    if (mov.re.test(t)) return mov;
  }
  return null;
}

function rpeForPct(pct) {
  if (pct >= 90) return 'RPE 9–10';
  if (pct >= 80) return 'RPE 8–9';
  if (pct >= 70) return 'RPE 7–8';
  if (pct >= 60) return 'RPE 6–7';
  return 'RPE 5–6';
}

function personalizeLine(line, prs) {
  const m = line.match(/^\s*(\d+(?:\.\d+)?)\s*(.+?)\s*\(\s*(\d{1,3})\s*%\s*\)/);
  if (!m) return null;
  const qty = parseFloat(m[1]);
  const pct = Number(m[3]);
  const mov = matchMovement(m[2]);
  if (!mov || !qty || !pct) return null;

  const base = { line: line.trim(), key: mov.key };

  // Calorías en máquina: el % se traduce directo a intensidad percibida.
  if (mov.kind === 'rpe') {
    return { ...base, rx: rpeForPct(pct), hint: 'intensidad sugerida' };
  }

  const pr = prs[mov.key];
  if (!pr) return { ...base, missing: PR_LABELS[mov.key] || m[2] };

  if (mov.kind === 'reps') {
    // Fracción del máximo que aguanta por serie → series parejas.
    const chunk = Math.max(1, Math.floor((pr.value * pct) / 100));
    const sets = Math.max(1, Math.ceil(qty / chunk));
    const perSet = Math.ceil(qty / sets);
    return {
      ...base,
      rx: sets === 1 ? `${qty} de corrido` : `${sets} series de ~${perSet}`,
      hint: `tu máx: ${pr.value}`
    };
  }
  if (mov.kind === 'weight') {
    // Redondeo a discos reales: 5 lb o 2.5 kg.
    const raw = (pr.value * pct) / 100;
    const rounded = pr.unit === 'lb' ? Math.round(raw / 5) * 5 : Math.round(raw / 2.5) * 2.5;
    return { ...base, rx: `${rounded} ${pr.unit}`, hint: `PR: ${pr.value} ${pr.unit}` };
  }
  if (mov.kind === 'run') {
    // Ritmo del PR de referencia escalado a la distancia y a la intensidad.
    const target = (pr.value * (qty / mov.base)) / (pct / 100);
    return {
      ...base,
      rx: `≈ ${fmtSecs(target)} · ${rpeForPct(pct)}`,
      hint: `${mov.base} m: ${fmtSecs(pr.value)}`
    };
  }
  return null;
}

function PersonalizedWod({ description, prs }) {
  const items = (description || '')
    .split('\n')
    .map((l) => personalizeLine(l, prs))
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <View style={styles.persoCard}>
      <View style={styles.persoHeader}>
        <Ionicons name="speedometer-outline" size={15} color={colors.accent} />
        <Text style={styles.persoTitle}>TU WOD</Text>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.persoRow}>
          <Text style={styles.persoLine}>{it.line}</Text>
          {it.missing ? (
            <Text style={styles.persoMissing}>
              Registra tu PR de {it.missing} en tu perfil para ver tu dosis
            </Text>
          ) : (
            <Text style={styles.persoRx}>
              → {it.rx} <Text style={styles.persoHint}>({it.hint})</Text>
            </Text>
          )}
        </View>
      ))}
      <Text style={styles.persoFoot}>Calculado con tus récords personales 🎯</Text>
    </View>
  );
}

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
  // Math.max evita "hace -2 min" si el reloj del server va adelantado.
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

// ── Clases y feed: helpers de fecha y video ─────────────────────────
function localDayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// El server guarda el día a medianoche; la parte UTC del ISO devuelve el día
// elegido sin importar la zona horaria del server.
function classDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function dayLabel(date) {
  const day = classDay(date);
  if (day === localDayStr()) return 'HOY';
  if (day === localDayStr(1)) return 'MAÑANA';
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(y, m - 1, dd)
    .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })
    .toUpperCase();
}

function groupClassesByDay(list) {
  const today = localDayStr();
  const map = new Map();
  for (const c of list || []) {
    if (classDay(c.date) < today) continue;
    const k = dayLabel(c.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(c);
  }
  return [...map.entries()];
}

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// La próxima clase que el atleta ya reservó (la más cercana aún por venir;
// tolera hasta 2 h pasadas por si la abre estando ya en la clase).
function nextReservedClass(classes) {
  const now = Date.now();
  return (classes || [])
    .filter((c) => c.mine)
    .map((c) => {
      const [yy, mm, dd] = classDay(c.date).split('-').map(Number);
      const [h, m] = String(c.time).split(':').map(Number);
      return { ...c, when: new Date(yy, mm - 1, dd, h || 0, m || 0).getTime() };
    })
    .filter((c) => c.when > now - 2 * 3600 * 1000)
    .sort((a, b) => a.when - b.when)[0] || null;
}

// Encabezado de sección: barra de acento + título display (ritmo visual).
function SectionHeader({ children }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionAccent} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
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

// ── Reserva de clases ───────────────────────────────────────────────
function ClassesSection({ classes, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  async function toggle(c) {
    if (busyId) return;
    if (c.mine) {
      const ok = await confirmAsync(
        'Cancelar reserva',
        `¿Liberar tu lugar de las ${c.time} (${dayLabel(c.date)})?`,
        'Liberar'
      );
      if (!ok) return;
    }
    setBusyId(c._id);
    setError(null);
    try {
      if (c.mine) await api.cancelClassReservation(c._id);
      else await api.reserveClass(c._id);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
      await onChanged?.(); // el cupo pudo cambiar (p. ej. se llenó)
    } finally {
      setBusyId(null);
    }
  }

  const groups = groupClassesByDay(classes);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <SectionHeader>RESERVA TU CLASE</SectionHeader>
      {error && <Text style={styles.commentsError}>{error}</Text>}
      {groups.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aún no hay clases abiertas. Vuelve más tarde.</Text>
        </View>
      )}
      {groups.map(([day, list]) => (
        <View key={day}>
          <Text style={styles.dayHead}>{day}</Text>
          {list.map((c) => {
            const full = c.spotsLeft === 0 && !c.mine;
            return (
              <View key={c._id} style={styles.classCard}>
                <Text style={styles.classTime}>{c.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.className}>{c.name}</Text>
                  <Text style={[styles.classSpots, c.spotsLeft === 0 && !c.mine && { color: colors.danger }]}>
                    {c.mine
                      ? 'Tienes tu lugar apartado'
                      : c.spotsLeft === 0
                        ? 'Clase llena'
                        : `${c.spotsLeft} de ${c.capacity} lugares libres`}
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggle(c)}
                  disabled={full || busyId === c._id}
                  style={[styles.classBtn, c.mine && styles.classBtnMine, full && styles.classBtnFull]}
                >
                  {busyId === c._id ? (
                    <ActivityIndicator size="small" color={c.mine ? colors.accent : '#05230b'} />
                  ) : (
                    <Text style={[styles.classBtnText, c.mine && styles.classBtnTextMine, full && styles.classBtnTextFull]}>
                      {c.mine ? 'RESERVADO ✓' : full ? 'LLENA' : 'RESERVAR'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Feed de publicaciones del gimnasio ──────────────────────────────
function PostCard({ post }) {
  const yt = youtubeId(post.videoUrl);
  return (
    <View style={styles.postCard}>
      <Text style={styles.postDate}>
        {new Date(post.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} · {timeAgo(post.createdAt)}
      </Text>
      {post.title ? <Text style={styles.postTitle}>{post.title}</Text> : null}
      {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}
      {post.image ? <Image source={{ uri: post.image }} style={styles.postImg} /> : null}
      {post.videoUrl ? (
        <Pressable style={styles.postVideo} onPress={() => Linking.openURL(post.videoUrl)}>
          {yt ? (
            <Image
              source={{ uri: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }}
              style={styles.postVideoThumb}
            />
          ) : null}
          <View style={styles.postVideoRow}>
            <Ionicons name="play-circle" size={20} color={colors.accent} />
            <Text style={styles.postVideoText}>Ver video</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function PostsFeed({ posts }) {
  if (!posts || posts.length === 0) return null;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <SectionHeader>EL BOX PUBLICA</SectionHeader>
      {posts.map((p) => <PostCard key={p._id} post={p} />)}
    </View>
  );
}

// Info del gimnasio como pie de página compacto.
function GymFooter({ info }) {
  if (!info) return null;
  return (
    <View style={styles.footer}>
      <Text style={styles.footerBrand}>{(info.name || 'InRage CrossFit').toUpperCase()}</Text>
      {(info.schedule || []).map((s, i) => (
        <Text key={i} style={styles.footerLine}>{s.day} · {s.hours}</Text>
      ))}
      {info.address ? <Text style={styles.footerLine}>{info.address}</Text> : null}
      {(info.phone || info.instagram) ? (
        <Text style={styles.footerLine}>{[info.phone, info.instagram].filter(Boolean).join(' · ')}</Text>
      ) : null}
    </View>
  );
}

// ── Inicio: saludo, avisos, check-in e info del box ─────────────────
export default function HomeScreen({ user, onUserUpdate }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [attendance, setAttendance] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkinError, setCheckinError] = useState(null);

  const [gymInfo, setGymInfo] = useState(null);
  const [classes, setClasses] = useState([]);
  const [posts, setPosts] = useState([]);

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

    // El feed es para todos (también cuentas pendientes: es contenido educativo).
    try {
      setPosts(await api.getPosts());
    } catch {}

    if (active) {
      try {
        setAttendance(await api.myAttendance());
      } catch {}
      try {
        setClasses(await api.getClasses());
      } catch {}
    }

    setLoading(false);
    setRefreshing(false);
  }

  async function refreshClasses() {
    try {
      setClasses(await api.getClasses());
    } catch {}
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

  const heroScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const insideOpacity = insideAnim;
  const insideShift = insideAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const nextClass = nextReservedClass(classes);

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
          <Text style={styles.hello}>{greeting().toUpperCase()} · {formatDate(new Date())}</Text>
          <Text style={styles.userName}>{firstName(user?.name)}</Text>
        </View>
        <Avatar uri={user?.avatar} name={user?.name} size={46} />
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}

      {!loading && nextClass ? (
        <View style={styles.nextClass}>
          <View style={styles.nextClassIcon}>
            <Ionicons name="calendar" size={18} color="#05230b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextClassLabel}>TU PRÓXIMA CLASE</Text>
            <Text style={styles.nextClassText}>
              {dayLabel(nextClass.date)} · {nextClass.time} · {nextClass.name}
            </Text>
          </View>
        </View>
      ) : null}

      {!loading && gymInfo?.announcement ? (
        <View style={styles.announce}>
          <Text style={styles.announceLabel}>📣 AVISO DEL GIMNASIO</Text>
          <Text style={styles.announceText}>{gymInfo.announcement}</Text>
        </View>
      ) : null}

      {/* PENDING: sin reservas, pero con el feed y la info del gym */}
      {!loading && !isActive && (
        <>
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>⏳ Cuenta pendiente</Text>
            <Text style={styles.pendingText}>
              Tu cuenta está en revisión. En cuanto el gimnasio te dé de alta podrás
              reservar clase y ver el WOD del día.
            </Text>
            <Text style={styles.pendingHint}>Desliza hacia abajo para actualizar.</Text>
          </View>
          <PostsFeed posts={posts} />
          <GymInfo info={gymInfo} />
        </>
      )}

      {/* ACTIVO: check-in como acción propia + info del box */}
      {!loading && isActive && (
        <>
          {/* Check-in: registra tu visita al llegar (pronto via código QR) */}
          {inGym ? (
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
            </Animated.View>
          ) : (
            <Animated.View style={[styles.checkinCard, { transform: [{ scale: heroScale }] }]}>
              <View style={styles.checkinIconWrap}>
                <Ionicons name="barbell" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkinTitle}>¿Ya llegaste al box?</Text>
                <Text style={styles.checkinSub}>Marca tu entrada para registrar tu visita</Text>
              </View>
              <Pressable onPress={checkIn} disabled={checking} style={styles.checkinBtn}>
                {checking
                  ? <ActivityIndicator size="small" color="#05230b" />
                  : <Text style={styles.checkinBtnText}>ENTRAR</Text>}
              </Pressable>
            </Animated.View>
          )}
          {checkinError && <Text style={styles.checkinError}>{checkinError}</Text>}

          <ClassesSection classes={classes} onChanged={refreshClasses} />
          <PostsFeed posts={posts} />
          <GymFooter info={gymInfo} />
        </>
      )}
    </ScrollView>
  );
}

// ── WOD: el entrenamiento de hoy, tu dosis y la conversación ────────
export function WodScreen({ user }) {
  const [workout, setWorkout] = useState(null);
  const [wodError, setWodError] = useState(null);
  const [wodEmpty, setWodEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [prs, setPrs] = useState({});
  const [recent, setRecent] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const isActive = user?.role === 'admin' || user?.status !== 'pending';

  async function load() {
    if (!isActive) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
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
      const prList = await api.getPRs();
      const map = {};
      for (const pr of prList || []) map[pr.movement] = { value: pr.value, unit: pr.unit };
      setPrs(map);
    } catch {}
    try {
      setRecent(await api.getRecentWorkouts());
    } catch {}
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
          <Text style={styles.userName}>WOD del día</Text>
        </View>
        <View style={styles.wodBadge}>
          <Ionicons name="barbell" size={20} color={colors.accent} />
        </View>
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}

      {!loading && !isActive && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>⏳ Cuenta pendiente</Text>
          <Text style={styles.pendingText}>
            En cuanto el gimnasio te dé de alta podrás ver el WOD del día aquí.
          </Text>
        </View>
      )}

      {!loading && isActive && (
        <>
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
              <PersonalizedWod description={workout.description} prs={prs} />
              <WodComments workout={workout} user={user} />
            </>
          )}

          {recent.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <SectionHeader>WODS ANTERIORES</SectionHeader>
              {recent.map((w) => {
                const open = expandedId === w._id;
                return (
                  <View key={w._id} style={styles.histCard}>
                    <Pressable
                      style={styles.histHead}
                      onPress={() => setExpandedId(open ? null : w._id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.histDate}>{formatDate(new Date(w.date))}</Text>
                        <Text style={styles.histName}>{w.title}</Text>
                      </View>
                      <Ionicons
                        name={open ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    {open && (
                      <View style={styles.histBody}>
                        <Text style={styles.description}>{w.description}</Text>
                        <PersonalizedWod description={w.description} prs={prs} />
                        <WodComments workout={w} user={user} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
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
  hello: { color: colors.accent, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  userName: { color: colors.textPrimary, fontFamily: type.display, fontSize: 38, letterSpacing: 1, marginTop: 1 },

  /* Próxima clase reservada */
  nextClass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(70,226,42,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.4)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  nextClassIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center'
  },
  nextClassLabel: { color: colors.accent, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  nextClassText: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },

  /* Encabezado de sección con barra de acento */
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.accent },

  /* Estado vacío genérico */
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    padding: spacing.md
  },
  emptyText: { color: colors.textMuted, fontSize: 13, flex: 1 },

  avatarFallback: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wodBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(70,226,42,0.12)',
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

  /* Check-in: tarjeta héroe (pronto con código QR) */
  checkinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.3)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }
  },
  checkinIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(70,226,42,0.14)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkinTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800' },
  checkinSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  checkinBtn: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 18,
    minWidth: 92,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  checkinBtnText: { color: '#05230b', fontFamily: type.display, fontSize: 17, letterSpacing: 1.5 },

  /* Secciones del inicio */
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 22,
    letterSpacing: 1.5,
    marginBottom: spacing.sm
  },

  /* Reserva de clases */
  dayHead: {
    color: colors.accent,
    fontFamily: type.mono,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: spacing.sm,
    marginBottom: spacing.xs + 2
  },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm
  },
  classTime: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 24,
    letterSpacing: 1,
    minWidth: 58
  },
  className: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  classSpots: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  classBtn: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minWidth: 104,
    alignItems: 'center'
  },
  classBtnMine: {
    backgroundColor: 'rgba(70,226,42,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.45)'
  },
  classBtnFull: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  classBtnText: { color: '#05230b', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  classBtnTextMine: { color: colors.accent },
  classBtnTextFull: { color: colors.textMuted },

  /* Feed de publicaciones */
  postCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2
  },
  postDate: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  postTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 22, letterSpacing: 1, marginBottom: 4 },
  postBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  postImg: {
    width: '100%',
    height: 190,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceAlt
  },
  postVideo: {
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderRadius: radii.md,
    overflow: 'hidden'
  },
  postVideoThumb: { width: '100%', height: 170, backgroundColor: colors.surfaceAlt },
  postVideoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: spacing.md
  },
  postVideoText: { color: colors.accent, fontSize: 14, fontWeight: '800' },

  /* Footer compacto con la info del gym */
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center'
  },
  footerBrand: {
    color: colors.textMuted,
    fontFamily: type.display,
    fontSize: 18,
    letterSpacing: 3,
    marginBottom: spacing.sm
  },
  footerLine: { color: colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },

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

  /* TU WOD (personalizado) */
  persoCard: {
    backgroundColor: 'rgba(70,226,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.3)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md
  },
  persoHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  persoTitle: { color: colors.accent, fontFamily: type.display, fontSize: 18, letterSpacing: 2 },
  persoRow: { marginBottom: spacing.sm + 2 },
  persoLine: { color: colors.textMuted, fontFamily: type.mono, fontSize: 12 },
  persoRx: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  persoHint: { color: colors.textMuted, fontSize: 12, fontWeight: '400' },
  persoMissing: { color: '#F2C037', fontSize: 12, marginTop: 2 },
  persoFoot: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },

  /* WODs anteriores */
  histTitle: {
    color: colors.textPrimary, fontFamily: type.display, fontSize: 22,
    letterSpacing: 1.5, marginBottom: spacing.md
  },
  histCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    marginBottom: spacing.sm + 2,
    overflow: 'hidden'
  },
  histHead: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md
  },
  histDate: { color: colors.accent, fontFamily: type.mono, fontSize: 10, letterSpacing: 1.5 },
  histName: { color: colors.textPrimary, fontFamily: type.display, fontSize: 20, letterSpacing: 1, marginTop: 2 },
  histBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md
  },

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
