import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { GymClass } from '../models/GymClass.js';

const router = Router();

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// GET /api/classes — clases de hoy a +7 días, con cupo y mi reserva.
// La ventana arranca un día atrás: el server vive en UTC y el gimnasio en
// UTC-6 — sin ese margen, las clases de la tarde desaparecerían a las 6pm.
// El cliente descarta los días ya pasados en SU zona horaria.
router.get('/', protect, async (req, res, next) => {
  try {
    const from = startOfDay();
    from.setDate(from.getDate() - 1);
    const to = new Date(from);
    to.setDate(to.getDate() + 9);

    const classes = await GymClass.find({ date: { $gte: from, $lt: to } })
      .populate('reservations.member', 'name')
      .sort({ date: 1, time: 1 })
      .lean();

    const me = String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    res.json(
      classes.map((c) => ({
        _id: c._id,
        date: c.date,
        time: c.time,
        name: c.name,
        capacity: c.capacity,
        reserved: c.reservations.length,
        spotsLeft: Math.max(0, c.capacity - c.reservations.length),
        mine: c.reservations.some((r) => String(r.member?._id || r.member) === me),
        // Solo el staff ve quién reservó.
        ...(isAdmin && { roster: c.reservations.map((r) => r.member?.name || '—') })
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/classes  (admin) — abre una clase con N lugares.
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const { date, time, name } = req.body;
    const capacity = Number(req.body.capacity);
    if (!date || !time || !capacity || capacity < 1) {
      return res.status(400).json({ error: 'Fecha, hora y cupo son obligatorios' });
    }
    if (!/^\d{1,2}:\d{2}$/.test(String(time).trim())) {
      return res.status(400).json({ error: 'Hora inválida — usa formato HH:MM' });
    }
    const day = new Date(`${String(date).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(day.getTime())) {
      return res.status(400).json({ error: 'Fecha inválida' });
    }
    const gymClass = await GymClass.create({
      date: day,
      time: String(time).trim(),
      name: (name || 'CrossFit').trim(),
      capacity: Math.min(capacity, 100)
    });
    res.status(201).json(gymClass);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/classes/:id  (admin)
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const gymClass = await GymClass.findByIdAndDelete(req.params.id);
    if (!gymClass) return res.status(404).json({ error: 'Clase no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/classes/:id/reserve — aparta tu lugar. La condición $expr hace el
// chequeo de cupo y el $push en UNA operación atómica: dos personas peleando
// por el último lugar nunca lo ganan las dos.
router.post('/:id/reserve', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación.' });
    }

    const updated = await GymClass.findOneAndUpdate(
      {
        _id: req.params.id,
        'reservations.member': { $ne: req.user._id },
        $expr: { $lt: [{ $size: '$reservations' }, '$capacity'] }
      },
      { $push: { reservations: { member: req.user._id } } },
      { new: true }
    );

    if (!updated) {
      const existing = await GymClass.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Clase no encontrada' });
      const mine = existing.reservations.some((r) => String(r.member) === String(req.user._id));
      if (mine) return res.status(409).json({ error: 'Ya tienes lugar en esta clase' });
      return res.status(409).json({ error: 'Clase llena — ya no hay lugares' });
    }

    res.json({ ok: true, spotsLeft: Math.max(0, updated.capacity - updated.reservations.length) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/classes/:id/reserve — cancela tu lugar.
router.delete('/:id/reserve', protect, async (req, res, next) => {
  try {
    const updated = await GymClass.findByIdAndUpdate(
      req.params.id,
      { $pull: { reservations: { member: req.user._id } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Clase no encontrada' });
    res.json({ ok: true, spotsLeft: Math.max(0, updated.capacity - updated.reservations.length) });
  } catch (err) {
    next(err);
  }
});

export default router;
