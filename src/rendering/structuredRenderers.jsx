import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { buildTimelineScale } from '../core/timelineScale';
import { balancedColumns } from './gridColumns';
import { highlightCode } from './languages';
import { stripStepOrdinal } from './stepTitles';
import { typesetMath } from './mathjax';
import { sanitizeMarkdown, sanitizeStyle } from './security';


function payloadFor(rendering) {
  const payload = JSON.parse(String(rendering.data ?? '{}'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Structured renderer payload must be an object');
  }
  return payload;
}

function MarkdownBlock({ content }) {
  const ref = useRef(null);
  const html = useMemo(() => sanitizeMarkdown(marked(content)), [content]);
  useEffect(() => { typesetMath(ref.current); }, [html]);
  return <div ref={ref} className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function LazyCode({ content, language, style }) {
  const [highlighted, setHighlighted] = useState(null);
  useEffect(() => {
    let cancelled = false;
    highlightCode(content, language).then((value) => { if (!cancelled) setHighlighted(value); });
    return () => { cancelled = true; };
  }, [content, language]);
  return <pre className={`code-block language-${language}`} style={style}>{highlighted === null
    ? <code>{content}</code>
    : <code dangerouslySetInnerHTML={{ __html: highlighted }} />}</pre>;
}

function Table({ payload, style }) {
  if (!Array.isArray(payload.headers) || !Array.isArray(payload.rows)) throw new TypeError('Invalid table');
  return <table className="data-table" style={style}>
    {payload.caption && <caption>{String(payload.caption)}</caption>}
    <thead><tr>{payload.headers.map((header, index) => <th key={index}>{String(header)}</th>)}</tr></thead>
    <tbody>{payload.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}>{String(cell)}</td>)}</tr>)}</tbody>
  </table>;
}

function Steps({ payload, style }) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new TypeError('Invalid steps');
  const layout = payload.layout || 'list';
  return <div
    className={`steps-block steps-layout-${layout}`}
    style={style}
    data-columns={layout === 'grid' ? balancedColumns(items.length, 3) : undefined}
  >
    {items.map((item, index) => {
      const num = String(item.index ?? index + 1).padStart(2, '0');
      return (
        <div key={index} className="steps-item">
          <div className="steps-badge">{num}</div>
          <div className="steps-content">
            <h3 className="steps-title">{stripStepOrdinal(String(item.title ?? ''))}</h3>
            {item.description ? <div className="steps-description"><MarkdownBlock content={String(item.description)} /></div> : null}
          </div>
        </div>
      );
    })}
  </div>;
}

function Chart({ payload, style }) {
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const series = payload.series && typeof payload.series === 'object' ? Object.entries(payload.series) : [];
  if (!labels.length || !series.length) throw new TypeError('Invalid chart');
  const width = 800, height = 280, padding = 44;
  const values = series.flatMap(([, items]) => items.map(Number));
  const minimum = Math.min(0, ...values), maximum = Math.max(1, ...values);
  const scaleY = (value) => height - padding - ((value - minimum) / (maximum - minimum || 1)) * (height - padding * 2);
  const scaleX = (index) => padding + index * ((width - padding * 2) / Math.max(labels.length - 1, 1));
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
  const gridTicks = [0.25, 0.5, 0.75, 1];

  return <figure className="chart" style={style}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Data chart">
      {gridTicks.map((ratio) => {
        const val = minimum + ratio * (maximum - minimum);
        const y = scaleY(val);
        return <line key={ratio} x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid-line" />;
      })}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
      {labels.map((label, index) => <text key={index} x={scaleX(index)} y={height - 16} textAnchor="middle">{String(label)}</text>)}
      {series.map(([name, items], seriesIndex) => payload.kind === 'bar' ? (
        <g key={name} aria-label={name}>
          {items.map((value, index) => {
            const slot = (width - padding * 2) / labels.length;
            const barWidth = slot / (series.length + 1);
            const x = padding + index * slot + seriesIndex * barWidth + barWidth / 2;
            const y = scaleY(Number(value)), baseline = scaleY(0);
            const barHeight = Math.max(Math.abs(baseline - y), 2);
            const barTop = Math.min(y, baseline);
            return <rect
              key={index}
              x={x}
              y={barTop}
              width={barWidth * 0.8}
              height={barHeight}
              rx="4"
              ry="4"
              fill={colors[seriesIndex % colors.length]}
            />;
          })}
        </g>
      ) : (
        <g key={name} aria-label={name}>
          <polyline
            fill="none"
            stroke={colors[seriesIndex % colors.length]}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={items.map((value, index) => `${scaleX(index)},${scaleY(Number(value))}`).join(' ')}
          />
          {items.map((value, index) => (
            <circle
              key={index}
              cx={scaleX(index)}
              cy={scaleY(Number(value))}
              r="4"
              fill={colors[seriesIndex % colors.length]}
              stroke="var(--surface-raised)"
              strokeWidth="2"
            />
          ))}
        </g>
      ))}
    </svg>
    <figcaption className="chart-legend">
      {series.map(([name], index) => (
        <span key={name} className="chart-legend-item">
          <span className="chart-legend-dot" style={{ backgroundColor: colors[index % colors.length] }} />
          {name}
        </span>
      ))}
    </figcaption>
  </figure>;
}

