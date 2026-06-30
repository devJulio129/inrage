import { Member } from '../models/Member.js';
import { GymClass } from '../models/GymClass.js';
import { Post } from '../models/Post.js';
import { PushToken } from '../models/PushToken.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { normalizeBranch } from './branches.js';
import {
  countReservations,
  isMineActive,
  normalizeReservationStatus
} from './classReservations.js';
import { GYM_UTC_OFFSET_HOURS } from './classSchedule.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const TEMPORARY_EXPO_ERRORS = new Set(['MessageRateExceeded', 'ProviderUnavailable']);
const PERMANENT_TOKEN_ERRORS = new Set(['DeviceNotRegistered']);

export function isExpoPushToken(token) {
  return /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(String(token || '').trim())
    || /^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(String(token || '').trim());
}

function classDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function classStartsAt(gymClass) {
  const [year, month, day] = classDay(gymClass.date).split('-').map(Number);
  const [hour, minute] = String(gymClass.time || '00:00').split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0) - GYM_UTC_OFFSET_HOURS * 3600 * 1000);
}

export function pushDeliveryEnabled() {
  return String(process.env.PUSH_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true';
}

function preferenceAllowed(member, payload = {}) {
  const prefs = {
    enabled: true,
    posts: true,
    classReminders: true,
    classChanges: true,
    membership: true,
    branchPreference: 'all',
    ...(member?.notificationPreferences || {})
  };
  return prefs.enabled !== false;
}

async function createLog({ memberId, payload, status, error = '', reminderKey = null }) {
  return NotificationLog.create({
    type: payload.type || 'push',
    member: memberId || undefined,
    branch: payload.branch || undefined,
    title: payload.title,
    body: payload.body,
    status,
    error,
    classId: payload.classId ? String(payload.classId) : undefined,
    postId: payload.postId ? String(payload.postId) : undefined,
    reminderKey,
    metadata: payload.data || {},
    sentAt: new Date()
  });
}

async function expoFetch(url, body, { retry = true } = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok && retry && response.status >= 500) {
    return expoFetch(url, body, { retry: false });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw Object.assign(new Error(`Expo push rejected message (${response.status})`), {
      status: response.status,
      body: text
    });
  }
  return response.json();
}

async function expoSend(messages) {
  if (!pushDeliveryEnabled()) {
    return { skipped: true, reason: 'Push notifications disabled' };
  }
  return expoFetch(EXPO_PUSH_URL, messages);
}

async function expoReceipts(ids) {
  if (!ids.length || !pushDeliveryEnabled()) return {};
  const result = await expoFetch(EXPO_RECEIPTS_URL, { ids }, { retry: false });
  return result?.data || {};
}

async function disableToken(token, reason) {
  await PushToken.updateOne(
    { token },
    {
      $set: {
        enabled: false,
        disabledAt: new Date(),
        disabledReason: String(reason || 'invalid_push_token').slice(0, 160)
      }
    }
  );
}

async function inspectExpoResult(result, tokens) {
  const tickets = Array.isArray(result?.data) ? result.data : [];
  const receiptIds = [];
  const receiptToToken = new Map();
  const errors = [];

  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i];
    const row = tokens[i];
    if (!ticket || !row) continue;
    if (ticket.status === 'ok' && ticket.id) {
      receiptIds.push(ticket.id);
      receiptToToken.set(ticket.id, row.token);
    } else if (ticket.status === 'error') {
      const code = ticket.details?.error || 'ticket_error';
      errors.push(code);
      if (PERMANENT_TOKEN_ERRORS.has(code)) await disableToken(row.token, code);
      if (TEMPORARY_EXPO_ERRORS.has(code)) errors.push('temporary');
    }
  }

  const receipts = await expoReceipts(receiptIds).catch(() => ({}));
  for (const [id, receipt] of Object.entries(receipts || {})) {
    if (receipt?.status !== 'error') continue;
    const code = receipt.details?.error || 'receipt_error';
    errors.push(code);
    const token = receiptToToken.get(id);
    if (token && PERMANENT_TOKEN_ERRORS.has(code)) await disableToken(token, code);
  }

  return {
    errors: [...new Set(errors.filter(Boolean))],
    pruned: errors.filter((code) => PERMANENT_TOKEN_ERRORS.has(code)).length
  };
}

