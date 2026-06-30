import { GymClass } from '../models/GymClass.js';
import { Member } from '../models/Member.js';
import { addDaysUTC, gymTodayUTC } from './classSchedule.js';
import {
  classStartsAt,
  sendClassQrReminder,
  sendClassReminder,
  sendMembershipReminder
} from './notificationService.js';

function dayStartUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calendarDaysUntil(from, to) {
  const start = dayStartUTC(from);
  const end = dayStartUTC(to);
  return Math.round((end - start) / 86_400_000);
}

export async function runDueNotificationJobs({ now = new Date() } = {}) {
  const from = gymTodayUTC();
  const to = addDaysUTC(from, 2);
  const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
    .select('date time branch reservations capacity')
    .lean();

  const summary = {
    classReminders30: 0,
    classReminders15: 0,
    qrReminders: 0,
    membershipReminders: 0
  };

  for (const gymClass of classes) {
    const startsAt = classStartsAt(gymClass);
    const minutes = (startsAt.getTime() - now.getTime()) / 60_000;
    if (minutes >= 29 && minutes <= 31) {
      const result = await sendClassReminder(gymClass._id, 30);
      summary.classReminders30 += Number(result.sent || 0);
    }
    if (minutes >= 14 && minutes <= 16) {
      const result = await sendClassReminder(gymClass._id, 15);
      summary.classReminders15 += Number(result.sent || 0);
    }
    if (minutes >= -1 && minutes <= 5) {
      const result = await sendClassQrReminder(gymClass._id);
      summary.qrReminders += Number(result.sent || 0);
    }
  }

  const members = await Member.find({
    role: { $ne: 'admin' },
    'membership.endDate': { $exists: true, $ne: null }
  }).select('_id membership notificationPreferences role status').lean();

  for (const member of members) {
    const endDate = new Date(member.membership?.endDate);
    if (Number.isNaN(endDate.getTime())) continue;
    const days = calendarDaysUntil(now, endDate);
    if (![7, 3, 1, 0].includes(days)) continue;
    const result = await sendMembershipReminder(member._id, days, endDate);
    summary.membershipReminders += Number(result.sent || 0);
  }

  return { ok: true, ...summary };
}

export const notificationJobs = { runDueNotificationJobs };
