import test from "node:test";
import assert from "node:assert/strict";
import { clampStepIndex, parseViewerQuery, safeHttpUrl, withView } from "../src/core/urlState.js";

test("parses explicit flags and preserves step zero", () => {
  const state = parseViewerQuery("?trace=t.json&step=0&raw=0&animate=true&presenter=1");
  assert.equal(state.targetStepIndex, 0);
  assert.equal(state.rawMode, false);
  assert.equal(state.animateMode, true);
  assert.equal(state.presenterMode, true);
  assert.equal(state.viewerRole, "presenter");
});

test("progressive reveal is on by default and can be turned off", () => {
  assert.equal(parseViewerQuery("?trace=t.json").animateMode, true);
  assert.equal(parseViewerQuery("?animate=1").animateMode, true);
  assert.equal(parseViewerQuery("?animate=0").animateMode, false);
  assert.equal(parseViewerQuery("?animate=false").animateMode, false);
});

test("parses explicit audience and presenter roles", () => {
  assert.equal(parseViewerQuery("?role=audience&presenter=1").viewerRole, "audience");
  assert.equal(parseViewerQuery("?role=audience&presenter=1").presenterMode, true);
  assert.equal(parseViewerQuery("?role=presenter").presenterMode, false);
  assert.equal(parseViewerQuery("?role=presenter").viewerRole, "presenter");
  assert.equal(parseViewerQuery("?role=presenter&presenter=1").presenterMode, true);
  assert.equal(parseViewerQuery("?role=presenter&presenter=0").presenterMode, false);
  assert.equal(parseViewerQuery("").viewerRole, "audience");
  assert.equal(parseViewerQuery("").presenterMode, false);
});

test("parses the Vite-safe source view and legacy raw flag", () => {
  assert.equal(parseViewerQuery("?view=source").rawMode, true);
  assert.equal(parseViewerQuery("?raw=1").rawMode, true);
  assert.equal(parseViewerQuery("?view=presentation").rawMode, false);
  assert.equal(parseViewerQuery("?view=presentation").viewMode, "presentation");
});

test("parses the remote notes control view", () => {
  const state = parseViewerQuery("?live=ws://127.0.0.1:8765/&token=p&role=presenter&view=notes");
  assert.equal(state.notesMode, true);
  assert.equal(state.viewMode, "notes");
  assert.equal(state.rawMode, false);
  assert.equal(state.viewerRole, "presenter");
  assert.equal(withView("?trace=t.json&raw=1", "notes"), "?trace=t.json&view=notes");
  assert.equal(withView("?view=notes&step=3", "presentation"), "?step=3");
  assert.equal(safeHttpUrl("http://127.0.0.1:4173/?role=audience"), "http://127.0.0.1:4173/?role=audience");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
});

test("clamps an out-of-range step", () => {
  assert.equal(clampStepIndex(99, 4), 3);
  assert.equal(clampStepIndex(null, 4), 0);
  assert.equal(clampStepIndex(0, 0), null);
});
