import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { emailService } from '../services/email.js';
import { Member } from '../models/Member.js';
import { PushToken } from '../models/PushToken.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { notificationService } from '../services/notificationService.js';
import { runDueNotificationJobs } from '../services/notificationJobs.js';
import {
  generateBranchCheckInQr,
  getCurrentBranchCheckInQr
} from '../services/checkinQr.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/admin/test-email - sends a real delivery probe using configured provider.
router.post('/test-email', protect, adminOnly, async (req, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) {
    return res.status(400).json({ error: 'Email destino invalido' });
  }

  try {
    const result = await emailService.sendTestEmail({ to, name: req.user?.name });
    res.json({ ok: true, provider: result.provider, to });
  } catch (err) {
    console.error('[admin] test email failed', {
      code: err.code || 'EMAIL_SEND_FAILED',
      provider: err.provider || null,
      message: err.message
    });
    res.status(err.status || 502).json({ error: err.message || 'Email provider rejected message' });
  }
});

router.get('/notifications/status', protect, adminOnly, async (_req, res, next) => {
  try {
    const [tokenCount, enabledTokenCount, recentLogs] = await Promise.all([
      PushToken.countDocuments(),
      PushToken.countDocuments({ enabled: true }),
      NotificationLog.find().sort({ sentAt: -1 }).limit(10).lean()
    ]);
    res.json({
      ok: true,
      enabled: String(process.env.PUSH_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true',
      tokenCount,
      enabledTokenCount,
      recentLogs
    });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/test', protect, adminOnly, async (req, res, next) => {
  try {
    const memberId = req.body?.memberId || req.user._id;
    const member = await Member.findById(memberId).select('_id name');
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const result = await notificationService.sendToMember(member._id, {
      type: 'admin_test',
      title: 'Notificacion de prueba',
      body: 'Si puedes leer esto, las notificaciones push de Inrage estan listas.',
      data: { target: 'home' }
    });
    res.json({ ok: true, memberId: member._id, result });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/run-due', protect, adminOnly, async (_req, res, next) => {
  try {
    res.json(await runDueNotificationJobs());
  } catch (err) {
    next(err);
  }
});

router.get('/checkin-qr', protect, adminOnly, async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await getCurrentBranchCheckInQr(req.query.branch || 'Torres')) });
  } catch (err) {
    if (err?.code) {
      return res.status(err.status || 400).json({
        ok: false,
        status: err.code,
        title: err.title || 'No se pudo cargar el QR',
        error: err.message,
        actionLabel: err.actionLabel || 'Entendido'
      });
    }
    next(err);
  }
});

router.post('/checkin-qr', protect, adminOnly, async (req, res, next) => {
  try {
    res.json({
      ok: true,
      ...(await generateBranchCheckInQr(req.body?.branch || req.query.branch || 'Torres', req.user._id))
    });
  } catch (err) {
    if (err?.code) {
      return res.status(err.status || 400).json({ ok: false, status: err.code, error: err.message });
    }
    next(err);
  }
});

export default router;
