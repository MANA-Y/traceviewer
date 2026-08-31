import { useEffect, useState } from 'react';
import { describeLoadingState, formatElapsed } from './core/loadingState';

const PREVIEW_LINES = [
  { kind: 'heading', width: '56%' },
  { kind: 'body', width: '92%' },
  { kind: 'body', width: '84%' },
  { kind: 'short', width: '68%' },
  { kind: 'body', width: '78%' },
];

export default function LoadingScreen({
  live = false,
  status = 'idle',
  hasTrace = false,
  hasCompiled = false,
  diagnostic = null,
}) {
  const copy = describeLoadingState({ live, status, hasTrace, hasCompiled, diagnostic });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [live, status, hasTrace, hasCompiled]);

  const linger = (copy.phase === 'waiting' || copy.phase === 'stale' || copy.phase === 'connecting')
    && elapsed >= 6;

  return (
    <main
      className={`loading-screen loading-screen-${copy.phase}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-atmosphere" aria-hidden="true" />
      <section className="loading-stage">
        <div className="loading-preview" aria-hidden="true">
          <div className="loading-preview-chrome">
            <span />
            <span />
            <span />
          </div>
          <div className="loading-preview-stage">
            <div className="loading-gutter">
              {PREVIEW_LINES.map((_, index) => <small key={index}>{index + 1}</small>)}
            </div>
            <div className="loading-preview-body">
              <div className="loading-cursor" />
              {PREVIEW_LINES.map((line, index) => (
                <div
                  key={index}
                  className={`loading-line loading-line-${line.kind}`}
                  style={{ width: line.width }}
                />
              ))}
            </div>
          </div>
          <div className="loading-progress">
            {PREVIEW_LINES.map((_, index) => <span key={index} />)}
          </div>
        </div>
        <p className="loading-kicker">{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p className="loading-detail">{copy.detail}</p>
        {linger && (
          <p className="loading-wait">
            Still waiting · {formatElapsed(elapsed)}
          </p>
        )}
        {diagnostic?.message && copy.phase !== 'stale' && (
          <p className="loading-diagnostic">{diagnostic.message}</p>
        )}
      </section>
    </main>
  );
}
