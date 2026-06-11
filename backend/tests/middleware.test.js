import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { adminOnly } from '../src/middleware/authMiddleware.js';
import { errorHandler, notFound } from '../src/middleware/errorHandler.js';

// Minimal stand-in for Express's res object: records status code and JSON body.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('adminOnly middleware', () => {
  test('blocks requests with no authenticated user', () => {
    const res = mockRes();
    let nextCalled = false;
    adminOnly({}, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  test('blocks members with role "member"', () => {
    const res = mockRes();
    let nextCalled = false;
    adminOnly({ user: { role: 'member' } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.message, 'Admin access required');
    assert.equal(nextCalled, false);
  });

  test('lets admins through', () => {
    const res = mockRes();
    let nextCalled = false;
    adminOnly({ user: { role: 'admin' } }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });
});

describe('errorHandler middleware', () => {
  test('uses the error status and message when provided', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Email already registered'), { status: 409 });
    errorHandler(err, {}, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'Email already registered');
  });

  test('defaults to 500 with a generic message', () => {
    const res = mockRes();
    errorHandler({}, {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'Internal server error');
  });
});

describe('notFound middleware', () => {
  test('returns 404 with the method and path', () => {
    const res = mockRes();
    notFound({ method: 'GET', path: '/api/nope' }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Not found: GET /api/nope');
  });
});
