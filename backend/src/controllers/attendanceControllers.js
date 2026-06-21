import { Attendance } from '../models/Attendance.js';

// El box vive en UTC-6 (Tampico). Bucketizamos las asistencias por DÍA del gym
// para que el check-in sea uno por día y la racha cuente días reales del box,
// no medianoche UTC del server.
const GYM_OFFSET_MS = Number(process.env.GYM_UTC_OFFSET_HOURS ?? -6) * 3600 * 1000;

function gymDayStr(date) {
  return new Date(new Date(date).getTime() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}
function gymTodayStr() {
  return gymDayStr(new Date());
}
function prevDayStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}
// Instante UTC en que empieza ese día del gym (medianoche local del box).
function gymDayStartUTC(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - GYM_OFFSET_MS);
}

// Cualquier visita registrada HOY (con o sin salida).
function findTodayVisit(memberId, todayStr = gymTodayStr()) {
  const start = gymDayStartUTC(todayStr);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return Attendance.findOne({ member: memberId, checkIn: { $gte: start, $lt: end } }).sort({ checkIn: -1 });
}

// Visita de hoy aún abierta (sin checkOut) → el atleta sigue en el box.
function findOpenVisit(memberId, todayStr = gymTodayStr()) {
  const start = gymDayStartUTC(todayStr);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return Attendance.findOne({ member: memberId, checkOut: null, checkIn: { $gte: start, $lt: end } });
}

// Racha actual (días consecutivos terminando hoy o ayer) y la más larga.
function computeStreak(daySet, todayStr) {
  let current = 0;
  let anchor = daySet.has(todayStr) ? todayStr : prevDayStr(todayStr);
  if (daySet.has(anchor)) {
    let d = anchor;
    while (daySet.has(d)) {
      current++;
      d = prevDayStr(d);
    }
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...daySet].sort()) {
    run = prev && prevDayStr(d) === prev ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest };
}

// POST /api/attendances/checkin — marca llegada al box.
// IDEMPOTENTE POR DÍA: si ya marcaste entrada hoy, no se crea otra visita
// (así nadie infla su contador aplanando el botón). Cada día nuevo sí permite
// un check-in nuevo.
export async function checkIn(req, res, next) {
  try {
    const existing = await findTodayVisit(req.user._id);
    if (existing) {
      // Si ya había salido y regresa el mismo día, reabrimos sin contar otra visita.
      if (existing.checkOut) {
        existing.checkOut = null;
        await existing.save();
      }
      return res.json({ status: 'in', attendance: existing, alreadyToday: true });
    }
    const attendance = await Attendance.create({ member: req.user._id, checkIn: new Date() });
    res.status(201).json({ status: 'in', attendance, alreadyToday: false });
  } catch (err) {
    next(err);
  }
}

// POST /api/attendances/checkout — marca salida.
export async function checkOut(req, res, next) {
  try {
    const open = await findOpenVisit(req.user._id);
    if (!open) return res.json({ status: 'out', attendance: null });
    open.checkOut = new Date();
    await open.save();
    res.json({ status: 'out', attendance: open });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendances/me — presencia actual + visitas (días únicos) + racha.
export async function myAttendance(req, res, next) {
  try {
    const today = gymTodayStr();
    const open = await findOpenVisit(req.user._id, today);

    // Visitas = días ÚNICOS con asistencia (robusto aunque haya duplicados viejos).
    const rows = await Attendance.find({ member: req.user._id }).select('checkIn').lean();
    const days = new Set(rows.map((r) => gymDayStr(r.checkIn)));
    const { current, longest } = computeStreak(days, today);

    res.json({
      inGym: Boolean(open),
      since: open?.checkIn || null,
      totalVisits: days.size,
      streak: current,
      longestStreak: longest,
      checkedInToday: days.has(today)
    });
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
