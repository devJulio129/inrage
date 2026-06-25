import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { Member } from '../models/Member.js';
import { Notification } from '../models/Notification.js';

const router = Router();

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const notifications = await Notification.find({ member: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      ok: true,
      unread: notifications.filter((item) => item.status === 'unread').length,
      notifications
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      member: req.user._id
    });
    if (!notification) return res.status(404).json({ error: 'Notificacion no encontrada' });
    if (notification.status !== 'read') {
      notification.status = 'read';
      notification.readAt = new Date();
      await notification.save();
    }
    res.json({ ok: true, notification });
  } catch (err) {
    next(err);
  }
});

router.post('/push-token', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Falta push token' });
    if (token.length > 500) return res.status(400).json({ error: 'Push token invalido' });

    const member = await Member.findById(req.user._id);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const now = new Date();
    const current = member.pushTokens.find((item) => item.token === token);
    if (current) {
      current.platform = req.body?.platform || current.platform;
      current.deviceId = req.body?.deviceId || current.deviceId;
      current.lastUsedAt = now;
    } else {
      member.pushTokens.push({
        token,
        platform: req.body?.platform || null,
        deviceId: req.body?.deviceId || null,
        createdAt: now,
        lastUsedAt: now
      });
    }
    await member.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
