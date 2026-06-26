import { Attendance } from '../models/Attendance.js';
import { Member } from '../models/Member.js';
import { PR } from '../models/PR.js';
import { effectiveStreak, gymDayStr } from './gymTime.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BIO_LENGTH = 300;
const MAX_FEATURED_PRS = 6;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyName(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
  return slug || 'atleta';
}

export function isSafeSlug(value) {
  const slug = String(value || '');
  return slug.length >= 3 && slug.length <= 60 && SLUG_RE.test(slug);
}

export function normalizePublicProfile(profile = {}) {
  return {
    enabled: Boolean(profile?.enabled),
    slug: profile?.slug || '',
    bio: profile?.bio || '',
    avatarUrl: profile?.avatarUrl || '',
    coverUrl: profile?.coverUrl || '',
    showAttendanceStats: profile?.showAttendanceStats !== false,
    showPrs: profile?.showPrs !== false,
    showBadges: profile?.showBadges !== false,
    featuredPrs: Array.isArray(profile?.featuredPrs) ? profile.featuredPrs.slice(0, MAX_FEATURED_PRS) : [],
    createdAt: profile?.createdAt || null,
    updatedAt: profile?.updatedAt || null
  };
}

export function publicProfileUrl(slug) {
  if (!slug) return null;
  const base = process.env.PUBLIC_WEB_URL
    || process.env.ADMIN_WEB_URL
    || String(process.env.CORS_ORIGIN || '').split(',')[0].trim();
  const path = `/athlete/${slug}`;
  return base ? `${base.replace(/\/+$/, '')}${path}` : path;
}

