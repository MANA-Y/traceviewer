import { resolvePublicAssetUrl } from './publicUrl.js';

export const LOCAL_TRACE_ID = 'local';
export const BUNDLED_EXAMPLE_TRACE = '/var/traces/presentations.example.json';
export const RECENT_TRACES_KEY = 'traceviewer-recent-traces';
export const STEP_COMMENTS_KEY = 'traceviewer-step-comments';
export const MAX_RECENT_TRACES = 6;

let localObjectUrl = null;
let localName = '';
let localRevision = 0;

export function isJsonSnapshotFile(file) {
  if (!file || typeof file.name !== 'string') return false;
  if (file.name.toLowerCase().endsWith('.json')) return true;
  return file.type === 'application/json' || file.type === 'text/json';
}

export function assignLocalTrace(file) {
  if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
  localObjectUrl = URL.createObjectURL(file);
  localName = file.name;
  localRevision += 1;
  return { id: LOCAL_TRACE_ID, name: localName, revision: localRevision, url: localObjectUrl };
}

export function peekLocalTrace() {
  return localObjectUrl
    ? { id: LOCAL_TRACE_ID, name: localName, revision: localRevision, url: localObjectUrl }
    : null;
}

export function resolveSnapshotUrl(tracePath) {
  if (tracePath === LOCAL_TRACE_ID) return peekLocalTrace()?.url ?? null;
  return resolvePublicAssetUrl(tracePath);
}

export function localTraceHref(meta) {
  const params = new URLSearchParams({
    trace: LOCAL_TRACE_ID,
    name: meta.name,
    rev: String(meta.revision),
    animate: '1',
  });
  return `?${params}`;
}

export function snapshotHref(trace) {
  return `?trace=${encodeURIComponent(trace)}&animate=1`;
}

export function displayNameForTrace(tracePath, fallbackName) {
  if (fallbackName) return fallbackName;
  if (tracePath === LOCAL_TRACE_ID) return peekLocalTrace()?.name ?? 'local snapshot';
  if (!tracePath) return 'presentation';
  try {
    const url = new URL(tracePath, 'https://traceviewer.local');
    const leaf = decodeURIComponent(url.pathname.split('/').pop() || tracePath);
    return leaf.replace(/\.json$/i, '') || leaf;
  } catch {
    return String(tracePath).split('/').pop() || 'presentation';
  }
}

export function loadRecentTraces(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(RECENT_TRACES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecentEntry).slice(0, MAX_RECENT_TRACES) : [];
  } catch {
    return [];
  }
}

export function rememberRecentTrace(entry, storage = localStorage) {
  if (!isRecentEntry(entry) || entry.url === LOCAL_TRACE_ID) return loadRecentTraces(storage);
  const next = [
    { title: entry.title, url: entry.url },
    ...loadRecentTraces(storage).filter((item) => item.url !== entry.url),
  ].slice(0, MAX_RECENT_TRACES);
  try {
    storage.setItem(RECENT_TRACES_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota and private-mode failures.
  }
  return next;
}

export function commentStorageKey(presentationId, stepIndex) {
  return `${STEP_COMMENTS_KEY}:${presentationId}:${stepIndex}`;
}

export function loadStepComment(presentationId, stepIndex, storage = localStorage) {
  try {
    return storage.getItem(commentStorageKey(presentationId, stepIndex)) ?? '';
  } catch {
    return '';
  }
}

export function saveStepComment(presentationId, stepIndex, comment, storage = localStorage) {
  const key = commentStorageKey(presentationId, stepIndex);
  try {
    if (comment.trim()) storage.setItem(key, comment);
    else storage.removeItem(key);
  } catch {
    // Ignore quota and private-mode failures.
  }
}

function isRecentEntry(entry) {
  return entry
    && typeof entry.title === 'string'
    && entry.title.trim()
    && typeof entry.url === 'string'
    && entry.url.trim()
    && entry.url !== LOCAL_TRACE_ID;
}
