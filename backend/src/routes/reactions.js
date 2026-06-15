import { Router } from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/authMiddleware.js';
import { Reaction, REACTION_TYPES, REACTION_TARGETS } from '../models/Reaction.js';

const router = Router();

// Construye { [targetId]: { counts: {type:n}, total, mine } } para un set de ids.
async function summarize(targetType, ids, memberId) {
  const objIds = ids
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const out = {};
  for (const id of ids) out[id] = { counts: {}, total: 0, mine: null };
  if (objIds.length === 0) return out;

  const rows = await Reaction.aggregate([
    { $match: { targetType, targetId: { $in: objIds } } },
    { $group: { _id: { targetId: '$targetId', type: '$type' }, n: { $sum: 1 } } }
  ]);
  for (const r of rows) {
    const key = String(r._id.targetId);
    if (!out[key]) out[key] = { counts: {}, total: 0, mine: null };
    out[key].counts[r._id.type] = r.n;
    out[key].total += r.n;
  }

  const mine = await Reaction.find({ targetType, targetId: { $in: objIds }, member: memberId })
    .select('targetId type')
    .lean();
  for (const m of mine) {
    const key = String(m.targetId);
    if (out[key]) out[key].mine = m.type;
  }
  return out;
}

// POST /api/reactions/summary  — body { targetType, ids: [] }
// Conteos + mi reacción para varios elementos de un jalón (lo usa cada lista).
router.post('/summary', protect, async (req, res, next) => {
  try {
    const { targetType, ids } = req.body;
    if (!REACTION_TARGETS.includes(targetType) || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    res.json(await summarize(targetType, ids.slice(0, 100), req.user._id));
  } catch (err) {
    next(err);
  }
});

// GET /api/reactions/who?targetType=&targetId=  — quién reaccionó y con qué.
router.get('/who', protect, async (req, res, next) => {
  try {
    const { targetType, targetId } = req.query;
    if (!REACTION_TARGETS.includes(targetType) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const rows = await Reaction.find({ targetType, targetId })
      .sort({ createdAt: 1 })
      .populate('member', 'name avatar')
      .lean();
    res.json(rows.map((r) => ({
      type: r.type,
      name: r.member?.name || 'Atleta',
      avatar: r.member?.avatar || null
    })));
  } catch (err) {
    next(err);
  }
});

// PUT /api/reactions  — body { targetType, targetId, type }
// Alterna: misma reacción = la quita; distinta = la cambia; ninguna = la crea.
router.put('/', protect, async (req, res, next) => {
  try {
    const { targetType, targetId, type } = req.body;
    if (!REACTION_TARGETS.includes(targetType) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Elemento inválido' });
    }
    if (!REACTION_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Reacción inválida' });
    }

    const existing = await Reaction.findOne({ targetType, targetId, member: req.user._id });
    if (existing && existing.type === type) {
      await existing.deleteOne(); // toggle off
    } else if (existing) {
      existing.type = type;
      await existing.save();
    } else {
      await Reaction.create({ targetType, targetId, member: req.user._id, type });
    }

    const summary = await summarize(targetType, [String(targetId)], req.user._id);
    res.json(summary[String(targetId)]);
  } catch (err) {
    next(err);
  }
});

export default router;
