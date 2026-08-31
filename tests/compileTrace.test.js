import test from "node:test";
import assert from "node:assert/strict";
import { compileTrace, getLocation, getRenderingsAtStep, groupPresentationLines } from "../src/core/compileTrace.js";

const frame = (line) => ({
  path: "talk.py",
  function_name: "main",
  line_number: line,
});

const rendering = (type, data) => ({ type, data });

function traceWith(steps) {
  return {
    files: { "talk.py": "first\nsecond\nthird" },
    steps: steps.map((renderings, index) => ({
      stack: [frame(index + 1)],
      env: {},
      renderings,
    })),
  };
}

test("speaker notes become step metadata and never audience renderings", () => {
  const markdown = rendering("markdown", "Visible");
  const compiled = compileTrace(traceWith([
    [rendering("notes", JSON.stringify({ message: "Explain the benchmark" })), markdown],
    [rendering("notes", "Raw fallback"), rendering("notes", JSON.stringify("Parsed string"))],
  ]));

  assert.deepEqual(compiled.notesByStep.get(0), ["Explain the benchmark"]);
  assert.deepEqual(compiled.notesByStep.get(1), ["Raw fallback", "Parsed string"]);
  assert.deepEqual(compiled.notesByLocation.get(getLocation("talk.py", 1)), ["Explain the benchmark"]);
  assert.deepEqual(compiled.notesByLocation.get(getLocation("talk.py", 2)), ["Raw fallback", "Parsed string"]);
  assert.deepEqual(compiled.renderingsByLocation.get(getLocation("talk.py", 1)), [markdown]);
  assert.equal(compiled.renderingsByLocation.has(getLocation("talk.py", 2)), false);
});

test("sections compile into ordered navigation markers", () => {
  const compiled = compileTrace(traceWith([
    [rendering("section", JSON.stringify({ title: "Opening", subtitle: "Why it matters" }))],
    [rendering("markdown", "Middle")],
    [rendering("section", "Questions")],
  ]));

  assert.deepEqual(compiled.sections, [
    {
      stepIndex: 0,
      title: "Opening",
      subtitle: "Why it matters",
      location: getLocation("talk.py", 1),
    },
    {
      stepIndex: 2,
      title: "Questions",
      subtitle: null,
      location: getLocation("talk.py", 3),
    },
  ]);
  assert.equal(compiled.renderingsByLocation.get(getLocation("talk.py", 1))[0].type, "section");
  assert.deepEqual(
    compiled.presentationLinesByPath.get("talk.py").map(({ sectionGroupId, sectionTitle }) => [sectionGroupId, sectionTitle]),
    [[1, "Opening"], [1, "Opening"], [2, "Questions"]],
  );
  assert.deepEqual(
    groupPresentationLines(compiled.presentationLinesByPath.get("talk.py")).map(({ id, title, items }) => [id, title, items.length]),
    [[1, "Opening", 2], [2, "Questions", 1]],
  );
});

test("repeated renderings at one location never reveal a future value", () => {
  const first = rendering("markdown", "first");
  const last = rendering("markdown", "last");
  const trace = {
    files: { "talk.py": "text(value)" },
    steps: [
      { stack: [frame(1)], env: {}, renderings: [first] },
      { stack: [frame(1)], env: {}, renderings: [last] },
    ],
  };
  const compiled = compileTrace(trace);
  const location = getLocation("talk.py", 1);

  assert.deepEqual(getRenderingsAtStep(compiled, location, 0), [first]);
  assert.deepEqual(getRenderingsAtStep(compiled, location, 1), [last]);
  assert.equal(getRenderingsAtStep(compiled, location, -1), null);
});

test("presentation reveal ignores completed Python internals", () => {
  const trace = {
    files: { "talk.py": "text('First')\ncompute()\ninside_loop()\ntext('Last')" },
    presentationSteps: [0, 3],
    steps: [
      { stack: [frame(1)], env: {}, renderings: [rendering("markdown", "First")] },
      { stack: [frame(2)], env: {}, renderings: [] },
      { stack: [frame(3)], env: {}, renderings: [] },
      { stack: [frame(4)], env: {}, renderings: [rendering("markdown", "Last")] },
    ],
  };

  const compiled = compileTrace(trace);
  assert.deepEqual(
    compiled.presentationLinesByPath.get("talk.py").map(({ lineNumber }) => lineNumber),
    [1, 4],
  );
  assert.equal(compiled.firstRevealStep.has(getLocation("talk.py", 2)), false);
  assert.equal(compiled.firstRevealStep.has(getLocation("talk.py", 3)), false);
  assert.equal(compiled.firstRevealStep.get(getLocation("talk.py", 4)), 3);
});
