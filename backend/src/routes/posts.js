import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { Post } from '../models/Post.js';

const router = Router();

// GET /api/posts — el feed del gimnasio, lo más nuevo primero.
// Visible para cualquier cuenta logueada (también pendientes: es contenido
// educativo, igual que el aviso del día).
router.get('/', protect, async (req, res, next) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('createdBy', 'name')
      .lean();
    res.json(posts);
  } catch (err) {
    next(err);
  }
});

// POST /api/posts  (admin) — texto, imagen pequeña y/o link de video.
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    const videoUrl = (req.body.videoUrl || '').trim();
    const image = req.body.image;

    if (!body && !image && !videoUrl) {
      return res.status(400).json({ error: 'La publicación está vacía' });
    }
    if (image && (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > 400_000)) {
      return res.status(400).json({ error: 'Imagen inválida o demasiado pesada' });
    }
    if (videoUrl && !/^https?:\/\/\S+$/.test(videoUrl)) {
      return res.status(400).json({ error: 'El link del video debe empezar con http(s)://' });
    }

    const post = await Post.create({ title, body, image, videoUrl, createdBy: req.user._id });
    res.status(201).json(await post.populate('createdBy', 'name'));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id  (admin)
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const post = await Post.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
