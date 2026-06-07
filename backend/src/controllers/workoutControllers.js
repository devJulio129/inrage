import { Workout } from '../models/Workout.js';

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
    res.json({ message: 'WOD eliminado' });
  } catch (err) {
    next(err);
  }
}
