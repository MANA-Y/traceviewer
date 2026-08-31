export const TRACE_EVENT_PROTOCOL_VERSION = 1;

const EVENT_TYPES = new Set([
  "hello",
  "trace_snapshot",
  "execution_reset",
  "step_append",
  "diagnostic",
  "presentation_state",
  "complete",
  "error",
]);

export class TraceProtocolError extends Error {
  constructor(message) {
    super(`Invalid trace event: ${message}`);
    this.name = "TraceProtocolError";
  }
}

export function validateTraceEvent(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TraceProtocolError("event must be an object");
  }
  if (value.protocolVersion !== TRACE_EVENT_PROTOCOL_VERSION) {
    throw new TraceProtocolError(`protocolVersion must be ${TRACE_EVENT_PROTOCOL_VERSION}`);
  }
  if (!EVENT_TYPES.has(value.type)) {
    throw new TraceProtocolError(`unknown type ${JSON.stringify(value.type)}`);
  }
  if (typeof value.sessionId !== "string" || value.sessionId.length === 0) {
    throw new TraceProtocolError("sessionId must be a non-empty string");
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    throw new TraceProtocolError("sequence must be a non-negative integer");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new TraceProtocolError("revision must be a non-negative integer");
  }
  if (value.payload === null || typeof value.payload !== "object" || Array.isArray(value.payload)) {
    throw new TraceProtocolError("payload must be an object");
  }
  if (value.type === "presentation_state" &&
      (!Number.isSafeInteger(value.payload.stepIndex) || value.payload.stepIndex < 0)) {
    throw new TraceProtocolError("presentation_state stepIndex must be a non-negative integer");
  }
  return value;
}
