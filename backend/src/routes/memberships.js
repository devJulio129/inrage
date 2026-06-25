import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { Member } from '../models/Member.js';
import { Notification } from '../models/Notification.js';
import {
  extendMembershipEndDate,
  resolveMembershipStatus,
  runMembershipReminders,
  serializeMemberMembership,
  summarizeMemberships
} from '../services/memberships.js';

const router = Router();
const EDITABLE_FIELDS = ['status', 'planName', 'startDate', 'endDate', 'notes'];
const VALID_STATUSES = new Set(['active', 'expiring_soon', 'expired', 'frozen', 'inactive']);

function parseDate(value, label) {
  if (value == null || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error(`${label} invalida`);
    err.status = 400;
    throw err;
  }
  return date;
}

function matchesStatus(row, status) {
  if (!status || status === 'all') return true;
  if (status === 'expiring_soon') return row.membershipStatus === 'expiring_soon';
  if (status === 'frozen_inactive') {
    return row.membershipStatus === 'frozen' || row.membershipStatus === 'inactive';
  }
  return row.membershipStatus === status;
}

router.use(protect, adminOnly);

router.get('/overview', async (_req, res, next) => {
  try {
    const members = await Member.find({ role: { $ne: 'admin' } }).select('membership').lean();
    res.json({ ok: true, ...summarizeMemberships(members) });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const status = String(req.query.status || 'all');
    const days = req.query.days == null ? null : Number(req.query.days);
    const members = await Member.find({ role: { $ne: 'admin' } })
      .select('name email phone membership')
      .sort({ name: 1 })
      .lean();

    const rows = members
      .map((member) => serializeMemberMembership(member))
      .filter((row) => matchesStatus(row, status))
      .filter((row) => !search || [row.name, row.email, row.phone, row.planName]
        .some((value) => String(value || '').toLowerCase().includes(search)))
      .filter((row) => !Number.isFinite(days)
        || (row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= days));

    res.json({ ok: true, members: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

router.patch('/:memberId', async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });

    if (!member.membership) member.membership = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue;
      if (field === 'status') {
        if (!VALID_STATUSES.has(req.body.status)) {
          return res.status(400).json({ error: 'Status de membresia invalido' });
        }
        member.membership.status = req.body.status;
      } else if (field === 'startDate' || field === 'endDate') {
        member.membership[field] = parseDate(req.body[field], field);
      } else {
        member.membership[field] = String(req.body[field] || '').trim();
      }
    }

    await member.save();
    res.json({ ok: true, member: serializeMemberMembership(member) });
  } catch (err) {
    next(err);
  }
});

router.post('/:memberId/mark-paid', async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    if (!member.membership) member.membership = {};

    const extension = extendMembershipEndDate(member.membership, {
      months: req.body?.months,
      paidAt: req.body?.paidAt || new Date()
    });
    member.membership.status = 'active';
    member.membership.endDate = extension.endDate;
    member.membership.lastPaymentAt = extension.paidAt;
    member.membership.nextPaymentDueAt = extension.endDate;
    if (req.body?.planName) member.membership.planName = String(req.body.planName).trim();
    member.membership.reminder7DaysSentAt = undefined;
    member.membership.reminder1DaySentAt = undefined;
    member.membership.expiredReminderSentAt = undefined;
    await member.save();

    await Notification.create({
      member: member._id,
      type: 'payment_confirmed',
      title: 'Pago de membresia confirmado',
      body: `Tu membresia fue renovada hasta el ${extension.endDate.toLocaleDateString('es-MX', { timeZone: 'UTC' })}.`,
      metadata: { months: extension.months, membershipEndDate: extension.endDate }
    });

    res.json({ ok: true, member: serializeMemberMembership(member) });
  } catch (err) {
    next(err);
  }
});

router.post('/:memberId/send-reminder', async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.memberId).select('name membership');
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const state = resolveMembershipStatus(member.membership);
    const endDate = member.membership?.endDate
      ? new Date(member.membership.endDate).toLocaleDateString('es-MX', { timeZone: 'UTC' })
      : null;
    const notification = await Notification.create({
      member: member._id,
      type: 'admin_manual_reminder',
      title: String(req.body?.title || 'Recordatorio de membresia').trim(),
      body: String(
        req.body?.body
        || (endDate
          ? `Tu membresia ${state.status === 'expired' ? 'vencio' : 'vence'} el ${endDate}. Habla con tu coach para renovarla.`
          : 'Habla con tu coach para revisar el estado de tu membresia.')
      ).trim(),
      metadata: { membershipStatus: state.status, membershipEndDate: member.membership?.endDate || null }
    });
    res.status(201).json({ ok: true, notification });
  } catch (err) {
    next(err);
  }
});

router.post('/run-reminders', async (_req, res, next) => {
  try {
    res.json({ ok: true, ...(await runMembershipReminders()) });
  } catch (err) {
    next(err);
  }
});

export default router;
