import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Member } from '../models/Member.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, birthDate, gender } = req.body;

    const existing = await Member.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const member = await Member.create({
      name, email, password: hashedPassword, phone, birthDate, gender
    });

    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { _id: member._id, name: member.name, email: member.email, role: member.role }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const member = await Member.findOne({ email });
    if (!member) return res.status(404).json({ error: 'Email not found' });

    const match = await bcrypt.compare(password, member.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { _id: member._id, name: member.name, email: member.email, role: member.role }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

export default router;
