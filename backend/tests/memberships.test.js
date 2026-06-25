import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDaysLeft,
  extendMembershipEndDate,
  resolveMembershipStatus,
  runMembershipReminders,
  summarizeMemberships
} from '../src/services/memberships.js';
import { Member } from '../src/models/Member.js';
import { Notification } from '../src/models/Notification.js';

describe('membership status rules', () => {
  const today = '2026-06-25';

  test('calculates days left using calendar days', () => {
    assert.equal(calculateDaysLeft('2026-07-02', today), 7);
    assert.equal(calculateDaysLeft('2026-06-25', today), 0);
    assert.equal(calculateDaysLeft('2026-06-24', today), -1);
  });

  test('derives active, expiring and expired from endDate', () => {
    assert.deepEqual(
      resolveMembershipStatus({ status: 'active', endDate: '2026-07-10' }, today),
      { status: 'active', daysLeft: 15 }
    );
    assert.deepEqual(
      resolveMembershipStatus({ status: 'active', endDate: '2026-07-02' }, today),
      { status: 'expiring_soon', daysLeft: 7 }
    );
    assert.deepEqual(
      resolveMembershipStatus({ status: 'active', endDate: '2026-06-24' }, today),
      { status: 'expired', daysLeft: -1 }
    );
  });

  test('respects frozen and inactive manual states', () => {
    assert.equal(
      resolveMembershipStatus({ status: 'frozen', endDate: '2026-06-01' }, today).status,
      'frozen'
    );
    assert.equal(
      resolveMembershipStatus({ status: 'inactive', endDate: '2026-12-01' }, today).status,
      'inactive'
    );
  });

  test('uses safe states when membership or endDate is missing', () => {
    assert.deepEqual(
      resolveMembershipStatus(undefined, today),
      { status: 'inactive', daysLeft: null }
    );
    assert.deepEqual(
      resolveMembershipStatus({ status: 'active' }, today),
      { status: 'active', daysLeft: null }
    );
    assert.deepEqual(
      resolveMembershipStatus({ status: 'expired' }, today),
      { status: 'expired', daysLeft: null }
    );
  });

  test('summarizes effective statuses', () => {
    const summary = summarizeMemberships([
      { membership: { status: 'active', endDate: '2026-08-01' } },
      { membership: { status: 'active', endDate: '2026-07-02' } },
      { membership: { status: 'active', endDate: '2026-06-26' } },
      { membership: { status: 'active', endDate: '2026-06-20' } },
      { membership: { status: 'frozen', endDate: '2026-07-30' } },
      {}
    ], today);

    assert.deepEqual(summary, {
      totalActive: 1,
      expiring7Days: 2,
      expiringTomorrow: 1,
      expired: 1,
      frozen: 1,
      inactive: 1
    });
  });
});

describe('membership payment extension', () => {
  test('extends an active membership from its current end date', () => {
    const result = extendMembershipEndDate(
      { endDate: new Date('2026-07-15T00:00:00.000Z') },
      { months: 2, paidAt: new Date('2026-06-25T18:00:00.000Z') }
    );
    assert.equal(result.endDate.toISOString(), '2026-09-15T00:00:00.000Z');
  });

  test('extends an expired membership from payment date and clamps month end', () => {
    const result = extendMembershipEndDate(
      { endDate: new Date('2025-12-01T00:00:00.000Z') },
      { months: 1, paidAt: new Date('2026-01-31T00:00:00.000Z') }
    );
    assert.equal(result.endDate.toISOString(), '2026-02-28T00:00:00.000Z');
  });
});

describe('automatic reminder idempotency', () => {
  const reminderCases = [
    ['membership_expiring_7_days', '2026-06-29T00:00:00.000Z'],
    ['membership_expiring_1_day', '2026-06-26T00:00:00.000Z'],
    ['membership_expired', '2026-06-24T00:00:00.000Z']
  ];

  for (const [expectedType, endDate] of reminderCases) {
    test(`repeated sweeps do not duplicate ${expectedType}`, async (t) => {
      const now = new Date('2026-06-25T18:00:00.000Z');
      const member = {
        _id: `member-${expectedType}`,
        name: 'Ana',
        membership: { status: 'active', endDate: new Date(endDate) },
        async save() {}
      };
      const notifications = [];

      t.mock.method(Member, 'find', async () => [member]);
      t.mock.method(Notification, 'findOne', async ({ reminderKey }) =>
        notifications.find((item) => item.reminderKey === reminderKey) || null);
      t.mock.method(Notification, 'create', async (data) => {
        notifications.push(data);
        return data;
      });

      const first = await runMembershipReminders(now);
      const second = await runMembershipReminders(now);

      assert.equal(first.created, 1);
      assert.equal(second.created, 0);
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].type, expectedType);
    });
  }

  test('concurrent sweeps create one notification for the same membership cycle', async (t) => {
    const now = new Date('2026-06-25T18:00:00.000Z');
    const makeMember = () => ({
      _id: '64b000000000000000000099',
      name: 'Ana',
      membership: {
        status: 'active',
        endDate: new Date('2026-06-29T00:00:00.000Z')
      },
      async save() {}
    });
    const members = [makeMember(), makeMember()];
    let findCall = 0;
    const keys = new Set();

    t.mock.method(Member, 'find', async () => [members[findCall++]]);
    t.mock.method(Notification, 'findOne', async () => null);
    t.mock.method(Notification, 'create', async (data) => {
      if (keys.has(data.reminderKey)) {
        const duplicate = new Error('duplicate reminder');
        duplicate.code = 11000;
        throw duplicate;
      }
      keys.add(data.reminderKey);
      return data;
    });

    const [first, second] = await Promise.all([
      runMembershipReminders(now),
      runMembershipReminders(now)
    ]);

    assert.equal(first.created + second.created, 1);
    assert.equal(keys.size, 1);
  });
});
