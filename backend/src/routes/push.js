import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { Member } from '../models/Member.js';
import { PushToken } from '../models/PushToken.js';
import { notificationService } from '../services/notificationService.js';

const router = Router();
const BRANCH_PREFS = new Set(['all', 'Torres', 'Central']);
const PREF_KEYS = ['enabled', 'posts', 'classReminders', 'classChanges', 'membership'];

router.use(protect);

function allOrNothingPreferences(enabled = true) {
  const value = Boolean(enabled);
  return {
    enabled: value,
    posts: value,
    classReminders: value,
    classChanges: value,
    membership: value,
    branchPreference: 'all'
  };
}

function sanitizePreferences(input = {}) {
  let enabled;
  if ('enabled' in input) enabled = Boolean(input.enabled);
  else {
    const granularKey = PREF_KEYS.find((key) => key !== 'enabled' && key in input);
    if (granularKey) enabled = Boolean(input[granularKey]);
  }
  if ('branchPreference' in input) {
    const value = String(input.branchPreference || 'all').trim();
    if (!BRANCH_PREFS.has(value)) {
      throw Object.assign(new Error('Preferencia de sucursal invalida'), { status: 400 });
    }
  }
  return enabled === undefined ? {} : allOrNothingPreferences(enabled);
}

function serializeToken(row) {
  return {
    id: row._id,
    platform: row.platform || 'unknown',
    deviceName: row.deviceName || '',
    enabled: Boolean(row.enabled),
    lastSeenAt: row.lastSeenAt || null,
    createdAt: row.createdAt || null
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!notificationService.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Push token invalido' });
    }

    const platform = ['android', 'ios', 'web'].includes(req.body?.platform)
      ? req.body.platform
      : 'unknown';
    const now = new Date();
    let row = await PushToken.findOne({ token });

    if (row) {
      row.member = req.user._id;
      row.platform = platform;
      row.deviceName = String(req.body?.deviceName || row.deviceName || '').trim().slice(0, 120);
      row.enabled = req.body?.enabled == null ? row.enabled !== false : Boolean(req.body.enabled);
      row.lastSeenAt = now;
      await row.save();
    } else {
      row = await PushToken.create({
        member: req.user._id,
        token,
        platform,
        deviceName: String(req.body?.deviceName || '').trim().slice(0, 120),
        enabled: req.body?.enabled == null ? true : Boolean(req.body.enabled),
        lastSeenAt: now
      });
    }

    res.status(201).json({ ok: true, token: serializeToken(row) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'Push token ya registrado' });
    }
    next(err);
  }
});

router.get('/preferences', async (req, res, next) => {
  try {
    const [member, tokens] = await Promise.all([
      Member.findById(req.user._id).select('notificationPreferences').lean(),
      PushToken.find({ member: req.user._id }).sort({ lastSeenAt: -1 }).lean()
    ]);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const enabled = member.notificationPreferences?.enabled !== false;
    res.json({
      ok: true,
      preferences: allOrNothingPreferences(enabled),
      tokens: tokens.map(serializeToken),
      tokenCount: tokens.length,
      enabledTokenCount: tokens.filter((row) => row.enabled).length
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/preferences', async (req, res, next) => {
  try {
    const patch = sanitizePreferences(req.body || {});
    const member = await Member.findById(req.user._id);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const previous = member.notificationPreferences?.toObject ? member.notificationPreferences.toObject() : member.notificationPreferences || {};
    const enabled = patch.enabled ?? previous.enabled ?? true;
    member.notificationPreferences = allOrNothingPreferences(enabled);
    await member.save();

    if (req.body?.token) {
      await PushToken.updateOne(
        { member: req.user._id, token: String(req.body.token).trim() },
        { $set: { enabled: Boolean(member.notificationPreferences.enabled), lastSeenAt: new Date() } }
      );
    }

    const tokens = await PushToken.find({ member: req.user._id }).sort({ lastSeenAt: -1 }).lean();
    res.json({
      ok: true,
      preferences: member.notificationPreferences,
      tokens: tokens.map(serializeToken),
      tokenCount: tokens.length,
      enabledTokenCount: tokens.filter((row) => row.enabled).length
    });
  } catch (err) {
    next(err);
  }
});

export default router;
