import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTraceAsync } from '../src/core/traceCompiler.js';


const trace = {
  formatVersion: 2,
  files: { 'talk.py': 'pass\n' },
  frames: [{ path: 'talk.py', line_number: 1, function_name: 'main' }],
  renderings: [[]],
  outputs: [''],
  steps: [[[0], 0, 0, 0, {}]],
};

test('trace compiler validates and compiles through the non-worker fallback', async () => {
  const result = await compileTraceAsync(trace, null);
  assert.equal(result.trace.steps.length, 1);
  assert.ok(result.compiledTrace.playback.stepsByLocation instanceof Map);
});

test('trace compiler fallback rejects invalid snapshots', async () => {
  await assert.rejects(
    compileTraceAsync({ ...trace, steps: [] }, null),
    /steps must contain/,
  );
});
