import crypto from 'node:crypto';
import { BranchCheckInQr } from '../models/BranchCheckInQr.js';
import { GymClass } from '../models/GymClass.js';
import { addDaysUTC, GYM_UTC_OFFSET_HOURS } from './classSchedule.js';
import { branchFilter, normalizeBranch } from './branches.js';
import {
  countReservations,
  ensureReservationDates,
  findReservationByMember,
  isCapacityStatus,
  normalizeReservationStatus
} from './classReservations.js';
import { createAttendanceIfMissing } from './attendance.js';

const QR_VERSION = 1;
const STATIC_QR_VERSION = 2;
const STATIC_QR_TYPE = 'inrage_branch_static_check_in';
const MINUTE_MS = 60_000;

function configuredSecret() {
  return String(process.env.CHECKIN_QR_SECRET || '').trim();
}

function qrDebugEnabled() {
  return String(process.env.CHECKIN_QR_DEBUG || '').toLowerCase() === 'true';
}

function tokenFingerprint(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex').slice(0, 12);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function qrDebug(event, data = {}) {
  if (!qrDebugEnabled()) return;
  console.info('[checkin-qr]', event, data);
}

function windowBeforeMinutes() {
  return Number(process.env.CHECKIN_QR_WINDOW_MINUTES_BEFORE || 30);
}

