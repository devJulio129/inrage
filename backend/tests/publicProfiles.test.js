import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'test-secret';

const { createApp } = await import('../src/app.js');
const { Attendance } = await import('../src/models/Attendance.js');
const { Member } = await import('../src/models/Member.js');
const { PR } = await import('../src/models/PR.js');
const {
  ensureUniqueSlug,
  slugifyName
} = await import('../src/services/publicProfiles.js');

const ATHLETE_ID = '64b000000000000000000101';
const ADMIN_ID = '64b000000000000000000102';
const athleteToken = jwt.sign({ id: ATHLETE_ID }, process.env.JWT_SECRET);

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const next = createApp().listen(0, () => resolve(next));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function query(value) {
  let current = value;
  return {
    select() { return this; },
    sort() { return this; },
    limit(amount) {
      if (Array.isArray(current)) current = current.slice(0, amount);
      return this;
    },
    lean() { return Promise.resolve(current); },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    }
  };
}

function mockAuth(t, user) {
  t.mock.method(Member, 'findById', () => query(user));
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

describe('public profile slugs', () => {
  test('generates a URL-safe slug from athlete name', () => {
    assert.equal(slugifyName('Julio Garcia!!'), 'julio-garcia');
    assert.equal(slugifyName('  Ana   Maria  '), 'ana-maria');
  });

  test('generates a unique slug with numeric suffix', async (t) => {
    const seen = new Set(['julio-garcia']);
    t.mock.method(Member, 'findOne', (filter) => query(
      seen.has(filter['publicProfile.slug']) ? { _id: 'existing' } : null
    ));

    const slug = await ensureUniqueSlug('Julio Garcia', { memberId: ATHLETE_ID });

    assert.equal(slug, 'julio-garcia-2');
  });
});

describe('public athlete endpoint', () => {
  test('GET /api/public/athletes/:slug returns 404 when profile is disabled or missing', async (t) => {
    t.mock.method(Member, 'findOne', () => query(null));

    const { response, payload } = await request('/api/public/athletes/julio-garcia');

    assert.equal(response.status, 404);
    assert.equal(payload.error, 'Perfil no encontrado');
  });

  test('GET /api/public/athletes/:slug returns safe public payload when enabled', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Julio Garcia',
      email: 'julio@example.com',
      phone: '8331234567',
      birthDate: new Date('1990-01-01T00:00:00.000Z'),
      membership: { status: 'active' },
      joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      avatar: 'data:image/jpeg;base64,abc',
      streak: 4,
      streakDay: '2026-06-25',
      publicProfile: {
        enabled: true,
        slug: 'julio-garcia',
        bio: 'Atleta de InRage',
        showAttendanceStats: true,
        showPrs: true,
        showBadges: true
      }
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(Attendance, 'find', () => query([
      { checkIn: new Date('2026-06-20T18:00:00.000Z') },
      { checkIn: new Date('2026-06-24T18:00:00.000Z') }
    ]));
    t.mock.method(PR, 'find', () => query([
      { _id: 'pr1', movement: 'Back Squat', value: 300, unit: 'lb', setAt: new Date('2026-06-01T00:00:00.000Z') }
    ]));

    const { response, payload } = await request('/api/public/athletes/julio-garcia');

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.athlete.name, 'Julio Garcia');
    assert.equal(payload.athlete.slug, 'julio-garcia');
    assert.equal(payload.athlete.consistency.visitsLast30Days, 2);
    assert.equal(payload.athlete.featuredPrs[0].movement, 'Back Squat');
    assert.ok(payload.athlete.badges.some((badge) => badge.id === 'active-athlete'));
    assert.equal('email' in payload.athlete, false);
    assert.equal('phone' in payload.athlete, false);
    assert.equal('birthDate' in payload.athlete, false);
    assert.equal('membership' in payload.athlete, false);
  });

  test('public profile handles no attendance and no PRs', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      publicProfile: {
        enabled: true,
        slug: 'ana',
        showAttendanceStats: true,
        showPrs: true,
        showBadges: true
      }
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(Attendance, 'find', () => query([]));
    t.mock.method(PR, 'find', () => query([]));

    const { response, payload } = await request('/api/public/athletes/ana');

    assert.equal(response.status, 200);
    assert.equal(payload.athlete.consistency.level, 'inactive');
    assert.equal(payload.athlete.consistency.visitsLast30Days, 0);
    assert.deepEqual(payload.athlete.featuredPrs, []);
  });
});

describe('own public profile endpoint', () => {
  test('GET /api/me/public-profile handles member without publicProfile', async (t) => {
    mockAuth(t, { _id: ATHLETE_ID, name: 'Ana', role: 'athlete' });

    const { response, payload } = await request('/api/me/public-profile', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(payload.publicProfile.enabled, false);
    assert.equal(payload.publicProfile.showAttendanceStats, true);
    assert.equal(payload.publicProfile.publicUrl, null);
  });

  test('PATCH /api/me/public-profile validates duplicate slug', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      role: 'athlete',
      publicProfile: { enabled: false },
      async save() {}
    };
    mockAuth(t, member);
    t.mock.method(Member, 'findOne', () => query({ _id: ADMIN_ID }));

    const { response, payload } = await request('/api/me/public-profile', {
      token: athleteToken,
      method: 'PATCH',
      body: { enabled: true, slug: 'taken-slug' }
    });

    assert.equal(response.status, 409);
    assert.equal(payload.error, 'Slug no disponible');
  });
});