async function activeTokens(memberId) {
  return PushToken.find({ member: memberId, enabled: true }).lean();
}

async function findReminderLog(reminderKey) {
  const result = NotificationLog.findOne({ reminderKey });
  return typeof result?.lean === 'function' ? result.lean() : result;
}

export async function sendToMember(memberId, payload = {}) {
  const member = await Member.findById(memberId).select('notificationPreferences role status').lean();
  if (!member) {
    return { ok: false, sent: 0, skipped: 1, reason: 'member_not_found' };
  }

  const reminderKey = payload.reminderKey || null;
  if (reminderKey) {
    const existing = await findReminderLog(reminderKey);
    if (existing) return { ok: true, sent: 0, skipped: 1, duplicate: true };
  }

  if (!preferenceAllowed(member, payload)) {
    await createLog({ memberId, payload, status: 'skipped', error: 'Preference disabled', reminderKey });
    return { ok: true, sent: 0, skipped: 1, reason: 'preference_disabled' };
  }

  const tokens = (await activeTokens(memberId)).filter((row) => isExpoPushToken(row.token));
  if (tokens.length === 0) {
    await createLog({ memberId, payload, status: 'skipped', error: 'No active push token', reminderKey });
    return { ok: true, sent: 0, skipped: 1, reason: 'no_tokens' };
  }

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: {
      type: payload.type || 'push',
      ...(payload.data || {}),
      ...(payload.classId ? { classId: String(payload.classId) } : {}),
      ...(payload.postId ? { postId: String(payload.postId) } : {}),
      ...(payload.branch ? { branch: payload.branch } : {})
    }
  }));

  try {
    const result = await expoSend(messages);
    const status = result?.skipped ? 'skipped' : 'sent';
    const inspection = status === 'sent' ? await inspectExpoResult(result, tokens) : { errors: [], pruned: 0 };
    await createLog({
      memberId,
      payload,
      status: inspection.errors.length ? 'failed' : status,
      error: result?.reason || inspection.errors.join(', '),
      reminderKey
    });
    return {
      ok: inspection.errors.length === 0,
      sent: status === 'sent' ? Math.max(0, tokens.length - inspection.errors.length) : 0,
      skipped: status === 'skipped' ? tokens.length : 0,
      failed: inspection.errors.length,
      pruned: inspection.pruned
    };
  } catch (err) {
    await createLog({ memberId, payload, status: 'failed', error: err.message, reminderKey });
    return { ok: false, sent: 0, failed: tokens.length, error: err.message };
  }
}

export async function sendToAllAthletes(payload = {}) {
  const members = await Member.find({ role: { $ne: 'admin' }, status: { $ne: 'pending' } })
    .select('_id notificationPreferences role status')
    .lean();
  const results = [];
  for (const member of members) {
    results.push(await sendToMember(member._id, payload));
  }
  return {
    ok: true,
    members: members.length,
    sent: results.reduce((sum, row) => sum + Number(row.sent || 0), 0),
    skipped: results.reduce((sum, row) => sum + Number(row.skipped || 0), 0)
  };
}

export async function sendToBranch(branch, payload = {}) {
  return sendToAllAthletes({ ...payload, branch: normalizeBranch(branch) });
}

export async function sendClassReminder(classId, minutesBefore = 30) {
  const gymClass = await GymClass.findById(classId)
    .populate('reservations.member', '_id notificationPreferences role status')
    .lean();
  if (!gymClass) return { ok: false, sent: 0, reason: 'class_not_found' };

  const branch = normalizeBranch(gymClass.branch);
  let sent = 0;
  let skipped = 0;
  for (const reservation of gymClass.reservations || []) {
    if (!isMineActive(reservation)) continue;
    const memberId = reservation.member?._id || reservation.member;
    const result = await sendToMember(memberId, {
      type: 'class_reminder',
      preferenceKey: 'classReminders',
      title: 'Tu clase empieza pronto',
      body: `Recuerda llegar a ${branch} y escanear tu QR para hacer check-in.`,
      branch,
      classId,
      reminderKey: `class:${classId}:reminder:${minutesBefore}:member:${memberId}`,
      data: { target: 'classes', minutesBefore }
    });
    sent += Number(result.sent || 0);
    skipped += Number(result.skipped || 0);
  }
  return { ok: true, sent, skipped };
}

