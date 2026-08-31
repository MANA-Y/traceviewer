import test from 'node:test';
import assert from 'node:assert/strict';
import { getVirtualRange } from '../src/core/virtualWindow.js';

test('virtual range includes visible rows and overscan', () => {
  assert.deepEqual(getVirtualRange({
    itemCount: 100_000,
    itemHeight: 24,
    scrollTop: 24_000,
    viewportHeight: 720,
    overscan: 10,
  }), { start: 990, end: 1040 });
});

test('virtual range clamps at both ends', () => {
  assert.deepEqual(getVirtualRange({
    itemCount: 8,
    itemHeight: 24,
    scrollTop: 0,
    viewportHeight: 720,
  }), { start: 0, end: 8 });
  assert.deepEqual(getVirtualRange({
    itemCount: 0,
    itemHeight: 24,
    scrollTop: 0,
    viewportHeight: 720,
  }), { start: 0, end: 0 });
});