export async function ensureUniqueSlug(baseSlug, { memberId } = {}) {
  const base = slugifyName(baseSlug);
  let candidate = base;
  let suffix = 2;

  while (suffix < 1000) {
    const filter = { 'publicProfile.slug': candidate };
    if (memberId) filter._id = { $ne: memberId };
    const existing = await Member.findOne(filter).select('_id').lean();
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${random}`;
}

export function consistencyLevel(visitsLast30Days) {
  if (visitsLast30Days <= 0) return 'inactive';
  if (visitsLast30Days <= 3) return 'starting';
  if (visitsLast30Days <= 8) return 'consistent';
  if (visitsLast30Days <= 15) return 'strong';
  return 'elite';
}

export async function calculatePublicConsistency(member, now = new Date()) {
  const from30 = new Date(now.getTime() - 30 * DAY_MS);
  const from7 = new Date(now.getTime() - 7 * DAY_MS);
  const rows = await Attendance.find({
    member: member._id,
    checkIn: { $gte: from30, $lte: now }
  }).select('checkIn').lean();

  const visitsLast30Days = rows.length;
  const visitsLast7Days = rows.filter((row) => new Date(row.checkIn) >= from7).length;
  const lastVisitAt = rows.reduce((latest, row) => {
    const value = row.checkIn ? new Date(row.checkIn) : null;
    if (!value || Number.isNaN(value.getTime())) return latest;
    return !latest || value > latest ? value : latest;
  }, null);
  const score = Math.min(100, Math.round((visitsLast30Days / 16) * 100));

  return {
    level: consistencyLevel(visitsLast30Days),
    score,
    visitsLast7Days,
    visitsLast30Days,
    currentStreak: effectiveStreak(member, gymDayStr(now)),
    lastVisitAt
  };
}

function serializePr(pr) {
  return {
    id: pr._id,
    movement: pr.movement,
    name: pr.movement,
    value: pr.value,
    unit: pr.unit,
    date: pr.setAt || null
  };
}

export async function getFeaturedPublicPrs(member, profile) {
  if (profile.showPrs === false) return [];

  const ids = Array.isArray(profile.featuredPrs)
    ? profile.featuredPrs.filter(Boolean).slice(0, MAX_FEATURED_PRS)
    : [];
  const query = ids.length
    ? { member: member._id, _id: { $in: ids } }
    : { member: member._id };
  const rows = await PR.find(query).sort({ setAt: -1 }).limit(MAX_FEATURED_PRS).lean();
  return rows.map(serializePr);
}

export function buildPublicBadges(consistency, prs) {
  const badges = [];
  if ((consistency?.visitsLast7Days || 0) > 0) badges.push({ id: 'active-athlete', label: 'Atleta activo' });
  if ((consistency?.visitsLast30Days || 0) >= 8) badges.push({ id: 'consistent', label: 'Constante' });
  if ((consistency?.visitsLast30Days || 0) >= 16) badges.push({ id: 'elite', label: 'Elite' });
  if ((prs?.length || 0) > 0) badges.push({ id: 'pr-hunter', label: 'PR Hunter' });
  return badges;
}

export async function buildPublicAthletePayload(member, now = new Date()) {
  const profile = normalizePublicProfile(member.publicProfile);
  if (!profile.enabled || !profile.slug) return null;

  const [consistency, featuredPrs] = await Promise.all([
    profile.showAttendanceStats ? calculatePublicConsistency(member, now) : Promise.resolve(null),
    getFeaturedPublicPrs(member, profile)
  ]);

  return {
    id: member._id,
    name: member.name,
    slug: profile.slug,
    bio: profile.bio || '',
    avatarUrl: profile.avatarUrl || member.avatar || null,
    coverUrl: profile.coverUrl || null,
    joinedAt: member.joinedAt || null,
    consistency,
    badges: profile.showBadges ? buildPublicBadges(consistency, featuredPrs) : [],
    featuredPrs
  };
}

export function serializeOwnPublicProfile(member) {
  const profile = normalizePublicProfile(member.publicProfile);
  return {
    ...profile,
    publicUrl: profile.slug ? publicProfileUrl(profile.slug) : null
  };
}

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length > maxLength) {
    const err = new Error(`Maximo ${maxLength} caracteres`);
    err.status = 400;
    throw err;
  }
  return text;
}

function cleanOptionalUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 1000) {
    const err = new Error(`${label} demasiado largo`);
    err.status = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(text) && !/^data:image\//i.test(text)) {
    const err = new Error(`${label} debe ser una URL valida`);
    err.status = 400;
    throw err;
  }
  return text;
}

export async function applyPublicProfilePatch(member, body = {}) {
  if (!member.publicProfile) {
    member.publicProfile = {
      enabled: false,
      showAttendanceStats: true,
      showPrs: true,
      showBadges: true,
      featuredPrs: [],
      createdAt: new Date()
    };
  }

  const profile = member.publicProfile;
  if ('enabled' in body) profile.enabled = Boolean(body.enabled);
  if ('bio' in body) profile.bio = cleanText(body.bio, MAX_BIO_LENGTH);
  if ('avatarUrl' in body) profile.avatarUrl = cleanOptionalUrl(body.avatarUrl, 'avatarUrl');
  if ('coverUrl' in body) profile.coverUrl = cleanOptionalUrl(body.coverUrl, 'coverUrl');
  if ('showAttendanceStats' in body) profile.showAttendanceStats = Boolean(body.showAttendanceStats);
  if ('showPrs' in body) profile.showPrs = Boolean(body.showPrs);
  if ('showBadges' in body) profile.showBadges = Boolean(body.showBadges);
  if ('featuredPrs' in body) {
    if (!Array.isArray(body.featuredPrs)) {
      const err = new Error('featuredPrs debe ser una lista');
      err.status = 400;
      throw err;
    }
    if (body.featuredPrs.length > MAX_FEATURED_PRS) {
      const err = new Error(`featuredPrs permite maximo ${MAX_FEATURED_PRS}`);
      err.status = 400;
      throw err;
    }
    profile.featuredPrs = body.featuredPrs.map((id) => String(id).trim()).filter(Boolean);
  }

  if ('slug' in body) {
    const rawSlug = String(body.slug || '').trim();
    if (!rawSlug) {
      profile.slug = undefined;
    } else {
      const requested = slugifyName(rawSlug);
      if (!isSafeSlug(requested)) {
        const err = new Error('Slug invalido');
        err.status = 400;
        throw err;
      }
      const existing = await Member.findOne({
        'publicProfile.slug': requested,
        _id: { $ne: member._id }
      }).select('_id').lean();
      if (existing) {
        const err = new Error('Slug no disponible');
        err.status = 409;
        throw err;
      }
      profile.slug = requested;
    }
  }

  if (profile.enabled && !profile.slug) {
    profile.slug = await ensureUniqueSlug(member.name, { memberId: member._id });
  }

  profile.updatedAt = new Date();
  await member.save();
  return serializeOwnPublicProfile(member);
}

export async function buildAdminPublicProfileRow(member, now = new Date()) {
  const profile = normalizePublicProfile(member.publicProfile);
  const consistency = await calculatePublicConsistency(member, now);
  return {
    id: member._id,
    name: member.name,
    slug: profile.slug || '',
    enabled: profile.enabled,
    publicUrl: profile.slug ? publicProfileUrl(profile.slug) : null,
    visitsLast30Days: consistency.visitsLast30Days,
    consistencyLevel: consistency.level
  };
}
