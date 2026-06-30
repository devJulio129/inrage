import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET ??= 'test-secret';

const { createApp } = await import('../src/app.js');
const { Member } = await import('../src/models/Member.js');
const { GymClass } = await import('../src/models/GymClass.js');
const { ClassTemplate } = await import('../src/models/ClassTemplate.js');
const { GymInfo } = await import('../src/models/GymInfo.js');
const { LoginLog } = await import('../src/models/LoginLog.js');
const { Post } = await import('../src/models/Post.js');
const { Attendance } = await import('../src/models/Attendance.js');
const { PushToken } = await import('../src/models/PushToken.js');
const { NotificationLog } = await import('../src/models/NotificationLog.js');
const { BranchCheckInQr } = await import('../src/models/BranchCheckInQr.js');
const { emailService } = await import('../src/services/email.js');
const { ensureScheduledClasses, gymTodayUTC, GYM_UTC_OFFSET_HOURS } = await import('../src/services/classSchedule.js');
const { notificationService } = await import('../src/services/notificationService.js');
const { runDueNotificationJobs } = await import('../src/services/notificationJobs.js');
const { checkinQr } = await import('../src/services/checkinQr.js');
const { countReservations } = await import('../src/services/classReservations.js');

const ADMIN_ID = '65c000000000000000000001';
const ATHLETE_ID = '65c000000000000000000002';
const OTHER_ID = '65c000000000000000000003';

const admin = { _id: ADMIN_ID, name: 'Admin', role: 'admin', status: 'active' };
const athlete = { _id: ATHLETE_ID, name: 'Ana', role: 'athlete', status: 'active' };
const athleteToken = jwt.sign({ id: ATHLETE_ID }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: ADMIN_ID }, process.env.JWT_SECRET);

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
    populate() { return this; },
    lean() { return Promise.resolve(current); },
    then(resolve, reject) {
      return Promise.resolve(current).then(resolve, reject);
    }
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
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

function mockAuth(t, user = athlete) {
  t.mock.method(Member, 'findById', () => query(user));
}

async function makeReset({ token = 'reset-token', tempPassword = 'Temp12345', expiresAt = new Date(Date.now() + 3600_000) } = {}) {
  return {
    tempPasswordHash: await bcrypt.hash(tempPassword, 4),
    tempPasswordExpiresAt: expiresAt,
    resetTokenHash: hashToken(token),
    resetTokenExpiresAt: expiresAt,
    mustChangePassword: true,
    requestedAt: new Date()
  };
}

describe('forgot/reset password', () => {
  test('forgot password responds generic when email does not exist', async (t) => {
    let emailSent = false;
    t.mock.method(Member, 'findOne', () => query(null));
    t.mock.method(emailService, 'sendPasswordResetEmail', async () => { emailSent = true; });

    const { response, payload } = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nobody@example.com' }
    });

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.match(payload.message, /Si el correo existe/i);
    assert.equal(emailSent, false);
  });

  test('forgot password stores only hashes and sends reset instructions when email exists', async (t) => {
    let saved = false;
    let emailPayload;
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      async save() { saved = true; }
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(emailService, 'sendPasswordResetEmail', async (payload) => {
      emailPayload = payload;
      return { sent: true };
    });

    const { response } = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'ANA@example.com' }
    });

    assert.equal(response.status, 200);
    assert.equal(saved, true);
    assert.ok(member.passwordReset?.tempPasswordHash);
    assert.ok(member.passwordReset?.resetTokenHash);
    assert.notEqual(member.passwordReset.tempPasswordHash, emailPayload.tempPassword);
    const token = new URL(emailPayload.resetUrl).searchParams.get('token');
    assert.notEqual(member.passwordReset.resetTokenHash, token);
    assert.equal(member.passwordReset.resetTokenHash, hashToken(token));
    assert.equal(emailPayload.to, member.email);
  });

  test('forgot password reports configured delivery errors for existing email', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      async save() {}
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(emailService, 'sendPasswordResetEmail', async () => {
      const err = new Error('Email provider not configured');
      err.status = 503;
      err.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
      throw err;
    });

    const { response, payload } = await request('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: member.email }
    });

    assert.equal(response.status, 503);
    assert.equal(payload.error, 'Email provider not configured');
  });

  test('reset password fails with invalid token', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      email: 'ana@example.com',
      passwordReset: await makeReset(),
      async save() {}
    };
    t.mock.method(Member, 'findOne', () => query(member));

    const { response } = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: member.email,
        token: 'wrong-token',
        tempPassword: 'Temp12345',
        newPassword: 'newpass123'
      }
    });

    assert.equal(response.status, 400);
  });

  test('reset password fails with invalid temporary password', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      email: 'ana@example.com',
      passwordReset: await makeReset(),
      async save() {}
    };
    t.mock.method(Member, 'findOne', () => query(member));

    const { response } = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: member.email,
        token: 'reset-token',
        tempPassword: 'bad-temp',
        newPassword: 'newpass123'
      }
    });

    assert.equal(response.status, 400);
  });

  test('reset password fails after expiration', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      email: 'ana@example.com',
      passwordReset: await makeReset({ expiresAt: new Date(Date.now() - 1000) }),
      async save() {}
    };
    t.mock.method(Member, 'findOne', () => query(member));

    const { response } = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: member.email,
        token: 'reset-token',
        tempPassword: 'Temp12345',
        newPassword: 'newpass123'
      }
    });

    assert.equal(response.status, 400);
  });

  test('reset password updates password, clears reset data and prevents token reuse', async (t) => {
    let saved = false;
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      role: 'athlete',
      status: 'active',
      password: await bcrypt.hash('oldpass123', 4),
      passwordReset: await makeReset(),
      async save() { saved = true; }
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(LoginLog, 'create', async () => ({}));

    const reset = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: member.email,
        token: 'reset-token',
        tempPassword: 'Temp12345',
        newPassword: 'newpass123'
      }
    });
    assert.equal(reset.response.status, 200);
    assert.equal(saved, true);
    assert.equal(member.passwordReset, undefined);
    assert.equal(await bcrypt.compare('newpass123', member.password), true);

    const reuse = await request('/api/auth/reset-password', {
      method: 'POST',
      body: {
        email: member.email,
        token: 'reset-token',
        tempPassword: 'Temp12345',
        newPassword: 'another123'
      }
    });
    assert.equal(reuse.response.status, 400);

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { email: member.email, password: 'newpass123' }
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.payload.token);
  });
});

