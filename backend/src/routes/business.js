import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { Attendance } from '../models/Attendance.js';
import { GymClass } from '../models/GymClass.js';
import { Member } from '../models/Member.js';
import { addDaysUTC, gymTodayUTC } from '../services/classSchedule.js';
import { countReservations } from '../services/classReservations.js';
import { gymDayStartUTC, gymTodayStr } from '../services/gymTime.js';
import {
  resolveMembershipStatus,
  serializeMembership,
  summarizeMemberships
} from '../services/memberships.js';

const router = Router();
router.use(protect, adminOnly);
const DAY_MS = 24 * 60 * 60 * 1000;

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

async function periodSummary(days) {
  const classTo = addDaysUTC(gymTodayUTC(), 1);
  const classFrom = addDaysUTC(classTo, -days);
  const attendanceTo = new Date(gymDayStartUTC(gymTodayStr()).getTime() + DAY_MS);
  const attendanceFrom = new Date(attendanceTo.getTime() - days * DAY_MS);
  const [attendances, classes] = await Promise.all([
    Attendance.find({ checkIn: { $gte: attendanceFrom, $lt: attendanceTo } }).select('member').lean(),
    GymClass.find({ date: { $gte: classFrom, $lt: classTo } }).select('reservations').lean()
  ]);
  let cancellations = 0;
  let noShows = 0;
  for (const gymClass of classes) {
    const counts = countReservations(gymClass.reservations);
    cancellations += counts.cancelled;
    noShows += counts.noShow;
  }
  return {
    visits: attendances.length,
    uniqueAthletes: new Set(attendances.map((row) => String(row.member))).size,
    checkIns: attendances.length,
    cancellations,
    noShows
  };
}

router.get('/overview', async (_req, res, next) => {
  try {
    const today = gymTodayUTC();
    const tomorrow = addDaysUTC(today, 1);
    const weekStart = addDaysUTC(tomorrow, -7);
    const [todayClasses, last7Days, last30Days, members, weekClasses] = await Promise.all([
      GymClass.find({ date: { $gte: today, $lt: tomorrow } }).lean(),
      periodSummary(7),
      periodSummary(30),
      Member.find({ role: { $ne: 'admin' } }).select('status membership').lean(),
      GymClass.find({ date: { $gte: weekStart, $lt: today } }).lean()
    ]);

    const todaySummary = {
      classesCount: todayClasses.length,
      reserved: 0,
      checkedIn: 0,
      waitlist: 0,
      cancelled: 0
    };
    for (const gymClass of todayClasses) {
      const counts = countReservations(gymClass.reservations, gymClass.capacity);
      todaySummary.reserved += counts.reserved;
      todaySummary.checkedIn += counts.checkedIn;
      todaySummary.waitlist += counts.waitlist;
      todaySummary.cancelled += counts.cancelled;
    }

    const memberships = summarizeMemberships(members);
    const riskMembers = members.filter((member) => member.status === 'active');
    const attendanceToday = gymDayStartUTC(gymTodayStr());
    const recentVisitors = await Attendance.distinct('member', {
      member: { $in: riskMembers.map((member) => member._id) },
      checkIn: { $gte: new Date(attendanceToday.getTime() - 14 * DAY_MS) }
    });
    const recentIds = new Set(recentVisitors.map(String));
    const riskCount = riskMembers.filter((member) => !recentIds.has(String(member._id))).length;
    const lowAttendanceClasses = weekClasses.filter((gymClass) => {
      const counts = countReservations(gymClass.reservations, gymClass.capacity);
      return gymClass.capacity > 0 && counts.checkedIn / gymClass.capacity < 0.4;
    }).length;

    const alerts = [];
    if (memberships.expiring7Days) {
      alerts.push({ type: 'membership_expiring', count: memberships.expiring7Days, message: `${memberships.expiring7Days} membresias vencen esta semana` });
    }
    if (riskCount) {
      alerts.push({ type: 'athletes_risk', count: riskCount, message: `${riskCount} atletas no han venido en 14 dias` });
    }
    if (memberships.expired) {
      alerts.push({ type: 'membership_expired', count: memberships.expired, message: `${memberships.expired} membresias vencidas` });
    }
    if (lowAttendanceClasses) {
      alerts.push({ type: 'low_attendance', count: lowAttendanceClasses, message: `${lowAttendanceClasses} clases con baja asistencia esta semana` });
    }

    res.json({
      ok: true,
      today: todaySummary,
      last7Days,
      last30Days,
      memberships: {
        active: memberships.totalActive,
        expiring7Days: memberships.expiring7Days,
        expiringTomorrow: memberships.expiringTomorrow,
        expired: memberships.expired,
        frozen: memberships.frozen,
        inactive: memberships.inactive
      },
      alerts
    });
  } catch (err) {
    next(err);
  }
});

