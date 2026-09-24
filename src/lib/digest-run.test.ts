import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESEND_IDEMPOTENCY_SAFETY_WINDOW_MS,
  createDigestIdempotencyKey,
  isRunRetrySafe,
} from './digest-run.js';

test('la chiave di idempotenza non dipende dall ordine degli item', () => {
  const first = createDigestIdempotencyKey('2026-W35', ['b', 'a', 'c']);
  const second = createDigestIdempotencyKey('2026-W35', ['c', 'b', 'a']);

  assert.equal(first, second);
  assert.match(first, /^weekly-digest\/2026-W35\/[a-f0-9]{64}$/);
  assert.notEqual(first, createDigestIdempotencyKey('2026-W36', ['a', 'b', 'c']));
});

test('un run ambiguo non viene reinviato oltre la finestra sicura di Resend', () => {
  const now = Date.now();

  assert.equal(isRunRetrySafe(now - 1_000, now), true);
  assert.equal(isRunRetrySafe(now - RESEND_IDEMPOTENCY_SAFETY_WINDOW_MS, now), false);
});