const TIMELINE_LANE_COLORS = {
  computeParseJson: '#4c78a8',
  parseJson: '#54a24b',
  parsejson: '#54a24b',
  createPollingOrder: '#6b7c93',
  createCompleteData: '#6b7c93',
  createCompletedData: '#6b7c93',
  computeContent: '#8b5cf6',
  'TemplatesResolver.merge': '#f58518',
  'decodeJson<FwElement>': '#2a9d8f',
  decodeJson: '#2a9d8f',
  preMaker: '#e377c2',
  draw: '#e8c547',
  wait: '#e07a3d',
};

const TIMELINE_COMPARE_COLORS = {
  UIC: '#2a9d8f',
  FW: '#c23b22',
};

function timelineSpans(lane) {
  if (Array.isArray(lane.spans) && lane.spans.length) {
    return lane.spans.map((span) => ({
      start: Number(span.start),
      duration: Number(span.duration),
      kind: span.kind || (lane.name === 'wait' ? 'wait' : 'span'),
      series: span.series,
      color: span.color,
    }));
  }
  return [{
    start: Number(lane.start),
    duration: Number(lane.duration),
    kind: lane.kind || (lane.name === 'wait' ? 'wait' : 'span'),
    series: lane.series,
    color: lane.color,
  }];
}

function formatTimelineDuration(value) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(1);
}

