import { Member } from '../models/Member.js';
import { LoginLog } from '../models/LoginLog.js';
import { Attendance } from '../models/Attendance.js';
import { Workout } from '../models/Workout.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// GET /api/stats  (admin)
export async function getStats(req, res, next) {
  try {
    const now = Date.now();
    const DAY = 86_400_000;

    const [members, loginLogs, attendances, workouts] = await Promise.all([
      Member.find().select('-password').lean(),
      LoginLog.find().select('member at').lean(),
      Attendance.find().select('checkIn checkOut').lean(),
      Workout.find().select('date title').lean()
    ]);

    // ── Member breakdowns ───────────────────────────────────────────
    const totalMembers = members.length;
    const admins = members.filter((m) => m.role === 'admin').length;
    const athletes = totalMembers - admins;
    const pendingApprovals = members.filter(
      (m) => m.role !== 'admin' && m.status === 'pending'
    ).length;

    const gender = { male: 0, female: 0, other: 0, prefer_not_to_say: 0, unset: 0 };
    members.forEach((m) => {
      const g = m.gender || 'unset';
      gender[g] = (gender[g] || 0) + 1;
    });

    // ── Traffic-light distribution (last login per member) ──────────
    const lastByMember = new Map();
    loginLogs.forEach((l) => {
      const k = String(l.member);
      const t = new Date(l.at).getTime();
      if (!lastByMember.has(k) || t > lastByMember.get(k)) lastByMember.set(k, t);
    });
    const trafficLight = { active: 0, idle: 0, absent: 0 };
    members.forEach((m) => {
      const last = lastByMember.get(String(m._id));
      if (!last) trafficLight.absent += 1;
      else if (now - last <= 7 * DAY) trafficLight.active += 1;
      else if (now - last <= 30 * DAY) trafficLight.idle += 1;
      else trafficLight.absent += 1;
    });

    // ── Logins per day (last 14 days) ───────────────────────────────
    const loginsByDay = [];
    for (let i = 13; i >= 0; i--) {
      const day = startOfDay(new Date(now - i * DAY));
      const next = day.getTime() + DAY;
      const count = loginLogs.filter((l) => {
        const t = new Date(l.at).getTime();
        return t >= day.getTime() && t < next;
      }).length;
      loginsByDay.push({
        date: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }),
        count
      });
    }
    const loginsLast7 = loginsByDay.slice(7).reduce((a, b) => a + b.count, 0);

    // ── New members per month (last 6 months) ───────────────────────
    const newByMonth = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const next = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
      const count = members.filter((m) => {
        const j = new Date(m.joinedAt || m.createdAt).getTime();
        return j >= d.getTime() && j < next.getTime();
      }).length;
      newByMonth.push({
        label: d.toLocaleDateString('es-MX', { month: 'short' }),
        count
      });
    }

    // ── Attendance ──────────────────────────────────────────────────
    const attendanceLast30 = attendances.filter(
      (a) => now - new Date(a.checkIn).getTime() <= 30 * DAY
    ).length;
    const today0 = startOfDay().getTime();
    const inGymNow = attendances.filter(
      (a) => !a.checkOut && new Date(a.checkIn).getTime() >= today0
    ).length;

    // ── WOD ─────────────────────────────────────────────────────────
    const today = startOfDay();
    const wodToday = workouts.some(
      (w) => startOfDay(new Date(w.date)).getTime() === today.getTime()
    );

    res.json({
      generatedAt: new Date(),
      totals: {
        members: totalMembers,
        athletes,
        admins,
        pendingApprovals,
        logins: loginLogs.length,
        loginsLast7,
        attendanceLast30,
        inGymNow,
        workouts: workouts.length,
        wodToday
      },
      trafficLight,
      gender,
      loginsByDay,
      newByMonth
    });
  } catch (err) {
    next(err);
  }
}