describe('home highlights and special classes', () => {
  test('GET /api/home/highlights returns empty list safely', async (t) => {
    mockAuth(t);
    t.mock.method(GymInfo, 'findOne', () => query(null));
    t.mock.method(GymClass, 'find', () => query([]));

    const { response, payload } = await request('/api/home/highlights', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.highlights, []);
  });

  test('special featured class appears with reservation state and no sensitive data', async (t) => {
    mockAuth(t);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const specialClass = {
      _id: 'class-special',
      date: tomorrow,
      time: '10:00',
      name: 'Halterofilia tecnica',
      description: 'Trabajo tecnico',
      backgroundImage: 'https://img.example/special.jpg',
      capacity: 10,
      isSpecial: true,
      featuredOnHome: true,
      branch: 'Central',
      specialLabel: 'Clase especial',
      specialIcon: 'barbell',
      homePriority: 5,
      reservations: [
        { member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() },
        { member: OTHER_ID, status: 'reserved', reservedAt: new Date() }
      ]
    };
    t.mock.method(GymInfo, 'findOne', () => query({ _id: 'info1', announcement: 'Trae agua', updatedAt: new Date() }));
    t.mock.method(GymClass, 'find', () => query([specialClass]));

    const { response, payload } = await request('/api/home/highlights', { token: athleteToken });

    assert.equal(response.status, 200);
    const item = payload.highlights.find((row) => row.type === 'special_class');
    assert.ok(item);
    assert.equal(item.classId, specialClass._id);
    assert.equal(item.branch, 'Central');
    assert.equal(item.backgroundImage, 'https://img.example/special.jpg');
    assert.equal(item.imageUrl, 'https://img.example/special.jpg');
    assert.equal(item.mine, true);
    assert.equal(item.myReservationStatus, 'reserved');
    assert.equal(item.spotsLeft, 8);
    assert.equal('reservations' in item, false);
    assert.ok(payload.highlights.some((row) => row.type === 'announcement'));
  });

  test('POST /api/classes stores branch and all special home fields', async (t) => {
    mockAuth(t, admin);
    let createdPayload;
    t.mock.method(GymClass, 'create', async (data) => {
      createdPayload = data;
      return { _id: 'class-created', ...data };
    });

    const { response, payload } = await request('/api/classes', {
      token: adminToken,
      method: 'POST',
      body: {
        date: '2099-03-10',
        time: '18:30',
        branch: 'Central',
        name: 'Open Prep',
        description: 'Tecnica',
        backgroundImage: 'https://img.example/open-prep.jpg',
        capacity: 14,
        isSpecial: true,
        featuredOnHome: true,
        specialLabel: 'Open Prep',
        specialDescription: 'Skills avanzados',
        homePriority: 8,
        specialIcon: 'fire',
        specialColor: '#46E22A',
        visibleFrom: '2099-03-01T08:00',
        visibleUntil: '2099-03-09T21:30'
      }
    });

    assert.equal(response.status, 201);
    assert.equal(createdPayload.branch, 'Central');
    assert.equal(createdPayload.isSpecial, true);
    assert.equal(createdPayload.featuredOnHome, true);
    assert.equal(createdPayload.specialLabel, 'Open Prep');
    assert.equal(createdPayload.specialDescription, 'Skills avanzados');
    assert.equal(createdPayload.homePriority, 8);
    assert.equal(createdPayload.specialIcon, 'fire');
    assert.equal(createdPayload.specialColor, '#46E22A');
    assert.equal(createdPayload.backgroundImage, 'https://img.example/open-prep.jpg');
    assert.equal(createdPayload.visibleFrom.toISOString(), '2099-03-01T14:00:00.000Z');
    assert.equal(createdPayload.visibleUntil.toISOString(), '2099-03-10T03:30:00.000Z');
    assert.equal(payload.branch, 'Central');
  });

  test('home highlights skips unfeatured, past and hidden special classes', async (t) => {
    mockAuth(t);
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 2);
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 1);
    const hiddenUntil = new Date(Date.now() + 3600_000);
    t.mock.method(GymInfo, 'findOne', () => query(null));
    t.mock.method(GymClass, 'find', () => query([
      { _id: 'visible', date: future, time: '09:00', name: 'Visible', capacity: 8, backgroundImage: 'https://img.example/visible.jpg', isSpecial: true, featuredOnHome: true, reservations: [] },
      { _id: 'past', date: past, time: '09:00', name: 'Past', capacity: 8, isSpecial: true, featuredOnHome: true, reservations: [] },
      { _id: 'hidden', date: future, time: '10:00', name: 'Hidden', capacity: 8, isSpecial: true, featuredOnHome: true, visibleFrom: hiddenUntil, reservations: [] },
      { _id: 'expired-window', date: future, time: '10:30', name: 'Expired window', capacity: 8, isSpecial: true, featuredOnHome: true, visibleUntil: new Date(Date.now() - 1000), reservations: [] },
      { _id: 'unfeatured', date: future, time: '11:00', name: 'No', capacity: 8, isSpecial: true, featuredOnHome: false, reservations: [] }
    ]));

    const { response, payload } = await request('/api/home/highlights', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.deepEqual(payload.highlights.map((row) => row.id), ['visible']);
    assert.equal(payload.highlights[0].backgroundImage, 'https://img.example/visible.jpg');
  });

  test('athlete can reserve a featured special class and refresh highlights with reservation state', async (t) => {
    mockAuth(t);
    let saved = false;
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const gymClass = {
      _id: 'class-special',
      date: tomorrow,
      time: '19:00',
      name: 'Clase especial',
      branch: 'Torres',
      capacity: 5,
      isSpecial: true,
      featuredOnHome: true,
      reservations: [],
      async save() { saved = true; }
    };
    t.mock.method(GymClass, 'findById', () => query(gymClass));
    t.mock.method(GymInfo, 'findOne', () => query(null));
    t.mock.method(GymClass, 'find', () => query([gymClass]));

    const { response, payload } = await request('/api/classes/class-special/reserve', {
      token: athleteToken,
      method: 'POST'
    });

    assert.equal(response.status, 200);
    assert.equal(saved, true);
    assert.equal(payload.status, 'reserved');
    assert.equal(payload.classId, gymClass._id);
    assert.equal(payload.spotsLeft, 4);
    assert.equal(gymClass.reservations.length, 1);
    assert.equal(String(gymClass.reservations[0].member), ATHLETE_ID);
    assert.equal(gymClass.reservations[0].status, 'reserved');

    const refreshed = await request('/api/home/highlights', { token: athleteToken });
    const item = refreshed.payload.highlights.find((row) => row.classId === gymClass._id);
    assert.ok(item);
    assert.equal(item.mine, true);
    assert.equal(item.myReservationStatus, 'reserved');
    assert.equal(item.branch, 'Torres');
  });

  test('PATCH /api/classes marks an existing class as special without breaking reservations', async (t) => {
    mockAuth(t, admin);
    const gymClass = {
      _id: 'class-edit',
      date: new Date(),
      time: '18:00',
      name: 'CrossFit',
      branch: 'Torres',
      description: '',
      capacity: 12,
      reservations: [{ member: ATHLETE_ID, status: 'reserved' }],
      async save() {},
      toObject() { return this; }
    };
    t.mock.method(GymClass, 'findById', () => query(gymClass));

    const { response, payload } = await request('/api/classes/class-edit', {
      token: adminToken,
      method: 'PATCH',
      body: {
        isSpecial: true,
        featuredOnHome: true,
        specialLabel: 'Clase especial',
        specialIcon: 'fire',
        imageUrl: 'https://img.example/edit.jpg'
      }
    });

    assert.equal(response.status, 200);
    assert.equal(gymClass.isSpecial, true);
    assert.equal(gymClass.featuredOnHome, true);
    assert.equal(gymClass.backgroundImage, 'https://img.example/edit.jpg');
    assert.equal(gymClass.reservations.length, 1);
    assert.equal(payload.class.specialIcon, 'fire');
    assert.equal(payload.class.backgroundImage, 'https://img.example/edit.jpg');
  });

  test('GET /api/classes filters by branch and serializes legacy branch safely', async (t) => {
    mockAuth(t);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    let filterUsed;
    t.mock.method(GymClass, 'find', (filter) => {
      filterUsed = filter;
      return query([
        { _id: 'central-1', date: new Date(), time: '08:00', branch: 'Central', name: 'CrossFit', capacity: 10, reservations: [] }
      ]);
    });

    const { response, payload } = await request('/api/classes?branch=Central', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(filterUsed.branch, 'Central');
    assert.equal(payload[0].branch, 'Central');
  });

  test('GET /api/classes supports branch date range for reservation calendar', async (t) => {
    mockAuth(t);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    let filterUsed;
    t.mock.method(GymClass, 'find', (filter) => {
      filterUsed = filter;
      return query([
        { _id: 'torres-1', date: new Date('2026-07-03T00:00:00'), time: '07:00', branch: 'Torres', name: 'CrossFit', capacity: 10, reservations: [] }
      ]);
    });

    const { response, payload } = await request('/api/classes?branch=Torres&dateFrom=2026-07-01&dateTo=2026-07-07', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(filterUsed.branch, 'Torres');
    assert.equal(filterUsed.date.$gte.toISOString().slice(0, 10), '2026-07-01');
    assert.equal(filterUsed.date.$lt.toISOString().slice(0, 10), '2026-07-08');
    assert.equal(payload[0].branch, 'Torres');
  });

  test('GET /api/classes/calendar filters Torres and groups by date and branch', async (t) => {
    mockAuth(t);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    let filterUsed;
    t.mock.method(GymClass, 'find', (filter) => {
      filterUsed = filter;
      return query([
        {
          _id: 'torres-6',
          date: new Date('2026-07-03T00:00:00Z'),
          time: '06:00',
          branch: 'Torres',
          name: 'CrossFit',
          description: 'Fuerza',
          capacity: 12,
          reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
        }
      ]);
    });

    const { response, payload } = await request('/api/classes/calendar?from=2026-07-01&to=2026-07-07&branch=Torres', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(filterUsed.branch, 'Torres');
    assert.equal(filterUsed.date.$gte.toISOString().slice(0, 10), '2026-07-01');
    assert.equal(filterUsed.date.$lt.toISOString().slice(0, 10), '2026-07-08');
    assert.equal(payload.branch, 'Torres');
    assert.equal(payload.days[0].date, '2026-07-03');
    assert.equal(payload.days[0].branches[0].branch, 'Torres');
    assert.equal(payload.classes[0].id, 'torres-6');
    assert.equal(payload.classes[0].reservedCount, 1);
    assert.equal(payload.classes[0].isReservedByMe, true);
    assert.match(payload.classes[0].subtitle, /Torres/);
  });

  test('GET /api/classes/calendar filters Central', async (t) => {
    mockAuth(t);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    let filterUsed;
    t.mock.method(GymClass, 'find', (filter) => {
      filterUsed = filter;
      return query([
        { _id: 'central-6', date: new Date('2026-07-03T00:00:00Z'), time: '06:00', branch: 'Central', name: 'CrossFit', capacity: 14, reservations: [] }
      ]);
    });

    const { response, payload } = await request('/api/classes/calendar?from=2026-07-01&to=2026-07-07&branch=Central', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(filterUsed.branch, 'Central');
    assert.equal(payload.classes[0].branch, 'Central');
  });

  test('GET /api/classes/calendar supports branch=all and same date time in different branches', async (t) => {
    mockAuth(t, admin);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    let filterUsed;
    t.mock.method(GymClass, 'find', (filter) => {
      filterUsed = filter;
      return query([
        {
          _id: 'torres-6',
          date: new Date('2026-07-03T00:00:00Z'),
          time: '06:00',
          branch: 'Torres',
          name: 'CrossFit',
          capacity: 12,
          reservations: [{ member: { _id: ATHLETE_ID, name: 'Ana', email: 'ana@example.com', phone: '833' }, status: 'reserved', reservedAt: new Date() }]
        },
        {
          _id: 'central-6',
          date: new Date('2026-07-03T00:00:00Z'),
          time: '06:00',
          branch: 'Central',
          name: 'CrossFit',
          capacity: 14,
          reservations: [{ member: { _id: OTHER_ID, name: 'Luis', email: 'luis@example.com' }, status: 'checked_in', checkedInAt: new Date(), reservedAt: new Date() }]
        }
      ]);
    });

    const { response, payload } = await request('/api/classes/calendar?from=2026-07-01&to=2026-07-07&branch=all', { token: adminToken });

    assert.equal(response.status, 200);
    assert.equal('branch' in filterUsed, false);
    assert.equal(payload.branch, 'all');
    assert.equal(payload.classes.length, 2);
    assert.deepEqual(payload.classes.map((item) => `${item.branch}-${item.time}`).sort(), ['Central-06:00', 'Torres-06:00']);
    assert.equal(payload.days[0].branches.length, 2);
    assert.equal(payload.classes[0].reservedMembers[0].name, 'Ana');
    assert.equal(payload.classes[0].reservedMembers[0].phone, '833');
    assert.equal(payload.classes[1].reservedCount, 1);
  });

  test('GET /api/classes/calendar serializes special classes with branch', async (t) => {
    mockAuth(t);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    t.mock.method(GymClass, 'find', () => query([
      {
        _id: 'special-central',
        date: new Date('2026-07-04T00:00:00Z'),
        time: '09:00',
        branch: 'Central',
        name: 'Open Prep',
        description: 'Skills',
        backgroundImage: 'https://img.example/open-prep.jpg',
        capacity: 10,
        isSpecial: true,
        specialLabel: 'Clase especial',
        specialDescription: 'Trabajo especial',
        reservations: []
      }
    ]));

    const { response, payload } = await request('/api/classes/calendar?from=2026-07-01&to=2026-07-07&branch=all', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(payload.classes[0].branch, 'Central');
    assert.equal(payload.classes[0].isSpecial, true);
    assert.equal(payload.classes[0].specialLabel, 'Clase especial');
    assert.equal(payload.classes[0].backgroundImage, 'https://img.example/open-prep.jpg');
    assert.equal(payload.classes[0].imageUrl, 'https://img.example/open-prep.jpg');
  });

  test('reservation stays scoped to the selected Torres class id', async (t) => {
    mockAuth(t);
    const torresClass = {
      _id: 'torres-6',
      date: new Date('2026-07-03T00:00:00Z'),
      time: '06:00',
      branch: 'Torres',
      capacity: 12,
      reservations: [],
      async save() {}
    };
    t.mock.method(GymClass, 'findById', (id) => query(id === 'torres-6' ? torresClass : null));

    const { response, payload } = await request('/api/classes/torres-6/reserve', {
      token: athleteToken,
      method: 'POST'
    });

    assert.equal(response.status, 200);
    assert.equal(payload.classId, 'torres-6');
    assert.equal(torresClass.branch, 'Torres');
    assert.equal(torresClass.reservations.length, 1);
    assert.equal(String(torresClass.reservations[0].member), ATHLETE_ID);
  });

  test('reservation stays scoped to the selected Central class id', async (t) => {
    mockAuth(t);
    const centralClass = {
      _id: 'central-6',
      date: new Date('2026-07-03T00:00:00Z'),
      time: '06:00',
      branch: 'Central',
      capacity: 14,
      reservations: [],
      async save() {}
    };
    t.mock.method(GymClass, 'findById', (id) => query(id === 'central-6' ? centralClass : null));

    const { response, payload } = await request('/api/classes/central-6/reserve', {
      token: athleteToken,
      method: 'POST'
    });

    assert.equal(response.status, 200);
    assert.equal(payload.classId, 'central-6');
    assert.equal(centralClass.branch, 'Central');
    assert.equal(centralClass.reservations.length, 1);
    assert.equal(String(centralClass.reservations[0].member), ATHLETE_ID);
  });

  function classSlotOffset(minutesFromNow) {
    const gymNow = new Date(Date.now() + GYM_UTC_OFFSET_HOURS * 3600_000 + minutesFromNow * 60_000);
    const date = new Date(Date.UTC(gymNow.getUTCFullYear(), gymNow.getUTCMonth(), gymNow.getUTCDate()));
    const hour = String(gymNow.getUTCHours()).padStart(2, '0');
    const minute = String(gymNow.getUTCMinutes()).padStart(2, '0');
    return { date, time: `${hour}:${minute}` };
  }

  test('athlete can cancel a reservation before the 30 minute cutoff and capacity frees', async (t) => {
    mockAuth(t);
    const oldCutoff = process.env.RESERVATION_CANCEL_MINUTES_BEFORE;
    process.env.RESERVATION_CANCEL_MINUTES_BEFORE = '30';
    t.after(() => {
      if (oldCutoff === undefined) delete process.env.RESERVATION_CANCEL_MINUTES_BEFORE;
      else process.env.RESERVATION_CANCEL_MINUTES_BEFORE = oldCutoff;
    });
    const slot = classSlotOffset(90);
    const gymClass = {
      _id: 'cancel-ok',
      date: slot.date,
      time: slot.time,
      branch: 'Torres',
      capacity: 2,
      reservations: [
        { member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() },
        { member: OTHER_ID, status: 'reserved', reservedAt: new Date() }
      ],
      async save() {}
    };
    t.mock.method(GymClass, 'findById', () => query(gymClass));

    const { response, payload } = await request('/api/classes/cancel-ok/reserve', {
      token: athleteToken,
      method: 'DELETE'
    });

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'cancelled');
    assert.equal(payload.spotsLeft, 1);
    assert.equal(gymClass.reservations[0].status, 'cancelled');
  });

  test('athlete cannot cancel inside the 30 minute cutoff', async (t) => {
    mockAuth(t);
    const oldCutoff = process.env.RESERVATION_CANCEL_MINUTES_BEFORE;
    process.env.RESERVATION_CANCEL_MINUTES_BEFORE = '30';
    t.after(() => {
      if (oldCutoff === undefined) delete process.env.RESERVATION_CANCEL_MINUTES_BEFORE;
      else process.env.RESERVATION_CANCEL_MINUTES_BEFORE = oldCutoff;
    });
    const slot = classSlotOffset(10);
    const gymClass = {
      _id: 'cancel-closed',
      date: slot.date,
      time: slot.time,
      branch: 'Torres',
      capacity: 12,
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }],
      async save() { this.saved = true; return this; }
    };
    t.mock.method(GymClass, 'findById', () => query(gymClass));

    const { response, payload } = await request('/api/classes/cancel-closed/reserve', {
      token: athleteToken,
      method: 'DELETE'
    });

    assert.equal(response.status, 409);
    assert.equal(payload.status, 'reservation_cancellation_closed');
    assert.equal(gymClass.reservations[0].status, 'reserved');
    assert.equal(gymClass.saved, undefined);
  });

  test('athlete cannot cancel after check-in', async (t) => {
    mockAuth(t);
    const slot = classSlotOffset(90);
    const gymClass = {
      _id: 'cancel-checked-in',
      date: slot.date,
      time: slot.time,
      branch: 'Torres',
      capacity: 12,
      reservations: [{ member: ATHLETE_ID, status: 'checked_in', checkedInAt: new Date(), reservedAt: new Date() }],
      async save() { this.saved = true; return this; }
    };
    t.mock.method(GymClass, 'findById', () => query(gymClass));

    const { response, payload } = await request('/api/classes/cancel-checked-in/reserve', {
      token: athleteToken,
      method: 'DELETE'
    });

    assert.equal(response.status, 409);
    assert.equal(payload.status, 'already_checked_in');
    assert.equal(gymClass.reservations[0].status, 'checked_in');
    assert.equal(gymClass.saved, undefined);
  });

  test('POST /api/class-templates stores branch for recurring schedules', async (t) => {
    mockAuth(t, admin);
    let createdPayload;
    t.mock.method(ClassTemplate, 'create', async (data) => {
      createdPayload = data;
      return { _id: 'tpl-central', ...data };
    });

    const { response, payload } = await request('/api/class-templates', {
      token: adminToken,
      method: 'POST',
      body: { weekday: 1, time: '06:00', branch: 'Central', name: 'CrossFit', capacity: 14 }
    });

    assert.equal(response.status, 201);
    assert.equal(createdPayload.branch, 'Central');
    assert.equal(payload.branch, 'Central');
  });

  test('scheduled classes are generated with the template branch', async (t) => {
    const today = gymTodayUTC();
    const slot = {
      _id: 'tpl-central',
      weekday: today.getUTCDay(),
      time: '06:00',
      branch: 'Central',
      name: 'CrossFit',
      description: '',
      capacity: 14,
      generatedThrough: null,
      async save() {}
    };
    const filters = [];
    const inserts = [];
    t.mock.method(ClassTemplate, 'find', () => query([slot]));
    t.mock.method(GymClass, 'updateOne', async (filter, update) => {
      filters.push(filter);
      inserts.push(update.$setOnInsert);
      return { upsertedCount: 1 };
    });

    await ensureScheduledClasses();

    assert.ok(filters.length >= 1);
    assert.ok(filters.every((filter) => filter.branch === 'Central'));
    assert.ok(inserts.every((insert) => insert.branch === 'Central'));
  });

  test('GET /api/classes/admin/today defaults missing branch to Torres', async (t) => {
    mockAuth(t, admin);
    t.mock.method(ClassTemplate, 'find', () => query([]));
    t.mock.method(GymClass, 'find', () => query([
      { _id: 'legacy-1', date: new Date(), time: '07:00', name: 'Legacy', capacity: 8, reservations: [] }
    ]));

    const { response, payload } = await request('/api/classes/admin/today', { token: adminToken });

    assert.equal(response.status, 200);
    assert.equal(payload.classes[0].branch, 'Torres');
  });
});

describe('admin email diagnostics', () => {
  test('POST /api/admin/test-email sends through email service', async (t) => {
    mockAuth(t, { ...admin, email: 'admin@example.com' });
    let sentTo;
    t.mock.method(emailService, 'sendTestEmail', async ({ to }) => {
      sentTo = to;
      return { sent: true, provider: 'mock' };
    });

    const { response, payload } = await request('/api/admin/test-email', {
      token: adminToken,
      method: 'POST',
      body: { to: 'coach@example.com' }
    });

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.provider, 'mock');
    assert.equal(sentTo, 'coach@example.com');
  });

  test('POST /api/admin/test-email returns clear provider configuration error', async (t) => {
    mockAuth(t, { ...admin, email: 'admin@example.com' });
    t.mock.method(emailService, 'sendTestEmail', async () => {
      const err = new Error('Email provider not configured');
      err.status = 503;
      err.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
      throw err;
    });

    const { response, payload } = await request('/api/admin/test-email', {
      token: adminToken,
      method: 'POST',
      body: { to: 'coach@example.com' }
    });

    assert.equal(response.status, 503);
    assert.equal(payload.error, 'Email provider not configured');
  });
});

