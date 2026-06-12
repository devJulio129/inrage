import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Member } from '../models/Member.js';
import { LoginLog } from '../models/LoginLog.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Records an access event (login / register / google) so it shows up in the
// admin "Accesos" tab. Fire-and-forget — never blocks the auth response.
function logAccess(member, event, req) {
  LoginLog.create({
    member: member._id,
    name: member.name,
    email: member.email,
    role: member.role,
    event,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  }).catch(() => {});
}

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

    // New self-service account → show it in the admin history.
    logAccess(member, 'register', req);

    res.status(201).json({
      token,
      user: { _id: member._id, name: member.name, email: member.email, role: member.role, status: member.status }
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

    logAccess(member, 'login', req);

    res.json({
      token,
      user: { _id: member._id, name: member.name, email: member.email, role: member.role, status: member.status }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google
// Accepts a Google ID token from the mobile app, verifies it against Google,
// then logs the member in (creating the account on first sign-in).
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Falta idToken' });

    // Verify the token with Google (no extra dependency needed).
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!r.ok) return res.status(401).json({ error: 'Token de Google inválido' });
    const payload = await r.json();

    // If client IDs are configured, ensure the token was issued for our app.
    // Comma-separated list: the Android, iOS and Web OAuth clients each have
    // their own ID and the token's `aud` matches the one the app used.
    if (process.env.GOOGLE_CLIENT_ID) {
      const allowed = process.env.GOOGLE_CLIENT_ID.split(',').map((s) => s.trim()).filter(Boolean);
      if (!allowed.includes(payload.aud)) {
        return res.status(401).json({ error: 'Token de Google no autorizado para esta app' });
      }
    }

    const email = (payload.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'La cuenta de Google no tiene correo' });

    let member = await Member.findOne({ email });
    if (!member) {
      // Create a lightweight account for Google users.
      const randomPass = await bcrypt.hash(`google:${payload.sub}:${Date.now()}`, 10);
      member = await Member.create({
        name: payload.name || email.split('@')[0],
        email,
        password: randomPass,
        phone: 'N/A',
        birthDate: new Date('2000-01-01'),
        gender: 'prefer_not_to_say'
      });
    }

    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    logAccess(member, 'google', req);

    res.json({
      token,
      user: { _id: member._id, name: member.name, email: member.email, role: member.role, status: member.status }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json(req.user);
});

// PATCH /api/auth/avatar  — guarda el avatar (data-URI base64) del usuario.
router.patch('/avatar', protect, async (req, res, next) => {
  try {
    const { avatar } = req.body;
    await Member.findByIdAndUpdate(req.user._id, { avatar });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
