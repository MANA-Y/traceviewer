import test from "node:test";
import assert from "node:assert/strict";
import { convertTrace } from "../scripts/convert-trace-v1-to-v2.mjs";


test("v1 conversion records a sparse linear presentation track", () => {
  const frame = (line_number, function_name = "main") => ({
    path: "talk.py",
    line_number,
    function_name,
  });
  const converted = convertTrace({
    formatVersion: 1,
    files: { "talk.py": "first\nloop\nlast\n" },
    steps: [
      { stack: [frame(1)], renderings: [{ type: "markdown", data: "First" }] },
      { stack: [frame(2, "compute")], renderings: [] },
      { stack: [frame(2, "compute")], renderings: [] },
      { stack: [frame(3)], renderings: [{ type: "markdown", data: "Last" }] },
    ],
  });

  assert.deepEqual(converted.presentationSteps, [0, 3]);
  assert.equal(converted.steps.length, 4);
  assert.equal(converted.formatVersion, 2);
  assert.equal(converted.frames.length, 3);
  assert.deepEqual(converted.steps[0], [[0], 0, 0, 0, {}]);
  assert.deepEqual(converted.steps[3][0], [2]);
  assert.equal(converted.renderings.length, 3);
});

test("v1 conversion rejects interned documents and empty stacks", () => {
  const frame = { path: "talk.py", line_number: 1, function_name: "main" };
  assert.throws(() => convertTrace({
    formatVersion: 2,
    files: { "talk.py": "pass\n" },
    frames: [frame],
    renderings: [[]],
    outputs: [""],
    steps: [[[0], 0, 0, 0, {}]],
  }), /version 1/);
  assert.throws(() => convertTrace({
    formatVersion: "2",
    steps: [{ stack: [frame] }],
  }), /version 1/);
  assert.throws(() => convertTrace({
    formatVersion: 1,
    steps: [{ stack: [] }],
  }), /non-empty stack/);
});
