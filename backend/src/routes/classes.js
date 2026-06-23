import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { GymClass } from '../models/GymClass.js';
import { Member } from '../models/Member.js';
import { ensureScheduledClasses, gymTodayUTC, addDaysUTC } from '../services/classSchedule.js';
import { createAttendanceIfMissing } from '../services/attendance.js';
import {
  createClassCheckInToken,
  validateCheckInToken
} from '../services/checkInTokens.js';
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

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function classResponse(c, me, isAdmin) {
  const counts = countReservations(c.reservations, c.capacity);
  const myReservation = findReservationByMember(c.reservations, me);
  const myReservationStatus = myReservation ? normalizeReservationStatus(myReservation) : null;

  return {
    _id: c._id,
    date: c.date,
    time: c.time,
    name: c.name,
    capacity: c.capacity,
    reserved: counts.reserved,
    checkedIn: counts.checkedIn,
    waitlist: counts.waitlist,
    cancelled: counts.cancelled,
    spotsLeft: counts.spotsLeft,
    fromSchedule: Boolean(c.template),
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

function setReservationForBooking(reservation, status, now) {
  ensureReservationDates(reservation, now);
  reservation.status = status;
  reservation.reservedAt = now;
  reservation.cancelledAt = undefined;
  reservation.checkedInAt = undefined;
  reservation.checkInMethod = undefined;
  reservation.checkedInBy = undefined;
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

    const from = startOfDay();
    from.setDate(from.getDate() - 1);
    const to = new Date(from);
    to.setDate(to.getDate() + 9);

    const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
      .populate('reservations.member', 'name')
      .sort({ date: 1, time: 1 })
      .lean();

    const me = String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    res.json(classes.map((c) => classResponse(c, me, isAdmin)));
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
    const day = new Date(`${String(date).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(day.getTime())) {
      return res.status(400).json({ error: 'Fecha invalida' });
    }
    const gymClass = await GymClass.create({
      date: day,
      time: String(time).trim(),
      name: (name || 'CrossFit').trim(),
      description: (description || '').trim(),
      capacity: Math.min(capacity, 100)
    });
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
router.get('/admin/today', protect, adminOnly, async (_req, res, next) => {
  try {
    await ensureClassesForRead();

    const from = gymTodayUTC();
    const to = addDaysUTC(from, 1);
    const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
      .sort({ date: 1, time: 1 })
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
          name: c.name,
          capacity: c.capacity,
          reserved: counts.reserved,
          checkedIn: counts.checkedIn,
          waitlist: counts.waitlist,
          cancelled: counts.cancelled,
          spotsLeft: counts.spotsLeft,
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
router.post('/check-in/qr', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta esta pendiente de aprobacion.' });
    }

    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Falta token de QR' });

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

// DELETE /api/classes/:id (admin)
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findByIdAndDelete(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });
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
        at: now
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
      return res.status(409).json({ error: 'No puedes cancelar despues de hacer check-in' });
    }
    if (status !== 'reserved' && status !== 'waitlist') {
      return res.status(409).json({ error: 'No tienes reserva activa para esta clase' });
    }

    reservation.status = 'cancelled';
    reservation.cancelledAt = new Date();
    await gymClass.save();

    const counts = countReservations(gymClass.reservations, gymClass.capacity);
    res.json({ ok: true, status: 'cancelled', spotsLeft: counts.spotsLeft, classId: gymClass._id });
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
