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

describe('support WhatsApp link', () => {
  function restoreSupportNumber(originalSupportNumber) {
    if (originalSupportNumber === undefined) delete process.env.SUPPORT_WHATSAPP_NUMBER;
    else process.env.SUPPORT_WHATSAPP_NUMBER = originalSupportNumber;
  }

  async function withSupportNumber(value, run) {
    const originalSupportNumber = process.env.SUPPORT_WHATSAPP_NUMBER;
    if (value === undefined) delete process.env.SUPPORT_WHATSAPP_NUMBER;
    else process.env.SUPPORT_WHATSAPP_NUMBER = value;
    try {
      return await run();
    } finally {
      restoreSupportNumber(originalSupportNumber);
    }
  }

  test('builds a configured wa.me link with encoded support message', async () => {
    await withSupportNumber('528334305108', async () => {
      const res = await fetch(`${baseUrl}/api/support/whatsapp-link`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.configured, true);
      assert.equal(body.label, 'Contactar soporte por WhatsApp');
      assert.match(body.url, /^https:\/\/wa\.me\/528334305108\?text=/);
      assert.match(body.url, /%0A/);

      const parsed = new URL(body.url);
      const message = parsed.searchParams.get('text');
      assert.match(message, /Hola, necesito ayuda para recuperar mi acceso a Inrage\./);
      assert.match(message, /Sucursal: Torres\/Central/);
    });
  });

  test('does not include tokens, passwords or reset links in the WhatsApp URL', async () => {
    await withSupportNumber('528334305108', async () => {
      const res = await fetch(`${baseUrl}/api/support/whatsapp-link`);
      const body = await res.json();
      const decoded = decodeURIComponent(body.url).toLowerCase();

      assert.equal(decoded.includes('token'), false);
      assert.equal(decoded.includes('password'), false);
      assert.equal(decoded.includes('contrase'), false);
      assert.equal(decoded.includes('reset-password'), false);
    });
  });

  test('responds configured false when SUPPORT_WHATSAPP_NUMBER is missing', async () => {
    await withSupportNumber(undefined, async () => {
      const res = await fetch(`${baseUrl}/api/support/whatsapp-link`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.deepEqual(body, {
        configured: false,
        message: 'Support WhatsApp not configured'
      });
    });
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
    ['POST', '/api/attendances/check-in/qr'],
    ['GET', '/api/prs'],
    ['GET', '/api/login-logs'],
    ['GET', '/api/classes'],
    ['GET', '/api/classes/calendar'],
    ['PATCH', '/api/classes/000000000000000000000000'],
    ['GET', '/api/classes/admin/today'],
    ['POST', '/api/classes/check-in/qr'],
    ['POST', '/api/classes/000000000000000000000000/check-in-token'],
    ['GET', '/api/classes/000000000000000000000000/check-in-token/current'],
    ['POST', '/api/classes/000000000000000000000000/reserve'],
    ['DELETE', '/api/classes/000000000000000000000000/reserve'],
    ['POST', '/api/classes/000000000000000000000000/check-in/000000000000000000000000'],
    ['GET', '/api/classes/000000000000000000000000/roster'],
    ['GET', '/api/posts'],
    ['PATCH', '/api/posts/000000000000000000000000'],
    ['PUT', '/api/reactions'],
    ['POST', '/api/reactions/summary'],
    ['GET', '/api/comments'],
    ['POST', '/api/comments'],
    ['GET', '/api/messages/me'],
    ['GET', '/api/messages/me/unread'],
    ['POST', '/api/messages/me'],
    ['GET', '/api/messages/inbox'],
    ['GET', '/api/admin/business/overview'],
    ['GET', '/api/admin/business/athletes-risk'],
    ['GET', '/api/admin/business/class-performance'],
    ['GET', '/api/admin/memberships/overview'],
    ['GET', '/api/admin/memberships'],
    ['PATCH', '/api/admin/memberships/000000000000000000000000'],
    ['POST', '/api/admin/memberships/000000000000000000000000/mark-paid'],
    ['POST', '/api/admin/memberships/000000000000000000000000/send-reminder'],
    ['POST', '/api/admin/memberships/run-reminders'],
    ['POST', '/api/admin/test-email'],
    ['GET', '/api/me/public-profile'],
    ['PATCH', '/api/me/public-profile'],
    ['GET', '/api/admin/public-profiles'],
    ['PATCH', '/api/admin/public-profiles/000000000000000000000000'],
    ['GET', '/api/notifications'],
    ['PATCH', '/api/notifications/000000000000000000000000/read'],
    ['POST', '/api/notifications/push-token'],
    ['POST', '/api/push/register'],
    ['GET', '/api/push/preferences'],
    ['PATCH', '/api/push/preferences'],
    ['GET', '/api/admin/notifications/status'],
    ['POST', '/api/admin/notifications/test'],
    ['POST', '/api/admin/notifications/run-due'],
    ['GET', '/api/admin/checkin-qr'],
    ['POST', '/api/admin/checkin-qr'],
    ['GET', '/api/home/highlights']
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