describe('posts source for mobile home notices', () => {
  test('admin creates a normal post and GET /api/posts exposes it for Home', async (t) => {
    mockAuth(t, admin);
    const createdPost = {
      _id: 'post-home',
      title: 'Aviso QA',
      body: 'Trae agua',
      createdBy: ADMIN_ID,
      createdAt: new Date(),
      populate() {
        return Promise.resolve({ ...this, createdBy: { _id: ADMIN_ID, name: 'Admin' } });
      }
    };
    t.mock.method(Post, 'create', async (data) => {
      assert.equal(data.title, 'Aviso QA');
      assert.equal(data.body, 'Trae agua');
      assert.equal(String(data.createdBy), ADMIN_ID);
      return createdPost;
    });

    const created = await request('/api/posts', {
      token: adminToken,
      method: 'POST',
      body: { title: 'Aviso QA', body: 'Trae agua' }
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.payload.title, 'Aviso QA');

    t.mock.method(Post, 'find', () => query([createdPost]));
    const listed = await request('/api/posts', { token: athleteToken });

    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.length, 1);
    assert.equal(listed.payload[0]._id, createdPost._id);
    assert.equal(listed.payload[0].body, 'Trae agua');
  });
});

describe('push notifications sprint 10', () => {
  const pushTokenA = 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
  const pushTokenB = 'ExpoPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

  function withPushEnabled(t, value = 'true') {
    const old = process.env.PUSH_NOTIFICATIONS_ENABLED;
    process.env.PUSH_NOTIFICATIONS_ENABLED = value;
    t.after(() => {
      if (old === undefined) delete process.env.PUSH_NOTIFICATIONS_ENABLED;
      else process.env.PUSH_NOTIFICATIONS_ENABLED = old;
    });
  }

  test('POST /api/push/register creates a push token for the authenticated user', async (t) => {
    mockAuth(t);
    t.mock.method(PushToken, 'findOne', async () => null);
    let created;
    t.mock.method(PushToken, 'create', async (data) => {
      created = data;
      return { _id: 'pt1', ...data, createdAt: new Date() };
    });

    const { response, payload } = await request('/api/push/register', {
      token: athleteToken,
      method: 'POST',
      body: { token: pushTokenA, platform: 'android', deviceName: 'Pixel QA' }
    });

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(created.member, ATHLETE_ID);
    assert.equal(created.token, pushTokenA);
    assert.equal(created.platform, 'android');
  });

  test('POST /api/push/register updates an existing token without duplicating it', async (t) => {
    mockAuth(t);
    let saved = 0;
    const existing = {
      _id: 'pt1',
      member: OTHER_ID,
      token: pushTokenA,
      platform: 'ios',
      enabled: true,
      async save() { saved += 1; }
    };
    t.mock.method(PushToken, 'findOne', async () => existing);
    t.mock.method(PushToken, 'create', async () => {
      throw new Error('should not create duplicate token');
    });

    const { response } = await request('/api/push/register', {
      token: athleteToken,
      method: 'POST',
      body: { token: pushTokenA, platform: 'android' }
    });

    assert.equal(response.status, 201);
    assert.equal(saved, 1);
    assert.equal(existing.member, ATHLETE_ID);
    assert.equal(existing.platform, 'android');
  });

  test('PATCH /api/push/preferences stores preferences and can disable a device token', async (t) => {
    const member = {
      ...athlete,
      notificationPreferences: { enabled: true, posts: true, classReminders: true, classChanges: true, membership: true, branchPreference: 'all' },
      async save() {}
    };
    mockAuth(t, member);
    let updateFilter;
    let updatePayload;
    t.mock.method(PushToken, 'updateOne', async (filter, payload) => {
      updateFilter = filter;
      updatePayload = payload;
      return { modifiedCount: 1 };
    });
    t.mock.method(PushToken, 'find', () => query([
      { _id: 'pt1', platform: 'android', enabled: false, lastSeenAt: new Date(), createdAt: new Date() }
    ]));

    const { response, payload } = await request('/api/push/preferences', {
      token: athleteToken,
      method: 'PATCH',
      body: {
        token: pushTokenA,
        enabled: false,
        posts: false,
        branchPreference: 'Central'
      }
    });

    assert.equal(response.status, 200);
    assert.equal(payload.preferences.enabled, false);
    assert.equal(payload.preferences.posts, false);
    assert.equal(payload.preferences.classReminders, false);
    assert.equal(payload.preferences.classChanges, false);
    assert.equal(payload.preferences.membership, false);
    assert.equal(payload.preferences.branchPreference, 'all');
    assert.equal(updateFilter.token, pushTokenA);
    assert.equal(updatePayload.$set.enabled, false);
  });

  test('POST /api/push/register supports several devices for one user', async (t) => {
    mockAuth(t);
    const created = [];
    t.mock.method(PushToken, 'findOne', async () => null);
    t.mock.method(PushToken, 'create', async (data) => {
      created.push(data);
      return { _id: `pt-${created.length}`, ...data };
    });

    await request('/api/push/register', {
      token: athleteToken,
      method: 'POST',
      body: { token: pushTokenA, platform: 'android' }
    });
    await request('/api/push/register', {
      token: athleteToken,
      method: 'POST',
      body: { token: pushTokenB, platform: 'ios' }
    });

    assert.equal(created.length, 2);
    assert.deepEqual(created.map((row) => row.platform), ['android', 'ios']);
  });

  test('notification service sends through Expo when preferences allow it', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, posts: true, branchPreference: 'all' } }));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    let logged;
    t.mock.method(NotificationLog, 'findOne', async () => null);
    t.mock.method(NotificationLog, 'create', async (data) => {
      logged = data;
      return data;
    });
    let sentBody;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      sentBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
    });

    const result = await notificationService.sendToMember(ATHLETE_ID, {
      type: 'post',
      preferenceKey: 'posts',
      title: 'Nuevo aviso del box',
      body: 'Trae agua',
      postId: 'post1'
    });

    assert.equal(result.sent, 1);
    assert.equal(sentBody[0].to, pushTokenA);
    assert.equal(logged.status, 'sent');
    assert.equal(logged.postId, 'post1');
  });

  test('notification service prunes device tokens rejected by Expo receipts', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, posts: true, branchPreference: 'all' } }));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    let updateFilter;
    let updatePayload;
    t.mock.method(PushToken, 'updateOne', async (filter, payload) => {
      updateFilter = filter;
      updatePayload = payload;
      return { modifiedCount: 1 };
    });
    t.mock.method(NotificationLog, 'findOne', async () => null);
    t.mock.method(NotificationLog, 'create', async (data) => data);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url) => {
      calls += 1;
      if (String(url).includes('getReceipts')) {
        return {
          ok: true,
          json: async () => ({ data: { receipt1: { status: 'error', details: { error: 'DeviceNotRegistered' } } } })
        };
      }
      return { ok: true, json: async () => ({ data: [{ status: 'ok', id: 'receipt1' }] }) };
    });

    const result = await notificationService.sendToMember(ATHLETE_ID, {
      type: 'post',
      preferenceKey: 'posts',
      title: 'Nuevo aviso del box',
      body: 'Trae agua'
    });

    assert.equal(calls, 2);
    assert.equal(result.pruned, 1);
    assert.equal(updateFilter.token, pushTokenA);
    assert.equal(updatePayload.$set.enabled, false);
    assert.equal(updatePayload.$set.disabledReason, 'DeviceNotRegistered');
  });

  test('notification service does not send when the user disabled notifications', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: false, posts: true, branchPreference: 'all' } }));
    let fetched = false;
    t.mock.method(globalThis, 'fetch', async () => {
      fetched = true;
      return { ok: true, json: async () => ({}) };
    });
    let logged;
    t.mock.method(NotificationLog, 'create', async (data) => {
      logged = data;
      return data;
    });

    const result = await notificationService.sendToMember(ATHLETE_ID, {
      type: 'post',
      preferenceKey: 'posts',
      title: 'Nuevo aviso del box',
      body: 'Trae agua'
    });

    assert.equal(result.reason, 'preference_disabled');
    assert.equal(fetched, false);
    assert.equal(logged.status, 'skipped');
  });

  test('notification service avoids duplicate reminders by reminderKey', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true } }));
    t.mock.method(NotificationLog, 'findOne', async () => ({ _id: 'existing-log' }));
    let fetched = false;
    t.mock.method(globalThis, 'fetch', async () => {
      fetched = true;
      return { ok: true, json: async () => ({}) };
    });

    const result = await notificationService.sendToMember(ATHLETE_ID, {
      type: 'class_reminder',
      preferenceKey: 'classReminders',
      title: 'Tu clase empieza pronto',
      body: 'Recuerda llegar al box.',
      reminderKey: 'class:c1:reminder:30:member:a1'
    });

    assert.equal(result.duplicate, true);
    assert.equal(fetched, false);
  });

  test('runDueNotificationJobs sends class and QR reminders without duplicates', async (t) => {
    withPushEnabled(t, 'true');
    const now = new Date('2026-07-03T14:30:00.000Z');
    const classDate = new Date('2026-07-03T00:00:00.000Z');
    const classRow = {
      _id: '65c000000000000000000101',
      date: classDate,
      time: '09:00',
      branch: 'Torres',
      capacity: 12,
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    };
    t.mock.method(GymClass, 'find', () => query([classRow]));
    t.mock.method(GymClass, 'findById', () => query(classRow));
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, classReminders: true, branchPreference: 'all' } }));
    t.mock.method(Member, 'find', () => query([]));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    t.mock.method(NotificationLog, 'findOne', async () => null);
    const logs = [];
    t.mock.method(NotificationLog, 'create', async (data) => {
      logs.push(data);
      return data;
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));

    const result = await runDueNotificationJobs({ now });

    assert.equal(result.classReminders30, 1);
    assert.ok(logs.some((row) => row.type === 'class_reminder'));
    assert.ok(logs.every((row) => !String(row.error || '').includes(pushTokenA)));
  });

  test('runDueNotificationJobs sends QR reminder when class is starting', async (t) => {
    withPushEnabled(t, 'true');
    const now = new Date('2026-07-03T15:00:00.000Z');
    const classRow = {
      _id: '65c000000000000000000102',
      date: new Date('2026-07-03T00:00:00.000Z'),
      time: '09:00',
      branch: 'Torres',
      capacity: 12,
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    };
    t.mock.method(GymClass, 'find', () => query([classRow]));
    t.mock.method(GymClass, 'findById', () => query(classRow));
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, classReminders: true, branchPreference: 'all' } }));
    t.mock.method(Member, 'find', () => query([]));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    t.mock.method(NotificationLog, 'findOne', async () => null);
    const logs = [];
    t.mock.method(NotificationLog, 'create', async (data) => {
      logs.push(data);
      return data;
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));

    const result = await runDueNotificationJobs({ now });

    assert.equal(result.qrReminders, 1);
    assert.ok(logs.some((row) => row.type === 'class_qr_reminder'));
  });

  test('runDueNotificationJobs sends membership reminder only when there is a reliable endDate', async (t) => {
    withPushEnabled(t, 'true');
    const now = new Date('2026-07-01T12:00:00.000Z');
    t.mock.method(GymClass, 'find', () => query([]));
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID, membership: { endDate: new Date('2026-07-08T00:00:00.000Z') }, notificationPreferences: { enabled: true, membership: true } },
      { _id: OTHER_ID, membership: {}, notificationPreferences: { enabled: true, membership: true } }
    ]));
    t.mock.method(Member, 'findById', (id) => query({ _id: id, notificationPreferences: { enabled: true, membership: true } }));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    t.mock.method(NotificationLog, 'findOne', async () => null);
    const logs = [];
    t.mock.method(NotificationLog, 'create', async (data) => {
      logs.push(data);
      return data;
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));

    const result = await runDueNotificationJobs({ now });

    assert.equal(result.membershipReminders, 1);
    assert.equal(logs.filter((row) => row.type === 'membership_reminder').length, 1);
  });

  test('sendPostNotification fans out a new post notification', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(Post, 'findById', () => query({ _id: 'post1', title: 'Aviso', body: 'Trae agua al box' }));
    t.mock.method(Member, 'find', () => query([{ _id: ATHLETE_ID, role: 'athlete', status: 'active' }]));
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, posts: true, branchPreference: 'all' } }));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    t.mock.method(NotificationLog, 'findOne', async () => null);
    let logged;
    t.mock.method(NotificationLog, 'create', async (data) => {
      logged = data;
      return data;
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));

    const result = await notificationService.sendPostNotification('post1');

    assert.equal(result.sent, 1);
    assert.equal(logged.type, 'post');
    assert.equal(logged.postId, 'post1');
  });

  test('sendClassChangeNotification notifies reserved athletes', async (t) => {
    withPushEnabled(t, 'true');
    t.mock.method(GymClass, 'findById', () => query({
      _id: '65c000000000000000000201',
      date: new Date('2026-07-03T00:00:00.000Z'),
      time: '06:00',
      branch: 'Central',
      reservations: [{ member: ATHLETE_ID, status: 'reserved' }]
    }));
    t.mock.method(Member, 'findById', () => query({ ...athlete, notificationPreferences: { enabled: true, classChanges: true, branchPreference: 'all' } }));
    t.mock.method(PushToken, 'find', () => query([{ token: pushTokenA, enabled: true }]));
    t.mock.method(NotificationLog, 'findOne', async () => null);
    let logged;
    t.mock.method(NotificationLog, 'create', async (data) => {
      logged = data;
      return data;
    });
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }));

    const result = await notificationService.sendClassChangeNotification('65c000000000000000000201', 'Cambio de hora');

    assert.equal(result.sent, 1);
    assert.equal(logged.type, 'class_change');
    assert.equal(logged.branch, 'Central');
  });
});

