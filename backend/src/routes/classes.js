import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { GymClass } from '../models/GymClass.js';
import { Member } from '../models/Member.js';
import { ensureScheduledClasses, gymTodayUTC, addDaysUTC, GYM_UTC_OFFSET_HOURS } from '../services/classSchedule.js';
import { branchFilter, normalizeBranch } from '../services/branches.js';
import { notificationService } from '../services/notificationService.js';
import { createAttendanceIfMissing } from '../services/attendance.js';
import {
  createClassCheckInToken,
  validateCheckInToken
} from '../services/checkInTokens.js';
import {
  canCancelReservationForClass,
  checkInErrorResponse,
  checkInWithRotatingQr,
  reservationCancellationClosedPayload
} from '../services/checkinQr.js';
import {
  countReservations,
  ensureReservationDates,
  findReservationByMember,
  isCapacityStatus,
  isMineActive,
  normalizeReservationStatus,
  serializeRosterMember
} from '../services/classReservations.js';

const router = Router();
const DATE_LABEL = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
});

function startOfUTCDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayQuery(value, field) {
  if (!value) return null;
  const raw = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error(`${field} invalida`), { status: 400 });
  }
  return startOfUTCDay(date);
}

function classDateWindow(query = {}) {
  const defaultFrom = addDaysUTC(gymTodayUTC(), -1);

  const from = dayQuery(query.dateFrom || query.from, 'dateFrom') || defaultFrom;
  const toDay = dayQuery(query.dateTo || query.to, 'dateTo');
  const to = toDay ? addDaysUTC(toDay, 1) : addDaysUTC(from, 9);

  if (to <= from) {
    throw Object.assign(new Error('Rango de fechas invalido'), { status: 400 });
  }
  return { from, to };
}

function classDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function branchCalendarFilter(value) {
  if (!value || String(value).toLowerCase() === 'all') return null;
  return branchFilter(value);
}

function classSubtitle(gymClass) {
  const branch = normalizeBranch(gymClass.branch);
  const label = DATE_LABEL.format(new Date(gymClass.date));
  return `${branch} - ${label} - ${gymClass.time || ''}`;
}

function activeRosterRows(reservations = []) {
  return reservations
    .filter((reservation) => {
      const status = normalizeReservationStatus(reservation);
      return status === 'reserved' || status === 'checked_in' || status === 'waitlist';
    })
    .map((reservation) => serializeRosterMember(reservation));
}

function classResponse(c, me, isAdmin) {
  const counts = countReservations(c.reservations, c.capacity);
  const myReservation = findReservationByMember(c.reservations, me);
  const myReservationStatus = myReservation ? normalizeReservationStatus(myReservation) : null;

  return {
    id: c._id,
    _id: c._id,
    date: c.date,
    time: c.time,
    branch: normalizeBranch(c.branch),
    name: c.name,
    backgroundImage: c.backgroundImage || '',
    imageUrl: c.backgroundImage || '',
    capacity: c.capacity,
    reserved: counts.reserved,
    reservedCount: counts.reserved + counts.checkedIn,
    checkedIn: counts.checkedIn,
    waitlist: counts.waitlist,
    cancelled: counts.cancelled,
    spotsLeft: counts.spotsLeft,
    isSpecial: Boolean(c.isSpecial),
    specialLabel: c.specialLabel || '',
    specialDescription: c.specialDescription || '',
    featuredOnHome: Boolean(c.featuredOnHome),
    homePriority: Number(c.homePriority || 0),
    specialIcon: c.specialIcon || '',
    specialColor: c.specialColor || '',
    visibleFrom: c.visibleFrom || null,
    visibleUntil: c.visibleUntil || null,
    fromSchedule: Boolean(c.template),
    isReservedByMe: Boolean(myReservation && isMineActive(myReservation)),
    mine: Boolean(myReservation && isMineActive(myReservation)),
    myReservationStatus,
    myCheckedInAt: myReservation?.checkedInAt || null,
    ...(isAdmin && {
      roster: (c.reservations || [])
        .filter((r) => isCapacityStatus(normalizeReservationStatus(r)))
        .map((r) => r.member?.name || '-')
    })
  };
}

