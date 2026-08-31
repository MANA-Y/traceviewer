import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimelineScale,
  mergeIntervals,
  subtractIntervals,
} from '../src/core/timelineScale.js';

const PLOT_WIDTH = 686;

function span(start, duration, kind = 'span', series = undefined) {
  return { start, duration, kind, series };
}

function widthOf(scale, target) {
  const visual = scale.toVisual(target.start + target.duration, target.series)
    - scale.toVisual(target.start, target.series);
  return (visual / scale.visualMax) * PLOT_WIDTH;
}

// Overlapping wait spans start before the last stage ends, which is how a
// hand-written timeline can arrive, so the clamping stays covered.
const UIC_START = [
  span(0, 3.909, 'span', 'UIC'),
  span(3.915, 1.4515, 'span', 'UIC'),
  span(273.224, 0.567, 'span', 'UIC'),
  span(273.784, 27.429, 'span', 'UIC'),
  span(5.3665, 267.8575, 'wait', 'UIC'),
];
const FW_START = [
  span(0, 6.0465, 'span', 'FW'),
  span(9.773, 7.318, 'span', 'FW'),
  span(12.52, 2.038, 'span', 'FW'),
  span(313.763, 0.017, 'span', 'FW'),
  span(313.783, 21.415, 'span', 'FW'),
  span(14.558, 299.205, 'wait', 'FW'),
];

test('merges overlapping intervals and leaves disjoint ones alone', () => {
  assert.deepEqual(mergeIntervals([{ start: 5, end: 9 }, { start: 0, end: 6 }]), [{ start: 0, end: 9 }]);
  assert.deepEqual(mergeIntervals([{ start: 0, end: 2 }, { start: 4, end: 6 }]), [
    { start: 0, end: 2 },
    { start: 4, end: 6 },
  ]);
});

test('subtracts busy intervals from a wait interval', () => {
  assert.deepEqual(subtractIntervals([{ start: 10, end: 100 }], [{ start: 0, end: 20 }]), [
    { start: 20, end: 100 },
  ]);
  assert.deepEqual(subtractIntervals([{ start: 0, end: 100 }], [{ start: 40, end: 60 }]), [
    { start: 0, end: 40 },
    { start: 60, end: 100 },
  ]);
  assert.deepEqual(subtractIntervals([{ start: 10, end: 20 }], [{ start: 0, end: 30 }]), []);
});

test('compresses only the idle part of a wait so real work keeps its width', () => {
  const scale = buildTimelineScale(FW_START, 'wait');
  // computeContent runs until 17.091 while the wait span starts at 14.558.
  const computeContent = FW_START[1];
  const decodeJson = FW_START[2];
  const perMs = widthOf(scale, decodeJson) / decodeJson.duration;
  assert.ok(Math.abs(widthOf(scale, computeContent) / computeContent.duration - perMs) < 0.01);
});

test('gives every series the same scale so equal durations render equally', () => {
  const scale = buildTimelineScale([...UIC_START, ...FW_START], 'wait');
  const uicDraw = UIC_START[3];
  const fwDraw = FW_START[4];
  const uicPerMs = widthOf(scale, uicDraw) / uicDraw.duration;
  const fwPerMs = widthOf(scale, fwDraw) / fwDraw.duration;
  assert.ok(Math.abs(uicPerMs - fwPerMs) < 0.01, `${uicPerMs} vs ${fwPerMs}`);
  // The slower UIC draw must read as the longer bar.
  assert.ok(widthOf(scale, uicDraw) > widthOf(scale, fwDraw));
});

test('keeps a single-series timeline on one scale', () => {
  const scale = buildTimelineScale(FW_START, 'wait');
  const draw = FW_START[4];
  const first = FW_START[0];
  const drawPerMs = widthOf(scale, draw) / draw.duration;
  assert.ok(Math.abs(widthOf(scale, first) / first.duration - drawPerMs) < 0.01);
});

test('leaves timelines without a compressed kind linear', () => {
  const spans = [span(0, 10), span(100, 10)];
  const scale = buildTimelineScale(spans, null);
  assert.equal(scale.waitBands.length, 0);
  assert.equal(scale.toVisual(55), 55);
});

test('reports a wait band for the compressed gap', () => {
  const scale = buildTimelineScale(FW_START, 'wait');
  assert.equal(scale.waitBands.length, 1);
  assert.ok(Math.abs(scale.waitBands[0].real0 - 17.091) < 0.001);
  assert.ok(Math.abs(scale.waitBands[0].real1 - 313.763) < 0.001);
});
