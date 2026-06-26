import { Member } from '../models/Member.js';
import { Notification } from '../models/Notification.js';
import { gymDayStr, gymTodayStr } from './gymTime.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MANUAL_STATUSES = new Set(['frozen', 'inactive']);
const VALID_STATUSES = new Set(['active', 'expiring_soon', 'expired', 'frozen', 'inactive']);

function dateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function utcDay(value) {
  const key = typeof value === 'string' ? value.slice(0, 10) : dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function calculateDaysLeft(endDate, today = gymTodayStr()) {
  const end = utcDay(endDate);
  const start = utcDay(today);
  if (end == null || start == null) return null;
  return Math.round((end - start) / DAY_MS);
}

export function resolveMembershipStatus(membership, today = gymTodayStr()) {
  if (!membership) return { status: 'inactive', daysLeft: null };

  const storedStatus = VALID_STATUSES.has(membership.status) ? membership.status : 'inactive';
  if (MANUAL_STATUSES.has(storedStatus)) {
    return { status: storedStatus, daysLeft: calculateDaysLeft(membership.endDate, today) };
  }

  const daysLeft = calculateDaysLeft(membership.endDate, today);
  if (daysLeft == null) return { status: storedStatus, daysLeft: null };
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft <= 7) return { status: 'expiring_soon', daysLeft };
  return { status: 'active', daysLeft };
}

export function serializeMembership(member, today = gymTodayStr()) {
  const membership = member?.membership?.toObject
    ? member.membership.toObject()
    : member?.membership || null;
  const state = resolveMembershipStatus(membership, today);

  return {
    status: state.status,
    daysLeft: state.daysLeft,
    planName: membership?.planName || null,
    startDate: membership?.startDate || null,
    endDate: membership?.endDate || null,
    lastPaymentAt: membership?.lastPaymentAt || null,
    nextPaymentDueAt: membership?.nextPaymentDueAt || null
  };
}

export function serializeMemberMembership(member, today = gymTodayStr()) {
  const membership = serializeMembership(member, today);
  return {
    id: member._id,
    name: member.name,
    email: member.email,
    phone: member.phone || null,
    membershipStatus: membership.status,
    membershipEndDate: member.membership?.endDate || null,
    daysLeft: membership.daysLeft,
    planName: member.membership?.planName || null,
    startDate: member.membership?.startDate || null,
    lastPaymentAt: member.membership?.lastPaymentAt || null,
    nextPaymentDueAt: member.membership?.nextPaymentDueAt || null,
    notes: member.membership?.notes || null
  };
}

export function summarizeMemberships(members, today = gymTodayStr()) {
  const result = {
    totalActive: 0,
    expiring7Days: 0,
    expiringTomorrow: 0,
    expired: 0,
    frozen: 0,
    inactive: 0
  };

  for (const member of members) {
    const { status, daysLeft } = resolveMembershipStatus(member.membership, today);
    if (status === 'active') result.totalActive += 1;
    if (status === 'expiring_soon') {
      result.expiring7Days += 1;
      if (daysLeft === 1) result.expiringTomorrow += 1;
    }
    if (status === 'expired') result.expired += 1;
    if (status === 'frozen') result.frozen += 1;
    if (status === 'inactive') result.inactive += 1;
  }

  return result;
}

export function extendMembershipEndDate(membership, { months = 1, paidAt = new Date() } = {}) {
  const safeMonths = Math.min(24, Math.max(1, Math.floor(Number(months) || 1)));
  const paidDate = new Date(paidAt);
  if (Number.isNaN(paidDate.getTime())) throw new Error('Fecha de pago invalida');

  const currentEnd = membership?.endDate ? new Date(membership.endDate) : null;
  const currentIsActive = currentEnd
    && calculateDaysLeft(currentEnd, dateKey(paidDate)) >= 0;
  const base = currentIsActive ? currentEnd : paidDate;
  const baseDay = base.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth() + safeMonths,
    1,
    base.getUTCHours(),
    base.getUTCMinutes(),
    base.getUTCSeconds(),
    base.getUTCMilliseconds()
  ));
  const lastTargetDay = new Date(Date.UTC(
    targetMonthStart.getUTCFullYear(),
    targetMonthStart.getUTCMonth() + 1,
    0
  )).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(baseDay, lastTargetDay));
  const nextEnd = targetMonthStart;
  return { endDate: nextEnd, paidAt: paidDate, months: safeMonths };
}

function reminderCopy(type, member) {
  const firstName = String(member.name || 'Atleta').split(' ')[0];
  if (type === 'membership_expiring_7_days') {
    return {
      title: 'Tu mensualidad vence pronto',
      body: `${firstName}, tu membresia vence esta semana. Habla con tu coach para renovarla.`
    };
  }
  if (type === 'membership_expiring_1_day') {
    return {
      title: 'Tu mensualidad vence manana',
      body: `${firstName}, recuerda renovar tu membresia con tu coach.`
    };
  }
  return {
    title: 'Tu mensualidad esta vencida',
    body: `${firstName}, renueva con tu coach para mantener tu acceso activo.`
  };
}

async function createAutomaticReminder(member, type, flag, now) {
  const copy = reminderCopy(type, member);
  const membershipEndDate = member.membership?.endDate || null;
  const reminderKey = [
    String(member._id),
    type,
    dateKey(membershipEndDate) || 'no-end-date'
  ].join(':');
  const existing = await Notification.findOne({
    member: member._id,
    type,
    $or: [
      { reminderKey },
      { 'metadata.membershipEndDate': membershipEndDate }
    ]
  });

  let created = false;
  if (!existing) {
    try {
      await Notification.create({
        member: member._id,
        type,
        reminderKey,
        ...copy,
        sentAt: now,
        metadata: { membershipEndDate }
      });
      created = true;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  if (!member.membership[flag]) {
    member.membership[flag] = now;
    await member.save();
  }
  return created;
}

export async function runMembershipReminders(now = new Date(), { memberIds } = {}) {
  const memberFilter = {
    role: { $ne: 'admin' },
    'membership.endDate': { $exists: true, $ne: null }
  };
  if (Array.isArray(memberIds)) {
    memberFilter._id = { $in: memberIds };
  }

  const members = await Member.find(memberFilter);
  const summary = { scanned: members.length, created: 0, byType: {} };
  const today = gymDayStr(now);

  for (const member of members) {
    const { status, daysLeft } = resolveMembershipStatus(member.membership, today);
    let type = null;
    let flag = null;

    if (status === 'expired' && !member.membership.expiredReminderSentAt) {
      type = 'membership_expired';
      flag = 'expiredReminderSentAt';
    } else if (status === 'expiring_soon' && daysLeft === 1) {
      if (!member.membership.reminder1DaySentAt) {
        type = 'membership_expiring_1_day';
        flag = 'reminder1DaySentAt';
      }
    } else if (status === 'expiring_soon' && !member.membership.reminder7DaysSentAt) {
      type = 'membership_expiring_7_days';
      flag = 'reminder7DaysSentAt';
    }

    if (!type) continue;
    const created = await createAutomaticReminder(member, type, flag, now);
    if (created) {
      summary.created += 1;
      summary.byType[type] = (summary.byType[type] || 0) + 1;
    }
  }

  return summary;
}