function calendarClassResponse(c, me, isAdmin) {
  const counts = countReservations(c.reservations, c.capacity);
  const myReservation = findReservationByMember(c.reservations, me);
  const myReservationStatus = myReservation ? normalizeReservationStatus(myReservation) : null;
  const reservedMembers = isAdmin ? activeRosterRows(c.reservations || []) : undefined;
  const allReservations = isAdmin ? (c.reservations || []).map((reservation) => serializeRosterMember(reservation)) : undefined;

  return {
    id: c._id,
    _id: c._id,
    branch: normalizeBranch(c.branch),
    date: classDay(c.date),
    time: c.time,
    name: c.name,
    description: c.description || '',
    backgroundImage: c.backgroundImage || '',
    imageUrl: c.backgroundImage || '',
    coach: c.coach || null,
    capacity: counts.capacity,
    reservedCount: counts.reserved + counts.checkedIn,
    reserved: counts.reserved,
    checkedIn: counts.checkedIn,
    checkedInCount: counts.checkedIn,
    waitlist: counts.waitlist,
    waitlistCount: counts.waitlist,
    cancelled: counts.cancelled,
    spotsLeft: counts.spotsLeft,
    isReservedByMe: Boolean(myReservation && isMineActive(myReservation)),
    mine: Boolean(myReservation && isMineActive(myReservation)),
    myReservationStatus,
    myCheckedInAt: myReservation?.checkedInAt || null,
    isSpecial: Boolean(c.isSpecial),
    specialLabel: c.specialLabel || '',
    specialDescription: c.specialDescription || '',
    featuredOnHome: Boolean(c.featuredOnHome),
    homePriority: Number(c.homePriority || 0),
    specialIcon: c.specialIcon || '',
    specialColor: c.specialColor || '',
    visibleFrom: c.visibleFrom || null,
    visibleUntil: c.visibleUntil || null,
    subtitle: classSubtitle(c),
    fromSchedule: Boolean(c.template),
    ...(isAdmin && { reservedMembers, reservations: allReservations })
  };
}

function groupedCalendar(classes = []) {
  const dayMap = new Map();
  for (const item of classes) {
    if (!dayMap.has(item.date)) dayMap.set(item.date, new Map());
    const branchMap = dayMap.get(item.date);
    if (!branchMap.has(item.branch)) branchMap.set(item.branch, []);
    branchMap.get(item.branch).push(item);
  }

  return [...dayMap.entries()].map(([date, branchMap]) => ({
    date,
    branches: [...branchMap.entries()].map(([branch, branchClasses]) => ({
      branch,
      classes: branchClasses.sort((a, b) => String(a.time).localeCompare(String(b.time)))
    }))
  }));
}

function setReservationForBooking(reservation, status, now) {
  ensureReservationDates(reservation, now);
  reservation.status = status;
  reservation.reservedAt = now;
  reservation.cancelledAt = undefined;
  reservation.checkedInAt = undefined;
  reservation.checkInMethod = undefined;
  reservation.checkedInBy = undefined;
  reservation.source = 'athlete';
  reservation.autoReservedByQr = false;
}

function tokenResponse(classId, tokenData) {
  return {
    ok: true,
    classId,
    token: tokenData.token,
    expiresAt: tokenData.expiresAt,
    qrPayload: tokenData.qrPayload
  };
}

