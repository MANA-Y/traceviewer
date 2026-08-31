import test from "node:test";
import assert from "node:assert/strict";
import {
  compilePlayback,
  findLocationStep,
  getFileId,
  getLocationId,
  mapSemanticStep,
  materializeEnvironment,
  snapToPresentationStep,
  transition,
} from "../src/core/playback.js";

const frame = (path, functionName, line) => ({
  path,
  function_name: functionName,
  line_number: line,
});

test("semantic revision mapping preserves source location near relative position", () => {
  const previous = { steps: [
    step(frame("talk.py", "main", 1)),
    step(frame("talk.py", "main", 2)),
    step(frame("talk.py", "main", 1)),
  ] };
  const next = { steps: [
    step(frame("talk.py", "main", 1)),
    step(frame("talk.py", "main", 9)),
    step(frame("talk.py", "main", 1)),
    step(frame("talk.py", "main", 2)),
  ] };

  assert.equal(mapSemanticStep(previous, next, 2), 2);
  assert.equal(mapSemanticStep(previous, next, 1), 3);
});
const step = (...stack) => ({ stack, env: {} });

test("stable identities distinguish files, locations, and recursive invocations", () => {
  const playback = compilePlayback({ steps: [
    step(frame("a.py", "walk", 10)),
    step(frame("a.py", "walk", 20), frame("a.py", "walk", 10)),
    step(frame("b.py", "walk", 10)),
  ] });

  assert.equal(playback.identities[0].fileId, getFileId("a.py"));
  assert.equal(playback.identities[0].locationId, getLocationId("a.py", 10));
  assert.notEqual(playback.identities[0].invocationId, playback.identities[1].invocationId);
  assert.notEqual(playback.identities[0].locationId, playback.identities[2].locationId);
});

test("table-driven commands handle calls, recursion, and exception unwinding", () => {
  const playback = compilePlayback({ steps: [
    step(frame("talk.py", "main", 1)),
    step(frame("talk.py", "main", 2), frame("talk.py", "child", 10)),
    step(frame("talk.py", "main", 2), frame("talk.py", "child", 11), frame("talk.py", "child", 10)),
    step(frame("talk.py", "main", 2), frame("talk.py", "child", 12)),
    step(frame("talk.py", "main", 3)),
  ] });

  const cases = [
    [0, "next", 1],
    [0, "previous", 0],
    [0, "stepOverNext", 4],
    [4, "stepOverPrevious", 0],
    [1, "stepOut", 4],
    [2, "stepOut", 3],
    [4, "stepOut", 4],
  ];
  for (const [from, command, expected] of cases) {
    assert.equal(transition(playback, from, command), expected, `${from} ${command}`);
  }
});

test("presentation commands follow authored lines without replaying loop events", () => {
  const trace = { steps: [
    step(frame("talk.py", "main", 1)),
    step(frame("talk.py", "benchmark", 10)),
    step(frame("talk.py", "benchmark", 11)),
    step(frame("talk.py", "benchmark", 10)),
    step(frame("talk.py", "main", 2)),
  ], presentationSteps: [0, 1, 2, 4] };
  const playback = compilePlayback(trace);

  assert.equal(transition(playback, 0, "next"), 1);
  assert.equal(transition(playback, 2, "next"), 3);
  assert.equal(transition(playback, 2, "presentationNext"), 4);
  assert.equal(transition(playback, 3, "presentationPrevious"), 2);
  assert.equal(transition(playback, 4, "presentationPrevious"), 2);
  assert.deepEqual(playback.presentationSteps, [0, 1, 2, 4]);
  assert.deepEqual([...playback.presentationPositionByStep], [0, 1, 2, 2, 3]);
  assert.equal(snapToPresentationStep(playback, 2), 2);
  assert.equal(snapToPresentationStep(playback, 3), 2);
  assert.equal(snapToPresentationStep(playback, 4), 4);
});

test("presentation snap moves off-track and pre-track indexes onto the authored line", () => {
  const playback = compilePlayback({
    steps: [
      step(frame("talk.py", "setup", 1)),
      step(frame("talk.py", "main", 2)),
      step(frame("talk.py", "benchmark", 10)),
      step(frame("talk.py", "main", 3)),
    ],
    presentationSteps: [1, 3],
  });

  assert.equal(snapToPresentationStep(playback, 0), 1);
  assert.equal(snapToPresentationStep(playback, 1), 1);
  assert.equal(snapToPresentationStep(playback, 2), 1);
  assert.equal(snapToPresentationStep(playback, 3), 3);
});

test("seek clamps and repeated multi-file locations resolve by direction", () => {
  const playback = compilePlayback({ steps: [
    step(frame("a.py", "main", 1)),
    step(frame("b.py", "main", 1)),
    step(frame("a.py", "main", 1)),
  ] });

  assert.equal(transition(playback, 0, { type: "seek", stepIndex: 99 }), 2);
  assert.equal(findLocationStep(playback, "a.py", 1, 0, 1), 2);
  assert.equal(findLocationStep(playback, "a.py", 1, 2, -1), 2);
  assert.equal(findLocationStep(playback, "b.py", 1, 2, 1), null);
});

test("environment deltas are compiled per invocation", () => {
  const first = step(frame("a.py", "main", 1));
  first.env = { count: 1 };
  const child = step(frame("a.py", "main", 2), frame("a.py", "child", 5));
  child.env = { temporary: true };
  const resumed = step(frame("a.py", "main", 3));
  resumed.env = { count: 2 };

  const playback = compilePlayback({ steps: [first, child, resumed] });

  assert.deepEqual(materializeEnvironment(playback.environments[0]), { count: 1 });
  assert.deepEqual(materializeEnvironment(playback.environments[1]), { temporary: true });
  assert.deepEqual(materializeEnvironment(playback.environments[2]), { count: 2 });
});

test("serialized invocation ids isolate repeated calls from one call site", () => {
  const first = step(
    { ...frame("a.py", "main", 2), invocation_id: 1 },
    { ...frame("a.py", "child", 5), invocation_id: 2 },
  );
  first.env = { stale: true };
  const second = step(
    { ...frame("a.py", "main", 2), invocation_id: 1 },
    { ...frame("a.py", "child", 5), invocation_id: 3 },
  );
  second.env = { current: true };

  const playback = compilePlayback({ steps: [first, second] });
  assert.deepEqual(materializeEnvironment(playback.environments[0]), { stale: true });
  assert.deepEqual(materializeEnvironment(playback.environments[1]), { current: true });
  assert.notEqual(playback.identities[0].invocationId, playback.identities[1].invocationId);
});
