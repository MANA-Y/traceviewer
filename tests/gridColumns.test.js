import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedColumns } from '../src/rendering/gridColumns.js';

test('fits small groups on a single row', () => {
  assert.equal(balancedColumns(1), 1);
  assert.equal(balancedColumns(3), 3);
  assert.equal(balancedColumns(4), 4);
  assert.equal(balancedColumns(3, 3), 3);
});

test('spreads larger groups over full rows instead of leaving orphans', () => {
  assert.equal(balancedColumns(5), 3);
  assert.equal(balancedColumns(6), 3);
  assert.equal(balancedColumns(7), 4);
  assert.equal(balancedColumns(8), 4);
  assert.equal(balancedColumns(9), 3);
  assert.equal(balancedColumns(4, 3), 2);
  assert.equal(balancedColumns(6, 3), 3);
});

test('falls back to one column for invalid counts', () => {
  assert.equal(balancedColumns(0), 1);
  assert.equal(balancedColumns(-2), 1);
  assert.equal(balancedColumns(2.5), 1);
});
