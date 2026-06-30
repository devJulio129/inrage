import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { GymClass } from '../models/GymClass.js';
import { GymInfo } from '../models/GymInfo.js';
import { addDaysUTC, gymTodayUTC, GYM_UTC_OFFSET_HOURS } from '../services/classSchedule.js';
import { normalizeBranch } from '../services/branches.js';
import {
  countReservations,
  findReservationByMember,
  isMineActive,
  normalizeReservationStatus
} from '../services/classReservations.js';

const router = Router();

function classDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function classStartsAt(gymClass) {
  const [year, month, day] = classDay(gymClass.date).split('-').map(Number);
  const [hour, minute] = String(gymClass.time || '00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0) - GYM_UTC_OFFSET_HOURS * 3600 * 1000);
}

function isVisibleNow(gymClass, now) {
  const startsAt = classStartsAt(gymClass);
  if (startsAt <= now) return false;
  if (gymClass.visibleFrom && new Date(gymClass.visibleFrom) > now) return false;
  if (gymClass.visibleUntil && new Date(gymClass.visibleUntil) < now) return false;
  return true;
}

function specialClassHighlight(gymClass, memberId) {
  const counts = countReservations(gymClass.reservations, gymClass.capacity);
  const reservation = findReservationByMember(gymClass.reservations, memberId);
  const status = reservation ? normalizeReservationStatus(reservation) : null;
  const startsAt = classStartsAt(gymClass);
  return {
    type: 'special_class',
    id: gymClass._id,
    title: gymClass.specialLabel || gymClass.name || 'Clase especial',
    subtitle: `${classDay(gymClass.date)} ${gymClass.time || ''}`.trim(),
    description: gymClass.specialDescription || gymClass.description || '',
    backgroundImage: gymClass.backgroundImage || '',
    imageUrl: gymClass.backgroundImage || '',
    branch: normalizeBranch(gymClass.branch),
    startsAt,
    classId: gymClass._id,
    ctaLabel: status === 'reserved' || status === 'checked_in'
      ? 'Reservado'
      : counts.spotsLeft > 0
        ? 'Reservar'
        : 'Lista de espera',
    icon: gymClass.specialIcon || 'star',
    color: gymClass.specialColor || null,
    priority: Number(gymClass.homePriority || 0),
    spotsLeft: counts.spotsLeft,
    capacity: counts.capacity,
    mine: Boolean(reservation && isMineActive(reservation)),
    myReservationStatus: status
  };
}

// GET /api/home/highlights - operational highlights for mobile Home.
router.get('/highlights', protect, async (req, res, next) => {
  try {
    const now = new Date();
    const from = gymTodayUTC();
    const to = addDaysUTC(from, 45);
    const [gymInfo, specialClasses] = await Promise.all([
      GymInfo.findOne().sort({ updatedAt: -1 }).lean(),
      GymClass.find({
        date: { $gte: from, $lt: to },
        isSpecial: true,
        featuredOnHome: true
      }).sort({ homePriority: -1, date: 1, time: 1 }).lean()
    ]);

    const highlights = [];
    for (const gymClass of specialClasses) {
      if (!gymClass.isSpecial || !gymClass.featuredOnHome) continue;
      if (!isVisibleNow(gymClass, now)) continue;
      highlights.push(specialClassHighlight(gymClass, req.user._id));
    }

    const announcement = String(gymInfo?.announcement || '').trim();
    if (announcement) {
      highlights.push({
        type: 'announcement',
        id: `gym-info-${gymInfo._id}`,
        title: 'Aviso del box',
        body: announcement,
        createdAt: gymInfo.updatedAt || gymInfo.createdAt || null,
        priority: 0
      });
    }

    highlights.sort((a, b) =>
      Number(b.priority || 0) - Number(a.priority || 0) ||
      new Date(a.startsAt || a.createdAt || 0) - new Date(b.startsAt || b.createdAt || 0)
    );

    res.json({ ok: true, highlights });
  } catch (err) {
    next(err);
  }
});

export default router;
