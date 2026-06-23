import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

// passport-jwt reads JWT_SECRET when the strategy is created, so it must be
// set before the app module is imported.
process.env.JWT_SECRET ??= 'test-secret';
const { createApp } = await import('../src/app.js');

// Boot the real app on an ephemeral port. No database connection is made:
// these tests only exercise routes that reject before touching MongoDB.
let server;
let baseUrl;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('GET /health', () => {
  test('responds 200 with service status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok', service: 'inrage-backend' });
  });
});

describe('unknown routes', () => {
  test('respond 404 with the method and path', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'Not found: GET /api/does-not-exist');
  });
});

describe('protected routes', () => {
  const protectedRoutes = [
    ['GET', '/api/members'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/workouts/today'],
    ['GET', '/api/workouts/000000000000000000000000/comments'],
    ['POST', '/api/workouts/000000000000000000000000/comments'],
    ['GET', '/api/attendances/me'],
    ['GET', '/api/prs'],
    ['GET', '/api/login-logs'],
    ['GET', '/api/classes'],
    ['GET', '/api/classes/admin/today'],
    ['POST', '/api/classes/check-in/qr'],
    ['POST', '/api/classes/000000000000000000000000/check-in-token'],
    ['GET', '/api/classes/000000000000000000000000/check-in-token/current'],
    ['POST', '/api/classes/000000000000000000000000/reserve'],
    ['DELETE', '/api/classes/000000000000000000000000/reserve'],
    ['POST', '/api/classes/000000000000000000000000/check-in/000000000000000000000000'],
    ['GET', '/api/classes/000000000000000000000000/roster'],
    ['GET', '/api/posts'],
    ['PUT', '/api/reactions'],
    ['POST', '/api/reactions/summary'],
    ['GET', '/api/comments'],
    ['POST', '/api/comments'],
    ['GET', '/api/messages/me'],
    ['GET', '/api/messages/me/unread'],
    ['POST', '/api/messages/me'],
    ['GET', '/api/messages/inbox']
  ];

  for (const [method, route] of protectedRoutes) {
    test(`${method} ${route} rejects requests without a token`, async () => {
      const res = await fetch(`${baseUrl}${route}`, { method });
      assert.equal(res.status, 401);
    });
  }

  test('rejects a syntactically invalid bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer not-a-real-token' }
    });
    assert.equal(res.status, 401);
  });
});

describe('auth input validation', () => {
  test('POST /api/auth/register with malformed email responds 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'no-es-un-correo', password: 'secret123' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Escribe un correo válido');
  });

  test('POST /api/auth/register with a short password responds 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', email: 'x@gmail.com', password: '123' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'La contraseña debe tener al menos 6 caracteres');
  });

  test('POST /api/auth/google without idToken responds 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Falta idToken');
  });
});
