/**
 * Rewrite a version 1 trace snapshot as version 2.
 *
 * Version 1 repeated every stack frame, rendering list, and output string in
 * every step. Version 2 stores each distinct value once and refers to it by
 * index. This script exists to convert snapshots recorded before the change;
 * the producer writes version 2 directly.
 *
 * Usage: node scripts/convert-trace-v1-to-v2.mjs <trace.json> [more.json ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function createTable() {
  const indexes = new Map();
  const values = [];
  return {
    values,
    intern(value) {
      const key = JSON.stringify(value);
      let index = indexes.get(key);
      if (index === undefined) {
        index = values.length;
        indexes.set(key, index);
        values.push(value);
      }
      return index;
    },
  };
}

export function convertTrace(trace) {
  if (!Array.isArray(trace?.steps) ||
      trace.formatVersion === 2 ||
      trace.formatVersion === '2' ||
      (trace.formatVersion !== 1 && trace.formatVersion !== undefined)) {
    throw new Error('Input is not a version 1 trace snapshot');
  }
  if (trace.steps.some((step) => !Array.isArray(step?.stack) || step.stack.length === 0)) {
    throw new Error('Version 1 steps must have a non-empty stack');
  }
  const frames = createTable();
  const renderings = createTable();
  const outputs = createTable();
  const visibleSteps = new Set();
  const presentationScopes = new Set();
  for (let stepIndex = 0; stepIndex < trace.steps.length; stepIndex++) {
    const step = trace.steps[stepIndex];
    if ((step.renderings ?? []).some((item) => item.type !== 'notes')) {
      const frame = step.stack.at(-1);
      visibleSteps.add(stepIndex);
      presentationScopes.add(JSON.stringify([frame.path, frame.function_name]));
    }
  }
  const presentationSteps = [];
  const seenLocations = new Set();
  const steps = trace.steps.map((step, stepIndex) => {
    const frame = step.stack.at(-1);
    const scope = JSON.stringify([frame.path, frame.function_name]);
    const location = JSON.stringify([scope, frame.line_number]);
    if (presentationScopes.has(scope) &&
        (!seenLocations.has(location) || visibleSteps.has(stepIndex))) {
      presentationSteps.push(stepIndex);
    }
    seenLocations.add(location);
    return [
      step.stack.map((frame) => frames.intern(frame)),
      renderings.intern(step.renderings ?? []),
      outputs.intern(step.stdout ?? ''),
      outputs.intern(step.stderr ?? ''),
      step.env ?? {},
    ];
  });
  return {
    formatVersion: 2,
    files: trace.files,
    frames: frames.values,
    renderings: renderings.values,
    outputs: outputs.values,
    ...(presentationSteps.length === 0 ? {} : { presentationSteps }),
    steps,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: node scripts/convert-trace-v1-to-v2.mjs <trace.json> [more.json ...]');
    process.exit(1);
  }
  for (const path of paths) {
    const before = readFileSync(path, 'utf8');
    const converted = JSON.stringify(convertTrace(JSON.parse(before)));
    writeFileSync(path, converted);
    const ratio = (before.length / converted.length).toFixed(1);
    console.log(`${path}: ${before.length} -> ${converted.length} bytes (${ratio}x smaller)`);
  }
}
