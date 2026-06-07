import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { PR } from '../models/PR.js';

const router = Router();

// GET /api/prs — récords del usuario autenticado.
router.get('/', protect, async (req, res, next) => {
  try {
    const prs = await PR.find({ member: req.user._id }).sort({ movement: 1 }).lean();
    res.json(prs);
  } catch (err) { next(err); }
});

// PUT /api/prs/:movement — crea o actualiza un PR.
router.put('/:movement', protect, async (req, res, next) => {
  try {
    const { value, unit } = req.body;
    const num = Number(value);
    if (!value || isNaN(num) || num <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const pr = await PR.findOneAndUpdate(
      { member: req.user._id, movement: req.params.movement },
      { value: num, unit: unit || 'kg', setAt: new Date() },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(pr);
  } catch (err) { next(err); }
});

// DELETE /api/prs/:movement — elimina el PR de ese movimiento.
router.delete('/:movement', protect, async (req, res, next) => {
  try {
    await PR.findOneAndDelete({ member: req.user._id, movement: req.params.movement });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
