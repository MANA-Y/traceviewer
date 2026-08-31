import { pathToFileURL } from 'node:url';
import { compileTrace } from '../src/core/compileTrace.js';
import { validateTrace } from '../src/core/trace.js';

export function createPerformanceTrace(stepCount = 100_000, lineCount = 10_000) {
  const path = 'performance_fixture.py';
  const source = Array.from({ length: lineCount }, (_, index) => `value_${index + 1} = ${index + 1}`).join('\n');
  const frames = Array.from({ length: lineCount }, (_, index) => ({
    path,
    line_number: index + 1,
    function_name: 'benchmark',
    invocation_id: 1,
  }));
  const steps = Array.from({ length: stepCount }, (_, index) => [
    [index % lineCount],
    0,
    0,
    0,
    index % 128 === 0 ? { checkpoint: index } : {},
  ]);
  return {
    formatVersion: 2,
    files: { [path]: source },
    frames,
    renderings: [[]],
    outputs: [''],
    steps,
  };
}

export function runBenchmark(stepCount = 100_000) {
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const trace = createPerformanceTrace(stepCount);
  const started = performance.now();
  const compiled = compileTrace(validateTrace(trace));
  const compileMs = performance.now() - started;
  global.gc?.();
  const heapDeltaMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
  return {
    steps: compiled.playback.stepCount,
    compileMs: Number(compileMs.toFixed(1)),
    heapDeltaMb: Number(heapDeltaMb.toFixed(1)),
    locations: compiled.playback.stepsByLocation.size,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stepCount = Number.parseInt(process.argv[2] ?? '100000', 10);
  const result = runBenchmark(stepCount);
  console.log(JSON.stringify(result, null, 2));
  if (result.heapDeltaMb > 200) {
    console.error('Performance budget exceeded: compiled fixture uses more than 200 MB of heap');
    process.exitCode = 1;
  }
}
