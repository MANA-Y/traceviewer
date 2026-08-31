import { useEffect, useMemo, useState } from 'react';
import { formatDuration, targetStatus } from './rehearsalUtils';

const DEFAULT_STATE = { elapsed: 0, targetMinutes: 20 };

function readState(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value && typeof value === 'object' ? { ...DEFAULT_STATE, ...value } : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

export default function RehearsalTimer({ presentationId, onHide }) {
  const storageKey = `traceviewer-rehearsal:${presentationId}`;
  const initial = useMemo(() => readState(storageKey), [storageKey]);
  const [elapsed, setElapsed] = useState(initial.elapsed);
  const [targetMinutes] = useState(initial.targetMinutes);
  const [startedAt, setStartedAt] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...readState(storageKey), elapsed, targetMinutes }));
    } catch { /* Persistence is optional in restricted browser contexts. */ }
  }, [elapsed, storageKey, targetMinutes]);

  useEffect(() => {
    if (startedAt === null) return undefined;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const running = startedAt !== null;
  const toggle = () => {
    if (running) {
      setElapsed(Date.now() - startedAt);
      setStartedAt(null);
    } else {
      setStartedAt(Date.now() - elapsed);
    }
  };
  const reset = () => {
    setElapsed(0);
    setStartedAt(running ? Date.now() : null);
  };
  const status = targetStatus(elapsed, targetMinutes);

  return (
    <div className={`rehearsal-timer${status.overrun ? ' rehearsal-overrun' : ''}`} aria-label="Rehearsal timer">
      <div>
        <time>{formatDuration(elapsed)}</time>
        <small>{status.label}</small>
      </div>
      <button type="button" onClick={toggle}>{running ? 'Pause' : elapsed ? 'Resume' : 'Start'}</button>
      <button type="button" onClick={reset} disabled={!running && elapsed === 0}>Reset</button>
      {onHide && <button type="button" className="rehearsal-hide" onClick={onHide}>Hide</button>}
    </div>
  );
}
