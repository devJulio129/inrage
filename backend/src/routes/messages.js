import { Router } from 'express';
import mongoose from 'mongoose';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { Message } from '../models/Message.js';
import { Member } from '../models/Member.js';

const router = Router();

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 2_800_000; // ~2 MB por archivo en base64

// Valida y normaliza los adjuntos del body.
function cleanAttachments(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('Adjuntos inválidos');
  if (raw.length > MAX_ATTACHMENTS) throw new Error(`Máximo ${MAX_ATTACHMENTS} archivos por mensaje`);
  return raw.map((a) => {
    if (!a || typeof a.data !== 'string' || !/^data:.+;base64,/.test(a.data)) {
      throw new Error('Un adjunto no es válido');
    }
    if (a.data.length > MAX_ATTACHMENT_CHARS) {
      throw new Error('Un archivo pesa demasiado (máx ~2 MB)');
    }
    return {
      name: String(a.name || 'archivo').slice(0, 200),
      mime: String(a.mime || '').slice(0, 100),
      data: a.data
    };
  });
}

function serialize(m) {
  return {
    _id: m._id,
    fromAdmin: m.fromAdmin,
    body: m.body,
    attachments: m.attachments,
    createdAt: m.createdAt
  };
}

// ── Lado atleta (su propio hilo) ────────────────────────────────────

// GET /api/messages/me — hilo del atleta; marca como leídos los del gym.
router.get('/me', protect, async (req, res, next) => {
  try {
    await Message.updateMany(
      { member: req.user._id, fromAdmin: true, readByMember: false },
      { $set: { readByMember: true } }
    );
    const thread = await Message.find({ member: req.user._id }).sort({ createdAt: 1 }).lean();
    res.json(thread.map(serialize));
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/me/unread — cuántos mensajes del gym sin leer.
router.get('/me/unread', protect, async (req, res, next) => {
  try {
    const count = await Message.countDocuments({
      member: req.user._id, fromAdmin: true, readByMember: false
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/me — el atleta responde.
router.post('/me', protect, async (req, res, next) => {
  try {
    const body = (req.body.body || '').trim();
    let attachments;
    try { attachments = cleanAttachments(req.body.attachments); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    if (!body && attachments.length === 0) {
      return res.status(400).json({ error: 'El mensaje está vacío' });
    }
    const msg = await Message.create({
      member: req.user._id,
      fromAdmin: false,
      sender: req.user._id,
      body,
      attachments,
      readByMember: true,
      readByAdmin: false
    });
    res.status(201).json(serialize(msg));
  } catch (err) {
    next(err);
  }
});

// ── Lado admin ──────────────────────────────────────────────────────

// GET /api/messages/inbox — atletas con conversación + último mensaje + no leídos.
router.get('/inbox', protect, adminOnly, async (req, res, next) => {
  try {
    const rows = await Message.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$member',
          lastBody: { $first: '$body' },
          lastFromAdmin: { $first: '$fromAdmin' },
          lastHasFiles: { $first: { $gt: [{ $size: '$attachments' }, 0] } },
          lastAt: { $first: '$createdAt' },
          unread: { $sum: { $cond: [{ $and: [{ $eq: ['$fromAdmin', false] }, { $eq: ['$readByAdmin', false] }] }, 1, 0] } }
        }
      },
      { $sort: { lastAt: -1 } }
    ]);
    const ids = rows.map((r) => r._id);
    const members = await Member.find({ _id: { $in: ids } }).select('name email avatar').lean();
    const byId = Object.fromEntries(members.map((m) => [String(m._id), m]));
    res.json(rows.map((r) => ({
      member: byId[String(r._id)] || { _id: r._id, name: 'Atleta' },
      lastBody: r.lastBody,
      lastFromAdmin: r.lastFromAdmin,
      lastHasFiles: r.lastHasFiles,
      lastAt: r.lastAt,
      unread: r.unread
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/member/:id — hilo con un atleta; marca leídos los suyos.
router.get('/member/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Atleta inválido' });
    }
    await Message.updateMany(
      { member: req.params.id, fromAdmin: false, readByAdmin: false },
      { $set: { readByAdmin: true } }
    );
    const thread = await Message.find({ member: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json(thread.map(serialize));
  } catch (err) {
    next(err);
  }
});

// POST /api/messages/member/:id — el gym le escribe al atleta.
router.post('/member/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Atleta inválido' });
    }
    const member = await Member.findById(req.params.id).select('_id');
    if (!member) return res.status(404).json({ error: 'Atleta no encontrado' });

    const body = (req.body.body || '').trim();
    let attachments;
    try { attachments = cleanAttachments(req.body.attachments); }
    catch (e) { return res.status(400).json({ error: e.message }); }
    if (!body && attachments.length === 0) {
      return res.status(400).json({ error: 'El mensaje está vacío' });
    }
    const msg = await Message.create({
      member: member._id,
      fromAdmin: true,
      sender: req.user._id,
      body,
      attachments,
      readByAdmin: true,
      readByMember: false
    });
    res.status(201).json(serialize(msg));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id  (admin) — borra un mensaje de cualquier hilo.
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Mensaje inválido' });
    }
    const deleted = await Message.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Mensaje no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
