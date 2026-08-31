import { useMemo, useState } from 'react';
import {
  cumulativeStream,
  includesQuery,
  previewValue,
  renderInspectorValue,
} from './inspectorUtils';

function InspectorValue({ value }) {
  const [expanded, setExpanded] = useState(false);
  const preview = previewValue(value);
  return (
    <div className="inspector-value">
      <pre>{expanded ? preview.fullText : preview.text}</pre>
      {preview.truncated && (
        <button type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show all (${preview.fullText.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}

function Variables({ environment, query }) {
  const entries = Object.entries(environment ?? {}).filter(([name, value]) =>
    includesQuery([name, renderInspectorValue(value)], query)
  );
  if (entries.length === 0) return <p className="presenter-empty">No captured variables.</p>;
  return (
    <table className="inspector-variables">
      <tbody>
        {entries.map(([name, value]) => (
          <tr key={name}>
            <th>{name}</th>
            <td><InspectorValue value={value} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stack({ frames, query }) {
  const filtered = (frames ?? []).filter((frame) =>
    includesQuery([frame.function_name, frame.path, frame.line_number, frame.code], query)
  );
  if (!filtered.length) return <p className="presenter-empty">No stack frames.</p>;
  return (
    <ol className="inspector-stack">
      {[...filtered].reverse().map((frame, index) => (
        <li key={`${frame.invocation_id ?? index}-${frame.path}-${frame.line_number}`}>
          <strong>{frame.function_name || '<module>'}</strong>
          <span>{frame.path}:{frame.line_number}</span>
          {frame.code && <code>{frame.code.trim()}</code>}
        </li>
      ))}
    </ol>
  );
}

function Stream({ value, name, query }) {
  const visible = includesQuery([value], query);
  return value && visible ? (
    <pre className={`inspector-stream inspector-${name}`}>{value}</pre>
  ) : (
    <p className="presenter-empty">No {name} at this step.</p>
  );
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through for HTTP, embedded browsers, and denied clipboard permission.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard is unavailable');
}

export default function Inspector({ environment, step, steps, currentStepIndex }) {
  const [activeTab, setActiveTab] = useState('variables');
  const [query, setQuery] = useState('');
  const [streamScope, setStreamScope] = useState('current');
  const [copyStatus, setCopyStatus] = useState('');

  const tabs = [
    ['variables', 'Variables'],
    ['stack', 'Stack'],
    ['stdout', 'stdout'],
    ['stderr', 'stderr'],
  ];

  const varCount = Object.keys(environment ?? {}).length;
  const frameCount = step?.stack?.length ?? 0;
  const hasStream = Boolean(step?.stdout || step?.stderr);

  const streamName = activeTab === 'stdout' || activeTab === 'stderr' ? activeTab : null;
  const streamValue =
    streamName && streamScope === 'accumulated'
      ? cumulativeStream(steps, currentStepIndex, streamName)
      : step?.[streamName];

  const copyText = useMemo(() => {
    if (activeTab === 'variables') {
      return Object.entries(environment ?? {})
        .filter(([name, value]) => includesQuery([name, renderInspectorValue(value)], query))
        .map(([name, value]) => `${name} = ${renderInspectorValue(value)}`)
        .join('\n');
    }
    if (activeTab === 'stack') {
      return (step?.stack ?? [])
        .filter((frame) =>
          includesQuery([frame.function_name, frame.path, frame.line_number, frame.code], query)
        )
        .map(
          (frame) =>
            `${frame.function_name} (${frame.path}:${frame.line_number})${
              frame.code ? `\n  ${frame.code.trim()}` : ''
            }`
        )
        .join('\n');
    }
    return includesQuery([streamValue], query) ? streamValue ?? '' : '';
  }, [activeTab, environment, query, step, streamValue]);

  const copy = async () => {
    try {
      await copyToClipboard(copyText);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    window.setTimeout(() => setCopyStatus(''), 1500);
  };

  return (
    <details className="presenter-inspector-details">
      <summary className="presenter-inspector-summary">
        <span id="inspector-title" className="inspector-summary-title">Inspector</span>
        <span className="inspector-summary-meta">
          {varCount > 0 && <span className="meta-badge meta-active">{varCount} vars</span>}
          {varCount === 0 && <span className="meta-badge">0 vars</span>}
          <span className="meta-badge">{frameCount} frames</span>
          {hasStream && <span className="meta-badge meta-stream">stream</span>}
        </span>
      </summary>

      <section className="presenter-inspector-panel" aria-labelledby="inspector-title">
        <div className="inspector-tabs" role="tablist" aria-label="Step inspector">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inspector-tools">
          <input
            type="search"
            aria-label="Search inspector"
            placeholder={`Search ${activeTab}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" onClick={copy} disabled={!copyText}>
            Copy
          </button>
          <span role="status">{copyStatus}</span>
        </div>

        {streamName && (
          <div className="inspector-scope" aria-label={`${streamName} scope`}>
            <button
              type="button"
              aria-pressed={streamScope === 'current'}
              onClick={() => setStreamScope('current')}
            >
              Current
            </button>
            <button
              type="button"
              aria-pressed={streamScope === 'accumulated'}
              onClick={() => setStreamScope('accumulated')}
            >
              Accumulated
            </button>
          </div>
        )}

        <div className="inspector-content" role="tabpanel">
          {activeTab === 'variables' && <Variables environment={environment} query={query} />}
          {activeTab === 'stack' && <Stack frames={step?.stack} query={query} />}
          {activeTab === 'stdout' && <Stream value={streamValue} name="stdout" query={query} />}
          {activeTab === 'stderr' && <Stream value={streamValue} name="stderr" query={query} />}
        </div>
      </section>
    </details>
  );
}
