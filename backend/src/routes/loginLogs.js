import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { LoginLog } from '../models/LoginLog.js';

const router = Router();

router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    const logs = await LoginLog.find().sort({ at: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