function windowAfterMinutes() {
  return Number(process.env.CHECKIN_QR_WINDOW_MINUTES_AFTER || 15);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64url(input) {
  const padded = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function expectedSecret() {
  const secret = configuredSecret();
  if (!secret) {
    const err = new Error('QR Check-in no está configurado.');
    err.status = 503;
    err.code = 'qr_not_configured';
    throw err;
  }
  return secret;
}

function randomQrToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function parseStaticQrToken(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    const err = new Error('Falta token de QR');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }

  try {
    const payload = JSON.parse(raw);
    if (payload?.type !== STATIC_QR_TYPE || payload?.v !== STATIC_QR_VERSION || !payload?.token) {
      const err = new Error('Este QR no es valido.');
      err.status = 400;
      err.code = 'invalid_qr';
      throw err;
    }
    return {
      token: String(payload.token).trim(),
      branch: branchFilter(payload.branch)
    };
  } catch (err) {
    if (err?.code) throw err;
  }

  return { token: raw, branch: null };
}

export function buildStaticBranchCheckInQr(branchInput, { token = randomQrToken(), now = new Date() } = {}) {
  const branch = branchFilter(branchInput);
  const payload = {
    v: STATIC_QR_VERSION,
    type: STATIC_QR_TYPE,
    branch,
    token
  };
  return {
    branch,
    token,
    tokenHash: tokenHash(token),
    tokenPreview: tokenFingerprint(token),
    generatedAt: now,
    qrValue: JSON.stringify(payload)
  };
}

function branchQrResponse(row) {
  if (!row) return null;
  return {
    branch: normalizeBranch(row.branch),
    qrValue: row.qrValue,
    tokenPreview: row.tokenPreview || '',
    generation: Number(row.generation || 1),
    generatedAt: row.generatedAt || row.createdAt || null,
    updatedAt: row.updatedAt || null,
    static: true,
    printable: true
  };
}

export async function getCurrentBranchCheckInQr(branchInput) {
  const branch = branchFilter(branchInput);
  const row = await BranchCheckInQr.findOne({ branch });
  if (!row) {
    const err = new Error(`No hay QR de check-in generado para ${branch}.`);
    err.status = 404;
    err.code = 'qr_not_generated';
    err.title = 'QR no generado';
    err.actionLabel = 'Generar QR';
    throw err;
  }
  return branchQrResponse(row);
}

export async function generateBranchCheckInQr(branchInput, adminId, { now = new Date() } = {}) {
  const branch = branchFilter(branchInput);
  const next = buildStaticBranchCheckInQr(branch, { now });
  const previous = await BranchCheckInQr.findOne({ branch }).select('generation');
  const generation = Number(previous?.generation || 0) + 1;
  const row = await BranchCheckInQr.findOneAndUpdate(
    { branch },
    {
      $set: {
        branch,
        qrValue: next.qrValue,
        tokenHash: next.tokenHash,
        tokenPreview: next.tokenPreview,
        generation,
        generatedBy: adminId,
        generatedAt: now
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return branchQrResponse(row);
}

export async function validateCurrentBranchCheckInQr(input) {
  const parsed = parseStaticQrToken(input);
  const hash = tokenHash(parsed.token);
  const query = parsed.branch ? { branch: parsed.branch } : { tokenHash: hash };
  const row = await BranchCheckInQr.findOne(query);
  if (!row) {
    const err = new Error('Este QR no es el codigo vigente del box.');
    err.status = 400;
    err.code = 'invalid_qr';
    err.title = 'QR no vigente';
    err.actionLabel = 'Escanear QR vigente';
    throw err;
  }
  if (row.tokenHash !== hash) {
    const err = new Error('Este QR ya no esta vigente. Escanea el codigo nuevo del box.');
    err.status = 410;
    err.code = 'qr_replaced';
    err.title = 'QR reemplazado';
    err.actionLabel = 'Escanear QR vigente';
    throw err;
  }
  return {
    branch: normalizeBranch(row.branch),
    generatedAt: row.generatedAt || row.createdAt || null,
    generation: Number(row.generation || 1)
  };
}

export function classStartsAt(gymClass) {
  const day = new Date(gymClass.date).toISOString().slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = String(gymClass.time || '00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, date, hour || 0, minute || 0) - GYM_UTC_OFFSET_HOURS * 3600 * 1000);
}

function minuteOf(date = new Date()) {
  return Math.floor(date.getTime() / MINUTE_MS);
}

function qrExpiresAt(minute) {
  return new Date((minute + 1) * MINUTE_MS);
}

export function buildRotatingCheckInQr(branchInput, { now = new Date() } = {}) {
  const branch = branchFilter(branchInput);
  const secret = expectedSecret();
  const minute = minuteOf(now);
  const payload = {
    v: QR_VERSION,
    type: 'inrage_branch_check_in',
    branch,
    minute
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  const token = `${encodedPayload}.${signature}`;
  const expiresAt = qrExpiresAt(minute);
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));

  return {
    branch,
    token,
    expiresAt,
    secondsRemaining,
    qrValue: JSON.stringify({ type: 'inrage_branch_check_in', token })
  };
}

export function validateRotatingCheckInQr(token, { now = new Date() } = {}) {
  const secret = expectedSecret();
  const fingerprint = tokenFingerprint(token);
  const [encodedPayload, signature] = String(token || '').trim().split('.');
  if (!encodedPayload || !signature) {
    const err = new Error('Este QR no es valido.');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }
  const expected = sign(encodedPayload, secret);
  if (!safeEqual(signature, expected)) {
    const err = new Error('Este QR no es valido.');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encodedPayload));
  } catch {
    const err = new Error('Este QR no es valido.');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }

  if (payload?.v !== QR_VERSION || payload?.type !== 'inrage_branch_check_in') {
    const err = new Error('Este QR no es valido.');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }

  const currentMinute = minuteOf(now);
  if (payload.minute < currentMinute - 1) {
    qrDebug('expired', {
      token: fingerprint,
      branch: payload.branch,
      tokenMinute: payload.minute,
      currentMinute,
      scannedAt: now.toISOString()
    });
    const err = new Error('Este QR expiro. Escanea el nuevo codigo.');
    err.status = 410;
    err.code = 'qr_expired';
    throw err;
  }
  if (payload.minute > currentMinute) {
    const err = new Error('Este QR no es valido.');
    err.status = 400;
    err.code = 'invalid_qr';
    throw err;
  }
  qrDebug('parsed', {
    token: fingerprint,
    branch: payload.branch,
    tokenMinute: payload.minute,
    currentMinute,
    graceMinute: payload.minute === currentMinute - 1,
    scannedAt: now.toISOString()
  });

  return {
    branch: branchFilter(payload.branch),
    minute: payload.minute,
    expiresAt: qrExpiresAt(payload.minute)
  };
}

function gymDayFrom(date) {
  const shifted = new Date(date.getTime() + GYM_UTC_OFFSET_HOURS * 3600 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function activeMemberReservation(gymClass, memberId) {
  const reservation = findReservationByMember(gymClass.reservations || [], memberId);
  if (!reservation) return null;
  const status = normalizeReservationStatus(reservation);
  return status === 'reserved' || status === 'checked_in' ? reservation : null;
}

function checkInWindow(gymClass, scannedAt) {
  const startsAt = classStartsAt(gymClass);
  const beforeMs = windowBeforeMinutes() * MINUTE_MS;
  const afterMs = windowAfterMinutes() * MINUTE_MS;
  return {
    startsAt,
    tooEarly: scannedAt.getTime() < startsAt.getTime() - beforeMs,
    tooLate: scannedAt.getTime() > startsAt.getTime() + afterMs,
    inWindow: scannedAt.getTime() >= startsAt.getTime() - beforeMs
      && scannedAt.getTime() <= startsAt.getTime() + afterMs
  };
}

function classDay(gymClass) {
  return new Date(gymClass.date).toISOString().slice(0, 10);
}

function gymClock(date) {
  const shifted = new Date(date.getTime() + GYM_UTC_OFFSET_HOURS * 3600 * 1000);
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function publicTime(gymClass) {
  return `${gymClass.time || ''} en ${normalizeBranch(gymClass.branch)}`;
}

function serializeQrClass(gymClass) {
  if (!gymClass) return null;
  const counts = countReservations(gymClass.reservations || [], gymClass.capacity);
  return {
    id: gymClass._id,
    _id: gymClass._id,
    name: gymClass.name || 'Clase',
    branch: normalizeBranch(gymClass.branch),
    date: classDay(gymClass),
    time: gymClass.time || '',
    capacity: counts.capacity,
    reservedCount: counts.reserved + counts.checkedIn,
    checkedIn: counts.checkedIn,
    waitlist: counts.waitlist,
    spotsLeft: counts.spotsLeft
  };
}

function checkInError(code, message, status = 409, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function hasCapacity(gymClass, memberId) {
  const reservation = activeMemberReservation(gymClass, memberId);
  if (reservation) return true;
  return countReservations(gymClass.reservations || [], gymClass.capacity).spotsLeft > 0;
}

function findCandidate(classes, memberId, scannedAt) {
  let sawFull = false;
  for (const gymClass of classes) {
    const win = checkInWindow(gymClass, scannedAt);
    if (win.tooLate || win.tooEarly) continue;
    if (!hasCapacity(gymClass, memberId)) {
      sawFull = true;
      continue;
    }
    return { gymClass, sawFull };
  }
  return { gymClass: null, sawFull };
}

function reservationRequiredResponse(gymClass) {
  return {
    kind: 'requires_confirmation',
    status: 'reservation_required',
    gymClass,
    reservation: null
  };
}

export async function resolveCheckInTargetClass(
  memberId,
  branchInput,
  scannedAt = new Date(),
  { confirmAutoReserve = false } = {}
) {
  const branch = normalizeBranch(branchInput);
  const today = gymDayFrom(scannedAt);
  const from = addDaysUTC(today, -1);
  const to = addDaysUTC(today, 2);
  const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
    .sort({ date: 1, time: 1, _id: 1 });

  const sorted = [...classes].sort((a, b) => {
    const diff = classStartsAt(a).getTime() - classStartsAt(b).getTime();
    return diff || String(a._id).localeCompare(String(b._id));
  });
  const branchClasses = sorted.filter((gymClass) => normalizeBranch(gymClass.branch) === branch);
  const otherReservation = sorted.find((gymClass) => {
    if (normalizeBranch(gymClass.branch) === branch) return false;
    if (!activeMemberReservation(gymClass, memberId)) return false;
    const win = checkInWindow(gymClass, scannedAt);
    return !win.tooLate;
  });

  const reservedHere = branchClasses
    .map((gymClass) => ({ gymClass, reservation: activeMemberReservation(gymClass, memberId) }))
    .filter((row) => row.reservation);

  const checkedHere = reservedHere.find(
    (row) => normalizeReservationStatus(row.reservation) === 'checked_in'
  );
  if (checkedHere) {
    return {
      kind: 'reserved',
      status: 'already_checked_in',
      gymClass: checkedHere.gymClass,
      reservation: checkedHere.reservation
    };
  }

  const reservedInWindow = reservedHere.find((row) => checkInWindow(row.gymClass, scannedAt).inWindow);
  if (reservedInWindow) {
    return {
      kind: 'reserved',
      status: 'checked_in_reserved_class',
      gymClass: reservedInWindow.gymClass,
      reservation: reservedInWindow.reservation
    };
  }

  if (otherReservation && reservedHere.length === 0) {
    throw checkInError(
      'wrong_branch_for_reservation',
      `Tu reserva es en ${normalizeBranch(otherReservation.branch)}, pero escaneaste el QR de ${branch}.`,
      409,
      {
        title: 'Sucursal incorrecta',
        actionLabel: 'Ver mi reserva',
        classId: otherReservation._id,
        reservationBranch: normalizeBranch(otherReservation.branch),
        class: serializeQrClass(otherReservation),
        reservation: { branch: normalizeBranch(otherReservation.branch), classId: otherReservation._id }
      }
    );
  }

  const earlyReservation = reservedHere.find((row) => checkInWindow(row.gymClass, scannedAt).tooEarly);
  const lateReservedHere = reservedHere.some((row) => checkInWindow(row.gymClass, scannedAt).tooLate);
  const { gymClass, sawFull } = findCandidate(branchClasses, memberId, scannedAt);
  if (!gymClass) {
    if (sawFull) {
      throw checkInError('class_full', `La clase disponible en ${branch} esta llena.`, 409, {
        title: 'Clase llena',
        actionLabel: 'Ver horarios'
      });
    }
    if (earlyReservation) {
      const win = checkInWindow(earlyReservation.gymClass, scannedAt);
      throw checkInError(
        'too_early_for_checkin',
        `Tu reserva de ${publicTime(earlyReservation.gymClass)} todavia no abre check-in. Puedes escanear desde las ${gymClock(new Date(win.startsAt.getTime() - windowBeforeMinutes() * MINUTE_MS))}.`,
        409,
        {
          title: 'Aun es temprano para hacer check-in',
          actionLabel: 'Ver reserva',
          classId: earlyReservation.gymClass._id,
          class: serializeQrClass(earlyReservation.gymClass),
          reservation: { classId: earlyReservation.gymClass._id, branch: normalizeBranch(earlyReservation.gymClass.branch) }
        }
      );
    }
    if (lateReservedHere) {
      const lateReservation = reservedHere.find((row) => checkInWindow(row.gymClass, scannedAt).tooLate);
      const win = checkInWindow(lateReservation.gymClass, scannedAt);
      throw checkInError(
        'too_late_for_checkin',
        `El check-in de tu reserva de ${publicTime(lateReservation.gymClass)} cerro a las ${gymClock(new Date(win.startsAt.getTime() + windowAfterMinutes() * MINUTE_MS))}.`,
        409,
        {
          title: 'La ventana de check-in ya cerro',
          actionLabel: 'Ver horarios',
          classId: lateReservation.gymClass._id,
          class: serializeQrClass(lateReservation.gymClass),
          reservation: { classId: lateReservation.gymClass._id, branch: normalizeBranch(lateReservation.gymClass.branch) }
        }
      );
    }
    throw checkInError('no_available_class', `No hay clases disponibles para check-in en ${branch}.`, 404, {
      title: 'No hay clase disponible',
      actionLabel: 'Ver horarios'
    });
  }

  if (earlyReservation) {
    throw checkInError(
      'wrong_class_for_reservation',
      `Tu reserva es para las ${earlyReservation.gymClass.time}. Si llegaste para la clase de ${gymClass.time}, cambia tu reservacion antes de escanear.`,
      409,
      {
        title: 'Tu reserva es para otra hora',
        actionLabel: 'Cambiar reserva',
        classId: earlyReservation.gymClass._id,
        class: serializeQrClass(earlyReservation.gymClass),
        suggestedClass: serializeQrClass(gymClass),
        reservation: { classId: earlyReservation.gymClass._id, branch: normalizeBranch(earlyReservation.gymClass.branch) }
      }
    );
  }

  if (lateReservedHere) {
    const lateReservation = reservedHere.find((row) => checkInWindow(row.gymClass, scannedAt).tooLate);
    const win = checkInWindow(lateReservation.gymClass, scannedAt);
    throw checkInError(
      'too_late_for_checkin',
      `El check-in de tu reserva de ${publicTime(lateReservation.gymClass)} cerro a las ${gymClock(new Date(win.startsAt.getTime() + windowAfterMinutes() * MINUTE_MS))}.`,
      409,
      {
        title: 'La ventana de check-in ya cerro',
        actionLabel: 'Ver horarios',
        classId: lateReservation.gymClass._id,
        class: serializeQrClass(lateReservation.gymClass),
        suggestedClass: serializeQrClass(gymClass),
        reservation: { classId: lateReservation.gymClass._id, branch: normalizeBranch(lateReservation.gymClass.branch) }
      }
    );
  }

  if (!confirmAutoReserve) {
    return reservationRequiredResponse(gymClass);
  }

  return {
    kind: 'auto',
    status: 'auto_reserved_and_checked_in',
    gymClass,
    reservation: findReservationByMember(gymClass.reservations || [], memberId),
    previousReservations: []
  };
}

function successMessage(status, gymClass, kind = '') {
  const branch = normalizeBranch(gymClass.branch);
  if (status === 'checked_in_reserved_class') {
    return `Check-in confirmado para tu clase reservada de ${gymClass.time} en ${branch}.`;
  }
  if (status === 'already_checked_in') {
    return `Ya tenias check-in confirmado para tu clase de ${gymClass.time} en ${branch}.`;
  }
  return `No tenias reserva. Te agregamos a la clase mas cercana: ${gymClass.time} en ${branch}.`;
}

function successTitle(status) {
  if (status === 'already_checked_in') return 'Check-in ya confirmado';
  return 'Check-in confirmado';
}

function reservationRequiredPayload(target) {
  return {
    ok: false,
    status: 'reservation_required',
    title: 'Necesitas reservar esta clase',
    message: `Hay lugar disponible para la clase de ${target.gymClass.time} en ${normalizeBranch(target.gymClass.branch)}. Confirma para reservar y hacer check-in.`,
    actionLabel: 'Reservar y hacer check-in',
    class: serializeQrClass(target.gymClass),
    suggestedClass: serializeQrClass(target.gymClass),
    reservation: null
  };
}

function publicErrorPayload(err) {
  return {
    ok: false,
    status: err.code,
    title: err.title || 'No se pudo confirmar',
    message: err.message,
    error: err.message,
    actionLabel: err.actionLabel || 'Entendido',
    class: err.class || null,
    suggestedClass: err.suggestedClass || null,
    reservation: err.reservation || null
  };
}

export function checkInErrorResponse(err) {
  return publicErrorPayload(err);
}

export function reservationCancelMinutesBefore() {
  return Number(process.env.RESERVATION_CANCEL_MINUTES_BEFORE || 30);
}

export function canCancelReservationForClass(gymClass, now = new Date()) {
  const startsAt = classStartsAt(gymClass);
  return now.getTime() < startsAt.getTime() - reservationCancelMinutesBefore() * MINUTE_MS;
}

export function reservationCancellationClosedPayload(gymClass) {
  return {
    ok: false,
    status: 'reservation_cancellation_closed',
    title: 'Cancelacion cerrada',
    message: `Ya no puedes cancelar desde la app. La cancelacion cierra ${reservationCancelMinutesBefore()} minutos antes de la clase.`,
    actionLabel: 'Entendido',
    class: serializeQrClass(gymClass)
  };
}

export async function checkInWithRotatingQr(
  memberId,
  token,
  { now = new Date(), confirmAutoReserve = false } = {}
) {
  const { branch } = await validateCurrentBranchCheckInQr(token);
  qrDebug('scan-start', {
    branch,
    memberId: String(memberId),
    scannedAt: now.toISOString(),
    token: tokenFingerprint(token),
    confirmAutoReserve: Boolean(confirmAutoReserve)
  });
  let target;
  try {
    target = await resolveCheckInTargetClass(memberId, branch, now, { confirmAutoReserve });
  } catch (err) {
    qrDebug('scan-failed', {
      branch,
      memberId: String(memberId),
      scannedAt: now.toISOString(),
      status: err.code || 'error',
      reason: err.message
    });
    throw err;
  }

  if (target.status === 'reservation_required') {
    qrDebug('scan-confirmation-required', {
      branch,
      memberId: String(memberId),
      classId: String(target.gymClass?._id || ''),
      scannedAt: now.toISOString()
    });
    return reservationRequiredPayload(target);
  }

  const { gymClass } = target;
  let { reservation } = target;
  const alreadyCheckedIn = target.status === 'already_checked_in';

  if (!alreadyCheckedIn) {
    if (reservation) {
      ensureReservationDates(reservation, now);
      reservation.status = 'checked_in';
      reservation.checkedInAt = now;
      reservation.checkInMethod = 'qr_scan';
      reservation.checkedInBy = memberId;
    } else {
      gymClass.reservations.push({
        member: memberId,
        status: 'checked_in',
        reservedAt: now,
        at: now,
        checkedInAt: now,
        checkInMethod: 'qr_scan',
        checkedInBy: memberId,
        source: 'qr_auto',
        autoReservedByQr: true
      });
      reservation = gymClass.reservations[gymClass.reservations.length - 1];
    }
    if (target.kind === 'auto' || target.kind === 'moved') {
      reservation.source = 'qr_auto';
      reservation.autoReservedByQr = true;
    }
    await gymClass.save();
  }

  await createAttendanceIfMissing(memberId, {
    classId: gymClass._id,
    checkInAt: reservation?.checkedInAt || now
  });

  qrDebug('scan-resolved', {
    branch: normalizeBranch(gymClass.branch),
    memberId: String(memberId),
    classId: String(gymClass._id),
    status: target.status,
    scannedAt: now.toISOString(),
    autoReservedByQr: Boolean(reservation?.autoReservedByQr)
  });

  return {
    ok: true,
    status: target.status,
    alreadyCheckedIn,
    classId: gymClass._id,
    branch: normalizeBranch(gymClass.branch),
    time: gymClass.time,
    checkedInAt: reservation?.checkedInAt || now,
    autoReservedByQr: Boolean(reservation?.autoReservedByQr),
    movedFromClassId: null,
    movedFromTime: null,
    title: successTitle(target.status),
    message: successMessage(target.status, gymClass, target.kind),
    actionLabel: 'Listo',
    class: serializeQrClass(gymClass),
    reservation: {
      classId: gymClass._id,
      branch: normalizeBranch(gymClass.branch),
      status: normalizeReservationStatus(reservation)
    }
  };
}

export const checkinQr = {
  buildRotatingCheckInQr,
  validateRotatingCheckInQr,
  buildStaticBranchCheckInQr,
  getCurrentBranchCheckInQr,
  generateBranchCheckInQr,
  validateCurrentBranchCheckInQr,
  resolveCheckInTargetClass,
  checkInWithRotatingQr,
  checkInErrorResponse,
  reservationCancelMinutesBefore,
  canCancelReservationForClass,
  reservationCancellationClosedPayload
};
