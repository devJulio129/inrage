import { Router } from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/authMiddleware.js';
import { Comment } from '../models/Comment.js';

const router = Router();
const TYPES = ['workout', 'post'];

// GET /api/comments?targetType=&targetId=  → todos (raíz + respuestas).
// El cliente arma el hilo. Incluye nombre y avatar del autor.
router.get('/', protect, async (req, res, next) => {
  try {
    const { targetType, targetId } = req.query;
    if (!TYPES.includes(targetType) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const comments = await Comment.find({ targetType, targetId })
      .sort({ createdAt: 1 })
      .populate('member', 'name avatar')
      .lean();
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

// POST /api/comments  { targetType, targetId, text, parentId? }
router.post('/', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación.' });
    }
    const { targetType, targetId, parentId } = req.body;
    const text = (req.body.text || '').trim();
    if (!TYPES.includes(targetType) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Elemento inválido' });
    }
    if (!text) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    if (text.length > 500) return res.status(400).json({ error: 'Máximo 500 caracteres' });

    // Una respuesta debe colgar de un comentario raíz del mismo elemento.
    let parent = null;
    if (parentId) {
      if (!mongoose.isValidObjectId(parentId)) {
        return res.status(400).json({ error: 'Comentario padre inválido' });
      }
      parent = await Comment.findById(parentId);
      if (!parent || String(parent.targetId) !== String(targetId)) {
        return res.status(404).json({ error: 'Comentario padre no encontrado' });
      }
    }

    const comment = await Comment.create({
      targetType,
      targetId,
      member: req.user._id,
      text,
      // Solo un nivel de hilo: la respuesta a una respuesta cuelga de la raíz.
      parentId: parent ? (parent.parentId || parent._id) : null
    });
    res.status(201).json(await comment.populate('member', 'name avatar'));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/comments/:id  → propio o admin; borra también sus respuestas.
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });

    const isOwner = String(comment.member) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo puedes borrar tus comentarios' });
    }

    await Comment.deleteMany({ $or: [{ _id: comment._id }, { parentId: comment._id }] });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
