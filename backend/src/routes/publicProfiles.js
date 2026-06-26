import { Router } from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import { Member } from '../models/Member.js';
import {
  applyPublicProfilePatch,
  buildAdminPublicProfileRow,
  buildPublicAthletePayload,
  serializeOwnPublicProfile
} from '../services/publicProfiles.js';

const router = Router();

router.get('/public/athletes/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const member = await Member.findOne({
      'publicProfile.slug': slug,
      'publicProfile.enabled': true
    }).select('name avatar joinedAt streak streakDay publicProfile').lean();

    if (!member) return res.status(404).json({ error: 'Perfil no encontrado' });
    const athlete = await buildPublicAthletePayload(member);
    if (!athlete) return res.status(404).json({ error: 'Perfil no encontrado' });
    res.json({ ok: true, athlete });
  } catch (err) {
    next(err);
  }
});

router.get('/me/public-profile', protect, (req, res) => {
  res.json({ ok: true, publicProfile: serializeOwnPublicProfile(req.user) });
});

router.patch('/me/public-profile', protect, async (req, res, next) => {
  try {
    const member = await Member.findById(req.user._id);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });
    const publicProfile = await applyPublicProfilePatch(member, req.body || {});
    res.json({ ok: true, publicProfile });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/public-profiles', protect, adminOnly, async (_req, res, next) => {
  try {
    const members = await Member.find({ role: { $ne: 'admin' } })
      .select('name publicProfile streak streakDay')
      .sort({ name: 1 })
      .lean();
    const profiles = await Promise.all(members.map((member) => buildAdminPublicProfileRow(member)));
    res.json({ ok: true, profiles });
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/public-profiles/:memberId', protect, adminOnly, async (req, res, next) => {
  try {
    const member = await Member.findById(req.params.memberId);
    if (!member) return res.status(404).json({ error: 'Miembro no encontrado' });

    await applyPublicProfilePatch(member, { enabled: Boolean(req.body?.enabled) });
    const row = await buildAdminPublicProfileRow(member);
    res.json({ ok: true, profile: row });
  } catch (err) {
    next(err);
  }
});

export default router;
