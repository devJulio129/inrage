import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  Animated,
  Easing,
  Linking,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radii, type, useAppTheme } from '../theme';
import { api } from '../api/client';
import GymInfo from '../components/GymInfo';
import Reactions from '../components/Reactions';
import Avatar from '../components/Avatar';
import CommentsThread from '../components/CommentsThread';
import QrCheckInScanner from '../components/QrCheckInScanner';
import { timeAgo, confirmAsync, youtubeId } from '../utils';
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
  run_400m: '400 m Run', row_500m: '500 m Row', ski_500m: '500 m Ski'
};
const BRANCHES = ['Torres', 'Central'];
const RESERVATION_CANCEL_MINUTES_BEFORE = 30;

// Catálogo de movimientos del pizarrón (inglés + sinónimos en español).
// El orden importa: lo específico va antes de lo genérico.
const MOVES = [
  // Cardio por calorías → cadencia objetivo, no requiere PR.
  { re: /(assault|echo)\s*bike|bike\s*erg|\bbike\b/, kind: 'bike' },
  { re: /cal\b.*(row|ski)|(row|ski).*\bcal/, kind: 'erg' },
  // Cardio por metros → ritmo + cadencia según el PR de referencia.
  { re: /run|carrera|corre/, key: 'run_400m', kind: 'run', base: 400, cadence: 'run' },
  { re: /\bski\b|skierg/, key: 'ski_500m', kind: 'run', base: 500, cadence: 'stroke' },
  { re: /row|remo/, key: 'row_500m', kind: 'run', base: 500, cadence: 'stroke' },
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

// Cadencia objetivo (pacing) según la intensidad. Más legible que el RPE:
// le dice al atleta a qué ritmo de pasos/strokes/rpm debería ir.
function runCadence(pct) {
  if (pct >= 85) return '180–190 ppm';
  if (pct >= 70) return '170–180 ppm';
  return '160–170 ppm';
}
function strokeCadence(pct) {
  if (pct >= 85) return '30–34 s/min';
  if (pct >= 70) return '26–30 s/min';
  return '22–26 s/min';
}
function bikeCadence(pct) {
  if (pct >= 85) return '70–80 rpm';
  if (pct >= 70) return '60–70 rpm';
  return '55–65 rpm';
}

function personalizeLine(line, prs) {
  const m = line.match(/^\s*(\d+(?:\.\d+)?)\s*(.+?)\s*\(\s*(\d{1,3})\s*%\s*\)/);
  if (!m) return null;
  const qty = parseFloat(m[1]);
  const pct = Number(m[3]);
  const mov = matchMovement(m[2]);
  if (!mov || !qty || !pct) return null;

  const base = { line: line.trim(), key: mov.key };

  // Máquinas por calorías: cadencia objetivo según intensidad (sin PR).
  if (mov.kind === 'bike') {
    return { ...base, rx: bikeCadence(pct), hint: 'cadencia sugerida' };
  }
  if (mov.kind === 'erg') {
    return { ...base, rx: strokeCadence(pct), hint: 'cadencia sugerida' };
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
    // Ritmo del PR de referencia escalado a la distancia y a la intensidad,
    // más la cadencia objetivo (pasos o strokes por minuto).
    const target = (pr.value * (qty / mov.base)) / (pct / 100);
    const cad = mov.cadence === 'stroke' ? strokeCadence(pct) : runCadence(pct);
    return {
      ...base,
      rx: `≈ ${fmtSecs(target)} · ${cad}`,
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
  const hasRecommendation = items.some((it) => !it.missing);
  return (
    <View style={styles.persoCard}>
      <View style={styles.persoHeader}>
        <Ionicons name="speedometer-outline" size={15} color={colors.accent} />
        <Text style={styles.persoTitle}>TU DOSIS</Text>
      </View>
      {items.length === 0 ? (
        <View style={styles.persoRow}>
          <Text style={styles.persoLine}>Recomendacion pendiente</Text>
          <Text style={styles.persoMissing}>Agrega tus records para calcular tu recomendacion.</Text>
        </View>
      ) : items.map((it, i) => (
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

// ── Clases y feed: helpers de fecha ─────────────────────────────────
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

function classStartMs(c = {}) {
  if (!c?.date || !c?.time) return null;
  const [year, month, day] = classDay(c.date).split('-').map(Number);
  const [hour, minute] = String(c.time || '00:00').split(':').map(Number);
  const starts = new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
  return Number.isFinite(starts) ? starts : null;
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

function reservationDays(count = 7, startOffset = 0) {
  return Array.from({ length: count }, (_, index) => localDayStr(startOffset + index));
}

function compactDayLabel(ymd) {
  if (ymd === localDayStr()) return 'HOY';
  if (ymd === localDayStr(1)) return 'MANANA';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-MX', { weekday: 'short' })
    .toUpperCase();
}

function monthDayLabel(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    .toUpperCase();
}

function countClassesForDay(classes, ymd) {
  return (classes || []).filter((c) => classDay(c.date) === ymd).length;
}

function todayClasses(list) {
  const today = localDayStr();
  const now = Date.now();
  return (list || []).filter((c) => {
    if (classDay(c.date) !== today) return false;
    const [h, m] = String(c.time || '0:0').split(':').map(Number);
    const [y, mo, d] = today.split('-').map(Number);
    return new Date(y, mo - 1, d, h || 0, m || 0).getTime() > now;
  });
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
    .filter((c) => isClassReservedByMe(c))
    .map((c) => {
      const [yy, mm, dd] = classDay(c.date).split('-').map(Number);
      const [h, m] = String(c.time).split(':').map(Number);
      return { ...c, when: new Date(yy, mm - 1, dd, h || 0, m || 0).getTime() };
    })
    .filter((c) => c.when > now - 2 * 3600 * 1000)
    .sort((a, b) => a.when - b.when)[0] || null;
}

function nextCheckInClass(classes) {
  const now = Date.now();
  const candidates = (classes || [])
    .map((c) => {
      const status = classReservationState(c);
      if (!status) return null;
      const [yy, mm, dd] = classDay(c.date).split('-').map(Number);
      const [h, m] = String(c.time).split(':').map(Number);
      return { ...c, myReservationStatus: status, when: new Date(yy, mm - 1, dd, h || 0, m || 0).getTime() };
    })
    .filter(Boolean)
    .filter((c) => c.when > now - 2 * 3600 * 1000)
    .sort((a, b) => a.when - b.when);

  return candidates.find((c) => c.myReservationStatus === 'reserved' || c.myReservationStatus === 'checked_in')
    || candidates[0]
    || null;
}

function classReservationState(c = {}) {
  const rawStatus =
    c.myReservationStatus ||
    c.reservationStatus ||
    c.attendanceStatus ||
    c.currentUserReservation?.status ||
    c.currentUserReservation?.reservationStatus;
  const status = String(rawStatus || '').toLowerCase();
  if (['reserved', 'checked_in', 'waitlist', 'cancelled', 'no_show'].includes(status)) return status;
  if (c.checkedInByMe === true || c.isCheckedInByMe === true) return 'checked_in';
  if (typeof c.checkedIn === 'boolean' && c.checkedIn) return 'checked_in';
  if (c.isReservedByMe === true || c.mine === true) return 'reserved';
  if (typeof c.reserved === 'boolean' && c.reserved) return 'reserved';
  return null;
}

function isClassReservedByMe(c = {}) {
  const status = classReservationState(c);
  return status === 'reserved' || status === 'checked_in';
}

function classActionMeta(c = {}) {
  const status = classReservationState(c);
  const checkedIn = status === 'checked_in';
  const reserved = status === 'reserved';
  const waitlisted = status === 'waitlist';
  const mine = reserved || checkedIn;
  const spotsLeft = Number(c.spotsLeft ?? 0);
  const capacity = Number(c.capacity || 0);
  const full = spotsLeft === 0 && !mine;
  const lowSpots = spotsLeft > 0 && spotsLeft <= 2 && !mine;
  const startMs = classStartMs(c);
  const canCancel = reserved && Number.isFinite(startMs) && Date.now() < startMs - RESERVATION_CANCEL_MINUTES_BEFORE * 60_000;
  const cancelClosed = reserved && !canCancel;
  let cta = 'RESERVAR LUGAR';
  let icon = 'arrow-forward';
  let disabled = false;

  if (checkedIn) {
    cta = 'CHECK-IN CONFIRMADO';
    icon = 'checkmark-circle-outline';
    disabled = true;
  } else if (reserved) {
    cta = 'ESCANEAR QR';
    icon = 'qr-code-outline';
  } else if (waitlisted) {
    cta = 'LISTA DE ESPERA';
    icon = 'time-outline';
    disabled = true;
  } else if (full) {
    cta = 'CLASE LLENA';
    icon = 'alert-circle-outline';
    disabled = true;
  } else if (lowSpots) {
    cta = 'ULTIMOS LUGARES';
    icon = 'arrow-forward';
  }

  return {
    status,
    checkedIn,
    reserved,
    waitlisted,
    mine,
    spotsLeft,
    capacity,
    full,
    lowSpots,
    canCancel,
    cancelClosed,
    cta,
    icon,
    disabled
  };
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

function ScreenIntro({ eyebrow, title, subtitle, icon, avatar }) {
  return (
    <View style={styles.screenIntro}>
      <View style={styles.screenIntroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenEyebrow}>{eyebrow}</Text>
          <Text style={styles.screenTitleText}>{title}</Text>
        </View>
        {avatar || (
          <View style={styles.screenIcon}>
            <Ionicons name={icon} size={20} color={colors.accent} />
          </View>
        )}
      </View>
      {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Reserva de clases ───────────────────────────────────────────────
function HomeHeroLegacy({ user, inGym, nextClass, attendance, todayWorkout, isActive, onGoToClasses }) {
  const visits = Number(attendance?.totalVisits || 0);
  const streak = Number(attendance?.streak || 0);
  const spotsLeft = Number(nextClass?.spotsLeft ?? nextClass?.capacity ?? 0);
  const capacity = Number(nextClass?.capacity || 0);
  const featureTitle = nextClass ? `${nextClass.name || 'Clase'} - ${nextClass.time || '--:--'}` : 'RESERVA TU CLASE';
  const featureDate = nextClass ? `${dayLabel(nextClass.date)} - ${formatDate(new Date(nextClass.date))}` : 'Elige horario y sucursal';
  return (
    <View style={styles.homeHero}>
      <View style={styles.homeHeroTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.homeHeroEyebrow}>HOY · {greeting().toUpperCase()}</Text>
          <Text style={styles.homeHeroTitle}>{firstName(user?.name).toUpperCase()}</Text>
          <Text style={styles.homeHeroText}>
            {isActive
              ? inGym
                ? 'Estas dentro del box. Cierra tu visita al terminar.'
                : 'Reserva, revisa el WOD y confirma asistencia desde aqui.'
              : 'Tu cuenta esta en revision. Mientras tanto puedes ver avisos del box.'}
          </Text>
        </View>
        <Avatar uri={user?.avatar} name={user?.name} size={52} />
      </View>

      <View style={styles.homeHeroPills}>
        <View style={[styles.homeHeroPill, inGym && styles.homeHeroPillLive]}>
          <Ionicons name={inGym ? 'radio-button-on' : 'radio-button-off'} size={14} color={inGym ? colors.accent : colors.textMuted} />
          <Text style={styles.homeHeroPillText}>{inGym ? 'En el box' : 'Fuera del box'}</Text>
        </View>
        <View style={styles.homeHeroPill}>
          <Ionicons name="calendar-outline" size={14} color={colors.accent} />
          <Text style={styles.homeHeroPillText}>
            {nextClass ? `${nextClass.time} ${nextClass.name}` : 'Sin reserva proxima'}
          </Text>
        </View>
        <View style={styles.homeHeroPill}>
          <Ionicons name="barbell-outline" size={14} color={colors.accent} />
          <Text style={styles.homeHeroPillText}>{todayWorkout?.title || 'WOD pendiente'}</Text>
        </View>
      </View>

      {isActive ? (
        <View style={styles.homeHeroStats}>
          <View>
            <Text style={styles.homeHeroStatValue}>{visits}</Text>
            <Text style={styles.homeHeroStatLabel}>visitas</Text>
          </View>
          <View style={styles.homeHeroStatDivider} />
          <View>
            <Text style={styles.homeHeroStatValue}>{streak}</Text>
            <Text style={styles.homeHeroStatLabel}>racha</Text>
          </View>
          <View style={styles.homeHeroStatDivider} />
          <View style={{ flex: 1 }}>
            <Text style={styles.homeHeroStatValue}>{nextClass ? dayLabel(nextClass.date) : 'HOY'}</Text>
            <Text style={styles.homeHeroStatLabel}>{nextClass ? 'proxima clase' : 'agenda abierta'}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function HomeHero({ user, nextClass, attendance, isActive, onGoToClasses, onScanQr }) {
  const visits = Number(attendance?.totalVisits || 0);
  const streak = Number(attendance?.streak || 0);
  const spotsLeft = Number(nextClass?.spotsLeft ?? nextClass?.capacity ?? 0);
  const capacity = Number(nextClass?.capacity || 0);
  const featureTitle = nextClass ? `${nextClass.name || 'Clase'} - ${nextClass.time || '--:--'}` : 'RESERVA TU CLASE';
  const featureDate = nextClass ? `${dayLabel(nextClass.date)} - ${formatDate(new Date(nextClass.date))}` : 'Elige horario y sucursal';
  const heroImage = classBackgroundImage(nextClass);
  const heroMeta = nextClass ? classActionMeta(nextClass) : null;
  const heroActionText = heroMeta?.checkedIn ? 'CHECK-IN CONFIRMADO' : heroMeta?.mine ? 'ESCANEAR QR' : 'RESERVAR LUGAR';
  const heroActionIcon = heroMeta?.checkedIn ? 'checkmark-circle-outline' : heroMeta?.mine ? 'qr-code-outline' : 'arrow-forward';
  const heroAction = heroMeta?.mine && !heroMeta.checkedIn ? onScanQr : onGoToClasses;

  return (
    <View style={styles.homeHero}>
      <View style={styles.premiumHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.homeHeroEyebrow}>{greeting().toUpperCase()}</Text>
          <Text style={styles.homeHeroTitle}>{firstName(user?.name).toUpperCase()}</Text>
          <Text style={styles.homeHeroText}>Tu dia en InRage</Text>
        </View>
        <View style={styles.heroAvatarWrap}>
          <Avatar uri={user?.avatar} name={user?.name} size={58} />
          <View style={styles.heroAvatarStatus} />
        </View>
      </View>

      <Pressable style={styles.nextFeatureCard} onPress={heroAction} disabled={heroMeta?.checkedIn}>
        {heroImage ? <Image source={{ uri: heroImage }} style={styles.featureImage} /> : null}
        <View style={styles.featureBackdrop} />
        <View style={styles.featureTopRow}>
          <View style={styles.featurePill}>
            <Ionicons name="barbell-outline" size={16} color={colors.accent} />
            <Text style={styles.featurePillText}>PROXIMA CLASE</Text>
          </View>
          <View style={styles.featureMenu}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          </View>
        </View>
        <Text style={styles.featureTitle}>{featureTitle.toUpperCase()}</Text>
        <Text style={styles.featureDate}>{featureDate}</Text>
        <View style={styles.featureSpotsRow}>
          <Ionicons name="people-outline" size={18} color={colors.textMuted} />
          <Text style={styles.featureSpots}>
            {nextClass && capacity ? (
              <>
                <Text style={styles.featureSpotsStrong}>{spotsLeft}</Text> de {capacity} lugares libres
              </>
            ) : 'Agenda abierta'}
          </Text>
        </View>
        <View style={styles.featureButton}>
          <Text style={styles.featureButtonText}>{heroActionText}</Text>
          <Ionicons name={heroActionIcon} size={22} color="#05230b" />
        </View>
      </Pressable>

      {isActive ? (
        <View style={styles.homeHeroStats}>
          <View style={styles.homeHeroStatCard}>
            <Ionicons name="checkmark" size={24} color={colors.accent} />
            <Text style={styles.homeHeroStatValue}>{visits}</Text>
            <Text style={styles.homeHeroStatLabel}>visitas</Text>
          </View>
          <View style={styles.homeHeroStatCard}>
            <Ionicons name="flame" size={23} color={colors.accent} />
            <Text style={styles.homeHeroStatValue}>{streak}</Text>
            <Text style={styles.homeHeroStatLabel}>dias de racha</Text>
          </View>
          <View style={styles.homeHeroStatCard}>
            <Ionicons name="trophy" size={23} color={colors.accent} />
            <Text style={styles.homeHeroStatValue}>ELITE</Text>
            <Text style={styles.homeHeroStatLabel}>tu nivel</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function HomeLoadingCard() {
  return (
    <View style={styles.homeLoadingCard}>
      <ActivityIndicator color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={styles.homeLoadingTitle}>Cargando Home</Text>
        <Text style={styles.homeLoadingText}>Buscando reservas, WOD y avisos del box...</Text>
      </View>
    </View>
  );
}

function HomeErrorCard({ message, onRetry }) {
  if (!message) return null;
  return (
    <View style={styles.homeErrorCard}>
      <View style={styles.homeErrorIcon}>
        <Ionicons name="warning-outline" size={18} color={colors.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.homeErrorTitle}>Algo no cargo completo</Text>
        <Text style={styles.homeErrorText}>{message}</Text>
      </View>
      <Pressable onPress={onRetry} style={styles.homeRetryBtn}>
        <Text style={styles.homeRetryText}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

function HomeQuietState() {
  return (
    <View style={styles.homeQuietCard}>
      <View style={styles.homeQuietIcon}>
        <Ionicons name="today-outline" size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.homeQuietTitle}>Home listo, sin pendientes</Text>
        <Text style={styles.homeQuietText}>
          Todavia no hay WOD, clases ni avisos visibles para hoy. Desliza hacia abajo para actualizar.
        </Text>
      </View>
    </View>
  );
}

function WodSummaryCardLegacy({ workout, isActive }) {
  if (!isActive) return null;
  const description = (workout?.description || '').replace(/\s+/g, ' ').trim();
  return (
    <View style={styles.wodSummaryCard}>
      <View style={styles.wodSummaryHead}>
        <View style={styles.wodSummaryIcon}>
          <Ionicons name="barbell-outline" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.wodSummaryKicker}>WOD DEL DIA</Text>
          <Text style={styles.wodSummaryTitle}>{workout?.title || 'Todavia no hay WOD publicado'}</Text>
        </View>
      </View>
      <Text style={styles.wodSummaryText} numberOfLines={4}>
        {description || 'Cuando el coach publique el entrenamiento, aparecera aqui resumido para revisarlo rapido antes de clase.'}
      </Text>
    </View>
  );
}

function WodSummaryCard({ workout, isActive, onOpen }) {
  if (!isActive) return null;
  const description = (workout?.description || '').replace(/\s+/g, ' ').trim();
  return (
    <Pressable style={styles.wodSummaryCard} onPress={onOpen}>
      <Text style={styles.wodSummaryKicker}>WOD DE HOY</Text>
      <View style={styles.wodSummaryBody}>
        <View style={styles.wodSummaryIcon}>
          <Text style={styles.wodSummaryIconText}>WOD</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.wodSummaryTitle}>{(workout?.title || 'Todavia no hay WOD publicado').toUpperCase()}</Text>
          <Text style={styles.wodSummaryText} numberOfLines={2}>
            {description || 'Cuando el coach publique el entrenamiento, aparecera aqui resumido para revisarlo rapido antes de clase.'}
          </Text>
          <View style={styles.wodSummaryLinkRow}>
            <Text style={styles.wodSummaryLink}>VER WOD</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accent} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function ClassReservationCard({ c, meta, coach, busy, onOpen, onAction, onCancel }) {
  const image = classBackgroundImage(c);
  return (
    <Pressable key={c._id} style={styles.classCard} onPress={onOpen}>
      {image ? <Image source={{ uri: image }} style={styles.classCardImage} /> : null}
      {image ? <View style={styles.classCardImageOverlay} /> : null}
      <View style={styles.classCardTop}>
        <View style={styles.classTimeBlock}>
          <Text style={styles.classTime}>{c.time}</Text>
          <View style={styles.classDurationRow}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.classDuration}>{c.durationMinutes || c.duration || 60} MIN</Text>
          </View>
        </View>
        <View style={styles.classDivider} />
        <View style={styles.classInfoBlock}>
          <Text style={styles.className} numberOfLines={2}>{String(c.name || 'Clase').toUpperCase()}</Text>
          <View style={styles.classCoachRow}>
            <Ionicons name="people-outline" size={15} color={colors.textMuted} />
            <Text style={styles.classCoach} numberOfLines={1}>Coach {coach}</Text>
          </View>
          <View style={styles.classMetaRow}>
            <View style={styles.classSpotsPill}>
              <View style={[
                styles.classSpotDot,
                meta.full && styles.classSpotDotFull,
                meta.lowSpots && styles.classSpotDotLow
              ]} />
              <Text style={[styles.classSpots, meta.full && styles.classSpotsFull]}>
                {meta.checkedIn
                  ? 'CHECK-IN'
                  : meta.mine
                    ? 'TU LUGAR'
                    : meta.full
                      ? 'CLASE LLENA'
                      : `${meta.spotsLeft} DE ${meta.capacity || '?'} LIBRES`}
              </Text>
            </View>
            <Text style={styles.classBranch} numberOfLines={1}>
              {c.branch || 'Torres'}{c.isSpecial ? ` - ${c.specialLabel || 'Especial'}` : ''}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.classActions}>
        <Pressable
          onPress={onAction}
          disabled={meta.disabled || busy}
          style={[
            styles.classBtn,
            meta.mine && styles.classBtnMine,
            meta.checkedIn && styles.classBtnChecked,
            (meta.full || meta.lowSpots || meta.waitlisted) && styles.classBtnOutline
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={meta.mine ? colors.accent : '#05230b'} />
          ) : (
            <>
              <Text style={[
                styles.classBtnText,
                (meta.mine || meta.full || meta.lowSpots || meta.waitlisted) && styles.classBtnTextOutline,
                meta.checkedIn && styles.classBtnTextChecked
              ]}>
                {meta.cta}
              </Text>
              <Ionicons
                name={meta.icon}
                size={18}
                color={meta.mine || meta.full || meta.lowSpots || meta.waitlisted ? colors.accent : '#05230b'}
              />
            </>
          )}
        </Pressable>
        {meta.reserved ? (
          <Pressable
            onPress={onCancel}
            disabled={!meta.canCancel || busy}
            style={[
              styles.classSecondaryBtn,
              (!meta.canCancel || busy) && styles.classSecondaryBtnDisabled
            ]}
          >
            <Text style={[
              styles.classSecondaryText,
              (!meta.canCancel || busy) && styles.classSecondaryTextDisabled
            ]}>
              {meta.canCancel ? 'CANCELAR RESERVA' : 'CANCELACION CERRADA'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {meta.cancelClosed ? (
        <Text style={styles.classCancelClosed}>Ya no puedes cancelar desde la app.</Text>
      ) : null}
    </Pressable>
  );
}

function ClassesSection({ classes, onChanged, selectedDay = null, title = 'CLASES DE HOY', emptyText }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null); // clase abierta en el modal
  const [scannerOpen, setScannerOpen] = useState(false);

  async function reserve(c) {
    if (busyId) return;
    const meta = classActionMeta(c);
    if (meta.mine || meta.disabled) return;
    if (false) {
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
      await api.reserveClass(c._id);
      await onChanged?.();
      setDetail(null);
    } catch (err) {
      setError(err.message);
      await onChanged?.(); // el cupo pudo cambiar (p. ej. se llenó)
    } finally {
      setBusyId(null);
    }
  }

  async function cancelReservation(c) {
    if (busyId) return;
    const meta = classActionMeta(c);
    if (!meta.reserved || !meta.canCancel) return;
    const ok = await confirmAsync(
      '¿Cancelar tu reserva?',
      'Tu lugar quedará disponible para otro atleta.',
      'Cancelar reserva',
      'Mantener reserva'
    );
    if (!ok) return;
    setBusyId(c._id);
    setError(null);
    try {
      await api.cancelClassReservation(c._id);
      await onChanged?.();
      setDetail(null);
    } catch (err) {
      setError(err.payload?.message || err.message);
      await onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  async function submitClassQrCheckIn(token, options = {}) {
    const result = await api.checkInWithQr(token, options);
    if (result?.status === 'reservation_required') return result;
    await onChanged?.();
    setDetail(null);
    return result;
  }

  function handleClassAction(c) {
    const meta = classActionMeta(c);
    if (meta.checkedIn || meta.disabled) return;
    if (meta.mine) {
      setScannerOpen(true);
      return;
    }
    reserve(c);
  }

  // Vuelve a leer la clase del prop fresco para que el modal refleje cupos.
  const liveDetail = detail ? classes.find((c) => c._id === detail._id) || detail : null;
  const visibleList = selectedDay
    ? (classes || []).filter((c) => classDay(c.date) === selectedDay)
    : todayClasses(classes);
  const resolvedEmptyText = emptyText || (selectedDay
    ? 'No hay clases programadas para este dia en esta sucursal.'
    : 'No hay más clases programadas para hoy.');

  return (
    <View style={{ marginBottom: spacing.md }}>
      <SectionHeader>{title}</SectionHeader>
      {error && <Text style={styles.commentsError}>{error}</Text>}
      {visibleList.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>{resolvedEmptyText}</Text>
        </View>
      )}
      {visibleList.map((c) => {
        const meta = classActionMeta(c);
        const coach = typeof c.coach === 'string' ? c.coach : (c.coach?.name || c.coachName || 'Staff');
        return (
          <ClassReservationCard
            key={c._id}
            c={c}
            meta={meta}
            coach={coach}
            busy={busyId === c._id}
            onOpen={() => setDetail(c)}
            onAction={() => handleClassAction(c)}
            onCancel={() => cancelReservation(c)}
          />
        );
        return (
          <Pressable key={c._id} style={styles.classCard} onPress={() => setDetail(c)}>
            <Text style={styles.classTime}>{c.time}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.className}>{c.name}</Text>
              <Text style={styles.classBranch}>
                {c.branch || 'Torres'}{c.isSpecial ? ` - ${c.specialLabel || 'Clase especial'}` : ''}
              </Text>
              <Text style={[styles.classSpots, c.spotsLeft === 0 && !mine && { color: colors.danger }]}>
                {mine
                  ? 'Tienes tu lugar apartado'
                  : c.spotsLeft === 0
                    ? 'Clase llena'
                    : `${c.spotsLeft} de ${c.capacity} lugares libres`}
              </Text>
              <View style={styles.classHintRow}>
                <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                <Text style={styles.classHint}>Toca para ver de qué trata</Text>
              </View>
            </View>
            <Pressable
              onPress={() => handleClassAction(c)}
              disabled={full || busyId === c._id}
              style={[styles.classBtn, mine && styles.classBtnMine, full && styles.classBtnFull]}
            >
              {busyId === c._id ? (
                <ActivityIndicator size="small" color={mine ? colors.accent : '#05230b'} />
              ) : (
                <Text style={[styles.classBtnText, mine && styles.classBtnTextMine, full && styles.classBtnTextFull]}>
                  {mine ? 'ESCANEAR QR' : full ? 'LLENA' : 'RESERVAR'}
                </Text>
              )}
            </Pressable>
          </Pressable>
        );
      })}

      {/* Detalle de la clase: de qué trata + reservar/cancelar */}
      <Modal visible={!!liveDetail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetail(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            {liveDetail && (() => {
              const meta = classActionMeta(liveDetail);
              return (
                <>
                  <View style={styles.modalHandle} />
                  <Text style={styles.detailDay}>{dayLabel(liveDetail.date)} · {liveDetail.time} · {liveDetail.branch || 'Torres'}</Text>
                  <Text style={styles.detailName}>{liveDetail.name}</Text>
                  <View style={styles.detailSpotsRow}>
                    <Ionicons name="people-outline" size={16} color={colors.accent} />
                    <Text style={styles.detailSpots}>
                      {meta.checkedIn
                        ? 'Check-in confirmado'
                        : meta.mine
                          ? 'Ya tienes tu lugar'
                          : meta.full
                            ? 'Clase llena'
                            : `${meta.spotsLeft} de ${meta.capacity} lugares libres`}
                    </Text>
                  </View>
                  <Text style={styles.detailBody}>
                    {liveDetail.description?.trim()
                      ? liveDetail.description
                      : 'El gimnasio aún no agregó una descripción para esta clase.'}
                  </Text>
                  <Pressable
                    onPress={() => handleClassAction(liveDetail)}
                    disabled={meta.disabled || busyId === liveDetail._id}
                    style={[styles.detailBtn, meta.mine && styles.detailBtnMine, meta.disabled && !meta.mine && styles.detailBtnFull]}
                  >
                    {busyId === liveDetail._id ? (
                      <ActivityIndicator color={meta.mine ? colors.accent : '#05230b'} />
                    ) : (
                      <Text style={[styles.detailBtnText, meta.mine && { color: colors.accent }, meta.disabled && !meta.mine && { color: colors.textMuted }]}>
                        {meta.cta}
                      </Text>
                    )}
                  </Pressable>
                  {meta.reserved ? (
                    <>
                      <Pressable
                        onPress={() => cancelReservation(liveDetail)}
                        disabled={!meta.canCancel || busyId === liveDetail._id}
                        style={[
                          styles.detailSecondaryBtn,
                          (!meta.canCancel || busyId === liveDetail._id) && styles.detailSecondaryBtnDisabled
                        ]}
                      >
                        <Text style={[
                          styles.detailSecondaryText,
                          (!meta.canCancel || busyId === liveDetail._id) && styles.detailSecondaryTextDisabled
                        ]}>
                          {meta.canCancel ? 'Cancelar reserva' : 'Cancelacion cerrada'}
                        </Text>
                      </Pressable>
                      {meta.cancelClosed ? (
                        <Text style={styles.classCancelClosed}>Ya no puedes cancelar desde la app.</Text>
                      ) : null}
                    </>
                  ) : null}
                  {error && <Text style={styles.commentsError}>{error}</Text>}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
      <QrCheckInScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSubmit={submitClassQrCheckIn}
      />
    </View>
  );
}

// ── Feed de publicaciones del gimnasio ──────────────────────────────
function highlightIcon(name) {
  if (name === 'fire') return 'flame-outline';
  if (name === 'barbell') return 'barbell-outline';
  if (name === 'calendar') return 'calendar-outline';
  return 'star-outline';
}

function classBackgroundImage(item) {
  return String(item?.backgroundImage || item?.imageUrl || '').trim();
}

function BoxHighlightsSection({ highlights, posts, user, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState({ open: false, initial: null });
  const items = highlights || [];
  const previewPosts = (posts || []).slice(0, 3);
  const isEmpty = items.length === 0 && previewPosts.length === 0;

  async function reserve(item) {
    if (!item.classId || item.mine || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await api.reserveClass(item.classId);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
      await onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader>AVISOS DEL BOX</SectionHeader>
      {error && <Text style={styles.commentsError}>{error}</Text>}
      {isEmpty ? (
        <View style={styles.emptyCard}>
          <Ionicons name="megaphone-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aun no hay avisos ni clases especiales visibles.</Text>
        </View>
      ) : null}
      {items.map((item) => {
        if (item.type === 'announcement') {
          return (
            <View key={item.id} style={styles.highlightCard}>
              <View style={styles.highlightIcon}>
                <Ionicons name="megaphone-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.highlightLabel}>AVISO</Text>
                <Text style={styles.highlightTitle}>{item.title || 'Aviso del box'}</Text>
                <Text style={styles.highlightText}>{item.body}</Text>
              </View>
            </View>
          );
        }

        const full = Number(item.spotsLeft || 0) <= 0 && !item.mine;
        const reserved = item.mine || item.myReservationStatus === 'reserved' || item.myReservationStatus === 'checked_in';
        const cta = reserved ? 'Reservado' : full ? 'Lista de espera' : (item.ctaLabel || 'Reservar');
        const dateText = item.subtitle || (item.startsAt
          ? new Date(item.startsAt).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : '');
        const image = classBackgroundImage(item);
        return (
          <View key={item.id} style={styles.highlightCard}>
            {image ? <Image source={{ uri: image }} style={styles.highlightBackgroundImage} /> : null}
            {image ? <View style={styles.highlightBackgroundOverlay} /> : null}
            <View style={styles.highlightIcon}>
              <Ionicons name={highlightIcon(item.icon)} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.highlightLabel}>{item.branch || 'Torres'}</Text>
              <Text style={styles.highlightTitle}>{item.title}</Text>
              <Text style={styles.highlightText} numberOfLines={2}>
                {dateText}{item.capacity ? ` · ${item.spotsLeft} de ${item.capacity} lugares` : ''}
              </Text>
              {item.description ? <Text style={styles.highlightDescription} numberOfLines={2}>{item.description}</Text> : null}
            </View>
            {item.classId ? (
              <Pressable
                style={[styles.highlightBtn, reserved && styles.highlightBtnReserved]}
                onPress={() => reserve(item)}
                disabled={reserved || busyId === item.id}
              >
                {busyId === item.id
                  ? <ActivityIndicator size="small" color="#05230b" />
                  : <Text style={[styles.highlightBtnText, reserved && styles.highlightBtnTextReserved]}>{cta}</Text>}
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {previewPosts.length ? (
        <View style={styles.bulletinPosts}>
          <View style={styles.feedHeader}>
            <Text style={styles.bulletinLabel}>PUBLICACIONES RECIENTES</Text>
            {(posts || []).length > 3 && (
              <Pressable onPress={() => setViewer({ open: true, initial: null })} hitSlop={6}>
                <Text style={styles.verTodas}>Ver todas</Text>
              </Pressable>
            )}
          </View>
          {previewPosts.map((p) => (
            <PostCardCompact key={p._id} post={p} onPress={() => setViewer({ open: true, initial: p })} />
          ))}
        </View>
      ) : null}
      <PostsViewer
        visible={viewer.open}
        posts={posts || []}
        initial={viewer.initial}
        onClose={() => setViewer({ open: false, initial: null })}
        user={user}
      />
    </View>
  );
}

function monthLabel(date) {
  const s = new Date(date).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1); // "Junio 2026"
}

function groupPostsByMonth(posts) {
  const map = new Map();
  for (const p of posts || []) {
    const k = monthLabel(p.createdAt);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return [...map.entries()];
}

function postThumb(post) {
  if (post.image) return post.image;
  const yt = youtubeId(post.videoUrl);
  return yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : null;
}

// Tarjeta colapsada del feed: fecha, título, adelanto y miniatura.
function PostCardCompact({ post, onPress }) {
  const thumb = postThumb(post);
  const preview = (post.body || '').replace(/\s+/g, ' ').trim();
  return (
    <Pressable style={styles.postCompact} onPress={onPress}>
      {thumb ? <Image source={{ uri: thumb }} style={styles.postThumb} /> : (
        <View style={[styles.postThumb, styles.postThumbEmpty]}>
          <Ionicons name="megaphone-outline" size={22} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.postDate}>
          {new Date(post.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
        </Text>
        {post.title ? <Text style={styles.postCompactTitle} numberOfLines={1}>{post.title}</Text> : null}
        {preview ? <Text style={styles.postCompactPreview} numberOfLines={2}>{preview}</Text> : null}
        <View style={styles.postBadges}>
          {post.videoUrl ? <Text style={styles.postBadge}>▶ Video</Text> : null}
          {post.linkUrl ? <Text style={styles.postBadge}>🔗 Enlace</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

// Vista completa de una publicación (dentro del modal).
function PostDetail({ post, user }) {
  const yt = youtubeId(post.videoUrl);
  return (
    <>
      <Text style={styles.postDate}>
        {new Date(post.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · {timeAgo(post.createdAt)}
      </Text>
      {post.title ? <Text style={styles.postTitle}>{post.title}</Text> : null}
      {post.body ? <Text style={styles.postBody}>{post.body}</Text> : null}
      {post.image ? <Image source={{ uri: post.image }} style={styles.postImg} /> : null}
      {post.videoUrl ? (
        <Pressable style={styles.postVideo} onPress={() => Linking.openURL(post.videoUrl)}>
          {yt ? (
            <Image source={{ uri: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` }} style={styles.postVideoThumb} />
          ) : null}
          <View style={styles.postVideoRow}>
            <Ionicons name="play-circle" size={20} color={colors.accent} />
            <Text style={styles.postVideoText}>Ver video</Text>
          </View>
        </Pressable>
      ) : null}
      {post.linkUrl ? (
        <Pressable style={styles.postLink} onPress={() => Linking.openURL(post.linkUrl)}>
          <Ionicons name="link-outline" size={18} color={colors.beige} />
          <Text style={styles.postLinkText}>Abrir enlace</Text>
        </Pressable>
      ) : null}
      <Reactions targetType="post" targetId={post._id} />
      <CommentsThread targetType="post" targetId={post._id} user={user} />
    </>
  );
}

// Visor a pantalla completa: archivo por mes/año ↔ detalle de una publicación.
function PostsViewer({ visible, posts, initial, onClose, user }) {
  const [selected, setSelected] = useState(initial);

  useEffect(() => { setSelected(initial); }, [initial, visible]);

  const groups = groupPostsByMonth(posts);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.viewerRoot}>
        <View style={styles.viewerHeader}>
          {selected ? (
            <Pressable onPress={() => setSelected(null)} hitSlop={8} style={styles.viewerBack}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
              <Text style={styles.viewerBackText}>Publicaciones</Text>
            </Pressable>
          ) : (
            <Text style={styles.viewerTitle}>PUBLICACIONES</Text>
          )}
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.viewerContent}>
          {selected ? (
            <PostDetail post={selected} user={user} />
          ) : (
            groups.map(([month, list]) => (
              <View key={month} style={{ marginBottom: spacing.lg }}>
                <Text style={styles.archiveMonth}>{month}</Text>
                {list.map((p) => (
                  <PostCardCompact key={p._id} post={p} onPress={() => setSelected(p)} />
                ))}
              </View>
            ))
          )}
          {!selected && groups.length === 0 && (
            <Text style={styles.commentsEmpty}>Aún no hay publicaciones.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PostsFeed({ posts, user }) {
  const [viewer, setViewer] = useState({ open: false, initial: null });
  if (!posts || posts.length === 0) return null;
  const preview = posts.slice(0, 3);

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.feedHeader}>
        <SectionHeader>EL BOX PUBLICA</SectionHeader>
        {posts.length > 3 && (
          <Pressable onPress={() => setViewer({ open: true, initial: null })} hitSlop={6}>
            <Text style={styles.verTodas}>Ver todas</Text>
          </Pressable>
        )}
      </View>
      {preview.map((p) => (
        <PostCardCompact key={p._id} post={p} onPress={() => setViewer({ open: true, initial: p })} />
      ))}
      <PostsViewer
        visible={viewer.open}
        posts={posts}
        initial={viewer.initial}
        onClose={() => setViewer({ open: false, initial: null })}
        user={user}
      />
    </View>
  );
}

// @usuario o URL completa → URL de Instagram.
function instagramUrl(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return `https://instagram.com/${h.replace(/^@/, '')}`;
}

// Info del gimnasio como pie de página compacto. El Instagram es tocable.
function GymFooter({ info }) {
  if (!info) return null;
  const ig = instagramUrl(info.instagram);
  return (
    <View style={styles.footer}>
      <Text style={styles.footerBrand}>{(info.name || 'InRage CrossFit').toUpperCase()}</Text>
      {(info.schedule || []).map((s, i) => (
        <Text key={i} style={styles.footerLine}>{s.day} · {s.hours}</Text>
      ))}
      {info.address ? <Text style={styles.footerLine}>{info.address}</Text> : null}
      {info.phone ? <Text style={styles.footerLine}>{info.phone}</Text> : null}
      {ig ? (
        <Pressable style={styles.footerIg} onPress={() => Linking.openURL(ig)} hitSlop={6}>
          <Ionicons name="logo-instagram" size={15} color={colors.accent} />
          <Text style={styles.footerIgText}>{info.instagram}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Inicio: saludo, avisos, check-in e info del box ─────────────────
export default function HomeScreen({ user, onUserUpdate, onGoToClasses, onGoToWod }) {
  const palette = useAppTheme();
  styles = useMemo(() => createStyles(palette), [palette]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [homeError, setHomeError] = useState(null);

  const [attendance, setAttendance] = useState(null);
  const [checking, setChecking] = useState(false);
  const [checkinError, setCheckinError] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState(null);
  const [celebration, setCelebration] = useState(null); // racha alcanzada a celebrar

  const [gymInfo, setGymInfo] = useState(null);
  const [classes, setClasses] = useState([]);
  const [posts, setPosts] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);

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

  async function load({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    setHomeError(null);
    const failures = [];
    let current = user;
    try {
      current = await api.me();
      onUserUpdate?.(current);
    } catch {
      // keep cached user
      failures.push('perfil');
    }

    const active = current?.role === 'admin' || current?.status !== 'pending';

    try {
      setGymInfo(await api.getGymInfo());
    } catch {
      failures.push('info del box');
    }
    try {
      const data = await api.getHomeHighlights();
      setHighlights(data.highlights || []);
    } catch {
      setHighlights([]);
      failures.push('avisos');
    }

    // El feed es para todos (también cuentas pendientes: es contenido educativo).
    try {
      setPosts(await api.getPosts());
    } catch {
      failures.push('publicaciones');
    }

    if (active) {
      try {
        setAttendance(await api.myAttendance());
      } catch {
        failures.push('check-in');
      }
      try {
        setClasses(await api.getClasses());
      } catch {
        failures.push('clases');
      }
      try {
        setTodayWorkout(await api.getTodayWorkout());
      } catch (err) {
        setTodayWorkout(null);
        if (err?.status !== 404 && err?.status !== 403) failures.push('WOD');
      }
    } else {
      setAttendance(null);
      setClasses([]);
      setTodayWorkout(null);
    }

    if (failures.length) {
      setHomeError(`No se pudo actualizar: ${[...new Set(failures)].join(', ')}.`);
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function refreshClasses() {
    try {
      setClasses(await api.getClasses());
    } catch {}
    try {
      const data = await api.getHomeHighlights();
      setHighlights(data.highlights || []);
    } catch {}
  }

  useEffect(() => {
    load();
  }, []);

  function onRefresh() {
    setRefreshing(true);
    load({ showLoading: false });
  }

  // Hitos de racha: 5, 10 y luego cada 10 (20, 30, 40…).
  function isStreakMilestone(n) {
    return n === 5 || (n >= 10 && n % 10 === 0);
  }

  // Celebra una sola vez cada hito (se recuerda en el dispositivo). Si la racha
  // se reinicia y vuelve a alcanzar un hito, se vuelve a celebrar.
  async function maybeCelebrate(streak) {
    if (!streak || !isStreakMilestone(streak)) return;
    const key = `inrage_streak_celebrated_${user?._id || 'me'}`;
    try {
      const last = Number((await AsyncStorage.getItem(key)) || 0);
      if (streak !== last) {
        await AsyncStorage.setItem(key, String(streak));
        setCelebration(streak);
      }
    } catch {
      setCelebration(streak);
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

  async function submitQrCheckIn(token, options = {}) {
    setChecking(true);
    setCheckinError(null);
    setCheckinMsg(null);
    try {
      const result = await api.checkInWithQr(token, options);
      if (result?.status === 'reservation_required') return result;
      const freshAttendance = await api.myAttendance().catch(() => null);
      const freshClasses = await api.getClasses().catch(() => null);
      if (freshAttendance) {
        setAttendance(freshAttendance);
        await maybeCelebrate(freshAttendance?.streak);
      }
      if (freshClasses) setClasses(freshClasses);
      setCheckinMsg(result?.message || (result?.alreadyCheckedIn ? 'Ya hiciste check-in.' : 'Check-in confirmado.'));
      return result;
    } catch (err) {
      throw err;
    } finally {
      setChecking(false);
    }
  }

  const heroScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const insideOpacity = insideAnim;
  const insideShift = insideAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const nextClass = nextReservedClass(classes);
  const checkInClass = nextCheckInClass(classes);
  const checkInStatus = checkInClass?.myReservationStatus || null;
  const canScanQr = !checkInStatus || checkInStatus === 'reserved';
  const membership = user?.membership;
  const membershipNeedsAttention = membership?.status === 'expiring_soon' || membership?.status === 'expired';
  const noPrimaryContent = isActive
    && !homeError
    && !todayWorkout
    && todayClasses(classes).length === 0
    && highlights.length === 0
    && posts.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <HomeHero
        user={user}
        inGym={inGym}
        nextClass={nextClass}
        attendance={attendance}
        todayWorkout={todayWorkout}
        isActive={isActive}
        onGoToClasses={onGoToClasses}
        onScanQr={() => setScannerOpen(true)}
      />

      {loading ? <HomeLoadingCard /> : null}
      <HomeErrorCard message={homeError} onRetry={() => load()} />

      {false && !loading && nextClass ? (
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

      {!loading && membershipNeedsAttention ? (
        <View style={[
          styles.membershipBanner,
          membership.status === 'expired' && styles.membershipBannerExpired
        ]}>
          <View style={styles.membershipBannerIcon}>
            <Ionicons
              name={membership.status === 'expired' ? 'alert-circle-outline' : 'calendar-outline'}
              size={21}
              color={membership.status === 'expired' ? colors.danger : '#F2C037'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[
              styles.membershipBannerTitle,
              membership.status === 'expired' && styles.membershipBannerTitleExpired
            ]}>
              {membership.status === 'expired' ? 'Tu mensualidad esta vencida' : 'Tu mensualidad vence pronto'}
            </Text>
            <Text style={styles.membershipBannerText}>
              {membership.status === 'expired'
                ? 'Renueva con tu coach para mantener tu acceso activo.'
                : membership.endDate
                  ? `Vence el ${new Date(membership.endDate).toLocaleDateString('es-MX', { timeZone: 'UTC' })}. Habla con tu coach para renovar.`
                  : 'Habla con tu coach para revisar la fecha de renovacion.'}
            </Text>
          </View>
        </View>
      ) : null}

      {!loading && gymInfo?.announcement && !highlights.some((item) => item.type === 'announcement') ? (
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
          <BoxHighlightsSection
            highlights={highlights}
            posts={posts}
            user={user}
            onChanged={refreshClasses}
          />
          <GymInfo info={gymInfo} />
        </>
      )}

      {/* ACTIVO: check-in como acción propia + info del box */}
      {!loading && isActive && (
        <>
          {checkInStatus === 'checked_in' ? (
            <Animated.View style={{ opacity: insideOpacity, transform: [{ translateY: insideShift }] }}>
              <View style={styles.statusRow}>
                <View style={styles.liveRow}>
                  <View style={styles.liveDot} />
                  <View>
                    <Text style={styles.statusTitle}>CHECK-IN CONFIRMADO</Text>
                    <Text style={styles.statusSince}>
                      {checkInClass?.time ? `${checkInClass.time} · ` : ''}
                      Entrada {formatTime(checkInClass?.myCheckedInAt || attendance?.since)}
                    </Text>
                  </View>
                </View>
                {inGym && (
                  <Pressable onPress={checkOut} disabled={checking} style={styles.checkoutBtn}>
                    <Ionicons name="exit-outline" size={15} color={colors.textPrimary} />
                    <Text style={styles.checkoutText}>Salida</Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          ) : inGym && !checkInClass ? (
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
                <Ionicons
                  name={canScanQr ? 'qr-code-outline' : checkInStatus === 'waitlist' ? 'time-outline' : 'calendar-outline'}
                  size={22}
                  color={colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkinTitle}>
                  {canScanQr
                    ? 'Confirma tu asistencia'
                    : checkInStatus === 'waitlist'
                      ? 'Estas en lista de espera'
                      : checkInStatus === 'cancelled'
                        ? 'Reserva cancelada'
                        : 'Haz check-in en el box'}
                </Text>
                <Text style={styles.checkinSub}>
                  {canScanQr
                    ? `Escanea el QR del box para ${checkInClass?.time ? `${checkInClass.time} · ` : ''}${checkInClass?.name || 'registrar tu asistencia'}`
                    : checkInStatus === 'waitlist'
                      ? 'Cuando tengas lugar confirmado podras hacer check-in.'
                      : checkInStatus === 'cancelled'
                        ? 'Esta reserva no permite hacer check-in.'
                        : 'Escanea el QR de tu sucursal y te asignaremos la clase disponible mas cercana.'}
                </Text>
              </View>
              {canScanQr ? (
                <Pressable onPress={() => setScannerOpen(true)} disabled={checking} style={styles.checkinBtn}>
                  {checking
                    ? <ActivityIndicator size="small" color="#05230b" />
                    : <Text style={styles.checkinBtnText}>ESCANEAR QR</Text>}
                </Pressable>
              ) : (
                <View style={[styles.checkinBtn, styles.checkinBtnDisabled]}>
                  <Text style={[styles.checkinBtnText, styles.checkinBtnTextDisabled]}>QR</Text>
                </View>
              )}
            </Animated.View>
          )}
          {checkinMsg && <Text style={styles.checkinSuccess}>{checkinMsg}</Text>}
          {checkinError && <Text style={styles.checkinError}>{checkinError}</Text>}

          <QrCheckInScanner
            visible={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onSubmit={submitQrCheckIn}
          />

          <Pressable style={styles.goToClasses} onPress={onGoToClasses}>
            <Ionicons name="calendar-outline" size={18} color={colors.accent} />
            <Text style={styles.goToClassesText}>Ver y reservar clases</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>

          {noPrimaryContent ? (
            <HomeQuietState />
          ) : (
            <>
              <WodSummaryCard workout={todayWorkout} isActive={isActive} onOpen={onGoToWod} />
              <BoxHighlightsSection
                highlights={highlights}
                posts={posts}
                user={user}
                onChanged={refreshClasses}
              />
            </>
          )}
          <GymFooter info={gymInfo} />
        </>
      )}

      <Modal visible={!!celebration} transparent animationType="fade" onRequestClose={() => setCelebration(null)}>
        <Pressable style={styles.celebBackdrop} onPress={() => setCelebration(null)}>
          <Pressable style={styles.celebCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.celebEmoji}>🔥</Text>
            <Text style={styles.celebStreak}>{celebration}</Text>
            <Text style={styles.celebDays}>DÍAS DE RACHA</Text>
            <Text style={styles.celebMsg}>{celebrationMessage(celebration)}</Text>
            <Pressable style={styles.celebBtn} onPress={() => setCelebration(null)}>
              <Text style={styles.celebBtnText}>¡SEGUIR ASÍ!</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ── Clases: pestaña dedicada a la reserva ───────────────────────────
export function ClassesScreen({ user }) {
  const palette = useAppTheme();
  styles = useMemo(() => createStyles(palette), [palette]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [selectedDay, setSelectedDay] = useState(localDayStr());
  const [weekOffset, setWeekOffset] = useState(0);

  const isActive = user?.role === 'admin' || user?.status !== 'pending';
  const days = reservationDays(7, weekOffset);

  async function load() {
    if (!isActive) { setLoading(false); setRefreshing(false); return; }
    try {
      setError(null);
      const data = await api.getClassesCalendar({
        branch,
        from: localDayStr(weekOffset),
        to: localDayStr(weekOffset + 6)
      });
      setClasses(data.classes || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el calendario de clases.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedDay(localDayStr(weekOffset));
    load();
  }, [branch, weekOffset]);

  function goToday() {
    setWeekOffset(0);
    setSelectedDay(localDayStr());
  }

  function goNextWeek() {
    const next = weekOffset + 7;
    setWeekOffset(next);
    setSelectedDay(localDayStr(next));
  }

  function goPrevWeek() {
    const next = Math.max(0, weekOffset - 7);
    setWeekOffset(next);
    setSelectedDay(localDayStr(next));
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
    >
      <ScreenIntro
        eyebrow={`HOY · ${branch.toUpperCase()}`}
        title="RESERVAS"
        subtitle="Elige sucursal y dia para apartar tu lugar."
        icon="calendar"
        avatar={(
          <View style={styles.screenAvatarWrap}>
            <Avatar uri={user?.avatar} name={user?.name} size={58} />
            <View style={styles.screenAvatarDot} />
          </View>
        )}
      />

      {isActive && (
        <View style={styles.classCalendarPanel}>
          <View style={styles.branchSegment}>
            {BRANCHES.map((item) => {
              const active = branch === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => setBranch(item)}
                  style={[styles.branchChip, active && styles.branchChipActive]}
                >
                  <Text style={[styles.branchChipText, active && styles.branchChipTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.classDayStrip}
          >
            {days.map((day) => {
              const active = selectedDay === day;
              const count = countClassesForDay(classes, day);
              return (
                <Pressable
                  key={day}
                  onPress={() => setSelectedDay(day)}
                  style={[styles.classDayChip, active && styles.classDayChipActive]}
                >
                  <Text style={[styles.classDayName, active && styles.classDayNameActive]}>{compactDayLabel(day)}</Text>
                  <Text style={[styles.classDayDate, active && styles.classDayDateActive]}>{monthDayLabel(day)}</Text>
                  <Text style={[styles.classDayCount, active && styles.classDayCountActive]}>
                    {count ? `${count} clases` : 'Sin clases'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}

      {!loading && !isActive && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>⏳ Cuenta pendiente</Text>
          <Text style={styles.pendingText}>
            En cuanto el gimnasio te dé de alta podrás reservar tu lugar en las clases.
          </Text>
        </View>
      )}

      {!loading && isActive && error && (
        <View style={styles.classErrorCard}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.classErrorTitle}>No se pudo cargar el calendario</Text>
            <Text style={styles.classErrorText}>{error}</Text>
          </View>
          <Pressable style={styles.classRetryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.classRetryText}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {!loading && isActive && !error && (
        <ClassesSection
          classes={classes}
          onChanged={load}
          selectedDay={selectedDay}
          title={`${branch.toUpperCase()} - ${compactDayLabel(selectedDay)}`}
          emptyText={`No hay clases en ${branch} para ${monthDayLabel(selectedDay)}.`}
        />
      )}
    </ScrollView>
  );
}

// ── Calendario de WODs ──────────────────────────────────────────────
const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Celdas del mes (lunes primero). Cada celda es 'YYYY-MM-DD' o null (relleno).
function monthCells(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymdLocal(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function wodDayLabel(ymd, todayStr) {
  if (ymd === todayStr) return 'HOY';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
}

// Calendario del mes: hoy resaltado, punto lleno = WOD hecho, punto hueco =
// WOD programado a futuro. Tocar un día lo selecciona.
function WodCalendar({ anchor, byDay, selected, today, onSelect, onPrev, onNext }) {
  const cells = monthCells(anchor);
  return (
    <View style={styles.cal}>
      <View style={styles.calHead}>
        <Pressable onPress={onPrev} hitSlop={10} style={styles.calNav}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.calMonth}>{MONTHS_ES[anchor.getMonth()]} {anchor.getFullYear()}</Text>
        <Pressable onPress={onNext} hitSlop={10} style={styles.calNav}>
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.calWeekRow}>
        {WEEK_LABELS.map((w, i) => (
          <Text key={i} style={styles.calWeekLabel}>{w}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={styles.calCell} />;
          const has = Boolean(byDay[day]);
          const isToday = day === today;
          const isSelected = day === selected;
          const isFuture = day > today;
          return (
            <Pressable key={i} style={styles.calCell} onPress={() => onSelect(day)}>
              <View style={[
                styles.calDayInner,
                isSelected && styles.calDaySelected,
                !isSelected && isToday && styles.calDayToday
              ]}>
                <Text style={[
                  styles.calDayNum,
                  isSelected ? styles.calDayNumSelected : isToday ? styles.calDayNumToday : null
                ]}>
                  {Number(day.slice(8, 10))}
                </Text>
              </View>
              <View style={[styles.calDot, has && (isFuture ? styles.calDotFuture : styles.calDotDone)]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.calLegend}>
        <View style={styles.calLegendItem}>
          <View style={[styles.calDot, styles.calDotDone]} />
          <Text style={styles.calLegendText}>Hecho</Text>
        </View>
        <View style={styles.calLegendItem}>
          <View style={[styles.calDot, styles.calDotFuture]} />
          <Text style={styles.calLegendText}>Programado</Text>
        </View>
        <View style={styles.calLegendItem}>
          <View style={styles.calLegendToday} />
          <Text style={styles.calLegendText}>Hoy</Text>
        </View>
      </View>
    </View>
  );
}

// ── WOD: calendario + el entrenamiento del día seleccionado ─────────
export function WodScreen({ user, onGoToClasses }) {
  const palette = useAppTheme();
  styles = useMemo(() => createStyles(palette), [palette]);
  const todayStr = localDayStr();
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [byDay, setByDay] = useState({}); // 'YYYY-MM-DD' -> workout
  const [selected, setSelected] = useState(todayStr);
  const [prs, setPrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const isActive = user?.role === 'admin' || user?.status !== 'pending';

  async function loadMonth(a) {
    const from = ymdLocal(new Date(a.getFullYear(), a.getMonth(), 1));
    const to = ymdLocal(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    const list = await api.getWorkoutsRange(from, to);
    const map = {};
    for (const w of list || []) map[classDay(w.date)] = w;
    setByDay(map);
  }

  async function load() {
    if (!isActive) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      await loadMonth(anchor);
    } catch (err) {
      setError(err.message);
    }
    try {
      const prList = await api.getPRs();
      const map = {};
      for (const pr of prList || []) map[pr.movement] = { value: pr.value, unit: pr.unit };
      setPrs(map);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Al cambiar de mes, recarga solo ese mes (sin spinner global ni los PRs).
  const monthMounted = useRef(false);
  useEffect(() => {
    if (!monthMounted.current) {
      monthMounted.current = true;
      return;
    }
    if (isActive) loadMonth(anchor).catch((err) => setError(err.message));
  }, [anchor]);

  function onRefresh() {
    setRefreshing(true);
    load();
  }

  function changeMonth(delta) {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  const selectedWod = byDay[selected];
  const selIsToday = selected === todayStr;
  const selIsFuture = selected > todayStr;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <ScreenIntro
        eyebrow={formatDate(new Date()).toUpperCase()}
        title="WOD"
        subtitle="Tu calendario de entrenamientos: revisa los días anteriores y lo que viene."
        icon="barbell"
        avatar={(
          <View style={styles.screenAvatarWrap}>
            <Avatar uri={user?.avatar} name={user?.name} size={58} />
            <View style={styles.screenAvatarDot} />
          </View>
        )}
      />

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
          <WodCalendar
            anchor={anchor}
            byDay={byDay}
            selected={selected}
            today={todayStr}
            onSelect={setSelected}
            onPrev={() => changeMonth(-1)}
            onNext={() => changeMonth(1)}
          />

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>No se pudo cargar el calendario</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorHint}>Desliza hacia abajo para reintentar.</Text>
            </View>
          )}

          {selectedWod ? (
            <>
              <View style={styles.card}>
                <Text style={styles.wodKicker}>
                  {wodDayLabel(selected, todayStr)}{selIsFuture ? ' · PROGRAMADO' : ''}
                </Text>
                <Text style={styles.title}>{selectedWod.title}</Text>
                <View style={styles.divider} />
                <Text style={styles.description}>{selectedWod.description}</Text>
                <Reactions targetType="workout" targetId={selectedWod._id} />
              </View>
              {selIsToday && onGoToClasses && (
                <Pressable style={styles.goToClasses} onPress={onGoToClasses}>
                  <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                  <Text style={styles.goToClassesText}>Reserva tu lugar en la clase de hoy</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              )}
              <PersonalizedWod description={selectedWod.description} prs={prs} />
              <CommentsThread targetType="workout" targetId={selectedWod._id} user={user} />
            </>
          ) : (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>
                {selIsToday ? 'Aún no hay WOD para hoy' : selIsFuture ? 'Aún no se programa este día' : 'No hubo WOD este día'}
              </Text>
              <Text style={styles.errorText}>
                {selIsFuture
                  ? 'El gimnasio todavía no publica el entrenamiento de esa fecha.'
                  : selIsToday
                    ? 'El gimnasio todavía no ha publicado el entrenamiento.'
                    : 'No se registró entrenamiento para la fecha seleccionada.'}
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function celebrationMessage(n) {
  if (n >= 100) return '¡100 días! Eres parte del alma del box. Imparable. 🐐';
  if (n >= 50) return '¡50 días de constancia brutal! Nada te detiene.';
  if (n >= 30) return '¡30 días seguidos! Esto ya es estilo de vida. 💪';
  if (n >= 20) return '¡20 días! Tu constancia contagia a todo el box.';
  if (n >= 10) return '¡10 días seguidos! Vas con todo. 🚀';
  return '¡5 días de racha! El hábito está naciendo. 💪';
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

function createStyles(colors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.base },
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl, backgroundColor: colors.base },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  screenIntro: {
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
  screenIntroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  screenEyebrow: { color: colors.accent, fontSize: 11, letterSpacing: 1.4, fontWeight: '800', marginBottom: 3 },
  screenTitleText: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1.2, lineHeight: 38 },
  screenSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  screenIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hello: { color: colors.accent, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  userName: { color: colors.textPrimary, fontFamily: type.display, fontSize: 36, letterSpacing: 1.2, marginTop: 1 },
  homeHero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.34)',
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
  },
  homeHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  homeHeroEyebrow: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '900',
    marginBottom: 4
  },
  homeHeroTitle: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: 1.1
  },
  homeHeroText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs
  },
  homeHeroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md
  },
  homeHeroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: '100%'
  },
  homeHeroPillLive: {
    borderColor: 'rgba(70,226,42,0.42)',
    backgroundColor: 'rgba(70,226,42,0.1)'
  },
  homeHeroPillText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 210
  },
  homeHeroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  homeHeroStatValue: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: 1
  },
  homeHeroStatLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '800'
  },
  homeHeroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border
  },
  homeLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  homeLoadingTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  homeLoadingText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  homeErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,75,75,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,75,75,0.32)',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  homeErrorIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,75,75,0.12)'
  },
  homeErrorTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  homeErrorText: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  homeRetryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  homeRetryText: { color: colors.textPrimary, fontSize: 11, fontWeight: '800' },
  homeQuietCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.26)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  homeQuietIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(70,226,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeQuietTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  homeQuietText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  wodSummaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.26)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  wodSummaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  wodSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(70,226,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wodSummaryKicker: { color: colors.accent, fontSize: 10, letterSpacing: 1.7, fontWeight: '900' },
  wodSummaryTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 1 },
  wodSummaryText: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },

  /* Calendario de WODs */
  cal: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  calNav: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt
  },
  calMonth: { color: colors.textPrimary, fontFamily: type.display, fontSize: 22, letterSpacing: 1 },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekLabel: { flex: 1, textAlign: 'center', color: colors.textFaint, fontSize: 11, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  calDayInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calDayToday: { borderWidth: 1.5, borderColor: colors.accent },
  calDaySelected: { backgroundColor: colors.accent },
  calDayNum: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  calDayNumToday: { color: colors.accent, fontWeight: '800' },
  calDayNumSelected: { color: '#05230b', fontWeight: '800' },
  calDot: {
    width: 6, height: 6, borderRadius: 3, marginTop: 3,
    borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent'
  },
  calDotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  calDotFuture: { backgroundColor: 'transparent', borderColor: colors.accent },
  calLegend: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.md,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border
  },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calLegendText: { color: colors.textMuted, fontSize: 11 },
  calLegendToday: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.accent },

  /* Próxima clase reservada */
  nextClass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.4)',
    borderRadius: radii.lg,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radii.lg,
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
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  announceLabel: { color: colors.accent, fontSize: 11, letterSpacing: 2, fontWeight: '800', marginBottom: 4 },
  announceText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  highlightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(70,226,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  highlightLabel: { color: colors.accent, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  highlightTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 1 },
  highlightText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  highlightDescription: { color: colors.textPrimary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  highlightBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 92,
    alignItems: 'center'
  },
  highlightBtnReserved: {
    backgroundColor: 'rgba(70,226,42,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)'
  },
  highlightBtnText: { color: '#05230b', fontSize: 12, fontWeight: '900' },
  highlightBtnTextReserved: { color: colors.accent },

  membershipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(242,192,55,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(242,192,55,0.38)',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  membershipBannerExpired: {
    backgroundColor: 'rgba(255,75,75,0.08)',
    borderColor: 'rgba(255,75,75,0.38)'
  },
  membershipBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  membershipBannerTitle: { color: '#F2C037', fontSize: 14, fontWeight: '800' },
  membershipBannerTitleExpired: { color: colors.danger },
  membershipBannerText: { color: colors.textPrimary, fontSize: 12, lineHeight: 18, marginTop: 3 },

  pendingCard: {
    backgroundColor: 'rgba(242,192,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(242,192,55,0.4)',
    borderRadius: radii.lg,
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
    borderColor: colors.borderStrong,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8
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
    minWidth: 116,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }
  },
  checkinBtnText: { color: '#05230b', fontFamily: type.display, fontSize: 14, letterSpacing: 0.8 },
  checkinBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0
  },
  checkinBtnTextDisabled: { color: colors.textMuted },

  goToClasses: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    marginBottom: spacing.lg
  },
  goToClassesText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '700' },

  /* Secciones del inicio */
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 22,
    letterSpacing: 1.5,
    marginBottom: spacing.sm
  },

  /* Reserva de clases */
  classCalendarPanel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg
  },
  classWeekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  classWeekBtn: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md
  },
  classWeekBtnDisabled: { opacity: 0.45 },
  classWeekBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },
  classWeekBtnTextDisabled: { color: colors.textMuted },
  classWeekToday: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md
  },
  classWeekTodayText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  branchSegment: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  branchChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: 'center'
  },
  branchChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  branchChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900'
  },
  branchChipTextActive: { color: colors.accentText },
  classDayStrip: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  classDayChip: {
    width: 104,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.sm
  },
  classDayChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  classDayName: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  classDayNameActive: { color: colors.accent },
  classDayDate: { color: colors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 3 },
  classDayDateActive: { color: colors.textPrimary },
  classDayCount: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  classDayCountActive: { color: colors.accent },
  classErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  classErrorTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '900' },
  classErrorText: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  classRetryBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  classRetryText: { color: colors.accent, fontSize: 11, fontWeight: '900' },
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
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  classTime: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 24,
    letterSpacing: 1,
    minWidth: 58
  },
  className: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  classBranch: { color: colors.accent, fontSize: 11, fontWeight: '800', marginTop: 2 },
  classSpots: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  classHintRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  classHint: { color: colors.textMuted, fontSize: 10.5, opacity: 0.8 },
  classBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
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

  /* Modal de detalle de clase */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: spacing.xl,
    borderTopWidth: 1, borderColor: 'rgba(70,226,42,0.3)'
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md
  },
  detailDay: { color: colors.accent, fontFamily: type.mono, fontSize: 12, letterSpacing: 2 },
  detailName: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1, marginTop: 2 },
  detailSpotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  detailSpots: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  detailBody: { color: colors.textPrimary, fontSize: 14, lineHeight: 22, marginTop: spacing.md, marginBottom: spacing.lg },
  detailBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 15, alignItems: 'center',
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }
  },
  detailBtnMine: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(70,226,42,0.45)' },
  detailBtnFull: { backgroundColor: colors.surfaceAlt },
  detailBtnText: { color: '#05230b', fontFamily: type.display, fontSize: 18, letterSpacing: 1.5 },
  detailSecondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm
  },
  detailSecondaryBtnDisabled: { opacity: 0.65, borderColor: colors.border },
  detailSecondaryText: { color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  detailSecondaryTextDisabled: { color: colors.textMuted },

  /* Feed de publicaciones */
  feedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verTodas: { color: colors.accent, fontSize: 13, fontWeight: '700', marginBottom: spacing.sm },
  bulletinPosts: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  bulletinLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '900',
    marginBottom: spacing.sm
  },
  postCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm
  },
  postThumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  postThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  postCompactTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 1 },
  postCompactPreview: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  postBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  postBadge: { color: colors.accent, fontSize: 11, fontWeight: '700' },
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
  postLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: 11, paddingHorizontal: spacing.md, marginTop: spacing.sm
  },
  postLinkText: { color: colors.beige, fontSize: 14, fontWeight: '700' },

  /* Visor de publicaciones (archivo + detalle) */
  viewerRoot: { flex: 1, backgroundColor: colors.base },
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border
  },
  viewerTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 26, letterSpacing: 1.5 },
  viewerBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewerBackText: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  viewerContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  archiveMonth: {
    color: colors.accent, fontFamily: type.mono, fontSize: 12, letterSpacing: 2,
    marginBottom: spacing.sm
  },

  /* Footer compacto con la info del gym */
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center'
  },
  footerBrand: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 22,
    letterSpacing: 3,
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(70,226,42,0.35)',
    textShadowRadius: 10
  },
  footerLine: { color: colors.textMuted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  footerIg: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(70,226,42,0.4)',
    borderRadius: 16, paddingVertical: 7, paddingHorizontal: 14
  },
  footerIgText: { color: colors.accent, fontSize: 13, fontWeight: '700' },

  /* Dentro del box */
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.4)',
    borderRadius: radii.lg,
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
  checkinSuccess: { color: colors.accent, fontSize: 13, marginBottom: spacing.sm, textAlign: 'center', fontWeight: '700' },
  checkinError: { color: colors.danger, fontSize: 13, marginBottom: spacing.lg, textAlign: 'center' },

  /* Celebración de hito de racha */
  celebBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg
  },
  celebCard: {
    width: '100%', maxWidth: 340, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: 'rgba(255,122,26,0.5)',
    padding: spacing.xl
  },
  celebEmoji: { fontSize: 56, marginBottom: spacing.sm },
  celebStreak: { color: '#FF7A1A', fontFamily: type.display, fontSize: 72, letterSpacing: 1, lineHeight: 74 },
  celebDays: { color: colors.textPrimary, fontFamily: type.display, fontSize: 22, letterSpacing: 3, marginBottom: spacing.md },
  celebMsg: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: spacing.lg },
  celebBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: 14, paddingHorizontal: spacing.xl, alignSelf: 'stretch', alignItems: 'center'
  },
  celebBtnText: { color: '#05230b', fontWeight: '900', fontSize: 15, letterSpacing: 1 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  wodKicker: { color: colors.accent, fontFamily: type.mono, fontSize: 11, letterSpacing: 2, marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 36, letterSpacing: 1.3, marginBottom: spacing.md },
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
    borderRadius: radii.lg,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
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
    borderRadius: radii.lg,
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
  sendBtnDisabled: { opacity: 0.4 },

  /* Premium visual pass */
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xxl, backgroundColor: colors.base },
  screenIntro: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    marginBottom: spacing.lg,
    shadowOpacity: 0,
    elevation: 0
  },
  screenIntroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  screenEyebrow: { color: colors.accent, fontSize: 12, letterSpacing: 2.4, fontWeight: '900', marginBottom: 3 },
  screenTitleText: { color: colors.textPrimary, fontFamily: type.display, fontSize: 60, letterSpacing: 1.2, lineHeight: 64 },
  screenSubtitle: { color: colors.textMuted, fontSize: 19, lineHeight: 25, marginTop: spacing.xs },
  screenIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  screenAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8
  },
  screenAvatarDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.base
  },
  homeHero: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    marginBottom: spacing.lg,
    shadowOpacity: 0,
    elevation: 0
  },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  heroAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8
  },
  heroAvatarStatus: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.base
  },
  homeHeroEyebrow: { color: colors.accent, fontSize: 12, letterSpacing: 2.8, fontWeight: '900', marginBottom: 2 },
  homeHeroTitle: {
    color: colors.textPrimary,
    fontFamily: type.display,
    fontSize: 62,
    lineHeight: 66,
    letterSpacing: 1.4
  },
  homeHeroText: { color: colors.textMuted, fontSize: 18, lineHeight: 24, marginTop: 0 },
  nextFeatureCard: {
    minHeight: 220,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9
  },
  featureBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(70,226,42,0.05)',
    borderRadius: 24
  },
  featureImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.44
  },
  featureTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.36)',
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  featurePillText: { color: colors.accent, fontFamily: type.mono, fontSize: 11, letterSpacing: 2.4, fontWeight: '900' },
  featureMenu: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(0,0,0,0.34)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 36, lineHeight: 40, letterSpacing: 1.1 },
  featureDate: { color: colors.textMuted, fontSize: 15, marginTop: spacing.xs },
  featureSpotsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  featureSpots: { color: colors.textMuted, fontSize: 16 },
  featureSpotsStrong: { color: colors.accent, fontWeight: '900' },
  featureButton: {
    alignSelf: 'flex-start',
    minWidth: 208,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8
  },
  featureButtonText: { color: '#05230b', fontFamily: type.mono, fontSize: 13, letterSpacing: 2.3, fontWeight: '900' },
  homeHeroStats: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginTop: 0 },
  homeHeroStatCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    justifyContent: 'space-between',
    overflow: 'hidden'
  },
  homeHeroStatValue: { color: colors.textPrimary, fontFamily: type.display, fontSize: 28, lineHeight: 31, letterSpacing: 1 },
  homeHeroStatLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '800' },
  wodSummaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.md,
    marginBottom: spacing.lg,
    overflow: 'hidden'
  },
  wodSummaryBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.025)'
  },
  wodSummaryIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wodSummaryIconText: { color: colors.accent, fontFamily: type.display, fontSize: 22, letterSpacing: 1 },
  wodSummaryKicker: { color: colors.textMuted, fontFamily: type.mono, fontSize: 11, letterSpacing: 4, fontWeight: '900', marginBottom: spacing.md },
  wodSummaryTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 28, lineHeight: 31, letterSpacing: 1 },
  wodSummaryText: { color: colors.textMuted, fontSize: 15, lineHeight: 21, marginTop: 3 },
  wodSummaryLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  wodSummaryLink: { color: colors.accent, fontFamily: type.mono, fontSize: 12, letterSpacing: 2.3, fontWeight: '900' },
  sectionTitle: { color: colors.textPrimary, fontFamily: type.display, fontSize: 28, letterSpacing: 2, marginBottom: spacing.sm },
  sectionAccent: { width: 5, height: 28, borderRadius: 3, backgroundColor: colors.accent },
  classCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderLeftWidth: 0,
    borderRadius: 22,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
    minHeight: 150,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    overflow: 'hidden'
  },
  classCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  classCardImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.36
  },
  classCardImageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.48)'
  },
  classTimeBlock: { width: 76, gap: 6 },
  classTime: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1, lineHeight: 38 },
  classDurationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  classDuration: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  classDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.borderStrong },
  classInfoBlock: { flex: 1, minWidth: 0, paddingRight: 2 },
  className: { color: colors.textPrimary, fontFamily: type.display, fontSize: 24, lineHeight: 28, letterSpacing: 1 },
  classCoachRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  classCoach: { color: colors.textMuted, fontSize: 14 },
  classMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  classSpotsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 9,
    backgroundColor: 'rgba(0,0,0,0.2)'
  },
  classSpotDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  classSpotDotLow: { backgroundColor: '#F2C037' },
  classSpotDotFull: { backgroundColor: colors.danger },
  classSpots: { color: colors.textMuted, fontFamily: type.mono, fontSize: 10.5, letterSpacing: 1.1, fontWeight: '900' },
  classSpotsFull: { color: colors.textMuted },
  classBranch: { color: colors.textFaint, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  classBtn: {
    alignSelf: 'stretch',
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent
  },
  classBtnOutline: { backgroundColor: 'transparent', borderColor: colors.accent },
  classBtnMine: { backgroundColor: 'rgba(70,226,42,0.1)', borderColor: 'rgba(70,226,42,0.45)' },
  classBtnChecked: { backgroundColor: 'rgba(70,226,42,0.08)', borderColor: colors.borderStrong },
  classBtnText: { color: '#05230b', fontFamily: type.mono, fontSize: 11, letterSpacing: 1.8, fontWeight: '900' },
  classBtnTextOutline: { color: colors.accent },
  classBtnTextChecked: { color: colors.accent },
  classActions: { gap: 8 },
  classSecondaryBtn: {
    alignSelf: 'stretch',
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: spacing.sm
  },
  classSecondaryBtnDisabled: {
    opacity: 0.64,
    borderColor: colors.border
  },
  classSecondaryText: {
    color: colors.textPrimary,
    fontFamily: type.mono,
    fontSize: 10.5,
    letterSpacing: 1.3,
    fontWeight: '900',
    textAlign: 'center'
  },
  classSecondaryTextDisabled: { color: colors.textMuted },
  classCancelClosed: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center'
  },
  classCalendarPanel: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    marginBottom: spacing.lg
  },
  branchChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 11,
    alignItems: 'center'
  },
  classDayChip: {
    width: 88,
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  classDayChipActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  classDayName: { color: colors.textMuted, fontFamily: type.mono, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  classDayNameActive: { color: '#05230b' },
  classDayDate: { color: colors.textMuted, fontSize: 18, fontWeight: '900', marginTop: 7 },
  classDayDateActive: { color: '#05230b' },
  classDayCount: { color: colors.textFaint, fontSize: 10, marginTop: 5 },
  classDayCountActive: { color: '#05230b' },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.35)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden'
  },
  highlightBackgroundImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.28
  },
  highlightBackgroundOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  cal: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  calNav: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border
  },
  calMonth: { color: colors.textPrimary, fontFamily: type.display, fontSize: 34, letterSpacing: 1.5 },
  calWeekRow: { flexDirection: 'row', marginBottom: spacing.sm },
  calWeekLabel: { flex: 1, textAlign: 'center', color: colors.textFaint, fontSize: 14, fontWeight: '800' },
  calCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 8 },
  calDayInner: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  calDayToday: { borderWidth: 2, borderColor: colors.accent },
  calDaySelected: { backgroundColor: colors.accent },
  calDayNum: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  calDayNumToday: { color: colors.accent, fontWeight: '900' },
  calDayNumSelected: { color: '#05230b', fontWeight: '900' },
  calDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent'
  },
  calLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
    marginBottom: spacing.lg
  },
  wodKicker: { color: colors.accent, fontFamily: type.mono, fontSize: 12, letterSpacing: 2.8, fontWeight: '900', marginBottom: spacing.sm },
  title: { color: colors.textPrimary, fontFamily: type.display, fontSize: 42, letterSpacing: 1.3, lineHeight: 46, marginBottom: spacing.md },
  description: { color: colors.textPrimary, fontSize: 18, lineHeight: 29 },
  persoCard: {
    backgroundColor: 'rgba(70,226,42,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(70,226,42,0.36)',
    borderRadius: 20,
    padding: spacing.md,
    marginTop: spacing.md
  }
  });
}

let styles = createStyles(colors);
