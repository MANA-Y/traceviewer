import test from "node:test";
import assert from "node:assert/strict";
import { describeLoadingState, formatElapsed, isProducerUnreachable } from "../src/core/loadingState.js";

test("live audience waits for the presenter after connecting", () => {
  const copy = describeLoadingState({ live: true, status: "connected" });
  assert.equal(copy.phase, "waiting");
  assert.equal(copy.title, "Waiting for the presenter");
});

test("live connecting and stale states stay distinct from a generic load", () => {
  assert.equal(describeLoadingState({ live: true, status: "connecting" }).phase, "connecting");
  assert.equal(describeLoadingState({ live: true, status: "stale" }).phase, "stale");
  assert.equal(describeLoadingState({ live: true, status: "running" }).phase, "running");
});

test("snapshot load, compile, and highlight have their own copy", () => {
  assert.equal(describeLoadingState({ status: "loading" }).phase, "loading");
  assert.equal(describeLoadingState({ status: "compiling", hasTrace: true }).phase, "compiling");
  assert.equal(describeLoadingState({ hasTrace: true, hasCompiled: true }).phase, "highlighting");
});

test("formatElapsed uses a compact clock", () => {
  assert.equal(formatElapsed(6), "0:06");
  assert.equal(formatElapsed(83), "1:23");
});

test("unreachable producer copy replaces the raw socket error", () => {
  assert.equal(isProducerUnreachable({ message: "Live producer connection failed" }), true);
  const copy = describeLoadingState({
    live: true,
    status: "connecting",
    diagnostic: { message: "Can't reach the live producer" },
  });
  assert.equal(copy.phase, "stale");
  assert.equal(copy.title, "Can't reach the producer");
});
