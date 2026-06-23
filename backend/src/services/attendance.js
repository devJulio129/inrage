import { Attendance } from '../models/Attendance.js';
import { Member } from '../models/Member.js';
import {
  gymDayStr,
  gymTodayStr,
  prevDayStr,
  gymDayStartUTC,
  streakFromDays
} from './gymTime.js';

export function attendanceDayWindow(dayStr) {
  const start = gymDayStartUTC(dayStr);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

export function findVisitForDay(memberId, dayStr = gymTodayStr()) {
  const { start, end } = attendanceDayWindow(dayStr);
  return Attendance.findOne({ member: memberId, checkIn: { $gte: start, $lt: end } }).sort({ checkIn: -1 });
}

export async function attendanceDays(memberId) {
  return Attendance.find({ member: memberId }).select('checkIn checkOut classId').lean();
}

export async function applyCheckInStreak(member, today) {
  const yesterday = prevDayStr(today);
  if (member.streakDay === today) return;
  if (member.streakDay == null) {
    const rows = await attendanceDays(member._id);
    const days = new Set(rows.map((r) => gymDayStr(r.checkIn)));
    member.streak = streakFromDays(days, today).current || 1;
  } else if (member.streakDay === yesterday) {
    member.streak = (member.streak || 0) + 1;
  } else {
    member.streak = 1;
  }
  member.streakDay = today;
  if ((member.streak || 0) > (member.longestStreak || 0)) member.longestStreak = member.streak;
  await member.save();
}

export async function createAttendanceIfMissing(memberId, { classId = null, checkInAt = new Date() } = {}) {
  const today = gymDayStr(checkInAt);
  const existing = await findVisitForDay(memberId, today);
  if (existing) {
    let changed = false;
    if (existing.checkOut) {
      existing.checkOut = null;
      changed = true;
    }
    if (classId && !existing.classId) {
      existing.classId = classId;
      changed = true;
    }
    if (changed) await existing.save();
    return { attendance: existing, created: false };
  }

  const attendance = await Attendance.create({ member: memberId, classId, checkIn: checkInAt });
  const member = await Member.findById(memberId);
  if (member) await applyCheckInStreak(member, today);
  return { attendance, created: true };
}
