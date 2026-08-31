import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_TRACE_ID,
  commentStorageKey,
  displayNameForTrace,
  isJsonSnapshotFile,
  loadRecentTraces,
  loadStepComment,
  localTraceHref,
  rememberRecentTrace,
  resolveSnapshotUrl,
  saveStepComment,
  snapshotHref,
} from "../src/openTrace.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.hasOwn(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
  };
}

test("accepts JSON snapshot files by name or type", () => {
  assert.equal(isJsonSnapshotFile({ name: "talk.json", type: "" }), true);
  assert.equal(isJsonSnapshotFile({ name: "talk.JSON", type: "text/plain" }), true);
  assert.equal(isJsonSnapshotFile({ name: "talk", type: "application/json" }), true);
  assert.equal(isJsonSnapshotFile({ name: "talk.txt", type: "text/plain" }), false);
  assert.equal(isJsonSnapshotFile(null), false);
});

test("remembers recent served URLs and skips local snapshots", () => {
  const storage = memoryStorage();
  rememberRecentTrace({ title: "One", url: "/one.json" }, storage);
  rememberRecentTrace({ title: "Two", url: "/two.json" }, storage);
  rememberRecentTrace({ title: "One again", url: "/one.json" }, storage);
  rememberRecentTrace({ title: "Local", url: LOCAL_TRACE_ID }, storage);
  assert.deepEqual(loadRecentTraces(storage), [
    { title: "One again", url: "/one.json" },
    { title: "Two", url: "/two.json" },
  ]);
});

test("builds snapshot hrefs and display names", () => {
  assert.equal(snapshotHref("/var/traces/talk.json"), "?trace=%2Fvar%2Ftraces%2Ftalk.json&animate=1");
  assert.equal(localTraceHref({ name: "talk.json", revision: 3 }), "?trace=local&name=talk.json&rev=3&animate=1");
  assert.equal(displayNameForTrace("/var/traces/talk.json"), "talk");
  assert.equal(displayNameForTrace(LOCAL_TRACE_ID, "talk.json"), "talk.json");
  assert.equal(resolveSnapshotUrl("/talk.json"), "/talk.json");
  assert.equal(resolveSnapshotUrl(LOCAL_TRACE_ID), null);
});

test("stores presenter comments per presentation step", () => {
  const storage = memoryStorage();
  saveStepComment("talk", 2, "  pause here  ", storage);
  assert.equal(loadStepComment("talk", 2, storage), "  pause here  ");
  assert.equal(commentStorageKey("talk", 2), "traceviewer-step-comments:talk:2");
  saveStepComment("talk", 2, "   ", storage);
  assert.equal(loadStepComment("talk", 2, storage), "");
});
