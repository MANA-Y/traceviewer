import { useRef, useState } from 'react';
import {
  assignLocalTrace,
  displayNameForTrace,
  isJsonSnapshotFile,
  loadRecentTraces,
  localTraceHref,
  rememberRecentTrace,
  snapshotHref,
} from './openTrace';

export default function OpenTracePicker({ navigate, onOpened }) {
  const fileInputRef = useRef(null);
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(() => loadRecentTraces());

  const finish = (href) => {
    setError(null);
    navigate(href);
    onOpened?.();
  };

  const openFile = (file) => {
    if (!file) return;
    if (!isJsonSnapshotFile(file)) {
      setError('Choose a compiled snapshot JSON file.');
      return;
    }
    setFileName(file.name);
    finish(localTraceHref(assignLocalTrace(file)));
  };

  const openUrl = (event) => {
    event.preventDefault();
    const trace = url.trim();
    if (!trace) {
      setError('Choose a file or enter a snapshot URL.');
      return;
    }
    setRecent(rememberRecentTrace({ title: displayNameForTrace(trace), url: trace }));
    finish(snapshotHref(trace));
  };

  return (
    <div className="open-trace-picker">
      <div
        className={`trace-dropzone${dragOver ? ' is-dragover' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          openFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInputRef}
          id="trace-file"
          type="file"
          accept=".json,application/json,text/json"
          aria-label="Choose snapshot file"
          onChange={(event) => {
            openFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <strong>Drop a snapshot</strong>
        <span>or pick a compiled presentation from disk</span>
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Choose file
        </button>
        {fileName && <small>{fileName}</small>}
      </div>

      {error && <p className="open-trace-error" role="alert">{error}</p>}

      <form className="open-trace-form" onSubmit={openUrl}>
        <label htmlFor="trace-url">Snapshot URL</label>
        <div className="open-trace-url">
          <input
            id="trace-url"
            name="trace"
            type="text"
            value={url}
            placeholder="/var/traces/presentation.json"
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError(null);
            }}
          />
          <button type="submit">Open</button>
        </div>
      </form>

      {recent.length > 0 && (
        <section className="recent-traces" aria-label="Recent presentations">
          <h2>Recent</h2>
          <div className="presentation-list">
            {recent.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => finish(snapshotHref(item.url))}
              >
                <strong>{item.title}</strong>
                <small>{item.url}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
