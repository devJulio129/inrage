import { Router } from 'express';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Member } from '../models/Member.js';
import { LoginLog } from '../models/LoginLog.js';
import { protect } from '../middleware/authMiddleware.js';
import { verifyAppleToken } from '../services/appleAuth.js';
import { emailService } from '../services/email.js';
import { serializeMembership } from '../services/memberships.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORGOT_PASSWORD_MESSAGE = 'Si el correo existe, enviaremos instrucciones para restablecer tu contrasena.';
const RESET_EXPIRES_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeTokenEquals(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function makeResetUrl(email, token) {
  const base = (
    process.env.APP_PUBLIC_URL ||
    process.env.ADMIN_PUBLIC_URL ||
    process.env.PUBLIC_WEB_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '');
  const params = new URLSearchParams({ email, token });
  return `${base}/reset-password?${params.toString()}`;
}

function findMemberByEmail(email) {
  return Member.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
}

// Checks that the email's domain exists and can receive mail (MX lookup) —
// catches typos like "gmial.com" WITHOUT sending anything to the address.
// Fails open on our own network errors so signups never break by accident.
async function emailDomainExists(email) {
  const domain = email.split('@')[1];
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
    const a = await dns.resolve(domain).catch(() => []);
    return a.length > 0;
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return false;
    return true;
  }
}

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

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (EMAIL_RE.test(email)) {
      const member = await findMemberByEmail(email);
      if (member) {
        const tempPassword = `IR-${crypto.randomBytes(9).toString('base64url')}`;
        const resetToken = crypto.randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + RESET_EXPIRES_MINUTES * 60_000);

        member.passwordReset = {
          tempPasswordHash: await bcrypt.hash(tempPassword, 10),
          tempPasswordExpiresAt: expiresAt,
          resetTokenHash: hashResetToken(resetToken),
          resetTokenExpiresAt: expiresAt,
          mustChangePassword: true,
          requestedAt: new Date()
        };
        await member.save();

        const resetUrl = makeResetUrl(member.email || email, resetToken);
        try {
          await emailService.sendPasswordResetEmail({
            to: member.email || email,
            name: member.name,
            tempPassword,
            resetUrl,
            expiresMinutes: RESET_EXPIRES_MINUTES
          });
        } catch (err) {
          console.error('[auth] password reset email failed', {
            code: err.code || 'EMAIL_SEND_FAILED',
            provider: err.provider || null,
            message: err.message
          });
          return res.status(err.status || 502).json({ error: err.message || 'Email provider rejected message' });
        }
      }
    }

    res.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || '').trim();
    const tempPassword = String(req.body?.tempPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!EMAIL_RE.test(email) || !token || !tempPassword) {
      return res.status(400).json({ error: 'Token o contrasena provisional invalidos' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 6 caracteres' });
    }

    const member = await findMemberByEmail(email);
    const reset = member?.passwordReset;
    const now = new Date();
    const tokenHash = hashResetToken(token);

    const resetValid = Boolean(
      member &&
      reset?.resetTokenHash &&
      reset?.tempPasswordHash &&
      !reset.usedAt &&
      reset.resetTokenExpiresAt &&
      reset.tempPasswordExpiresAt &&
      new Date(reset.resetTokenExpiresAt) > now &&
      new Date(reset.tempPasswordExpiresAt) > now &&
      safeTokenEquals(reset.resetTokenHash, tokenHash)
    );
    if (!resetValid) {
      return res.status(400).json({ error: 'Token o contrasena provisional invalidos o expirados' });
    }

    const tempMatches = await bcrypt.compare(tempPassword, reset.tempPasswordHash);
    if (!tempMatches) {
      return res.status(400).json({ error: 'Token o contrasena provisional invalidos o expirados' });
    }

    member.password = await bcrypt.hash(newPassword, 10);
    member.passwordReset = undefined;
    await member.save();

    res.json({ ok: true, message: 'Contrasena actualizada' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, password, phone, birthDate, gender } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Escribe un correo válido' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!(await emailDomainExists(email))) {
      return res.status(400).json({ error: 'El dominio del correo no existe — revisa que esté bien escrito' });
    }

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
    const { password } = req.body;
    const email = (req.body.email || '').trim().toLowerCase();

    // Legacy accounts may have been stored with uppercase letters.
    const member = await Member.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
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
        googleId: payload.sub,
        password: randomPass,
        phone: 'N/A',
        birthDate: new Date('2000-01-01'),
        gender: 'prefer_not_to_say'
      });
    } else if (!member.googleId && payload.sub) {
      member.googleId = payload.sub;
      await member.save();
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

// Construye el nombre a partir del objeto fullName que Apple SOLO entrega en el
// primer inicio de sesión (después llega vacío). Por eso lo guardamos al crear.
function appleName(fullName, email) {
  const parts = [fullName?.givenName, fullName?.familyName].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  return (email || '').split('@')[0] || 'Atleta';
}

// POST /api/auth/apple
// Recibe el identityToken de "Sign in with Apple" (iOS), lo verifica contra las
// llaves de Apple y registra/loguea al atleta. Apple solo manda nombre y correo
// la PRIMERA vez, así que el cliente los reenvía y aquí se guardan al crear.
router.post('/apple', async (req, res, next) => {
  try {
    const { identityToken, fullName } = req.body;
    if (!identityToken) return res.status(400).json({ error: 'Falta identityToken' });

    // El `aud` del token nativo es el bundle ID de la app. Configurable por si
    // se agrega un Services ID (web) en el futuro (lista separada por comas).
    const audiences = (process.env.APPLE_CLIENT_ID || 'com.devjulio129.inrage')
      .split(',').map((s) => s.trim()).filter(Boolean);

    let payload;
    try {
      payload = await verifyAppleToken(identityToken, audiences);
    } catch (err) {
      return res.status(401).json({ error: 'Token de Apple inválido' });
    }

    const appleId = payload.sub;
    const email = (payload.email || req.body.email || '').toLowerCase();

    // Enlaza por appleId (estable) o por correo si ya existía la cuenta.
    let member = await Member.findOne(
      email ? { $or: [{ appleId }, { email }] } : { appleId }
    );

    if (!member) {
      if (!email) return res.status(400).json({ error: 'La cuenta de Apple no compartió un correo' });
      const randomPass = await bcrypt.hash(`apple:${appleId}:${Date.now()}`, 10);
      member = await Member.create({
        name: appleName(fullName, email),
        email,
        appleId,
        password: randomPass,
        phone: 'N/A',
        birthDate: new Date('2000-01-01'),
        gender: 'prefer_not_to_say'
      });
    } else if (!member.appleId) {
      member.appleId = appleId;
      await member.save();
    }

    const token = jwt.sign({ id: member._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    logAccess(member, 'apple', req);

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
  const user = req.user.toObject ? req.user.toObject() : req.user;
  delete user.pushTokens;
  res.json({ ...user, membership: serializeMembership(req.user) });
});

// PATCH /api/auth/avatar  — guarda el avatar (data-URI base64) del usuario.
router.patch('/avatar', protect, async (req, res, next) => {
  try {
    const { avatar } = req.body;
    // Solo imágenes reales y de tamaño razonable (la app la reduce a 256px;
    // 300 KB de data-URI ≈ 220 KB de imagen). Evita inflar la base de datos.
    if (typeof avatar !== 'string' || !avatar.startsWith('data:image/') || avatar.length > 300_000) {
      return res.status(400).json({ error: 'Imagen inválida — intenta con otra foto' });
    }
    await Member.findByIdAndUpdate(req.user._id, { avatar });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
