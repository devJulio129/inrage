import { Workout } from '../models/Workout.js';
// Los comentarios de WOD ahora viven en la colección unificada `comments`
// (targetType 'workout'); estos controllers delegan ahí para que el panel
// admin siga funcionando con las mismas URLs.
import { Comment } from '../models/Comment.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// GET /api/workouts/today  (only approved/active members)
export async function getTodayWorkout(req, res, next) {
  try {
    // Athletes must be approved by an admin before they can see the WOD.
    // Only block accounts explicitly marked 'pending' (new self-registrations);
    // legacy members without a status keep their access.
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({
        error: 'pending_approval',
        message: 'Tu cuenta está pendiente de aprobación por el gimnasio.'
      });
    }

    const workout = await Workout.findOne({
      date: { $gte: startOfDay(), $lte: endOfDay() }
    }).sort({ createdAt: -1 });

    if (!workout) {
      return res.status(404).json({ error: 'No hay WOD programado para hoy' });
    }
    res.json(workout);
  } catch (err) {
    next(err);
  }
}

// GET /api/workouts/recent  (members) — past WODs (excluding today) so
// athletes can review previous sessions and their comments.
export async function getRecentWorkouts(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({
        error: 'pending_approval',
        message: 'Tu cuenta está pendiente de aprobación por el gimnasio.'
      });
    }
    const since = new Date(Date.now() - 30 * 86_400_000);
    const workouts = await Workout.find({
      date: { $gte: since, $lt: startOfDay() }
    })
      .sort({ date: -1 })
      .limit(10);
    res.json(workouts);
  } catch (err) {
    next(err);
  }
}

// GET /api/workouts/range?from=ISO&to=ISO  (members) — WODs en un rango de
// fechas, INCLUYENDO los programados a futuro. Lo usa el calendario de la app
// para marcar qué días tuvieron/tendrán WOD. Devuelve el doc completo para que
// al tocar un día se muestre sin otra petición.
export async function getWorkoutsRange(req, res, next) {
  try {
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({
        error: 'pending_approval',
        message: 'Tu cuenta está pendiente de aprobación por el gimnasio.'
      });
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: 'from y to (fechas ISO) son obligatorios' });
    }
    if (to < from || to - from > 92 * 86_400_000) {
      return res.status(400).json({ error: 'Rango inválido (máximo ~3 meses)' });
    }

    const workouts = await Workout.find({
      date: { $gte: startOfDay(from), $lte: endOfDay(to) }
    }).sort({ date: 1 });
    res.json(workouts);
  } catch (err) {
    next(err);
  }
}

// GET /api/workouts  (admin) — recent workouts
export async function listWorkouts(req, res, next) {
  try {
    const workouts = await Workout.find().sort({ date: -1 }).limit(30);
    res.json(workouts);
  } catch (err) {
    next(err);
  }
}

// POST /api/workouts  (admin) — set/replace the WOD for a given day (default today).
// Upserts so there is only one WOD per day.
export async function upsertWorkout(req, res, next) {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'title y description son obligatorios' });
    }

    const day = req.body.date ? new Date(req.body.date) : new Date();

    const workout = await Workout.findOneAndUpdate(
      { date: { $gte: startOfDay(day), $lte: endOfDay(day) } },
      {
        $set: {
          title,
          description,
          date: startOfDay(day),
          createdBy: req.user?._id
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(workout);
  } catch (err) {
    next(err);
  }
}

// PUT /api/workouts/:id  (admin)
export async function updateWorkout(req, res, next) {
  try {
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.description !== undefined) update.description = req.body.description;
    if (req.body.date !== undefined) update.date = startOfDay(new Date(req.body.date));

    const workout = await Workout.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!workout) return res.status(404).json({ error: 'WOD no encontrado' });
    res.json(workout);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/workouts/:id  (admin)
export async function deleteWorkout(req, res, next) {
  try {
    const workout = await Workout.findByIdAndDelete(req.params.id);
    if (!workout) return res.status(404).json({ error: 'WOD no encontrado' });
    await Comment.deleteMany({ targetType: 'workout', targetId: workout._id });
    res.json({ message: 'WOD eliminado' });
  } catch (err) {
    next(err);
  }
}

// ── WOD comments ──────────────────────────────────────────────────
// The avatar travels with each comment so the app can show the member's
// photo without extra round-trips. Avatars are stored small (≤256px).

// GET /api/workouts/:id/comments  (lo usa el panel admin)
export async function listComments(req, res, next) {
  try {
    const comments = await Comment.find({ targetType: 'workout', targetId: req.params.id })
      .sort({ createdAt: 1 })
      .populate('member', 'name avatar')
      .lean();
    res.json(comments);
  } catch (err) {
    next(err);
  }
}

// POST /api/workouts/:id/comments  — body: { text }
export async function addComment(req, res, next) {
  try {
    // Pending accounts can't see the WOD, so they can't comment on it either.
    if (req.user.role !== 'admin' && req.user.status === 'pending') {
      return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación.' });
    }

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    if (text.length > 500) return res.status(400).json({ error: 'Máximo 500 caracteres' });

    const workout = await Workout.findById(req.params.id);
    if (!workout) return res.status(404).json({ error: 'WOD no encontrado' });

    const comment = await Comment.create({
      targetType: 'workout',
      targetId: workout._id,
      member: req.user._id,
      text
    });
    const populated = await comment.populate('member', 'name avatar');
    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/workouts/:id/comments/:commentId — own comment, or admin.
export async function deleteComment(req, res, next) {
  try {
    const comment = await Comment.findById(req.params.commentId);
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
}
