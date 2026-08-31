import test from "node:test";
import assert from "node:assert/strict";
import { validateTraceEvent } from "../src/sources/protocol.js";
import { LiveTraceSource, SnapshotTraceSource } from "../src/sources/traceSource.js";

const trace = {
  formatVersion: 2,
  files: { "talk.py": "pass\n" },
  frames: [{ path: "talk.py", line_number: 1, function_name: "main" }],
  renderings: [[]],
  outputs: [""],
  presentationSteps: [0],
  steps: [[[0], 0, 0, 0, {}]],
};

const event = (type, sequence, payload = {}) => ({
  protocolVersion: 1,
  type,
  sessionId: "session",
  sequence,
  revision: 1,
  payload,
});

test("validates event versions, types, and sequence fields", () => {
  assert.equal(validateTraceEvent(event("hello", 0)).type, "hello");
  assert.throws(() => validateTraceEvent({ ...event("hello", 0), protocolVersion: 2 }), /protocolVersion/);
  assert.throws(() => validateTraceEvent(event("unknown", 0)), /unknown type/);
  assert.equal(validateTraceEvent(event("step_append", 1, { steps: [] })).type, "step_append");
  assert.equal(validateTraceEvent(event("presentation_state", 2, { stepIndex: 0 })).type, "presentation_state");
  assert.throws(() => validateTraceEvent(event("presentation_state", 2, { stepIndex: -1 })), /stepIndex/);
});

test("snapshot source cannot publish presentation state", () => {
  assert.equal(new SnapshotTraceSource("/talk.json", () => {}).setStep(2), false);
});

test("live source assembles an incremental revision atomically", async () => {
  class MockWebSocket {
    listeners = new Map();
    constructor(url) {
      this.url = url;
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatch("open", {}));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatch(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }
    close() {}
  }
  const source = new LiveTraceSource("ws://127.0.0.1:8765/", "secret", MockWebSocket);
  const received = [];
  source.subscribe((value) => received.push(value));
  await source.connect();

  for (const value of [
    event("hello", 0),
    event("execution_reset", 1, {
      formatVersion: 2,
      files: trace.files,
      frames: trace.frames,
      renderings: trace.renderings,
      outputs: trace.outputs,
      presentationSteps: trace.presentationSteps,
    }),
    event("step_append", 2, { offset: 0, steps: trace.steps }),
    event("complete", 3, { stepCount: 1 }),
  ]) {
    MockWebSocket.instance.dispatch("message", { data: JSON.stringify(value) });
  }

  const snapshots = received.filter((value) => value.type === "snapshot");
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].trace, trace);

  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("execution_reset", 4, {
    formatVersion: 2,
    files: trace.files,
    frames: trace.frames,
    renderings: trace.renderings,
    outputs: trace.outputs,
  })) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("diagnostic", 5, {
    message: "rebuild failed",
  })) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("complete", 6, {
    stepCount: 0,
  })) });
  assert.equal(received.filter((value) => value.type === "snapshot").length, 1);

  await source.openSocket();
  assert.match(MockWebSocket.instance.url ?? "", /sessionId=/);
  assert.match(MockWebSocket.instance.url ?? "", /after=6/);
});

test("snapshot source emits a trace for worker validation", async () => {
  const source = new SnapshotTraceSource("/talk.json", async () => ({
    ok: true,
    headers: new Map(),
    json: async () => trace,
  }));
  const received = [];
  source.subscribe((value) => received.push(value));

  await source.connect();

  assert.equal(received[1].type, "snapshot");
  assert.equal(received[1].trace, trace);
  assert.equal(received.at(-1).status, "complete");
});

test("snapshot source does not bind fetch to the source instance", async () => {
  let receiver;
  function strictFetch() {
    receiver = this;
    return Promise.resolve({ ok: true, headers: new Map(), json: async () => trace });
  }
  const source = new SnapshotTraceSource("/talk.json", strictFetch);
  await source.connect();

  assert.equal(receiver, undefined);
});

test("live source applies snapshots and rejects reordered events", async () => {
  class MockWebSocket {
    listeners = new Map();
    constructor(url) {
      this.url = url;
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatch("open", {}));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatch(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }
    close() {}
  }

  const source = new LiveTraceSource("ws://127.0.0.1:8765/", "secret", MockWebSocket);
  const received = [];
  source.subscribe((value) => received.push(value));
  await source.connect();
  assert.match(MockWebSocket.instance.url, /token=secret/);

  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("trace_snapshot", 1, { trace })) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("complete", 1)) });

  assert.deepEqual(received.find((value) => value.type === "snapshot").trace, trace);
  assert.match(received.at(-1).diagnostic.message, /not monotonic/);
});

test("hello resets an expired checkpoint within the same live session", async () => {
  class MockWebSocket {
    listeners = new Map();
    constructor() {
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatch("open", {}));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatch(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }
    close() {}
  }
  const source = new LiveTraceSource("ws://127.0.0.1:8765/", "secret", MockWebSocket);
  const received = [];
  source.subscribe((value) => received.push(value));
  await source.connect();
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("hello", 0)) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("complete", 20)) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("hello", 0)) });
  MockWebSocket.instance.dispatch("message", { data: JSON.stringify(event("trace_snapshot", 10, { trace })) });

  assert.deepEqual(received.findLast((value) => value.type === "snapshot").trace, trace);
  assert.equal(received.some((value) => value.diagnostic), false);
});

test("hello exposes the presenter-only audience URL", async () => {
  class MockWebSocket {
    listeners = new Map();
    constructor() {
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatch("open", {}));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatch(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }
    close() {}
  }
  const source = new LiveTraceSource("ws://127.0.0.1:8765/", "secret", MockWebSocket);
  const received = [];
  source.subscribe((value) => received.push(value));
  await source.connect();
  MockWebSocket.instance.dispatch("message", {
    data: JSON.stringify(event("hello", 0, {
      audienceUrl: "http://127.0.0.1:4173/?role=audience",
      notesUrl: "http://127.0.0.1:4173/?role=presenter&view=notes",
    })),
  });
  assert.deepEqual(received.find((value) => value.type === "session"), {
    type: "session",
    audienceUrl: "http://127.0.0.1:4173/?role=audience",
    notesUrl: "http://127.0.0.1:4173/?role=presenter&view=notes",
  });
});

test("live source receives and publishes presentation state", async () => {
  class MockWebSocket {
    listeners = new Map();
    sent = [];
    constructor() {
      MockWebSocket.instance = this;
      queueMicrotask(() => this.dispatch("open", {}));
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    dispatch(type, value) {
      for (const listener of this.listeners.get(type) ?? []) listener(value);
    }
    send(value) { this.sent.push(value); }
    close() {}
  }
  const source = new LiveTraceSource("ws://127.0.0.1:8765/", "secret", MockWebSocket);
  const received = [];
  source.subscribe((value) => received.push(value));
  assert.equal(source.setStep(1), false);
  await source.connect();
  assert.equal(source.setStep(3), true);
  assert.deepEqual(JSON.parse(MockWebSocket.instance.sent[0]), { type: "set_step", stepIndex: 3 });
  MockWebSocket.instance.dispatch("message", {
    data: JSON.stringify(event("presentation_state", 0, { stepIndex: 4 })),
  });
  assert.equal(received.at(-1).stepIndex, 4);
  assert.throws(() => source.setStep(-1), /non-negative integer/);
});
