import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, rehearsalSectionKey, targetStatus } from '../src/presenter/rehearsalUtils.js';

test('formats rehearsal durations and section names', () => {
  assert.equal(formatDuration(65_900), '01:05');
  assert.equal(formatDuration(3_661_000), '1:01:01');
  assert.equal(rehearsalSectionKey(null), 'Introduction');
  assert.equal(rehearsalSectionKey({ title: ' Results ' }), 'Results');
});

test('target status reports remaining time and overrun', () => {
  assert.deepEqual(targetStatus(30_000, 1), { overrun: false, label: '00:30 left' });
  assert.deepEqual(targetStatus(75_000, 1), { overrun: true, label: 'Over by 00:15' });
});
