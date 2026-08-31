import { useEffect, useState } from 'react';
import Inspector from './Inspector';
import Notes from './Notes';
import RehearsalTimer from './RehearsalTimer';

const COLLAPSED_KEY = 'traceviewer-presenter-collapsed';

function PresenterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V9h4.5L14 4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z"
      />
    </svg>
  );
}

export default function PresenterShell({
  currentStepIndex,
  notes,
  nextNotes,
  environment,
  step,
  steps,
  presentationId,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch { /* Persistence is optional. */ }
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside className="presenter-panel is-collapsed" aria-label="Presenter view">
        <button
          type="button"
          className="presenter-fab"
          aria-label="Show presenter notes"
          title="Show presenter notes"
          onClick={() => setCollapsed(false)}
        >
          <PresenterIcon />
        </button>
      </aside>
    );
  }

  return (
    <aside className="presenter-panel" aria-label="Presenter view">
      <RehearsalTimer
        presentationId={presentationId}
        onHide={() => setCollapsed(true)}
      />

      <Notes
        notes={notes}
        nextNotes={nextNotes}
        presentationId={presentationId}
        stepIndex={currentStepIndex}
      />

      <Inspector
        environment={environment}
        step={step}
        steps={steps}
        currentStepIndex={currentStepIndex}
      />
    </aside>
  );
}
