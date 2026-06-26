import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ??= 'test-secret';

const { createApp } = await import('../src/app.js');
const { Member } = await import('../src/models/Member.js');
const { Notification } = await import('../src/models/Notification.js');
const { Attendance } = await import('../src/models/Attendance.js');
const { GymClass } = await import('../src/models/GymClass.js');
const { LoginLog } = await import('../src/models/LoginLog.js');

const ADMIN_ID = '64b000000000000000000001';
const ATHLETE_ID = '64b000000000000000000002';
const OTHER_ID = '64b000000000000000000003';

const admin = { _id: ADMIN_ID, name: 'Admin', role: 'admin', status: 'active' };
const athlete = { _id: ATHLETE_ID, name: 'Ana', role: 'athlete', status: 'active' };
const adminToken = jwt.sign({ id: ADMIN_ID }, process.env.JWT_SECRET);
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

function mockAuth(t, user = admin, extraById = {}) {
  t.mock.method(Member, 'findById', (id) => {
    const row = String(id) === String(user._id) ? user : extraById[String(id)] || null;
    return query(row);
  });
}

async function request(path, { token = adminToken, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { response, payload };
}

function mockPaymentNotification(t) {
  let createdNotification;
  t.mock.method(Notification, 'create', async (data) => {
    createdNotification = data;
    return { _id: 'notification-paid', ...data };
  });
  return () => createdNotification;
}

describe('admin memberships routes', () => {
  test('GET /api/admin/memberships/overview includes legacy members as inactive', async (t) => {
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID },
      { _id: OTHER_ID, membership: { status: 'frozen' } }
    ]));

    const { response, payload } = await request('/api/admin/memberships/overview');

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.inactive, 1);
    assert.equal(payload.frozen, 1);
  });

  test('GET /api/admin/memberships serializes members without membership or contact data', async (t) => {
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID, name: 'Ana' },
      {
        _id: OTHER_ID,
        name: 'Beto',
        email: 'beto@example.com',
        membership: { status: 'active', endDate: '2099-01-01T00:00:00.000Z' }
      }
    ]));

    const { response, payload } = await request('/api/admin/memberships');

    assert.equal(response.status, 200);
    assert.equal(payload.total, 2);
    assert.equal(payload.members[0].membershipStatus, 'inactive');
    assert.equal(payload.members[0].email, undefined);
    assert.equal(payload.members[0].phone, null);
  });

  test('POST /api/admin/memberships/:memberId/mark-paid initializes legacy membership', async (t) => {
    let saved = false;
    let createdNotification;
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: undefined,
      async save() { saved = true; }
    };
    mockAuth(t, admin, { [ATHLETE_ID]: member });
    t.mock.method(Notification, 'create', async (data) => {
      createdNotification = data;
      return { _id: 'notification-paid', ...data };
    });

    const { response, payload } = await request(
      `/api/admin/memberships/${ATHLETE_ID}/mark-paid`,
      {
        method: 'POST',
        body: { months: 1, paidAt: '2026-06-25T00:00:00.000Z', planName: 'Mensualidad' }
      }
    );

    assert.equal(response.status, 200);
    assert.equal(saved, true);
    assert.equal(member.membership.status, 'active');
    assert.equal(member.membership.endDate.toISOString(), '2026-07-25T00:00:00.000Z');
    assert.equal(createdNotification.type, 'payment_confirmed');
    assert.equal(payload.member.planName, 'Mensualidad');
  });

  test('POST /api/admin/memberships/:memberId/mark-paid extends active membership from endDate', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: {
        status: 'frozen',
        planName: 'Mensualidad',
        endDate: new Date('2026-07-15T00:00:00.000Z'),
        reminder7DaysSentAt: new Date('2026-07-08T00:00:00.000Z'),
        reminder1DaySentAt: new Date('2026-07-14T00:00:00.000Z'),
        expiredReminderSentAt: new Date('2026-07-16T00:00:00.000Z')
      },
      async save() {}
    };
    const getNotification = mockPaymentNotification(t);
    mockAuth(t, admin, { [ATHLETE_ID]: member });

    const { response, payload } = await request(
      `/api/admin/memberships/${ATHLETE_ID}/mark-paid`,
      {
        method: 'POST',
        body: { months: 2, paidAt: '2026-06-25T00:00:00.000Z' }
      }
    );

    assert.equal(response.status, 200);
    assert.equal(member.membership.status, 'active');
    assert.equal(member.membership.endDate.toISOString(), '2026-09-15T00:00:00.000Z');
    assert.equal(member.membership.lastPaymentAt.toISOString(), '2026-06-25T00:00:00.000Z');
    assert.equal(member.membership.nextPaymentDueAt.toISOString(), '2026-09-15T00:00:00.000Z');
    assert.equal(member.membership.reminder7DaysSentAt, undefined);
    assert.equal(member.membership.reminder1DaySentAt, undefined);
    assert.equal(member.membership.expiredReminderSentAt, undefined);
    assert.equal(getNotification().metadata.months, 2);
    assert.equal(payload.member.membershipEndDate, '2026-09-15T00:00:00.000Z');
  });

  test('POST /api/admin/memberships/:memberId/mark-paid extends expired membership from paid date', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: {
        status: 'expired',
        endDate: new Date('2026-05-01T00:00:00.000Z')
      },
      async save() {}
    };
    mockPaymentNotification(t);
    mockAuth(t, admin, { [ATHLETE_ID]: member });

    const { response } = await request(
      `/api/admin/memberships/${ATHLETE_ID}/mark-paid`,
      {
        method: 'POST',
        body: { months: 1, paidAt: '2026-06-25T00:00:00.000Z' }
      }
    );

    assert.equal(response.status, 200);
    assert.equal(member.membership.status, 'active');
    assert.equal(member.membership.endDate.toISOString(), '2026-07-25T00:00:00.000Z');
    assert.equal(member.membership.lastPaymentAt.toISOString(), '2026-06-25T00:00:00.000Z');
  });

  test('POST /api/admin/memberships/:memberId/mark-paid extends missing endDate from paid date', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: {
        status: 'inactive',
        planName: 'Mensualidad'
      },
      async save() {}
    };
    mockPaymentNotification(t);
    mockAuth(t, admin, { [ATHLETE_ID]: member });

    const { response } = await request(
      `/api/admin/memberships/${ATHLETE_ID}/mark-paid`,
      {
        method: 'POST',
        body: { months: 3, paidAt: '2026-06-25T00:00:00.000Z' }
      }
    );

    assert.equal(response.status, 200);
    assert.equal(member.membership.status, 'active');
    assert.equal(member.membership.endDate.toISOString(), '2026-09-25T00:00:00.000Z');
    assert.equal(member.membership.nextPaymentDueAt.toISOString(), '2026-09-25T00:00:00.000Z');
  });

  test('PATCH /api/admin/memberships/:memberId updates startDate without resetting reminder flags', async (t) => {
    const reminder7DaysSentAt = new Date('2026-07-08T00:00:00.000Z');
    const reminder1DaySentAt = new Date('2026-07-14T00:00:00.000Z');
    const expiredReminderSentAt = new Date('2026-07-16T00:00:00.000Z');
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: {
        status: 'active',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-07-15T00:00:00.000Z'),
        reminder7DaysSentAt,
        reminder1DaySentAt,
        expiredReminderSentAt
      },
      async save() {}
    };
    mockAuth(t, admin, { [ATHLETE_ID]: member });

    const { response } = await request(
      `/api/admin/memberships/${ATHLETE_ID}`,
      { method: 'PATCH', body: { startDate: '2026-02-10' } }
    );

    assert.equal(response.status, 200);
    assert.equal(member.membership.startDate.toISOString(), '2026-02-10T00:00:00.000Z');
    assert.equal(member.membership.endDate.toISOString(), '2026-07-15T00:00:00.000Z');
    assert.equal(member.membership.reminder7DaysSentAt, reminder7DaysSentAt);
    assert.equal(member.membership.reminder1DaySentAt, reminder1DaySentAt);
    assert.equal(member.membership.expiredReminderSentAt, expiredReminderSentAt);
  });

  test('PATCH /api/admin/memberships/:memberId resets reminder flags when endDate changes', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      membership: {
        status: 'active',
        endDate: new Date('2026-07-01T00:00:00.000Z'),
        reminder7DaysSentAt: new Date(),
        reminder1DaySentAt: new Date(),
        expiredReminderSentAt: new Date()
      },
      async save() {}
    };
    mockAuth(t, admin, { [ATHLETE_ID]: member });

    const { response } = await request(
      `/api/admin/memberships/${ATHLETE_ID}`,
      { method: 'PATCH', body: { endDate: '2026-08-01' } }
    );

    assert.equal(response.status, 200);
    assert.equal(member.membership.endDate.toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(member.membership.reminder7DaysSentAt, undefined);
    assert.equal(member.membership.reminder1DaySentAt, undefined);
    assert.equal(member.membership.expiredReminderSentAt, undefined);
  });

  test('POST /api/admin/memberships/:memberId/send-reminder supports no membership', async (t) => {
    let createdNotification;
    const member = { _id: ATHLETE_ID, name: 'Ana', membership: undefined };
    mockAuth(t, admin, { [ATHLETE_ID]: member });
    t.mock.method(Notification, 'create', async (data) => {
      createdNotification = data;
      return { _id: 'notification-manual', ...data };
    });

    const { response, payload } = await request(
      `/api/admin/memberships/${ATHLETE_ID}/send-reminder`,
      { method: 'POST', body: {} }
    );

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(createdNotification.type, 'admin_manual_reminder');
    assert.match(createdNotification.body, /revisar el estado/i);
  });

  test('POST /api/admin/memberships/run-reminders is idempotent across repeated sweeps', async (t) => {
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      membership: {
        status: 'active',
        endDate: new Date(Date.now() + 4 * 86_400_000)
      },
      async save() {}
    };
    const notifications = [];
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([member]));
    t.mock.method(Notification, 'findOne', async ({ reminderKey }) =>
      notifications.find((item) => item.reminderKey === reminderKey) || null);
    t.mock.method(Notification, 'create', async (data) => {
      notifications.push(data);
      return data;
    });

    const first = await request('/api/admin/memberships/run-reminders', { method: 'POST' });
    const second = await request('/api/admin/memberships/run-reminders', { method: 'POST' });

    assert.equal(first.response.status, 200);
    assert.equal(first.payload.created, 1);
    assert.equal(second.payload.created, 0);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'membership_expiring_7_days');
  });
});

