'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RateLimitStore } = require('../src/modules/rateLimit/rateLimit.store');

test('accepts up to maxAccepted requests in a window', () => {
  const s = new RateLimitStore({ windowMs: 60_000, maxAccepted: 5 });
  const now = 1_000_000;
  for (let i = 0; i < 5; i += 1) {
    const r = s.tryAccept('u1', now + i);
    assert.equal(r.accepted, true);
    assert.equal(r.acceptedInWindow, i + 1);
  }
  const sixth = s.tryAccept('u1', now + 5);
  assert.equal(sixth.accepted, false);
  assert.ok(sixth.retryAfterMs > 0);
});

test('isolates buckets per user_id', () => {
  const s = new RateLimitStore({ windowMs: 60_000, maxAccepted: 5 });
  const now = 1_000_000;
  for (let i = 0; i < 5; i += 1) s.tryAccept('a', now);
  const aBlocked = s.tryAccept('a', now);
  const bOk = s.tryAccept('b', now);
  assert.equal(aBlocked.accepted, false);
  assert.equal(bOk.accepted, true);
});

test('rolling window: old timestamps drop off after windowMs', () => {
  const s = new RateLimitStore({ windowMs: 60_000, maxAccepted: 5 });
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i += 1) s.tryAccept('u', t0);
  assert.equal(s.tryAccept('u', t0 + 30_000).accepted, false);
  assert.equal(s.tryAccept('u', t0 + 60_001).accepted, true);
});

test('rejected_total is cumulative across windows', () => {
  const s = new RateLimitStore({ windowMs: 60_000, maxAccepted: 2 });
  const t = 1_000_000;
  s.tryAccept('u', t);
  s.tryAccept('u', t);
  s.tryAccept('u', t); // reject 1
  s.tryAccept('u', t); // reject 2
  const stats1 = s.getStats('u', t);
  assert.equal(stats1.rejected_total, 2);

  // Move past window; rejections counter persists.
  s.tryAccept('u', t + 60_001);
  s.tryAccept('u', t + 60_001);
  s.tryAccept('u', t + 60_001); // reject 3
  const stats2 = s.getStats('u', t + 60_001);
  assert.equal(stats2.rejected_total, 3);
  assert.equal(stats2.accepted_in_current_window, 2);
});