router.get('/athletes-risk', async (_req, res, next) => {
  try {
    const since30 = new Date(gymDayStartUTC(gymTodayStr()).getTime() - 30 * DAY_MS);
    const [members, attendanceStats] = await Promise.all([
      Member.find({ role: { $ne: 'admin' }, status: 'active' })
        .select('name email phone membership')
        .sort({ name: 1 })
        .lean(),
      Attendance.aggregate([
        {
          $group: {
            _id: '$member',
            lastVisitAt: { $max: '$checkIn' },
            visitsLast30Days: {
              $sum: { $cond: [{ $gte: ['$checkIn', since30] }, 1, 0] }
            }
          }
        }
      ])
    ]);
    const byMember = new Map(attendanceStats.map((row) => [String(row._id), row]));
    const now = Date.now();

    const athletes = members.map((member) => {
      const attendance = byMember.get(String(member._id));
      const daysSinceLastVisit = attendance?.lastVisitAt
        ? Math.max(0, Math.floor((now - new Date(attendance.lastVisitAt).getTime()) / 86_400_000))
        : null;
      const riskLevel = daysSinceLastVisit == null
        ? 'unknown'
        : daysSinceLastVisit <= 7
          ? 'low'
          : daysSinceLastVisit <= 14
            ? 'medium'
            : 'high';
      const membership = serializeMembership(member);
      return {
        id: member._id,
        name: member.name,
        email: member.email,
        phone: member.phone || null,
        lastVisitAt: attendance?.lastVisitAt || null,
        daysSinceLastVisit,
        visitsLast30Days: attendance?.visitsLast30Days || 0,
        membershipStatus: membership.status,
        membershipEndDate: membership.endDate,
        riskLevel
      };
    });

    const order = { high: 0, unknown: 1, medium: 2, low: 3 };
    athletes.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]
      || (b.daysSinceLastVisit || 0) - (a.daysSinceLastVisit || 0));
    res.json({ ok: true, athletes });
  } catch (err) {
    next(err);
  }
});

router.get('/class-performance', async (_req, res, next) => {
  try {
    const to = addDaysUTC(gymTodayUTC(), 1);
    const from = addDaysUTC(to, -30);
    const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
      .select('name time capacity reservations')
      .lean();
    const groups = new Map();

    for (const gymClass of classes) {
      const key = `${gymClass.name}::${gymClass.time}`;
      const counts = countReservations(gymClass.reservations, gymClass.capacity);
      const row = groups.get(key) || {
        className: gymClass.name,
        time: gymClass.time,
        sessionsCount: 0,
        reserved: 0,
        checkedIn: 0,
        occupancy: 0,
        cancellations: 0,
        waitlistCount: 0
      };
      row.sessionsCount += 1;
      row.reserved += counts.reserved + counts.checkedIn;
      row.checkedIn += counts.checkedIn;
      row.occupancy += gymClass.capacity
        ? (counts.reserved + counts.checkedIn) / gymClass.capacity
        : 0;
      row.cancellations += counts.cancelled;
      row.waitlistCount += counts.waitlist;
      groups.set(key, row);
    }

    const performance = [...groups.values()].map((row) => ({
      className: row.className,
      time: row.time,
      sessionsCount: row.sessionsCount,
      avgReserved: round(row.reserved / row.sessionsCount),
      avgCheckedIn: round(row.checkedIn / row.sessionsCount),
      avgOccupancyRate: round(row.occupancy / row.sessionsCount, 3),
      cancellations: row.cancellations,
      waitlistCount: row.waitlistCount
    })).sort((a, b) => b.avgOccupancyRate - a.avgOccupancyRate || a.time.localeCompare(b.time));

    res.json({ ok: true, performance });
  } catch (err) {
    next(err);
  }
});

export default router;