export async function sendClassQrReminder(classId) {
  const gymClass = await GymClass.findById(classId)
    .populate('reservations.member', '_id notificationPreferences role status')
    .lean();
  if (!gymClass) return { ok: false, sent: 0, reason: 'class_not_found' };

  const branch = normalizeBranch(gymClass.branch);
  let sent = 0;
  let skipped = 0;
  for (const reservation of gymClass.reservations || []) {
    const status = normalizeReservationStatus(reservation);
    if (status !== 'reserved') continue;
    const memberId = reservation.member?._id || reservation.member;
    const result = await sendToMember(memberId, {
      type: 'class_qr_reminder',
      preferenceKey: 'classReminders',
      title: 'Escanea tu QR al llegar',
      body: 'Tu reserva esta activa. Haz check-in escaneando el QR del gym.',
      branch,
      classId,
      reminderKey: `class:${classId}:qr:member:${memberId}`,
      data: { target: 'classes' }
    });
    sent += Number(result.sent || 0);
    skipped += Number(result.skipped || 0);
  }
  return { ok: true, sent, skipped };
}

export async function sendMembershipReminder(memberId, daysBefore = 7, dueDate = null) {
  const cycle = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : 'unknown';
  return sendToMember(memberId, {
    type: 'membership_reminder',
    preferenceKey: 'membership',
    title: daysBefore === 0 ? 'Tu mensualidad vence hoy' : 'Tu mensualidad esta por vencer',
    body: daysBefore === 0
      ? 'Habla con tu coach para renovar tu membresia.'
      : `Tu membresia vence en ${daysBefore} dias. Habla con tu coach para renovarla.`,
    reminderKey: `membership:${memberId}:${cycle}:${daysBefore}`,
    data: { target: 'profile', daysBefore }
  });
}

export async function sendPostNotification(postId) {
  const post = await Post.findById(postId).lean();
  if (!post) return { ok: false, reason: 'post_not_found' };
  const title = post.title || 'Nuevo aviso del box';
  const body = String(post.body || title).replace(/\s+/g, ' ').trim().slice(0, 140);
  return sendToAllAthletes({
    type: 'post',
    preferenceKey: 'posts',
    title: 'Nuevo aviso del box',
    body: body || title,
    postId,
    data: { target: 'home' }
  });
}

export async function sendClassChangeNotification(classId, changeSummary = 'Tu clase fue actualizada') {
  const gymClass = await GymClass.findById(classId)
    .populate('reservations.member', '_id notificationPreferences role status')
    .lean();
  if (!gymClass) return { ok: false, reason: 'class_not_found' };

  const branch = normalizeBranch(gymClass.branch);
  let sent = 0;
  let skipped = 0;
  for (const reservation of gymClass.reservations || []) {
    if (!isMineActive(reservation)) continue;
    const memberId = reservation.member?._id || reservation.member;
    const result = await sendToMember(memberId, {
      type: 'class_change',
      preferenceKey: 'classChanges',
      title: 'Tu clase fue actualizada',
      body: changeSummary,
      branch,
      classId,
      data: { target: 'classes' }
    });
    sent += Number(result.sent || 0);
    skipped += Number(result.skipped || 0);
  }
  return { ok: true, sent, skipped };
}

export async function sendSpecialClassNotification(classId) {
  const gymClass = await GymClass.findById(classId).lean();
  if (!gymClass || !gymClass.isSpecial || !gymClass.featuredOnHome) {
    return { ok: true, sent: 0, skipped: 0 };
  }
  const branch = normalizeBranch(gymClass.branch);
  const counts = countReservations(gymClass.reservations || [], gymClass.capacity);
  return sendToBranch(branch, {
    type: 'special_class',
    preferenceKey: 'classChanges',
    title: 'Nueva clase especial disponible',
    body: `${branch} - ${classDay(gymClass.date)} ${gymClass.time || ''}. ${counts.spotsLeft} lugares disponibles.`,
    branch,
    classId,
    data: { target: 'classes' }
  });
}

export const notificationService = {
  sendToMember,
  sendToBranch,
  sendToAllAthletes,
  sendClassReminder,
  sendClassQrReminder,
  sendMembershipReminder,
  sendPostNotification,
  sendClassChangeNotification,
  sendSpecialClassNotification,
  isExpoPushToken,
  classStartsAt,
  isPushEnabled: pushDeliveryEnabled
};
