function parseNonNegativeInteger(value) {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = parseNonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseFlag(value) {
  return value === "1" || value === "true";
}

function parseOptionalFlag(value, defaultValue) {
  if (value === null) {
    return defaultValue;
  }
  if (value === "0" || value === "false") {
    return false;
  }
  if (value === "1" || value === "true") {
    return true;
  }
  return defaultValue;
}

function parseViewMode(value) {
  if (value === "source" || value === "notes") {
    return value;
  }
  return "presentation";
}

export function parseViewerQuery(search) {
  const params = new URLSearchParams(search);
  const requestedRole = params.get("role");
  const viewerRole = requestedRole === "presenter" || requestedRole === "audience"
    ? requestedRole
    : parseFlag(params.get("presenter")) ? "presenter" : "audience";
  const viewMode = parseViewMode(params.get("view"));
  return {
    tracePath: params.get("trace"),
    liveUrl: params.get("live"),
    liveToken: params.get("token"),
    targetSourcePath: params.get("source"),
    targetLineNumber: parsePositiveInteger(params.get("line")),
    targetStepIndex: parseNonNegativeInteger(params.get("step")),
    viewMode,
    rawMode: viewMode === "source" || (viewMode !== "notes" && parseFlag(params.get("raw"))),
    notesMode: viewMode === "notes",
    animateMode: parseOptionalFlag(params.get("animate"), true),
    presenterMode: parseOptionalFlag(params.get("presenter"), false),
    viewerRole,
  };
}

export function withView(search, view) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (view === "presentation" || view == null) {
    params.delete("view");
  } else {
    params.set("view", view);
  }
  if (view === "notes") {
    params.delete("raw");
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

export function openNotesWindow(search = window.location.search) {
  return window.open(withView(search, "notes"), "traceviewer-notes");
}

export function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function openAudienceWindow(url) {
  const safeUrl = safeHttpUrl(url);
  return safeUrl ? window.open(safeUrl, "traceviewer-stage") : null;
}

export function clampStepIndex(stepIndex, stepCount) {
  if (stepCount <= 0) {
    return null;
  }
  if (stepIndex === null) {
    return 0;
  }
  return Math.min(Math.max(stepIndex, 0), stepCount - 1);
}