function TimelineChart({ payload, style }) {
  const lanes = Array.isArray(payload.lanes) ? payload.lanes : [];
  if (!lanes.length) throw new TypeError('Invalid timeline');
  const patternId = useId().replace(/:/g, '');
  const compress = payload.compress === 'wait' ? 'wait' : null;
  const series = Array.isArray(payload.series) ? payload.series : [];
  const seriesColors = payload.colors && typeof payload.colors === 'object' ? payload.colors : {};
  const prepared = lanes.map((lane) => ({ name: String(lane.name ?? ''), color: lane.color, spans: timelineSpans(lane) }));
  const allSpans = prepared.flatMap((lane) => lane.spans);
  const { toVisual, visualMax, waitBands } = buildTimelineScale(allSpans, compress);
  const isCompare = series.length > 0 || prepared.some((lane) => lane.spans.length > 1);
  const left = 178, right = 56, top = payload.title ? 36 : 18, bottom = 42, laneHeight = isCompare ? 36 : 32;
  const width = 920;
  const height = top + prepared.length * laneHeight + bottom;
  const plotWidth = width - left - right;
  const scaleX = (value, seriesKey) => left + (toVisual(value, seriesKey) / visualMax) * plotWidth;
  const tickStep = visualMax > 120 ? 40 : 20;
  const ticks = [];
  for (let tick = 0; tick <= visualMax + 0.01; tick += tickStep) ticks.push(tick);
  const unit = String(payload.unit || 'ms');
  const axisLabel = compress ? `${unit} (wait spans compressed and highlighted)` : unit;
  const hasWait = allSpans.some((span) => span.kind === 'wait');

  const colorFor = (lane, span) => {
    if (span.color) return span.color;
    if (lane.color) return lane.color;
    if (span.series && (seriesColors[span.series] || TIMELINE_COMPARE_COLORS[span.series])) {
      return seriesColors[span.series] || TIMELINE_COMPARE_COLORS[span.series];
    }
    return TIMELINE_LANE_COLORS[lane.name] || '#64748b';
  };

  return <figure className="chart chart-timeline" style={style}>
    {payload.title ? <figcaption className="chart-timeline-title">{String(payload.title)}</figcaption> : null}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={String(payload.title || 'Timeline chart')}>
      <defs>
        <pattern id={`wait-hatch-${patternId}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#f4d2b1" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="#e07a3d" strokeWidth="2.2" />
        </pattern>
      </defs>
      {ticks.map((tick) => {
        const x = left + (tick / visualMax) * plotWidth;
        return <g key={tick}>
          <line x1={x} y1={top - 6} x2={x} y2={height - bottom + 8} className="chart-grid-line" />
          <text x={x} y={height - 16} textAnchor="middle">{tick}</text>
        </g>;
      })}
      {waitBands.map((band, index) => (
        <rect
          key={`band-back-${index}`}
          className="chart-wait-band"
          x={left + (band.vis0 / visualMax) * plotWidth}
          y={top - 6}
          width={Math.max(((band.vis1 - band.vis0) / visualMax) * plotWidth, 1)}
          height={prepared.length * laneHeight + 8}
        />
      ))}
      <line x1={left} y1={height - bottom + 8} x2={width - right} y2={height - bottom + 8} className="chart-axis" />
      <text x={(left + width - right) / 2} y={height - 2} textAnchor="middle" className="chart-timeline-axis">{axisLabel}</text>
      {prepared.map((lane, laneIndex) => {
        const y = top + (prepared.length - 1 - laneIndex) * laneHeight;
        const compareSpans = isCompare && lane.spans.length > 1;
        const barHeight = compareSpans ? 8 : 16;
        return (
          <g key={`${lane.name}-${laneIndex}`}>
            {lane.spans.map((span, spanIndex) => {
              const x = scaleX(span.start, span.series);
              const barWidth = Math.max(scaleX(span.start + span.duration, span.series) - x, span.duration === 0 ? 2 : 3);
              const offsetY = compareSpans
                ? (span.series === series[1] || spanIndex === 1 ? 18 : 6)
                : (laneHeight - barHeight) / 2;
              const isWait = span.kind === 'wait';
              return (
                <rect
                  key={`${span.series || 'span'}-${spanIndex}`}
                  x={x}
                  y={y + offsetY}
                  width={barWidth}
                  height={barHeight}
                  rx="3"
                  fill={isWait ? `url(#wait-hatch-${patternId})` : colorFor(lane, span)}
                  stroke={isWait ? '#e07a3d' : 'none'}
                  strokeWidth={isWait ? 1 : 0}
                />
              );
            })}
          </g>
        );
      })}
      {waitBands.map((band, index) => (
        <rect
          key={`band-over-${index}`}
          className="chart-wait-band-overlay"
          x={left + (band.vis0 / visualMax) * plotWidth}
          y={top - 6}
          width={Math.max(((band.vis1 - band.vis0) / visualMax) * plotWidth, 1)}
          height={prepared.length * laneHeight + 8}
        />
      ))}
      {prepared.map((lane, laneIndex) => {
        const y = top + (prepared.length - 1 - laneIndex) * laneHeight;
        const compareSpans = isCompare && lane.spans.length > 1;
        const barHeight = compareSpans ? 8 : 16;
        return (
          <g key={`label-${lane.name}-${laneIndex}`}>
            <text x={left - 10} y={y + laneHeight / 2 + 4} textAnchor="end">{lane.name}</text>
            {lane.spans.map((span, spanIndex) => {
              const x = scaleX(span.start, span.series);
              const barWidth = Math.max(scaleX(span.start + span.duration, span.series) - x, span.duration === 0 ? 2 : 3);
              const offsetY = compareSpans
                ? (span.series === series[1] || spanIndex === 1 ? 18 : 6)
                : (laneHeight - barHeight) / 2;
              const isWait = span.kind === 'wait';
              const label = isWait
                ? `wait ${Math.round(span.duration)}${unit}`
                : formatTimelineDuration(span.duration);
              const labelInside = barWidth > (isWait ? 72 : 28);
              return (
                <text
                  key={`${span.series || 'span'}-${spanIndex}`}
                  x={labelInside ? x + barWidth / 2 : x + barWidth + 6}
                  y={y + offsetY + barHeight / 2 + 4}
                  textAnchor={labelInside ? 'middle' : 'start'}
                  className={[
                    isWait ? 'chart-timeline-wait-label' : 'chart-timeline-value',
                    labelInside ? 'chart-timeline-label-inset' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {label}
                </text>
              );
            })}
          </g>
        );
      })}
    </svg>
    {(isCompare || hasWait) ? (
      <figcaption className="chart-legend">
        {series.map((name) => (
          <span key={name} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ backgroundColor: seriesColors[name] || TIMELINE_COMPARE_COLORS[name] || '#64748b' }} />
            {name}
          </span>
        ))}
        {hasWait ? (
          <span className="chart-legend-item">
            <span className="chart-legend-swatch chart-legend-swatch-wait" />
            wait
          </span>
        ) : null}
      </figcaption>
    ) : null}
  </figure>;
}

