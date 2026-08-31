import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cumulativeStream,
  includesQuery,
  previewValue,
  renderInspectorValue,
} from '../src/presenter/inspectorUtils.js';

test('inspector previews large values without losing the copyable value', () => {
  const value = { payload: 'x'.repeat(700) };
  const preview = previewValue(value, 80);
  assert.equal(preview.truncated, true);
  assert.equal(preview.text.length, 81);
  assert.equal(preview.fullText, renderInspectorValue(value));
});

test('cumulative streams include output through the active step', () => {
  const steps = [
    { stdout: 'one\n', stderr: '' },
    { stdout: '', stderr: 'warning\n' },
    { stdout: 'two\n', stderr: '' },
  ];
  assert.equal(cumulativeStream(steps, 1, 'stdout'), 'one\n');
  assert.equal(cumulativeStream(steps, 2, 'stdout'), 'one\ntwo\n');
  assert.equal(cumulativeStream(steps, 2, 'stderr'), 'warning\n');
});

test('inspector search is case-insensitive across fields', () => {
  assert.equal(includesQuery(['DemoValue', 42], 'demo'), true);
  assert.equal(includesQuery(['DemoValue', 42], 'missing'), false);
  assert.equal(includesQuery([], ''), true);
});
