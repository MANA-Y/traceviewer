import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceTrace } from '../scripts/performance-fixture.mjs';

test('performance fixture generator is deterministic and spans source lines', () => {
  const trace = createPerformanceTrace(25, 10);
  const lineOf = (stepIndex) => trace.frames[trace.steps[stepIndex][0][0]].line_number;
  assert.equal(trace.steps.length, 25);
  assert.equal(lineOf(0), 1);
  assert.equal(lineOf(10), 1);
  assert.equal(lineOf(24), 5);
  assert.equal(Object.keys(trace.files).length, 1);
});
