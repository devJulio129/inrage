import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { ClassTemplate } from '../models/ClassTemplate.js';
import { GymClass } from '../models/GymClass.js';
import { gymTodayUTC } from '../services/classSchedule.js';
import { branchFilter, normalizeBranch } from '../services/branches.js';

const router = Router();

// GET /api/class-templates — el horario semanal (todas las franjas).
// Lo leen el panel (para editarlo) y la app (para mostrar qué días/horas hay
// clase), así que basta con estar autenticado.
router.get('/', protect, async (_req, res, next) => {
  try {
    const slots = await ClassTemplate.find()
      .sort({ weekday: 1, branch: 1, time: 1 })
      .lean();
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

// POST /api/class-templates  (admin) — agrega una franja al horario semanal.
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const { weekday, time, name, description } = req.body;
    const capacity = Number(req.body.capacity);
    const wd = Number(weekday);

    if (!Number.isInteger(wd) || wd < 0 || wd > 6) {
      return res.status(400).json({ error: 'Día de la semana inválido' });
    }
    if (!time || !/^\d{1,2}:\d{2}$/.test(String(time).trim())) {
      return res.status(400).json({ error: 'Hora inválida — usa formato HH:MM' });
    }
    if (!capacity || capacity < 1) {
      return res.status(400).json({ error: 'El cupo es obligatorio' });
    }

    const slot = await ClassTemplate.create({
      weekday: wd,
      time: String(time).trim(),
      branch: branchFilter(req.body.branch) || normalizeBranch(req.body.branch),
      name: (name || 'CrossFit').trim(),
      description: (description || '').trim(),
      capacity: Math.min(capacity, 100)
    });
    res.status(201).json(slot);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/class-templates/:id  (admin) — quita una franja del horario.
// Limpia además las clases futuras que generó y que NADIE reservó todavía
// (las que sí tienen reservas se conservan; el coach las cancela a mano si hace falta).
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const slot = await ClassTemplate.findByIdAndDelete(req.params.id);
    if (!slot) return res.status(404).json({ error: 'Franja no encontrada' });

    const removed = await GymClass.deleteMany({
      template: slot._id,
      date: { $gte: gymTodayUTC() },
      reservations: { $size: 0 }
    });

    res.json({ ok: true, removedClasses: removed.deletedCount || 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
