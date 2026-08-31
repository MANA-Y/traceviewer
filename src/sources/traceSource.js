import { validateTraceEvent } from "./protocol.js";

export const MAX_TRACE_BYTES = 100 * 1024 * 1024;

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

async function readJsonWithLimit(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let byteLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > MAX_TRACE_BYTES) {
          await reader.cancel("Trace exceeds the size limit");
          throw new Error(`Trace is larger than ${MAX_TRACE_BYTES / 1024 / 1024} MB`);
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return JSON.parse(chunks.join(""));
    } finally {
      reader.releaseLock();
    }
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    if (utf8ByteLength(text) > MAX_TRACE_BYTES) {
      throw new Error(`Trace is larger than ${MAX_TRACE_BYTES / 1024 / 1024} MB`);
    }
    return JSON.parse(text);
  }
  // Test and non-browser fetch shims may expose only json(). Real browser
  // responses always take one of the byte-counted paths above.
  return response.json();
}

class BaseTraceSource {
  listeners = new Set();

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  setStep() {
    return false;
  }
}

export class SnapshotTraceSource extends BaseTraceSource {
  constructor(url, fetchImplementation = fetch) {
    super();
    this.url = url;
    this.fetchImplementation = (...args) => fetchImplementation(...args);
    this.controller = null;
  }

  async connect() {
    this.controller = new AbortController();
    this.emit({ type: "status", status: "loading" });
    const response = await this.fetchImplementation(this.url, { signal: this.controller.signal });
    if (!response.ok) {
      throw new Error(`Could not load trace (${response.status} ${response.statusText})`);
    }
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    if (contentLength !== null && Number.isFinite(contentLength) && contentLength > MAX_TRACE_BYTES) {
      throw new Error(`Trace is larger than ${MAX_TRACE_BYTES / 1024 / 1024} MB`);
    }
    this.emit({ type: "snapshot", trace: await readJsonWithLimit(response), revision: 0 });
    this.emit({ type: "status", status: "complete" });
  }

  close() {
    this.controller?.abort();
  }
}

export class LiveTraceSource extends BaseTraceSource {
  constructor(url, token, WebSocketImplementation = WebSocket) {
    super();
    const endpoint = new URL(url);
    if (!new Set(["ws:", "wss:"]).has(endpoint.protocol)) {
      throw new TypeError("Live trace URL must use ws: or wss:");
    }
    endpoint.searchParams.set("token", token);
    this.endpoint = endpoint;
    this.WebSocketImplementation = WebSocketImplementation;
    this.lastSequence = -1;
    this.sessionId = null;
    this.socket = null;
    this.closed = false;
    this.reconnectDelay = 250;
    this.reconnectTimer = null;
    this.pendingTrace = null;
    this.pendingRevision = null;
    this.pendingBytes = 0;
    this.connected = false;
  }

  async connect() {
    this.closed = false;
    return this.openSocket();
  }