describe('legacy member compatibility', () => {
  test('POST /api/auth/login works for a member without membership', async (t) => {
    const password = await bcrypt.hash('secret123', 4);
    const member = {
      _id: ATHLETE_ID,
      name: 'Ana',
      email: 'ana@example.com',
      password,
      role: 'athlete',
      status: 'active'
    };
    t.mock.method(Member, 'findOne', () => query(member));
    t.mock.method(LoginLog, 'create', async () => ({}));

    const { response, payload } = await request('/api/auth/login', {
      token: null,
      method: 'POST',
      body: { email: member.email, password: 'secret123' }
    });

    assert.equal(response.status, 200);
    assert.ok(payload.token);
    assert.equal(payload.user.email, member.email);
  });

  test('GET /api/auth/me adds a safe inactive membership for legacy members', async (t) => {
    mockAuth(t, athlete);

    const { response, payload } = await request('/api/auth/me', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(payload.membership.status, 'inactive');
    assert.equal(payload.membership.endDate, null);
  });

  test('GET /api/members keeps legacy members visible to admin', async (t) => {
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID, name: 'Ana', email: 'ana@example.com', status: 'active' }
    ]));
    t.mock.method(LoginLog, 'aggregate', async () => []);

    const { response, payload } = await request('/api/members');

    assert.equal(response.status, 200);
    assert.equal(payload.length, 1);
    assert.equal(payload[0].name, 'Ana');
    assert.equal(payload[0].membership, undefined);
  });
});

