import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDaysLeft,
  extendMembershipEndDate,
  resolveMembershipStatus,
  summarizeMemberships
} from '../src/services/memberships.js';

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
