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

export async function getTodayWorkout(req, res, next) {
  try {
    const workout = await Workout.findOne({
      date: { $gte: startOfDay(), $lte: endOfDay() }
    }).sort({ createdAt: -1 });

    if (!workout) {
      return res.status(404).json({ error: 'No workout scheduled for today' });
    }
    res.json(workout);
  } catch (err) {
    next(err);
  }
}

export async function listWorkouts(req, res, next) {
  try {
    const workouts = await Workout.find().sort({ date: -1 }).limit(30);
    res.json(workouts);
  } catch (err) {
    next(err);
  }
}

export async function createWorkout(req, res, next) {
  try {
    const workout = await Workout.create(req.body);
    res.status(201).json(workout);
  } catch (err) {
    next(err);
  }
}
