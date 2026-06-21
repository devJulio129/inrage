import { Attendance } from '../models/Attendance.js';
import { Member } from '../models/Member.js';
import {
  gymDayStr,
  gymTodayStr,
  prevDayStr,
  gymDayStartUTC,
  effectiveStreak,
  streakFromDays
} from '../services/gymTime.js';

// Cualquier visita registrada HOY (con o sin salida).
function findTodayVisit(memberId, todayStr = gymTodayStr()) {
  const start = gymDayStartUTC(todayStr);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return Attendance.findOne({ member: memberId, checkIn: { $gte: start, $lt: end } }).sort({ checkIn: -1 });
}

// Días únicos del gym con asistencia (para visitas y para inicializar la racha).
async function attendanceDays(memberId) {
  const rows = await Attendance.find({ member: memberId }).select('checkIn checkOut').lean();
  return rows;
}

// Mantiene la racha del Member al registrar la PRIMERA visita del día.
async function applyCheckInStreak(member, today) {
  const yesterday = prevDayStr(today);
  if (member.streakDay === today) return; // ya contó hoy
  if (member.streakDay == null) {
    // Primera vez que se calcula: arranca del histórico real (incluye hoy).
    const rows = await attendanceDays(member._id);
    const days = new Set(rows.map((r) => gymDayStr(r.checkIn)));
    member.streak = streakFromDays(days, today).current || 1;
  } else if (member.streakDay === yesterday) {
    member.streak = (member.streak || 0) + 1; // día consecutivo
  } else {
    member.streak = 1; // hubo un hueco → la racha se reinicia
  }
  member.streakDay = today;
  if ((member.streak || 0) > (member.longestStreak || 0)) member.longestStreak = member.streak;
  await member.save();
}

// POST /api/attendances/checkin — marca llegada al box.
// IDEMPOTENTE POR DÍA: si ya marcaste entrada hoy, no se crea otra visita (así
// nadie infla su contador aplanando el botón). Cada día nuevo sí cuenta.
export async function checkIn(req, res, next) {
  try {
    const today = gymTodayStr();
    const existing = await findTodayVisit(req.user._id, today);
    if (existing) {
      if (existing.checkOut) {
        existing.checkOut = null;
        await existing.save();
      }
      return res.json({ status: 'in', attendance: existing, alreadyToday: true });
    }
    const attendance = await Attendance.create({ member: req.user._id, checkIn: new Date() });
    const member = await Member.findById(req.user._id);
    if (member) await applyCheckInStreak(member, today);
    res.status(201).json({ status: 'in', attendance, alreadyToday: false });
  } catch (err) {
    next(err);
  }
}

// POST /api/attendances/checkout — marca salida.
export async function checkOut(req, res, next) {
  try {
    const today = gymTodayStr();
    const start = gymDayStartUTC(today);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const open = await Attendance.findOne({ member: req.user._id, checkOut: null, checkIn: { $gte: start, $lt: end } });
    if (!open) return res.json({ status: 'out', attendance: null });
    open.checkOut = new Date();
    await open.save();
    res.json({ status: 'out', attendance: open });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendances/me — presencia + visitas (días únicos) + racha.
// Aplica el "reset perezoso": si dejaron de ir, la racha guardada baja a 0.
export async function myAttendance(req, res, next) {
  try {
    const today = gymTodayStr();
    const rows = await attendanceDays(req.user._id);
    const days = new Set(rows.map((r) => gymDayStr(r.checkIn)));
    const totalVisits = days.size;
    const checkedInToday = days.has(today);
    const open = rows.find((r) => !r.checkOut && gymDayStr(r.checkIn) === today) || null;

    const member = await Member.findById(req.user._id);
    let streak = 0;
    let longest = 0;
    if (member) {
      // Inicializa desde el histórico la primera vez.
      if (member.streakDay == null && totalVisits > 0) {
        const c = streakFromDays(days, today);
        member.streak = c.current;
        member.streakDay = c.anchor;
        member.longestStreak = Math.max(member.longestStreak || 0, c.longest);
        if (member.streakDay) await member.save();
      }
      streak = effectiveStreak(member, today);
      // Dejaron de ir → la racha se pierde (persiste el 0).
      if (streak === 0 && (member.streak || 0) !== 0) {
        member.streak = 0;
        member.streakDay = null;
        await member.save();
      }
      longest = member.longestStreak || 0;
    }

    res.json({ inGym: Boolean(open), since: open?.checkIn || null, totalVisits, streak, longestStreak: longest, checkedInToday });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendances/active (admin) — quién está en el box ahora.
export async function activeNow(req, res, next) {
  try {
    const start = gymDayStartUTC(gymTodayStr());
    const active = await Attendance.find({ checkOut: null, checkIn: { $gte: start } })
      .populate('member', 'name email role gender')
      .sort({ checkIn: -1 });
    res.json(active);
  } catch (err) {
    next(err);
  }
}