  async openSocket() {
    this.emit({ type: "status", status: "connecting" });
    await new Promise((resolve, reject) => {
      let opened = false;
      const endpoint = new URL(this.endpoint);
      if (this.sessionId !== null && this.lastSequence >= 0) {
        endpoint.searchParams.set("sessionId", this.sessionId);
        endpoint.searchParams.set("after", String(this.lastSequence));
      }
      const socket = new this.WebSocketImplementation(endpoint.toString());
      this.socket = socket;
      socket.addEventListener("open", () => {
        opened = true;
        this.connected = true;
        this.reconnectDelay = 250;
        this.emit({ type: "status", status: "connected" });
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        socket.close();
        reject(new Error("Can't reach the live producer"));
      }, { once: true });
      socket.addEventListener("message", (message) => this.handleMessage(message.data));
      socket.addEventListener("close", () => {
        this.connected = false;
        this.emit({ type: "status", status: "stale" });
        this.scheduleReconnect();
        if (!opened) reject(new Error("Can't reach the live producer"));
      });
    });
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket().catch((error) => {
        this.emit({ type: "diagnostic", diagnostic: { message: error.message } });
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5_000);
        this.scheduleReconnect();
      });
    }, this.reconnectDelay);
  }

  handleMessage(data) {
    try {
      if (typeof data !== "string" || utf8ByteLength(data) > MAX_TRACE_BYTES) {
        throw new Error("Live event is not text or exceeds the size limit");
      }
      const event = validateTraceEvent(JSON.parse(data));
      const helloReset = event.type === "hello";
      const previousSequence = helloReset ? -1 : this.lastSequence;
      if (!helloReset && this.sessionId !== null && event.sessionId !== this.sessionId) {
        throw new Error("Live event session changed without a hello event");
      }
      if (event.sequence <= previousSequence) {
        throw new Error("Live event sequence is not monotonic");
      }
      if (event.type === "hello") {
        const audienceUrl = event.payload?.audienceUrl;
        const notesUrl = event.payload?.notesUrl;
        if (typeof audienceUrl === "string" || typeof notesUrl === "string") {
          this.emit({
            type: "session",
            audienceUrl: typeof audienceUrl === "string" ? audienceUrl : null,
            notesUrl: typeof notesUrl === "string" ? notesUrl : null,
          });
        }
      } else if (event.type === "trace_snapshot") {
        this.pendingTrace = null;
        this.pendingRevision = null;
        this.pendingBytes = 0;
        this.emit({ type: "snapshot", trace: event.payload.trace, revision: event.revision });
      } else if (event.type === "execution_reset") {
        if (typeof event.payload.formatVersion !== "number" ||
            event.payload.files === null || typeof event.payload.files !== "object" ||
            !Array.isArray(event.payload.frames) ||
            !Array.isArray(event.payload.renderings) ||
            !Array.isArray(event.payload.outputs) ||
            (event.payload.presentationSteps !== undefined &&
             !Array.isArray(event.payload.presentationSteps))) {
          throw new Error("execution_reset payload is invalid");
        }
        this.pendingTrace = {
          formatVersion: event.payload.formatVersion,
          files: event.payload.files,
          frames: event.payload.frames,
          renderings: event.payload.renderings,
          outputs: event.payload.outputs,
          ...(event.payload.presentationSteps === undefined
            ? {}
            : { presentationSteps: event.payload.presentationSteps }),
          steps: [],
        };
        this.pendingRevision = event.revision;
        this.pendingBytes = utf8ByteLength(JSON.stringify(event.payload));
        if (this.pendingBytes > MAX_TRACE_BYTES) {
          throw new Error("Live revision exceeds the size limit");
        }
        this.emit({ type: "status", status: "running" });
      } else if (event.type === "step_append") {
        if (this.pendingTrace === null || this.pendingRevision !== event.revision ||
            !Array.isArray(event.payload.steps) ||
            event.payload.offset !== this.pendingTrace.steps.length) {
          throw new Error("step_append does not match an active revision");
        }
        this.pendingBytes += utf8ByteLength(JSON.stringify(event.payload.steps));
        if (this.pendingBytes > MAX_TRACE_BYTES) {
          throw new Error("Live revision exceeds the size limit");
        }
        this.pendingTrace.steps.push(...event.payload.steps);
      } else if (event.type === "diagnostic" || event.type === "error") {
        if (this.pendingRevision === event.revision) {
          this.pendingTrace = null;
          this.pendingRevision = null;
          this.pendingBytes = 0;
        }
        this.emit({ type: "diagnostic", diagnostic: event.payload, revision: event.revision });
      } else if (event.type === "presentation_state") {
        this.emit({ type: "presentation_state", stepIndex: event.payload.stepIndex });
      } else if (event.type === "complete") {
        if (this.pendingTrace !== null && this.pendingRevision === event.revision) {
          this.emit({ type: "snapshot", trace: this.pendingTrace, revision: event.revision });
          this.pendingTrace = null;
          this.pendingRevision = null;
          this.pendingBytes = 0;
        }
        this.emit({ type: "status", status: "complete" });
      }
      if (helloReset) {
        this.pendingTrace = null;
        this.pendingRevision = null;
        this.pendingBytes = 0;
      }
      this.sessionId = event.sessionId;
      this.lastSequence = event.sequence;
    } catch (error) {
      this.emit({ type: "diagnostic", diagnostic: { message: error.message } });
      this.pendingTrace = null;
      this.pendingRevision = null;
      this.pendingBytes = 0;
      this.socket?.close(1002, "Invalid live event");
    }
  }

  close() {
    this.closed = true;
    this.connected = false;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
  }

  setStep(stepIndex) {
    if (!Number.isSafeInteger(stepIndex) || stepIndex < 0) {
      throw new TypeError("Presentation step must be a non-negative integer");
    }
    if (!this.connected || typeof this.socket?.send !== "function") {
      return false;
    }
    this.socket.send(JSON.stringify({ type: "set_step", stepIndex }));
    return true;
  }
}