const GRAPH_NODE_W = 132;
const GRAPH_NODE_H = 58;
const GRAPH_GAP_X = 40;
const GRAPH_GAP_Y = 78;
// Top padding holds the cycle rail plus its label, and leaves the row above the
// boxes free for edge labels that never fit inside a GRAPH_GAP_X-wide gap.
const GRAPH_PAD = { top: 58, right: 84, bottom: 48, left: 28 };
const GRAPH_LANE_LABEL_W = 78;
const GRAPH_CYCLE_LIFT = 32;
const GRAPH_CYCLE_RADIUS = 13;

function graphEdgeKey(edge) {
  return `${edge.from}->${edge.to}::${edge.label || ''}`;
}

function detectCycleKeys(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map([...ids].map((id) => [id, []]));
  for (const edge of edges) {
    if (ids.has(edge.from) && ids.has(edge.to)) outgoing.get(edge.from).push(edge);
  }
  const visiting = new Set();
  const visited = new Set();
  const cycleKeys = new Set();
  const walk = (id) => {
    visiting.add(id);
    for (const edge of outgoing.get(id) || []) {
      if (visiting.has(edge.to) || edge.from === edge.to) cycleKeys.add(graphEdgeKey(edge));
      else if (!visited.has(edge.to)) walk(edge.to);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) if (!visited.has(id)) walk(id);
  return cycleKeys;
}

function prepareGraph(payload) {
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload.edges) ? payload.edges : [];
  if (!rawNodes.length) throw new TypeError('Invalid graph');
  const nodes = rawNodes.map((node, index) => {
    const id = String(node.id ?? node.name ?? `n${index}`);
    return {
      id,
      label: String(node.label ?? node.title ?? id),
      subtitle: node.subtitle ? String(node.subtitle) : '',
      kind: node.kind || 'flow',
      lane: Number.isInteger(node.lane) ? node.lane : null,
      column: Number.isInteger(node.column) ? node.column : null,
      color: node.color,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = rawEdges
    .map((edge) => ({
      from: String(edge.from ?? edge.source ?? ''),
      to: String(edge.to ?? edge.target ?? ''),
      label: edge.label ? String(edge.label) : '',
      kind: edge.kind || 'flow',
    }))
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const cycleKeys = detectCycleKeys(nodes, edges);
  for (const edge of edges) {
    if (edge.kind === 'cycle' || edge.from === edge.to || cycleKeys.has(graphEdgeKey(edge))) {
      edge.kind = 'cycle';
    }
  }

  const incoming = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (edge.kind !== 'cycle') incoming.get(edge.to).push(edge.from);
  }
  const columnOf = new Map();
  const visit = (id, stack) => {
    if (columnOf.has(id)) return columnOf.get(id);
    const node = nodes.find((item) => item.id === id);
    if (node?.column != null) {
      columnOf.set(id, node.column);
      return node.column;
    }
    if (stack.has(id)) return 0;
    stack.add(id);
    const preds = incoming.get(id) || [];
    const column = preds.length ? Math.max(...preds.map((pred) => visit(pred, stack))) + 1 : 0;
    stack.delete(id);
    columnOf.set(id, column);
    return column;
  };
  for (const node of nodes) visit(node.id, new Set());

  const usedLanes = nodes.some((node) => node.lane != null);
  const laneOf = new Map();
  if (usedLanes) {
    for (const node of nodes) laneOf.set(node.id, node.lane ?? 0);
  } else {
    for (const node of nodes) laneOf.set(node.id, 0);
  }

  const columns = [...columnOf.values()];
  const lanes = [...laneOf.values()];
  const maxColumn = Math.max(0, ...columns);
  const maxLane = Math.max(0, ...lanes);
  const laneNames = Array.isArray(payload.lanes) ? payload.lanes.map(String) : [];
  const hasLaneLabels = laneNames.length > 0 || maxLane > 0;
  const left = GRAPH_PAD.left + (hasLaneLabels ? GRAPH_LANE_LABEL_W : 0);
  const width = left + (maxColumn + 1) * (GRAPH_NODE_W + GRAPH_GAP_X) - GRAPH_GAP_X + GRAPH_PAD.right;
  const height = GRAPH_PAD.top + (maxLane + 1) * (GRAPH_NODE_H + GRAPH_GAP_Y) - GRAPH_GAP_Y + GRAPH_PAD.bottom;

  const placed = nodes.map((node) => {
    const column = columnOf.get(node.id);
    const lane = laneOf.get(node.id);
    return {
      ...node,
      column,
      lane,
      x: left + column * (GRAPH_NODE_W + GRAPH_GAP_X),
      y: GRAPH_PAD.top + lane * (GRAPH_NODE_H + GRAPH_GAP_Y),
    };
  });
  const byId = new Map(placed.map((node) => [node.id, node]));
  return {
    nodes: placed,
    edges,
    byId,
    width: Math.max(width, 420),
    height: Math.max(height, 140),
    laneNames,
    maxLane,
    hasLaneLabels,
    left,
    title: payload.title ? String(payload.title) : '',
  };
}

function edgePath(from, to, kind, index, maxLane) {
  const start = { x: from.x + GRAPH_NODE_W, y: from.y + GRAPH_NODE_H / 2 };
  const end = { x: to.x, y: to.y + GRAPH_NODE_H / 2 };
  if (from.id === to.id) {
    const right = from.x + GRAPH_NODE_W;
    const cy = from.y + GRAPH_NODE_H / 2;
    return {
      d: `M ${right} ${from.y + 14} C ${right + 34} ${from.y - 6}, ${right + 34} ${from.y + GRAPH_NODE_H + 6}, ${right} ${from.y + GRAPH_NODE_H - 14}`,
      labelAt: { x: right + 40, y: cy - 2 },
      loop: true,
    };
  }
  if (from.column === to.column && from.lane !== to.lane) {
    const downward = from.lane < to.lane;
    const startY = downward ? from.y + GRAPH_NODE_H : from.y;
    const endY = downward ? to.y : to.y + GRAPH_NODE_H;
    const x = from.x + GRAPH_NODE_W / 2;
    return {
      d: `M ${x} ${startY} C ${x} ${startY + (downward ? 18 : -18)}, ${x} ${endY + (downward ? -18 : 18)}, ${x} ${endY}`,
      labelAt: { x: x + 18, y: (startY + endY) / 2 },
    };
  }
  if (kind === 'cycle' && to.column <= from.column) {
    // Stagger towards the boxes, never away: extra lift would push the rail and its
    // label out of GRAPH_PAD.top.
    const lift = GRAPH_CYCLE_LIFT - (index % 2) * 12;
    const below = maxLane > 0 && from.lane === maxLane;
    const away = below ? 1 : -1;
    const railY = below
      ? Math.max(from.y, to.y) + GRAPH_NODE_H + lift
      : Math.min(from.y, to.y) - lift;
    const fromY = below ? from.y + GRAPH_NODE_H : from.y;
    const toY = below ? to.y + GRAPH_NODE_H : to.y;
    const exitX = from.x + GRAPH_NODE_W / 2;
    const entryX = to.x + GRAPH_NODE_W / 2;
    const back = entryX > exitX ? 1 : -1;
    // A flat cubic over a long rail collapses into hooks at both ends, so route it
    // orthogonally and round only the corners.
    const radius = Math.max(4, Math.min(GRAPH_CYCLE_RADIUS, lift / 2, Math.abs(entryX - exitX) / 2));
    const turn = railY - away * radius;
    return {
      d: `M ${exitX} ${fromY} V ${turn}`
        + ` Q ${exitX} ${railY} ${exitX + back * radius} ${railY}`
        + ` H ${entryX - back * radius}`
        + ` Q ${entryX} ${railY} ${entryX} ${turn}`
        + ` V ${toY}`,
      labelAt: { x: (exitX + entryX) / 2, y: below ? railY + 14 : railY - 8 },
    };
  }
  if (from.lane === to.lane && to.column === from.column + 1) {
    return {
      d: `M ${start.x} ${start.y} C ${start.x + 18} ${start.y}, ${end.x - 18} ${end.y}, ${end.x} ${end.y}`,
      labelAt: { x: (start.x + end.x) / 2, y: from.y - 11 },
    };
  }
  const midX = (start.x + end.x) / 2;
  return {
    d: `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`,
    labelAt: { x: midX, y: (start.y + end.y) / 2 - 10 },
  };
}

function GraphChart({ payload, style }) {
  const graph = useMemo(() => prepareGraph(payload), [payload]);
  const markerId = useId().replace(/:/g, '');
  const routes = useMemo(() => {
    let cycleIndex = 0;
    return graph.edges.flatMap((edge) => {
      const from = graph.byId.get(edge.from);
      const to = graph.byId.get(edge.to);
      if (!from || !to) return [];
      const isCycle = edge.kind === 'cycle';
      const path = edgePath(from, to, edge.kind, isCycle ? cycleIndex++ : 0, graph.maxLane);
      return [{ key: graphEdgeKey(edge), label: edge.label, isCycle, ...path }];
    });
  }, [graph]);

  return <figure className="chart chart-graph" style={style}>
    {graph.title ? <figcaption className="chart-timeline-title">{graph.title}</figcaption> : null}
    <svg viewBox={`0 0 ${graph.width} ${graph.height}`} role="img" aria-label={graph.title || 'Stage graph'}>
      <defs>
        <marker id={`graph-arrow-${markerId}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 1.2 L 10 5 L 0 8.8 Z" className="graph-arrow-flow" />
        </marker>
        <marker id={`graph-arrow-cycle-${markerId}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 1.2 L 10 5 L 0 8.8 Z" className="graph-arrow-cycle" />
        </marker>
      </defs>
      {graph.hasLaneLabels ? graph.nodes.reduce((labels, node) => {
        if (labels.some((item) => item.lane === node.lane)) return labels;
        labels.push({ lane: node.lane, y: node.y + GRAPH_NODE_H / 2 + 4, name: graph.laneNames[node.lane] || `lane ${node.lane + 1}` });
        return labels;
      }, []).map((item) => (
        <text key={`lane-${item.lane}`} x={graph.left - 14} y={item.y} textAnchor="end" className="graph-lane-label">{item.name}</text>
      )) : null}
      {routes.map((route) => (
        <path
          key={route.key}
          className={route.isCycle ? 'graph-edge graph-edge-cycle' : 'graph-edge'}
          d={route.d}
          fill="none"
          markerEnd={`url(#${route.isCycle ? `graph-arrow-cycle-${markerId}` : `graph-arrow-${markerId}`})`}
        />
      ))}
      {graph.nodes.map((node) => (
        <g key={node.id} className={`graph-node graph-node-${node.kind}`} transform={`translate(${node.x} ${node.y})`}>
          <rect width={GRAPH_NODE_W} height={GRAPH_NODE_H} rx="10" style={node.color ? { stroke: node.color } : undefined} />
          <text x={GRAPH_NODE_W / 2} y={node.subtitle ? 24 : 34} textAnchor="middle" className="graph-node-label">{node.label}</text>
          {node.subtitle ? <text x={GRAPH_NODE_W / 2} y={42} textAnchor="middle" className="graph-node-sub">{node.subtitle}</text> : null}
        </g>
      ))}
      {/* Edge captions come last: they are wider than the gap between boxes, so they
          overhang the nodes and would be painted under them in the edge layer. */}
      {routes.filter((route) => route.label).map((route) => (
        <text
          key={`label-${route.key}`}
          x={route.labelAt.x}
          y={route.labelAt.y}
          textAnchor="middle"
          className={route.isCycle ? 'graph-edge-label graph-edge-label-cycle' : 'graph-edge-label'}
        >
          {route.label}
        </text>
      ))}
    </svg>
    <figcaption className="chart-legend">
      <span className="chart-legend-item"><span className="chart-legend-swatch graph-legend-flow" />stages</span>
      <span className="chart-legend-item"><span className="chart-legend-swatch graph-legend-cycle" />cycles</span>
    </figcaption>
  </figure>;
}

export default function StructuredRendering({ rendering }) {
  const payload = payloadFor(rendering);
  const style = sanitizeStyle(rendering.style);
  switch (rendering.type) {
    case 'table': return <Table payload={payload} style={style} />;
    case 'chart': return <Chart payload={payload} style={style} />;
    case 'timeline': return <TimelineChart payload={payload} style={style} />;
    case 'graph': return <GraphChart payload={payload} style={style} />;
    case 'callout': return <aside className={`callout callout-${payload.tone || 'info'}`} style={style}>{payload.title && <strong>{String(payload.title)}</strong>}<MarkdownBlock content={String(payload.message ?? '')} /></aside>;
    case 'columns':
      if (!Array.isArray(payload.cells) || payload.cells.length < 2 || payload.cells.length > 4) throw new TypeError('Invalid columns');
      return <div
        className={`content-columns columns-${payload.gap || 'normal'}`}
        style={style}
        data-columns={payload.cells.length}
      >{payload.cells.map((cell, index) => <div key={index}><MarkdownBlock content={String(cell)} /></div>)}</div>;
    case 'metrics': {
      const items = payload.items && typeof payload.items === 'object' ? Object.entries(payload.items) : [];
      if (!items.length) throw new TypeError('Invalid metrics');
      return <dl className="metrics" style={style} data-columns={balancedColumns(items.length)}>{items.map(([label, value]) => <div key={label}><dd>{String(value)}</dd><dt>{label}</dt></div>)}</dl>;
    }
    case 'quote': return <figure className="quote-block" style={style}><blockquote>{String(payload.message ?? '')}</blockquote>{payload.attribution && <figcaption>— {String(payload.attribution)}</figcaption>}</figure>;
    case 'divider': return <div className="content-divider"><hr />{payload.label && <span>{String(payload.label)}</span>}<hr /></div>;
    case 'section': return <div className="section-card" style={style}><h2>{String(payload.title ?? '')}</h2>{payload.subtitle && <p>{String(payload.subtitle)}</p>}</div>;
    case 'terminal': return <div className="terminal-block" style={style}><div className="terminal-header"><div className="terminal-controls" aria-hidden="true"><span className="terminal-dot" /><span className="terminal-dot" /><span className="terminal-dot" /></div><div className="terminal-command"><span className="terminal-prompt">$</span> {String(payload.command ?? '')}</div></div>{payload.stdout && <pre>{String(payload.stdout)}</pre>}{payload.stderr && <pre className="terminal-stderr">{String(payload.stderr)}</pre>}<footer>exit {Number(payload.exitCode)} · {Number(payload.durationMs).toFixed(2)} ms</footer></div>;
    case 'diff': return <LazyCode content={String(payload.content ?? '')} language="diff" style={style} />;
    case 'steps': return <Steps payload={payload} style={style} />;
    default: throw new TypeError(`Unsupported structured rendering: ${rendering.type}`);
  }
}