describe('athlete notifications routes', () => {
  test('GET /api/notifications returns recent rows and unread count', async (t) => {
    mockAuth(t, athlete);
    t.mock.method(Notification, 'find', () => query([
      { _id: 'n1', member: ATHLETE_ID, title: 'Uno', status: 'unread' },
      { _id: 'n2', member: ATHLETE_ID, title: 'Dos', status: 'read' }
    ]));

    const { response, payload } = await request('/api/notifications', { token: athleteToken });

    assert.equal(response.status, 200);
    assert.equal(payload.notifications.length, 2);
    assert.equal(payload.unread, 1);
  });

  test('PATCH /api/notifications/:id/read marks only the athlete notification', async (t) => {
    let saved = false;
    const notification = {
      _id: 'n1',
      member: ATHLETE_ID,
      status: 'unread',
      async save() { saved = true; }
    };
    mockAuth(t, athlete);
    t.mock.method(Notification, 'findOne', async (filter) => {
      assert.equal(String(filter.member), ATHLETE_ID);
      return notification;
    });

    const { response, payload } = await request(
      '/api/notifications/n1/read',
      { token: athleteToken, method: 'PATCH' }
    );

    assert.equal(response.status, 200);
    assert.equal(saved, true);
    assert.equal(notification.status, 'read');
    assert.ok(notification.readAt instanceof Date);
    assert.equal(payload.notification.status, 'read');
  });
});

describe('admin business routes', () => {
  test('GET /api/admin/business/overview handles legacy members and empty activity', async (t) => {
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID, status: 'active' },
      { _id: OTHER_ID, status: 'pending', membership: { status: 'frozen' } }
    ]));
    t.mock.method(GymClass, 'find', () => query([]));
    t.mock.method(Attendance, 'find', () => query([]));
    t.mock.method(Attendance, 'distinct', async () => []);

    const { response, payload } = await request('/api/admin/business/overview');

    assert.equal(response.status, 200);
    assert.equal(payload.today.classesCount, 0);
    assert.equal(payload.last7Days.visits, 0);
    assert.equal(payload.memberships.inactive, 1);
    assert.equal(payload.memberships.frozen, 1);
    assert.ok(payload.alerts.some((alert) => alert.type === 'athletes_risk'));
  });

  test('GET /api/admin/business/athletes-risk handles athletes without attendance or membership', async (t) => {
    mockAuth(t);
    t.mock.method(Member, 'find', () => query([
      { _id: ATHLETE_ID, name: 'Ana', email: 'ana@example.com' }
    ]));
    t.mock.method(Attendance, 'aggregate', async () => []);

    const { response, payload } = await request('/api/admin/business/athletes-risk');

    assert.equal(response.status, 200);
    assert.equal(payload.athletes.length, 1);
    assert.equal(payload.athletes[0].riskLevel, 'unknown');
    assert.equal(payload.athletes[0].membershipStatus, 'inactive');
    assert.equal(payload.athletes[0].membershipEndDate, null);
  });
});
