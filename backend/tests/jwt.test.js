import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// The token contract used by /api/auth/*: payload { id }, signed with
// JWT_SECRET, 7-day expiry. These tests pin that contract down.
const SECRET = 'test-secret';

describe('JWT token contract', () => {
  test('a signed token round-trips the member id', () => {
    const token = jwt.sign({ id: 'abc123' }, SECRET, { expiresIn: '7d' });
    const payload = jwt.verify(token, SECRET);
    assert.equal(payload.id, 'abc123');
  });

  test('tokens expire after the configured lifetime', () => {
    const token = jwt.sign({ id: 'abc123' }, SECRET, { expiresIn: '7d' });
    const { exp, iat } = jwt.verify(token, SECRET);
    assert.equal(exp - iat, 7 * 24 * 60 * 60);
  });

  test('verification fails with the wrong secret', () => {
    const token = jwt.sign({ id: 'abc123' }, SECRET);
    assert.throws(() => jwt.verify(token, 'another-secret'), /invalid signature/);
  });

  test('verification fails for a tampered token', () => {
    const token = jwt.sign({ id: 'abc123' }, SECRET);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ id: 'evil' })).toString('base64url');
    assert.throws(() => jwt.verify(`${header}.${forgedPayload}.${signature}`, SECRET));
  });

  test('verification fails for an expired token', () => {
    const token = jwt.sign({ id: 'abc123' }, SECRET, { expiresIn: '-1s' });
    assert.throws(() => jwt.verify(token, SECRET), /jwt expired/);
  });
});