describe('rotating branch QR check-in sprint 11', () => {
  function withQrEnv(t) {
    const oldSecret = process.env.CHECKIN_QR_SECRET;
    const oldBefore = process.env.CHECKIN_QR_WINDOW_MINUTES_BEFORE;
    const oldAfter = process.env.CHECKIN_QR_WINDOW_MINUTES_AFTER;
    process.env.CHECKIN_QR_SECRET = 'test-qr-secret-with-enough-entropy';
    process.env.CHECKIN_QR_WINDOW_MINUTES_BEFORE = '30';
    process.env.CHECKIN_QR_WINDOW_MINUTES_AFTER = '15';
    t.after(() => {
      if (oldSecret === undefined) delete process.env.CHECKIN_QR_SECRET;
      else process.env.CHECKIN_QR_SECRET = oldSecret;
      if (oldBefore === undefined) delete process.env.CHECKIN_QR_WINDOW_MINUTES_BEFORE;
      else process.env.CHECKIN_QR_WINDOW_MINUTES_BEFORE = oldBefore;
      if (oldAfter === undefined) delete process.env.CHECKIN_QR_WINDOW_MINUTES_AFTER;
      else process.env.CHECKIN_QR_WINDOW_MINUTES_AFTER = oldAfter;
    });
  }

  function classRow({
    id,
    branch = 'Torres',
    date = new Date('2026-07-03T00:00:00.000Z'),
    time = '09:00',
    capacity = 12,
    reservations = []
  } = {}) {
    return {
      _id: id || `65c00000000000000000${Math.random().toString().slice(2, 6).padStart(4, '0')}`,
      date,
      time,
      branch,
      name: 'CrossFit',
      capacity,
      reservations,
      saved: 0,
      async save() { this.saved += 1; return this; }
    };
  }

  async function classSlotForCurrentMinute() {
    let now = new Date();
    if (now.getUTCSeconds() > 55) {
      await new Promise((resolve) => setTimeout(resolve, (61 - now.getUTCSeconds()) * 1000));
      now = new Date();
    }
    const gymNow = new Date(now.getTime() + GYM_UTC_OFFSET_HOURS * 3600_000);
    const date = new Date(Date.UTC(gymNow.getUTCFullYear(), gymNow.getUTCMonth(), gymNow.getUTCDate()));
    const hour = String(gymNow.getUTCHours()).padStart(2, '0');
    const minute = String(gymNow.getUTCMinutes()).padStart(2, '0');
    return { now, date, time: `${hour}:${minute}` };
  }

  function mockAttendance(t) {
    const existing = {
      _id: 'attendance-1',
      classId: null,
      checkOut: null,
      async save() { this.saved = true; return this; }
    };
    t.mock.method(Attendance, 'findOne', () => query(existing));
    return existing;
  }

  function staticQrDoc(branch = 'Torres', token = `${branch.toLowerCase()}-static-token`) {
    const qr = checkinQr.buildStaticBranchCheckInQr(branch, {
      token,
      now: new Date('2026-07-03T14:00:00.000Z')
    });
    return {
      ...qr,
      _id: `${branch.toLowerCase()}-qr`,
      generation: 1,
      createdAt: qr.generatedAt,
      updatedAt: qr.generatedAt
    };
  }

  function mockCurrentQr(t, branch = 'Torres', token) {
    const doc = staticQrDoc(branch, token);
    t.mock.method(BranchCheckInQr, 'findOne', () => query(doc));
    return doc;
  }

  test('generates and validates a rotating QR for a branch', (t) => {
    withQrEnv(t);
    const now = new Date('2026-07-03T14:58:20.000Z');
    const qr = checkinQr.buildRotatingCheckInQr('Torres', { now });
    const payload = checkinQr.validateRotatingCheckInQr(qr.token, { now });

    assert.equal(qr.branch, 'Torres');
    assert.match(qr.qrValue, /inrage_branch_check_in/);
    assert.equal(payload.branch, 'Torres');
    assert.equal(qr.secondsRemaining, 40);
  });

  test('rotating QR rejects expired and invalid signatures', (t) => {
    withQrEnv(t);
    const now = new Date('2026-07-03T14:58:20.000Z');
    const qr = checkinQr.buildRotatingCheckInQr('Central', { now });

    assert.throws(
      () => checkinQr.validateRotatingCheckInQr(qr.token, { now: new Date('2026-07-03T15:00:01.000Z') }),
      /expiro/
    );
    assert.throws(
      () => checkinQr.validateRotatingCheckInQr(`${qr.token.slice(0, -4)}oops`, { now }),
      /valido/
    );
  });

  test('rotating QR accepts the previous minute for real scan latency', (t) => {
    withQrEnv(t);
    const issuedAt = new Date('2026-07-03T14:58:55.000Z');
    const scannedAt = new Date('2026-07-03T14:59:08.000Z');
    const qr = checkinQr.buildRotatingCheckInQr('Torres', { now: issuedAt });

    const payload = checkinQr.validateRotatingCheckInQr(qr.token, { now: scannedAt });

    assert.equal(payload.branch, 'Torres');
  });

  test('GET /api/admin/checkin-qr requires admin and returns branch QR', async (t) => {
    withQrEnv(t);
    mockCurrentQr(t, 'Central', 'central-current-token');
    mockAuth(t, athlete);
    const denied = await request('/api/admin/checkin-qr?branch=Torres', { token: athleteToken });
    assert.equal(denied.response.status, 403);

    t.mock.reset();
    mockCurrentQr(t, 'Central', 'central-current-token');
    mockAuth(t, admin);
    const allowed = await request('/api/admin/checkin-qr?branch=Central', { token: adminToken });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.payload.branch, 'Central');
    assert.ok(allowed.payload.qrValue);
    assert.equal(allowed.payload.static, true);
  });

  test('GET /api/admin/checkin-qr returns clear not generated error', async (t) => {
    t.mock.method(BranchCheckInQr, 'findOne', () => query(null));
    mockAuth(t, admin);

    const { response, payload } = await request('/api/admin/checkin-qr?branch=Torres', { token: adminToken });

    assert.equal(response.status, 404);
    assert.equal(payload.status, 'qr_not_generated');
  });

  test('POST /api/admin/checkin-qr generates a new printable QR and invalidates previous generation', async (t) => {
    mockAuth(t, admin);
    const previous = { generation: 3 };
    let savedUpdate;
    t.mock.method(BranchCheckInQr, 'findOne', () => query(previous));
    t.mock.method(BranchCheckInQr, 'findOneAndUpdate', (_filter, update) => {
      savedUpdate = update.$set;
      return query({ _id: 'qr-central', ...savedUpdate, createdAt: savedUpdate.generatedAt, updatedAt: savedUpdate.generatedAt });
    });

    const { response, payload } = await request('/api/admin/checkin-qr', {
      token: adminToken,
      method: 'POST',
      body: { branch: 'Central' }
    });

    assert.equal(response.status, 200);
    assert.equal(payload.branch, 'Central');
    assert.equal(payload.generation, 4);
    assert.match(payload.qrValue, /inrage_branch_static_check_in/);
    assert.equal(savedUpdate.generation, 4);
  });

  test('old printed branch QR is rejected after a new QR is generated for the branch', async (t) => {
    const oldQr = staticQrDoc('Torres', 'old-printed-token');
    const currentQr = staticQrDoc('Torres', 'new-current-token');
    t.mock.method(BranchCheckInQr, 'findOne', () => query(currentQr));

    await assert.rejects(
      () => checkinQr.validateCurrentBranchCheckInQr(oldQr.qrValue),
      (err) => err.code === 'qr_replaced'
    );
  });

  test('POST /api/attendances/check-in/qr checks in a valid reserved class', async (t) => {
    withQrEnv(t);
    mockAuth(t);
    mockAttendance(t);
    const slot = await classSlotForCurrentMinute();
    const gymClass = classRow({
      id: '65c000000000000000000301',
      branch: 'Torres',
      date: slot.date,
      time: slot.time,
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    });
    t.mock.method(GymClass, 'find', () => query([gymClass]));
    const qr = mockCurrentQr(t, 'Torres');

    const { response, payload } = await request('/api/attendances/check-in/qr', {
      token: athleteToken,
      method: 'POST',
      body: { token: qr.qrValue }
    });

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'checked_in_reserved_class');
    assert.equal(gymClass.reservations[0].status, 'checked_in');
    assert.equal(gymClass.reservations[0].autoReservedByQr, undefined);
  });

  test('reserved Torres athlete scanning Central QR gets wrong_branch_for_reservation', async (t) => {
    withQrEnv(t);
    const torres = classRow({
      id: '65c000000000000000000302',
      branch: 'Torres',
      time: '09:00',
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    });
    t.mock.method(GymClass, 'find', () => query([torres]));
    const qr = mockCurrentQr(t, 'Central');

    await assert.rejects(
      () => checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now: new Date('2026-07-03T14:58:20.000Z') }),
      (err) => err.code === 'wrong_branch_for_reservation'
    );
  });

  test('athlete without reservation must confirm before auto-reserve check-in', async (t) => {
    withQrEnv(t);
    mockAttendance(t);
    const gymClass = classRow({ id: '65c000000000000000000303', branch: 'Central', time: '09:00' });
    t.mock.method(GymClass, 'find', () => query([gymClass]));
    const now = new Date('2026-07-03T15:00:00.000Z');
    const qr = mockCurrentQr(t, 'Central');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'reservation_required');
    assert.equal(result.suggestedClass.time, '09:00');
    assert.equal(gymClass.reservations.length, 0);

    const confirmed = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true });

    assert.equal(confirmed.status, 'auto_reserved_and_checked_in');
    assert.equal(gymClass.reservations.length, 1);
    assert.equal(gymClass.reservations[0].status, 'checked_in');
    assert.equal(gymClass.reservations[0].autoReservedByQr, true);
  });

  test('POST /api/attendances/check-in/qr confirms auto-reserve only after user approval', async (t) => {
    withQrEnv(t);
    mockAuth(t);
    mockAttendance(t);
    const slot = await classSlotForCurrentMinute();
    const gymClass = classRow({
      id: '65c000000000000000000314',
      branch: 'Central',
      date: slot.date,
      time: slot.time
    });
    t.mock.method(GymClass, 'find', () => query([gymClass]));
    const qr = mockCurrentQr(t, 'Central');

    const first = await request('/api/attendances/check-in/qr', {
      token: athleteToken,
      method: 'POST',
      body: { token: qr.qrValue }
    });

    assert.equal(first.response.status, 200);
    assert.equal(first.payload.status, 'reservation_required');
    assert.equal(gymClass.reservations.length, 0);

    const second = await request('/api/attendances/check-in/qr', {
      token: athleteToken,
      method: 'POST',
      body: { token: qr.qrValue, confirmAutoReserve: true }
    });

    assert.equal(second.response.status, 200);
    assert.equal(second.payload.status, 'auto_reserved_and_checked_in');
    assert.equal(gymClass.reservations.length, 1);
    assert.equal(gymClass.reservations[0].status, 'checked_in');
    assert.equal(gymClass.reservations[0].autoReservedByQr, true);
  });

  test('reserved athlete can check in up to 30 minutes before the reserved class', async (t) => {
    withQrEnv(t);
    mockAttendance(t);
    const reserved = classRow({
      id: '65c000000000000000000311',
      branch: 'Torres',
      time: '11:00',
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    });
    t.mock.method(GymClass, 'find', () => query([reserved]));
    const now = new Date('2026-07-03T16:30:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'checked_in_reserved_class');
    assert.equal(String(result.classId), String(reserved._id));
    assert.equal(reserved.reservations[0].status, 'checked_in');
    assert.equal(reserved.reservations[0].autoReservedByQr, undefined);
  });

  test('far future reservation is not moved automatically to the arrival class', async (t) => {
    withQrEnv(t);
    const arrivalClass = classRow({
      id: '65c000000000000000000312',
      branch: 'Torres',
      time: '15:00'
    });
    const futureReserved = classRow({
      id: '65c000000000000000000313',
      branch: 'Torres',
      time: '17:00',
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    });
    t.mock.method(GymClass, 'find', () => query([arrivalClass, futureReserved]));
    const now = new Date('2026-07-03T21:00:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    await assert.rejects(
      () => checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true }),
      (err) => err.code === 'wrong_class_for_reservation'
    );
    assert.equal(arrivalClass.reservations.length, 0);
    assert.equal(futureReserved.reservations[0].status, 'reserved');
    assert.equal(futureReserved.saved, 0);
  });

  test('no-reservation scan 14 minutes after start asks and then enters that class', async (t) => {
    withQrEnv(t);
    mockAttendance(t);
    const current = classRow({ id: '65c000000000000000000304', branch: 'Torres', time: '09:00' });
    const next = classRow({ id: '65c000000000000000000305', branch: 'Torres', time: '09:30' });
    t.mock.method(GymClass, 'find', () => query([current, next]));
    const now = new Date('2026-07-03T15:14:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'reservation_required');
    assert.equal(String(result.suggestedClass._id), String(current._id));
    assert.equal(current.reservations.length, 0);

    const confirmed = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true });

    assert.equal(String(confirmed.classId), String(current._id));
    assert.equal(current.reservations.length, 1);
    assert.equal(next.reservations.length, 0);
  });

  test('no-reservation scan 16 minutes after start suggests next available class', async (t) => {
    withQrEnv(t);
    mockAttendance(t);
    const previous = classRow({ id: '65c000000000000000000306', branch: 'Torres', time: '09:00' });
    const next = classRow({ id: '65c000000000000000000307', branch: 'Torres', time: '09:30' });
    t.mock.method(GymClass, 'find', () => query([previous, next]));
    const now = new Date('2026-07-03T15:16:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'reservation_required');
    assert.equal(String(result.suggestedClass._id), String(next._id));
    assert.equal(previous.reservations.length, 0);
    assert.equal(next.reservations.length, 0);

    const confirmed = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true });

    assert.equal(String(confirmed.classId), String(next._id));
    assert.equal(previous.reservations.length, 0);
    assert.equal(next.reservations.length, 1);
  });

  test('full class is skipped and next available class is suggested without exceeding capacity', async (t) => {
    withQrEnv(t);
    mockAttendance(t);
    const full = classRow({
      id: '65c000000000000000000308',
      branch: 'Central',
      time: '09:00',
      capacity: 1,
      reservations: [{ member: OTHER_ID, status: 'reserved', reservedAt: new Date() }]
    });
    const next = classRow({ id: '65c000000000000000000309', branch: 'Central', time: '09:30', capacity: 1 });
    t.mock.method(GymClass, 'find', () => query([full, next]));
    const now = new Date('2026-07-03T15:00:00.000Z');
    const qr = mockCurrentQr(t, 'Central');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'reservation_required');
    assert.equal(String(result.suggestedClass._id), String(next._id));

    const confirmed = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true });

    assert.equal(String(confirmed.classId), String(next._id));
    assert.equal(countReservations(full.reservations, full.capacity).spotsLeft, 0);
    assert.equal(countReservations(next.reservations, next.capacity).spotsLeft, 0);
  });

  test('late reserved athlete gets too_late_for_checkin and is not moved', async (t) => {
    withQrEnv(t);
    const previous = classRow({
      id: '65c000000000000000000315',
      branch: 'Torres',
      time: '09:00',
      reservations: [{ member: ATHLETE_ID, status: 'reserved', reservedAt: new Date() }]
    });
    const next = classRow({ id: '65c000000000000000000316', branch: 'Torres', time: '09:30' });
    t.mock.method(GymClass, 'find', () => query([previous, next]));
    const now = new Date('2026-07-03T15:16:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    await assert.rejects(
      () => checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now, confirmAutoReserve: true }),
      (err) => err.code === 'too_late_for_checkin'
    );
    assert.equal(previous.reservations[0].status, 'reserved');
    assert.equal(next.reservations.length, 0);
  });

  test('no available class returns no_available_class', async (t) => {
    withQrEnv(t);
    t.mock.method(GymClass, 'find', () => query([]));
    const now = new Date('2026-07-03T15:00:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    await assert.rejects(
      () => checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now }),
      (err) => err.code === 'no_available_class'
    );
  });

  test('already checked-in reservation does not duplicate reservation or attendance', async (t) => {
    withQrEnv(t);
    const attendance = mockAttendance(t);
    const gymClass = classRow({
      id: '65c000000000000000000310',
      branch: 'Torres',
      time: '09:00',
      reservations: [{ member: ATHLETE_ID, status: 'checked_in', checkedInAt: new Date('2026-07-03T14:55:00.000Z') }]
    });
    t.mock.method(GymClass, 'find', () => query([gymClass]));
    const now = new Date('2026-07-03T15:00:00.000Z');
    const qr = mockCurrentQr(t, 'Torres');

    const result = await checkinQr.checkInWithRotatingQr(ATHLETE_ID, qr.qrValue, { now });

    assert.equal(result.status, 'already_checked_in');
    assert.equal(gymClass.reservations.length, 1);
    assert.equal(attendance.saved, true);
  });
});
