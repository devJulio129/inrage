import 'dotenv/config';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Member } from '../models/Member.js';
import { Notification } from '../models/Notification.js';
import { LoginLog } from '../models/LoginLog.js';
import {
  resolveMembershipStatus,
  runMembershipReminders,
  serializeMemberMembership,
  summarizeMemberships
} from '../services/memberships.js';
import { gymDayStr } from '../services/gymTime.js';

const AUTO_REMINDER_TYPES = [
  'membership_expiring_7_days',
  'membership_expiring_1_day',
  'membership_expired'
];
const allowWrite = process.env.SPRINT4_SMOKE_ALLOW_WRITE === 'true';
const target = String(process.env.SPRINT4_SMOKE_TARGET || '').toLowerCase();
const confirmDb = String(process.env.SPRINT4_SMOKE_CONFIRM_DB || '');
const keepData = process.env.SPRINT4_SMOKE_KEEP_DATA === 'true';
const apiUrl = String(process.env.SPRINT4_SMOKE_API_URL || '').replace(/\/+$/, '');
const adminToken = String(process.env.SPRINT4_SMOKE_ADMIN_TOKEN || '');
const configuredMongoTimeoutMs = Number.parseInt(process.env.SPRINT4_SMOKE_MONGO_TIMEOUT_MS || '8000', 10);
const mongoTimeoutMs = Number.isFinite(configuredMongoTimeoutMs) && configuredMongoTimeoutMs > 0
  ? configuredMongoTimeoutMs
  : 8000;
const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  + crypto.randomBytes(3).toString('hex');
const marker = `sprint4-smoke-${runId}`;
const password = `Smoke-${crypto.randomBytes(8).toString('hex')}!`;
const createdMemberIds = [];
const createdEmails = [];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function result(label, value) {
  console.log(`[smoke:s4] ${label}:`, value);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeMongoFast() {
  const closePromise = mongoose.connection.readyState === 0
    ? Promise.resolve()
    : mongoose.connection.close(true);
  await Promise.race([
    closePromise.catch(() => {}),
    wait(1000)
  ]);
}

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@');
  }
}

function isLocalMongoUri(uri) {
  return /^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(uri);
}

function getDatabaseNameFromMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  } catch {
    const uriWithoutQuery = uri.split('?')[0];
    const match = uriWithoutQuery.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?[^/]+\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }
}