function optionalDate(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  const date = localMatch
    ? new Date(
      Date.UTC(
        Number(localMatch[1]),
        Number(localMatch[2]) - 1,
        Number(localMatch[3]),
        Number(localMatch[4]),
        Number(localMatch[5])
      ) - GYM_UTC_OFFSET_HOURS * 3600 * 1000
    )
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function classBackgroundImageFromBody(body = {}) {
  if ('backgroundImage' in body) return String(body.backgroundImage || '').trim();
  if ('imageUrl' in body) return String(body.imageUrl || '').trim();
  return '';
}

function specialFieldsFromBody(body = {}, partial = false) {
  const out = {};
  const allowed = [
    'isSpecial',
    'featuredOnHome',
    'specialLabel',
    'specialDescription',
    'homePriority',
    'specialIcon',
    'specialColor',
    'visibleFrom',
    'visibleUntil'
  ];
  for (const key of allowed) {
    if (partial && !(key in body)) continue;
    if (key === 'isSpecial' || key === 'featuredOnHome') out[key] = Boolean(body[key]);
    else if (key === 'homePriority') out[key] = Number(body[key] || 0);
    else if (key === 'visibleFrom' || key === 'visibleUntil') {
      const parsed = optionalDate(body[key]);
      if (parsed === null) throw Object.assign(new Error(`${key} invalida`), { status: 400 });
      out[key] = parsed;
    } else {
      out[key] = String(body[key] || '').trim();
    }
  }
  if (out.featuredOnHome) out.isSpecial = true;
  return out;
}

function classEditFields(body = {}) {
  const out = specialFieldsFromBody(body, true);
  if ('date' in body) {
    const day = new Date(`${String(body.date).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) throw Object.assign(new Error('Fecha invalida'), { status: 400 });
    out.date = day;
  }
  if ('time' in body) {
    if (!/^\d{1,2}:\d{2}$/.test(String(body.time).trim())) {
      throw Object.assign(new Error('Hora invalida - usa formato HH:MM'), { status: 400 });
    }
    out.time = String(body.time).trim();
  }
  if ('branch' in body) out.branch = branchFilter(body.branch);
  if ('name' in body) out.name = (body.name || 'CrossFit').trim();
  if ('description' in body) out.description = (body.description || '').trim();
  if ('backgroundImage' in body || 'imageUrl' in body) out.backgroundImage = classBackgroundImageFromBody(body);
  if ('capacity' in body) {
    const capacity = Number(body.capacity);
    if (!capacity || capacity < 1) throw Object.assign(new Error('El cupo es obligatorio'), { status: 400 });
    out.capacity = Math.min(capacity, 100);
  }
  return out;
}

async function ensureClassesForRead() {
  try {
    await ensureScheduledClasses();
  } catch (genErr) {
    console.warn('[classes] ensureScheduledClasses failed:', genErr.message);
  }
}

// GET /api/classes - classes from today through the next week, with counts.
router.get('/', protect, async (req, res, next) => {
  try {
    await ensureClassesForRead();

    const { from, to } = classDateWindow(req.query);
    const branch = branchFilter(req.query.branch);
    const filter = {
      date: { $gte: from, $lt: to },
      ...(branch ? { branch } : {})
    };

    const classes = await GymClass.find(filter)
      .populate('reservations.member', 'name')
      .sort({ date: 1, branch: 1, time: 1 })
      .lean();

    const me = String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    res.json(classes.map((c) => classResponse(c, me, isAdmin)));
  } catch (err) {
    next(err);
  }
});

// GET /api/classes/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=Torres|Central|all
// Calendar-shaped response for reservation views. Includes roster details only
// for admins; athletes only receive their own reservation state.
router.get('/calendar', protect, async (req, res, next) => {
  try {
    await ensureClassesForRead();

    const { from, to } = classDateWindow(req.query);
    const branch = branchCalendarFilter(req.query.branch);
    const filter = {
      date: { $gte: from, $lt: to },
      ...(branch ? { branch } : {})
    };

    const rows = await GymClass.find(filter)
      .populate('reservations.member', 'name email phone')
      .sort({ date: 1, branch: 1, time: 1 })
      .lean();

    const isAdmin = req.user.role === 'admin';
    const classes = rows.map((row) => calendarClassResponse(row, req.user._id, isAdmin));
    res.json({
      ok: true,
      from: classDay(from),
      to: classDay(addDaysUTC(to, -1)),
      branch: branch || 'all',
      days: groupedCalendar(classes),
      classes
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes (admin) - opens a class with N spots.
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const { date, time, name, description } = req.body;
    const capacity = Number(req.body.capacity);
    if (!date || !time || !capacity || capacity < 1) {
      return res.status(400).json({ error: 'Fecha, hora y cupo son obligatorios' });
    }
    if (!/^\d{1,2}:\d{2}$/.test(String(time).trim())) {
      return res.status(400).json({ error: 'Hora invalida - usa formato HH:MM' });
    }
    const day = new Date(`${String(date).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) {
      return res.status(400).json({ error: 'Fecha invalida' });
    }
    const gymClass = await GymClass.create({
      date: day,
      time: String(time).trim(),
      branch: branchFilter(req.body.branch) || normalizeBranch(req.body.branch),
      name: (name || 'CrossFit').trim(),
      description: (description || '').trim(),
      backgroundImage: classBackgroundImageFromBody(req.body),
      capacity: Math.min(capacity, 100),
      ...specialFieldsFromBody(req.body)
    });
    if (notificationService.isPushEnabled() && gymClass.isSpecial && gymClass.featuredOnHome) {
      notificationService.sendSpecialClassNotification(gymClass._id).catch((err) => {
        console.warn('[push] special class notification failed', { message: err.message });
      });
    }
    res.status(201).json(gymClass);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Ya hay una clase a esa hora ese dia' });
    }
    next(err);
  }
});

