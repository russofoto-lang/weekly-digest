import assert from 'node:assert/strict';
import test from 'node:test';
import { formatIsoWeekDateRange, getIsoWeekDateRangeFromIso } from './iso-week.js';

test('converte una settimana ISO nel range italiano corretto', () => {
  assert.equal(formatIsoWeekDateRange('2026-W35'), '24 agosto 2026 – 30 agosto 2026');
  const range = getIsoWeekDateRangeFromIso('2026-W35');
  assert.equal(range.start.toISOString(), '2026-08-24T00:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-08-30T00:00:00.000Z');
});

test('rifiuta settimane ISO inesistenti', () => {
  assert.throws(() => formatIsoWeekDateRange('2026-W99'), /Settimana ISO non valida/);
});
