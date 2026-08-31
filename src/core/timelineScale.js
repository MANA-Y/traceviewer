const COMPRESS_THRESHOLD = 56;
const COMPRESS_WIDTH = 52;

export function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  const merged = [];
  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || item.start > previous.end) merged.push({ ...item });
    else previous.end = Math.max(previous.end, item.end);
  }
  return merged;
}

export function subtractIntervals(bases, holes) {
  const result = [];
  for (const base of bases) {
    let cursor = base.start;
    for (const hole of holes) {
      if (hole.end <= cursor) continue;
      if (hole.start >= base.end) break;
      if (hole.start > cursor) result.push({ start: cursor, end: hole.start });
      cursor = hole.end;
      if (cursor >= base.end) break;
    }
    if (cursor < base.end) result.push({ start: cursor, end: base.end });
  }
  return result;
}

function toIntervals(spans, predicate) {
  return mergeIntervals(spans
    .filter((span) => predicate(span) && span.duration > 0)
    .map((span) => ({ start: span.start, end: span.start + span.duration })));
}

function buildSeriesScale(spans, compressKind) {
  const realMax = Math.max(1, ...spans.map((span) => span.start + Math.max(span.duration, 0)));
  // A wait span may start before neighbouring work has finished. Compressing
  // that overlap would shrink real work, so only idle time is compressible.
  const waits = compressKind
    ? subtractIntervals(
      toIntervals(spans, (span) => span.kind === compressKind),
      toIntervals(spans, (span) => span.kind !== compressKind),
    )
    : [];

  const segments = [];
  let cursorReal = 0;
  let cursorVisual = 0;
  for (const wait of waits) {
    if (wait.start > cursorReal) {
      const gap = wait.start - cursorReal;
      segments.push({
        real0: cursorReal, real1: wait.start,
        vis0: cursorVisual, vis1: cursorVisual + gap,
        wait: false,
      });
      cursorVisual += gap;
    }
    const realDuration = wait.end - wait.start;
    const visualDuration = realDuration > COMPRESS_THRESHOLD ? COMPRESS_WIDTH : realDuration;
    segments.push({
      real0: wait.start, real1: wait.end,
      vis0: cursorVisual, vis1: cursorVisual + visualDuration,
      wait: true,
    });
    cursorVisual += visualDuration;
    cursorReal = wait.end;
  }
  if (realMax > cursorReal) {
    const gap = realMax - cursorReal;
    segments.push({
      real0: cursorReal, real1: realMax,
      vis0: cursorVisual, vis1: cursorVisual + gap,
      wait: false,
    });
    cursorVisual += gap;
  }

  const visualMax = Math.max(1, cursorVisual);
  const toVisual = (real) => {
    if (!segments.length) return real;
    if (real <= segments[0].real0) return segments[0].vis0;
    for (const segment of segments) {
      if (real <= segment.real1 + 1e-9) {
        const span = segment.real1 - segment.real0;
        const ratio = span ? (real - segment.real0) / span : 0;
        return segment.vis0 + ratio * (segment.vis1 - segment.vis0);
      }
    }
    return visualMax;
  };

  return { toVisual, visualMax, waitBands: segments.filter((segment) => segment.wait) };
}

// Each series waits on its own network gap, so a shared scale would place the
// series' post-wait work at different compression ratios and render equal
// durations at different widths.
export function buildTimelineScale(spans, compressKind) {
  const groups = new Map();
  for (const span of spans) {
    const key = span.series || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(span);
  }
  const scales = new Map();
  for (const [key, groupSpans] of groups) scales.set(key, buildSeriesScale(groupSpans, compressKind));
  const built = [...scales.values()];
  const fallback = scales.get('') || built[0];
  return {
    visualMax: Math.max(1, ...built.map((scale) => scale.visualMax)),
    waitBands: built.flatMap((scale) => scale.waitBands),
    toVisual: (real, seriesKey) => (scales.get(seriesKey || '') || fallback).toVisual(real),
  };
}