// GET /api/classes/admin/today (admin) - dashboard summary for today's classes.
// This must stay before parameterized routes like /:id.
router.get('/admin/today', protect, adminOnly, async (req, res, next) => {
  try {
    await ensureClassesForRead();

    const from = gymTodayUTC();
    const to = addDaysUTC(from, 1);
    const branch = branchFilter(req.query.branch);
    const filter = {
      date: { $gte: from, $lt: to },
      ...(branch ? { branch } : {})
    };
    const classes = await GymClass.find(filter)
      .sort({ date: 1, branch: 1, time: 1 })
      .lean();

    res.json({
      ok: true,
      classes: classes.map((c) => {
        const counts = countReservations(c.reservations, c.capacity);
        const occupied = counts.reserved + counts.checkedIn;
        return {
          id: c._id,
          date: c.date,
          time: c.time,
          branch: normalizeBranch(c.branch),
          name: c.name,
          backgroundImage: c.backgroundImage || '',
          imageUrl: c.backgroundImage || '',
          capacity: c.capacity,
          reserved: counts.reserved,
          checkedIn: counts.checkedIn,
          waitlist: counts.waitlist,
          cancelled: counts.cancelled,
          spotsLeft: counts.spotsLeft,
          isSpecial: Boolean(c.isSpecial),
          specialLabel: c.specialLabel || '',
          featuredOnHome: Boolean(c.featuredOnHome),
          homePriority: Number(c.homePriority || 0),
          occupancyRate: c.capacity ? occupied / c.capacity : 0,
          checkInRate: occupied ? counts.checkedIn / occupied : 0
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/check-in/qr - athlete check-in using the scanned QR token.
// Handles both class-specific tokens (hex, no dot) and branch rotating tokens
// (base64url.signature format, contains a dot). This lets the mobile send all
// QR scans to a single endpoint regardless of which QR the admin is showing.
router.post('/check-in/qr', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta esta pendiente de aprobacion.' });
    }

    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Falta token de QR' });

    // Branch rotating QR tokens are "encodedPayload.signature" — always contain a dot.
    // Class-specific tokens are plain hex (no dot). Route accordingly.
    if (token.includes('.')) {
      try {
        const result = await checkInWithRotatingQr(req.user._id, token, {
          confirmAutoReserve: Boolean(req.body?.confirmAutoReserve)
        });
        return res.json(result);
      } catch (err) {
        if (err?.code) {
          return res.status(err.status || 400).json(checkInErrorResponse(err));
        }
        return next(err);
      }
    }

    const tokenRow = await validateCheckInToken(token);
    const gymClass = await GymClass.findById(tokenRow.classId);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const reservation = findReservationByMember(gymClass.reservations, req.user._id);
    if (!reservation) {
      return res.status(409).json({ error: 'No tienes reserva para esta clase.' });
    }

    const status = normalizeReservationStatus(reservation);
    if (status === 'checked_in') {
      return res.json({
        ok: true,
        alreadyCheckedIn: true,
        classId: gymClass._id,
        checkedInAt: reservation.checkedInAt || null,
        method: reservation.checkInMethod || 'qr_scan'
      });
    }
    if (status === 'cancelled') {
      return res.status(409).json({ error: 'Tu reserva esta cancelada.' });
    }
    if (status === 'waitlist') {
      return res.status(409).json({ error: 'Estas en lista de espera.' });
    }
    if (status !== 'reserved') {
      return res.status(409).json({ error: 'Tu reserva no esta activa.' });
    }

    const now = new Date();
    ensureReservationDates(reservation, now);
    reservation.status = 'checked_in';
    reservation.checkedInAt = now;
    reservation.checkInMethod = 'qr_scan';
    reservation.checkedInBy = req.user._id;
    await gymClass.save();

    await createAttendanceIfMissing(req.user._id, { classId: gymClass._id, checkInAt: now });

    res.json({
      ok: true,
      alreadyCheckedIn: false,
      classId: gymClass._id,
      checkedInAt: now,
      method: 'qr_scan'
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/classes/:id (admin)
router.patch('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const before = {
      date: classDay(gymClass.date),
      time: gymClass.time,
      branch: normalizeBranch(gymClass.branch),
      featuredOnHome: Boolean(gymClass.featuredOnHome),
      isSpecial: Boolean(gymClass.isSpecial)
    };
    const updates = classEditFields(req.body);
    Object.assign(gymClass, updates);
    await gymClass.save();
    const after = {
      date: classDay(gymClass.date),
      time: gymClass.time,
      branch: normalizeBranch(gymClass.branch),
      featuredOnHome: Boolean(gymClass.featuredOnHome),
      isSpecial: Boolean(gymClass.isSpecial)
    };
    const changed = [];
    if (before.date !== after.date) changed.push(`fecha ${after.date}`);
    if (before.time !== after.time) changed.push(`hora ${after.time}`);
    if (before.branch !== after.branch) changed.push(`sucursal ${after.branch}`);
    if (notificationService.isPushEnabled() && changed.length && (gymClass.reservations || []).length > 0) {
      notificationService.sendClassChangeNotification(gymClass._id, `Tu clase cambio: ${changed.join(', ')}.`).catch((err) => {
        console.warn('[push] class change notification failed', { message: err.message });
      });
    }
    if (notificationService.isPushEnabled() && (!before.featuredOnHome || !before.isSpecial) && after.featuredOnHome && after.isSpecial) {
      notificationService.sendSpecialClassNotification(gymClass._id).catch((err) => {
        console.warn('[push] special class notification failed', { message: err.message });
      });
    }
    res.json({ ok: true, class: classResponse(gymClass.toObject ? gymClass.toObject() : gymClass, req.user._id, true) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Ya hay una clase a esa hora ese dia' });
    }
    next(err);
  }
});

// DELETE /api/classes/:id (admin)
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });
    if (notificationService.isPushEnabled() && (gymClass.reservations || []).length > 0) {
      notificationService.sendClassChangeNotification(gymClass._id, 'Tu clase fue cancelada. Habla con tu coach para reprogramar.').catch((err) => {
        console.warn('[push] class cancellation notification failed', { message: err.message });
      });
    }
    await gymClass.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/check-in-token (admin) - creates a short-lived QR token.
router.post('/:id/check-in-token', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id).select('_id');
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const tokenData = await createClassCheckInToken(gymClass._id, req.user._id);
    res.json(tokenResponse(gymClass._id, tokenData));
  } catch (err) {
    next(err);
  }
});

// GET /api/classes/:id/check-in-token/current (admin) - renews the QR token.
router.get('/:id/check-in-token/current', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id).select('_id');
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const tokenData = await createClassCheckInToken(gymClass._id, req.user._id);
    res.json(tokenResponse(gymClass._id, tokenData));
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/reserve - reserves a spot or joins the waitlist.
router.post('/:id/reserve', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta esta pendiente de aprobacion.' });
    }

    const gymClass = await GymClass.findById(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const reservation = findReservationByMember(gymClass.reservations, req.user._id);
    const currentStatus = reservation ? normalizeReservationStatus(reservation) : null;
    if (currentStatus === 'reserved' || currentStatus === 'checked_in') {
      return res.status(409).json({ error: 'Ya tienes lugar en esta clase' });
    }

    const now = new Date();
    const counts = countReservations(gymClass.reservations, gymClass.capacity);
    const nextStatus = counts.spotsLeft > 0 ? 'reserved' : 'waitlist';

    if (reservation) {
      if (currentStatus === 'waitlist' && nextStatus === 'waitlist') {
        return res.json({
          ok: true,
          status: 'waitlist',
          spotsLeft: counts.spotsLeft,
          classId: gymClass._id
        });
      }
      setReservationForBooking(reservation, nextStatus, now);
    } else {
      gymClass.reservations.push({
        member: req.user._id,
        status: nextStatus,
        reservedAt: now,
        at: now,
        source: 'athlete',
        autoReservedByQr: false
      });
    }

    await gymClass.save();
    const nextCounts = countReservations(gymClass.reservations, gymClass.capacity);
    res.json({ ok: true, status: nextStatus, spotsLeft: nextCounts.spotsLeft, classId: gymClass._id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/classes/:id/reserve - cancels without deleting reservation history.
router.delete('/:id/reserve', protect, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const reservation = findReservationByMember(gymClass.reservations, req.user._id);
    if (!reservation) {
      return res.status(404).json({ error: 'No tienes reserva activa para esta clase' });
    }

    const status = normalizeReservationStatus(reservation);
    if (status === 'checked_in') {
      return res.status(409).json({
        ok: false,
        status: 'already_checked_in',
        title: 'Check-in confirmado',
        message: 'No puedes cancelar despues de hacer check-in.',
        error: 'No puedes cancelar despues de hacer check-in.',
        actionLabel: 'Entendido'
      });
    }
    if (status !== 'reserved' && status !== 'waitlist') {
      return res.status(409).json({ error: 'No tienes reserva activa para esta clase' });
    }
    if (!canCancelReservationForClass(gymClass)) {
      return res.status(409).json(reservationCancellationClosedPayload(gymClass));
    }

    reservation.status = 'cancelled';
    reservation.cancelledAt = new Date();
    await gymClass.save();

    const counts = countReservations(gymClass.reservations, gymClass.capacity);
    res.json({
      ok: true,
      status: 'cancelled',
      spotsLeft: counts.spotsLeft,
      classId: gymClass._id,
      message: 'Reserva cancelada. Tu lugar quedo disponible para otro atleta.'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/check-in/:memberId (admin) - manual fallback.
router.post('/:id/check-in/:memberId', protect, adminOnly, async (req, res, next) => {
  try {
    const [gymClass, member] = await Promise.all([
      GymClass.findById(req.params.id),
      Member.findById(req.params.memberId).select('_id')
    ]);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });

    const now = new Date();
    let reservation = findReservationByMember(gymClass.reservations, member._id);
    let alreadyCheckedIn = false;

    if (reservation) {
      ensureReservationDates(reservation, now);
      alreadyCheckedIn = normalizeReservationStatus(reservation) === 'checked_in';
      if (!alreadyCheckedIn) {
        reservation.status = 'checked_in';
        reservation.checkedInAt = now;
        reservation.checkInMethod = 'admin_manual';
        reservation.checkedInBy = req.user._id;
      }
      if (req.body?.notes) reservation.notes = String(req.body.notes).trim();
    } else {
      gymClass.reservations.push({
        member: member._id,
        status: 'checked_in',
        reservedAt: now,
        at: now,
        checkedInAt: now,
        checkInMethod: 'admin_manual',
        checkedInBy: req.user._id,
        source: 'admin',
        autoReservedByQr: false,
        notes: req.body?.notes ? String(req.body.notes).trim() : undefined
      });
      reservation = gymClass.reservations[gymClass.reservations.length - 1];
    }

    await gymClass.save();
    await createAttendanceIfMissing(member._id, {
      classId: gymClass._id,
      checkInAt: reservation.checkedInAt || now
    });

    res.json({
      ok: true,
      alreadyCheckedIn,
      classId: gymClass._id,
      memberId: member._id,
      checkedInAt: reservation.checkedInAt || now,
      method: reservation.checkInMethod || 'admin_manual'
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/classes/:id/roster (admin)
router.get('/:id/roster', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findById(req.params.id)
      .populate('reservations.member', 'name email')
      .lean();
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });

    const counts = countReservations(gymClass.reservations, gymClass.capacity);
    const checkedIn = [];
    const pending = [];
    const waitlist = [];
    const cancelled = [];

    for (const reservation of gymClass.reservations || []) {
      const status = normalizeReservationStatus(reservation);
      const row = serializeRosterMember(reservation);
      if (status === 'checked_in') checkedIn.push(row);
      else if (status === 'reserved') pending.push(row);
      else if (status === 'waitlist') waitlist.push(row);
      else if (status === 'cancelled') cancelled.push(row);
    }

    res.json({
      ok: true,
      class: {
        id: gymClass._id,
        name: gymClass.name,
        branch: normalizeBranch(gymClass.branch),
        date: gymClass.date,
        time: gymClass.time,
        capacity: gymClass.capacity,
        coach: gymClass.coach || null
      },
      counts,
      checkedIn,
      pending,
      waitlist,
      cancelled
    });
  } catch (err) {
    next(err);
  }
});

export default router;
