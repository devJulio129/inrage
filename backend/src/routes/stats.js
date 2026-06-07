import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { getStats } from '../controllers/statsControllers.js';

const router = Router();

router.get('/', protect, adminOnly, getStats);

export default router;
