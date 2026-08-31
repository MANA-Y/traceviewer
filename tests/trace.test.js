import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CURRENT_TRACE_FORMAT_VERSION,
  TraceValidationError,
  validateTrace,
} from "../src/core/trace.js";

const validTrace = () => ({
  formatVersion: 2,
  files: { "talk.py": "def main():\n    pass\n" },
  frames: [{ path: "talk.py", line_number: 1, function_name: "main", code: "def main():" }],
  renderings: [[]],
  outputs: [""],
  steps: [[[0], 0, 0, 0, {}]],
});

test("expands a version 2 document into the playback shape", () => {
  const trace = validTrace();
  const expanded = validateTrace(trace);
  assert.equal(expanded.formatVersion, CURRENT_TRACE_FORMAT_VERSION);
  assert.deepEqual(expanded.files, trace.files);
  assert.deepEqual(expanded.steps[0].stack, [trace.frames[0]]);
  assert.equal(expanded.steps[0].stdout, "");
  assert.equal(expanded.steps[0].renderings, trace.renderings[0]);
});

test("shares one object per distinct frame across steps", () => {
  const trace = validTrace();
  trace.steps = [[[0], 0, 0, 0, {}], [[0], 0, 0, 0, {}], [[0], 0, 0, 0, {}]];
  const { steps } = validateTrace(trace);
  assert.equal(steps[0].stack[0], steps[1].stack[0]);
  assert.equal(steps[1].stack[0], steps[2].stack[0]);
});

test("derives presentation scope lines while skipping repeated execution", () => {
  const trace = validTrace();
  trace.renderings = [[], [{ type: "markdown", data: "First" }], [{ type: "notes", data: "Private" }]];
  trace.steps = [
    [[0], 0, 0, 0, {}],
    [[0], 1, 0, 0, {}],
    [[0], 0, 0, 0, {}],
    [[0], 2, 0, 0, {}],
    [[0], 1, 0, 0, {}],
  ];

  assert.deepEqual(validateTrace(trace).presentationSteps, [0, 1, 4]);
});

test("accepts a declared sparse presentation track and rejects cycles", () => {
  const trace = validTrace();
  trace.steps = [
    [[0], 0, 0, 0, {}],
    [[0], 0, 0, 0, {}],
    [[0], 0, 0, 0, {}],
  ];
  trace.presentationSteps = [0, 2];
  assert.deepEqual(validateTrace(trace).presentationSteps, [0, 2]);

  trace.presentationSteps = [0, 2, 1];
  assert.throws(() => validateTrace(trace), /strictly increasing/);

  trace.presentationSteps = null;
  assert.throws(() => validateTrace(trace), /non-empty array/);
});

test("accepts the shared contract fixture", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("../fixtures/contracts/trace-v2.minimal.json", import.meta.url),
    "utf8",
  ));
  const expanded = validateTrace(fixture);
  assert.equal(expanded.steps.length, 1);
  assert.equal(expanded.steps[0].renderings[0].type, "markdown");
});

test("rejects an unsupported format version", () => {
  const trace = validTrace();
  trace.formatVersion = 1;
  assert.throws(() => validateTrace(trace), /formatVersion must be 2/);
});

test("rejects empty stacks and out-of-range table indexes", () => {
  const empty = validTrace();
  empty.steps[0][0] = [];
  assert.throws(() => validateTrace(empty), TraceValidationError);

  const unknownFrame = validTrace();
  unknownFrame.steps[0][0] = [7];
  assert.throws(() => validateTrace(unknownFrame), /valid frame index/);

  const unknownOutput = validTrace();
  unknownOutput.steps[0][2] = 3;
  assert.throws(() => validateTrace(unknownOutput), /valid outputs index/);
});

test("rejects an active frame with a missing source file", () => {
  const trace = validTrace();
  trace.frames[0].path = "missing.py";
  assert.throws(() => validateTrace(trace), /missing source file/);
});

test("accepts a caller frame whose source is not embedded", () => {
  const trace = validTrace();
  trace.frames.unshift({ path: "runner.py", line_number: 3, function_name: "run" });
  trace.steps[0][0] = [0, 1];
  assert.equal(validateTrace(trace).steps[0].stack.length, 2);
});

test("rejects an active line outside its source file", () => {
  const trace = validTrace();
  trace.frames[0].line_number = 99;
  assert.throws(() => validateTrace(trace), /outside the source file/);
});

test("accepts producer invocation identities and rejects malformed ones", () => {
  const trace = validTrace();
  trace.frames[0].invocation_id = 42;
  assert.equal(validateTrace(trace).steps[0].stack[0].invocation_id, 42);
  trace.frames[0].invocation_id = {};
  assert.throws(() => validateTrace(trace), /invocation_id/);
});
