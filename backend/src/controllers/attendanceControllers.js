import { Attendance } from '../models/Attendance.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Find the member's currently-open visit (checked in today, not checked out).
function findOpenVisit(memberId) {
  return Attendance.findOne({
    member: memberId,
    checkOut: null,
    checkIn: { $gte: startOfDay() }
  });
}

// POST /api/attendances/checkin  — athlete marks arrival at the box.
export async function checkIn(req, res, next) {
  try {
    const open = await findOpenVisit(req.user._id);
    if (open) return res.json({ status: 'in', attendance: open }); // already here
    const attendance = await Attendance.create({ member: req.user._id, checkIn: new Date() });
    res.status(201).json({ status: 'in', attendance });
  } catch (err) {
    next(err);
  }
}

// POST /api/attendances/checkout  — athlete marks leaving.
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

// GET /api/attendances/me  — the athlete's current presence + today's count.
export async function myAttendance(req, res, next) {
  try {
    const open = await findOpenVisit(req.user._id);
    const total = await Attendance.countDocuments({ member: req.user._id });
    res.json({ inGym: Boolean(open), since: open?.checkIn || null, totalVisits: total });
  } catch (err) {
    next(err);
  }
}

// GET /api/attendances/active  (admin) — who is in the box right now.
export async function activeNow(req, res, next) {
  try {
    const active = await Attendance.find({
      checkOut: null,
      checkIn: { $gte: startOfDay() }
    })
      .populate('member', 'name email role gender')
      .sort({ checkIn: -1 });
    res.json(active);
  } catch (err) {
    next(err);
  }
}
