import { Router } from 'express';
import {
  getTodayWorkout,
  listWorkouts,
  createWorkout
} from '../controllers/workoutController.js';

const router = Router();

router.get('/today', getTodayWorkout);
router.get('/', listWorkouts);
router.post('/', createWorkout);

export default router;