async function connectToMongo(uri) {
  result('Conectando MongoDB', `${redactMongoUri(uri)} (timeout ${mongoTimeoutMs}ms)`);
  let timeoutId;
  try {
    const connectPromise = mongoose.connect(uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: mongoTimeoutMs,
      connectTimeoutMS: mongoTimeoutMs
    });
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        closeMongoFast().catch(() => {});
        reject(new Error(`timeout manual despues de ${mongoTimeoutMs}ms`));
      }, mongoTimeoutMs);
    });
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (err) {
    const nextStep = isLocalMongoUri(uri)
      ? 'Tu MONGODB_URI apunta a Mongo local. Inicia MongoDB local o reemplazalo por el MONGODB_URI de staging.'
      : 'Revisa que la URI, credenciales, VPN/IP allowlist y cluster de staging esten disponibles.';
    throw new Error(`No se pudo conectar a MongoDB en ${mongoTimeoutMs}ms. ${nextStep} Detalle: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function gymCalendarDate(now, offsetDays) {
  const [year, month, day] = gymDayStr(now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays));
}

function membershipCase(name, suffix, membership) {
  const email = `${marker}-${suffix}@example.invalid`;
  createdEmails.push(email);
  return {
    name: `[SMOKE S4 ${runId}] ${name}`,
    email,
    password: null,
    phone: '0000000000',
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
    gender: 'prefer_not_to_say',
    role: 'athlete',
    status: 'active',
    joinedAt: new Date(),
    ...(membership ? { membership } : {})
  };
}

async function collectionExists(name) {
  return mongoose.connection.db.listCollections({ name }, { nameOnly: true }).hasNext();
}

async function inspectReminderIndex() {
  const collectionName = Notification.collection.collectionName;
  const exists = await collectionExists(collectionName);
  if (!exists) {
    return { collectionName, collectionExists: false, index: null, duplicates: [], invalidKeys: [] };
  }

  const collection = mongoose.connection.db.collection(collectionName);
  const [indexes, duplicates, invalidKeys] = await Promise.all([
    collection.indexes(),
    collection.aggregate([
      { $match: { reminderKey: { $exists: true } } },
      { $group: { _id: '$reminderKey', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 }
    ]).toArray(),
    collection.find({
      reminderKey: { $exists: true },
      $or: [
        { reminderKey: null },
        { reminderKey: '' },
        { reminderKey: { $not: { $type: 'string' } } }
      ]
    }, { projection: { _id: 1, reminderKey: 1, type: 1, member: 1 } }).limit(20).toArray()
  ]);
  const index = indexes.find((item) =>
    item.key?.reminderKey === 1 && Object.keys(item.key).length === 1) || null;
  return { collectionName, collectionExists: true, index, duplicates, invalidKeys };
}

async function ensureReminderIndex(preflight) {
  check(preflight.duplicates.length === 0,
    `Hay ${preflight.duplicates.length} reminderKey duplicados. No se puede crear el indice.`);
  check(preflight.invalidKeys.length === 0,
    `Hay ${preflight.invalidKeys.length} reminderKey nulos, vacios o no-string. Revisa esos documentos.`);

  if (preflight.index) {
    check(preflight.index.unique === true && preflight.index.sparse === true,
      `Existe un indice reminderKey incompatible: ${JSON.stringify(preflight.index)}`);
    result('Indice reminderKey', `OK (${preflight.index.name}, unique+sparse)`);
    return;
  }

  if (!preflight.collectionExists) {
    await mongoose.connection.db.createCollection(preflight.collectionName);
  }
  const indexName = await mongoose.connection.db.collection(preflight.collectionName).createIndex(
    { reminderKey: 1 },
    { unique: true, sparse: true, name: 'reminderKey_1' }
  );
  result('Indice reminderKey creado', indexName);
}

async function apiRequest(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  check(response.ok, `${method} ${path} fallo (${response.status}): ${payload.error || payload.message || 'sin detalle'}`);
  return payload;
}

async function verifyApi(smokeMembers) {
  if (!apiUrl) {
    result('API checks', 'omitidos; define SPRINT4_SMOKE_API_URL para ejecutarlos');
    return;
  }

  const legacy = smokeMembers.find((member) => !member.membership);
  const expiring = smokeMembers.find((member) => member.email.includes('-expires7@'));
  const legacyLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: legacy.email, password }
  });
  const legacyMe = await apiRequest('/api/auth/me', { token: legacyLogin.token });
  check(legacyMe.membership?.status === 'inactive', 'GET /auth/me no normalizo al miembro sin membership.');
  const legacyNotifications = await apiRequest('/api/notifications', { token: legacyLogin.token });
  check(Array.isArray(legacyNotifications.notifications), 'GET /notifications no regreso una lista.');

  const expiringLogin = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email: expiring.email, password }
  });
  const expiringNotifications = await apiRequest('/api/notifications', { token: expiringLogin.token });
  check(expiringNotifications.notifications.length === 1,
    'El atleta por vencer no recibio exactamente una notificacion.');
  const unread = expiringNotifications.notifications[0];
  await apiRequest(`/api/notifications/${unread._id}/read`, {
    token: expiringLogin.token,
    method: 'PATCH'
  });
  const afterRead = await apiRequest('/api/notifications', { token: expiringLogin.token });
  check(afterRead.unread === 0, 'Marcar notificacion como leida no actualizo unread.');

  if (adminToken) {
    const query = encodeURIComponent(marker);
    const [overview, memberships, business, risk] = await Promise.all([
      apiRequest('/api/admin/memberships/overview', { token: adminToken }),
      apiRequest(`/api/admin/memberships?search=${query}`, { token: adminToken }),
      apiRequest('/api/admin/business/overview', { token: adminToken }),
      apiRequest('/api/admin/business/athletes-risk', { token: adminToken })
    ]);
    check(overview.ok === true, 'Membership overview invalido.');
    check(memberships.members?.length === 5, 'Admin memberships no encontro los cinco miembros smoke.');
    check(business.ok === true, 'Business overview invalido.');
    check(Array.isArray(risk.athletes), 'Athletes risk no regreso una lista.');
    result('API admin', 'overview, memberships, business y risk OK');
  } else {
    result('API admin', 'omitida; define SPRINT4_SMOKE_ADMIN_TOKEN');
  }

  result('API mobile', 'login legacy, /auth/me, notificaciones y read OK');
}

async function cleanup() {
  if (createdMemberIds.length === 0) return;
  const idFilter = { $in: createdMemberIds };
  const notificationResult = await Notification.deleteMany({ member: idFilter });
  const loginResult = await LoginLog.deleteMany({ member: idFilter });
  const memberResult = await Member.deleteMany({
    _id: idFilter,
    email: { $in: createdEmails }
  });
  check(memberResult.deletedCount === createdMemberIds.length,
    `Cleanup incompleto: se esperaban ${createdMemberIds.length} miembros y se borraron ${memberResult.deletedCount}.`);
  result('Cleanup', {
    members: memberResult.deletedCount,
    notifications: notificationResult.deletedCount,
    loginLogs: loginResult.deletedCount
  });
}

async function run() {
  const uri = process.env.MONGODB_URI;
  check(uri, 'MONGODB_URI no esta configurado. En PowerShell usa: $env:MONGODB_URI = "mongodb+srv://..."');
  check(getDatabaseNameFromMongoUri(uri),
    'MONGODB_URI debe incluir el nombre de la base. Ejemplo: mongodb+srv://usuario:password@cluster.mongodb.net/inrage-staging?appName=Cluster0');

  await connectToMongo(uri);
  const databaseName = mongoose.connection.name;
  const host = mongoose.connection.host;
  result('MongoDB', `${host}/${databaseName}`);

  const preflight = await inspectReminderIndex();
  result('Conflictos reminderKey', preflight.duplicates.length);
  result('Keys invalidas reminderKey', preflight.invalidKeys.length);
  if (preflight.duplicates.length) {
    result('Muestras duplicadas', preflight.duplicates.map((item) => ({
      reminderKey: item._id,
      count: item.count,
      ids: item.ids.map(String)
    })));
  }
  if (preflight.invalidKeys.length) {
    result('Muestras invalidas', preflight.invalidKeys.map((item) => ({
      id: String(item._id),
      member: item.member ? String(item.member) : null,
      type: item.type || null,
      reminderKey: item.reminderKey
    })));
  }
  if (preflight.index) {
    result('Indice actual', {
      name: preflight.index.name,
      unique: Boolean(preflight.index.unique),
      sparse: Boolean(preflight.index.sparse)
    });
  } else {
    result('Indice actual', 'no existe');
  }
  check(preflight.duplicates.length === 0,
    `Hay ${preflight.duplicates.length} reminderKey duplicados. Revisa docs/sprint4-smoke-test.md.`);
  check(preflight.invalidKeys.length === 0,
    `Hay ${preflight.invalidKeys.length} reminderKey nulos, vacios o no-string.`);
  if (preflight.index) {
    check(preflight.index.unique === true && preflight.index.sparse === true,
      `El indice reminderKey existente no es unique+sparse: ${JSON.stringify(preflight.index)}`);
  }

  if (!allowWrite) {
    console.log('[smoke:s4] Preflight de solo lectura completado.');
    console.log('[smoke:s4] Para crear datos usa SPRINT4_SMOKE_ALLOW_WRITE=true, SPRINT4_SMOKE_TARGET=staging');
    console.log(`[smoke:s4] y SPRINT4_SMOKE_CONFIRM_DB=${databaseName}`);
    return;
  }

  check(target === 'staging', 'SPRINT4_SMOKE_TARGET debe ser exactamente "staging".');
  check(confirmDb === databaseName,
    `SPRINT4_SMOKE_CONFIRM_DB debe coincidir exactamente con "${databaseName}".`);
  check(!['admin', 'config', 'local'].includes(databaseName),
    `La base reservada "${databaseName}" no es un destino valido.`);

  await ensureReminderIndex(preflight);

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 10);
  const members = [
    membershipCase('ACTIVE', 'active', {
      status: 'active',
      planName: 'Smoke Active',
      startDate: gymCalendarDate(now, -20),
      endDate: gymCalendarDate(now, 30)
    }),
    membershipCase('EXPIRES 7 DAYS', 'expires7', {
      status: 'active',
      planName: 'Smoke 7 Days',
      startDate: gymCalendarDate(now, -20),
      endDate: gymCalendarDate(now, 7)
    }),
    membershipCase('EXPIRES TOMORROW', 'tomorrow', {
      status: 'active',
      planName: 'Smoke Tomorrow',
      startDate: gymCalendarDate(now, -20),
      endDate: gymCalendarDate(now, 1)
    }),
    membershipCase('EXPIRED', 'expired', {
      status: 'active',
      planName: 'Smoke Expired',
      startDate: gymCalendarDate(now, -40),
      endDate: gymCalendarDate(now, -1)
    }),
    membershipCase('NO MEMBERSHIP', 'legacy', null)
  ].map((member) => ({ ...member, password: passwordHash }));

  const created = await Member.create(members);
  for (const member of created) createdMemberIds.push(member._id);
  result('Miembros smoke creados', created.map((member) => ({
    id: String(member._id),
    email: member.email,
    status: resolveMembershipStatus(member.membership)
  })));

  const serialized = created.map((member) => serializeMemberMembership(member));
  check(serialized.find((member) => member.email.endsWith('-legacy@example.invalid'))?.membershipStatus === 'inactive',
    'El miembro sin membership no fue serializado como inactive.');
  const summary = summarizeMemberships(created);
  check(summary.totalActive === 1, `Activas esperadas: 1, recibidas: ${summary.totalActive}`);
  check(summary.expiring7Days === 2, `Por vencer esperadas: 2, recibidas: ${summary.expiring7Days}`);
  check(summary.expiringTomorrow === 1, `Vencen manana esperadas: 1, recibidas: ${summary.expiringTomorrow}`);
  check(summary.expired === 1, `Vencidas esperadas: 1, recibidas: ${summary.expired}`);
  check(summary.inactive === 1, `Inactivas esperadas: 1, recibidas: ${summary.inactive}`);
  result('Resumen memberships', summary);

  const firstSweep = await runMembershipReminders(now, { memberIds: createdMemberIds });
  const secondSweep = await runMembershipReminders(now, { memberIds: createdMemberIds });
  check(firstSweep.created === 3, `Primer sweep debia crear 3 notificaciones; creo ${firstSweep.created}.`);
  check(secondSweep.created === 0, `Segundo sweep debia crear 0 notificaciones; creo ${secondSweep.created}.`);

  const automaticNotifications = await Notification.find({
    member: { $in: createdMemberIds },
    type: { $in: AUTO_REMINDER_TYPES }
  }).lean();
  const duplicateGroups = await Notification.aggregate([
    { $match: { member: { $in: createdMemberIds }, type: { $in: AUTO_REMINDER_TYPES } } },
    { $group: { _id: '$reminderKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);
  check(automaticNotifications.length === 3,
    `Se esperaban 3 notificaciones automaticas; hay ${automaticNotifications.length}.`);
  check(duplicateGroups.length === 0, 'Se detectaron reminderKey duplicados en datos smoke.');
  result('Primer sweep', firstSweep);
  result('Segundo sweep', secondSweep);
  result('Notificaciones automaticas', automaticNotifications.map((item) => ({
    member: String(item.member),
    type: item.type,
    reminderKey: item.reminderKey
  })));

  await verifyApi(created);

  if (keepData) {
    console.log('[smoke:s4] SPRINT4_SMOKE_KEEP_DATA=true: se conservaron los datos para revision manual.');
    console.log(`[smoke:s4] Marker: ${marker}`);
    console.log(`[smoke:s4] Password temporal comun: ${password}`);
    console.log(`[smoke:s4] IDs: ${createdMemberIds.map(String).join(',')}`);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await cleanup();
  }

  console.log('[smoke:s4] PASS');
}

run()
  .catch(async (err) => {
    console.error('[smoke:s4] FAIL:', err.message);
    if (!keepData) {
      try {
        await cleanup();
      } catch (cleanupErr) {
        console.error('[smoke:s4] Cleanup FAIL:', cleanupErr.message);
      }
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoFast();
    process.exit(process.exitCode || 0);
  });
