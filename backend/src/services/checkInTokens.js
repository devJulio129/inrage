import crypto from 'node:crypto';
import { CheckInToken } from '../models/CheckInToken.js';

const TOKEN_TTL_MS = 60 * 1000;

export function generateCheckInToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashCheckInToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function buildQrPayload(token) {
  return {
    type: 'inrage_check_in',
    token
  };
}

export async function createClassCheckInToken(classId, createdBy, ttlMs = TOKEN_TTL_MS) {
  const token = generateCheckInToken();
  const expiresAt = new Date(Date.now() + ttlMs);

  await CheckInToken.updateMany(
    { classId, isActive: true },
    { $set: { isActive: false } }
  );

  await CheckInToken.create({
    classId,
    tokenHash: hashCheckInToken(token),
    expiresAt,
    createdBy,
    isActive: true
  });

  return {
    token,
    expiresAt,
    qrPayload: buildQrPayload(token)
  };
}

export async function validateCheckInToken(token) {
  const tokenHash = hashCheckInToken(token);
  const row = await CheckInToken.findOne({ tokenHash });
  if (!row) {
    const err = new Error('QR invalido');
    err.status = 400;
    err.code = 'invalid';
    throw err;
  }
  if (row.expiresAt <= new Date()) {
    row.isActive = false;
    await row.save();
    const err = new Error('QR expirado');
    err.status = 410;
    err.code = 'expired';
    throw err;
  }
  if (!row.isActive) {
    const err = new Error('QR invalido');
    err.status = 400;
    err.code = 'inactive';
    throw err;
  }
  return row;
}
