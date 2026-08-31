function findStepPosition(stepIndices, stepIndex) {
  let low = 0;
  let high = stepIndices.length - 1;
  let match = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (stepIndices[middle] <= stepIndex) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match;
}

export default function Timeline({ currentStepIndex, totalSteps, stepIndices, sections, onSeek, onHelp, onSettings, onExportPdf }) {
  const visibleStepCount = stepIndices?.length ?? totalSteps;
  const currentPosition = currentStepIndex === null
    ? 0
    : stepIndices ? findStepPosition(stepIndices, currentStepIndex) : currentStepIndex;
  const progressPercentage = currentStepIndex !== null && visibleStepCount > 1
    ? (currentPosition / (visibleStepCount - 1)) * 100
    : 0;
  const stepProgress = currentStepIndex !== null
    ? `${currentPosition + 1} / ${visibleStepCount}`
    : null;
  return (
    <footer className="presentation-progress" title={stepProgress}>
      <span>{stepProgress}</span>
      <div className="presentation-progress-control">
        <input
          className="presentation-progress-range"
          type="range"
          min="0"
          max={Math.max(visibleStepCount - 1, 0)}
          value={currentPosition}
          aria-label="Presentation step"
          aria-valuetext={stepProgress ?? undefined}
          disabled={!onSeek}
          onChange={(event) => {
            const position = Number(event.target.value);
            onSeek?.(stepIndices?.[position] ?? position);
          }}
          style={{ '--progress': `${progressPercentage}%` }}
        />
        <div className="presentation-section-markers" aria-label="Presentation sections">
          {sections.map((section, index) => {
            const stepIndex = Math.min(Math.max(Number(section.stepIndex) || 0, 0), Math.max(totalSteps - 1, 0));
            const stepPosition = stepIndices ? findStepPosition(stepIndices, stepIndex) : stepIndex;
            const position = visibleStepCount > 1
              ? (stepPosition / (visibleStepCount - 1)) * 100
              : 0;
            return <button
              key={`${stepIndex}-${section.title ?? index}`}
              type="button"
              className={stepIndex <= currentStepIndex ? 'reached' : ''}
              aria-label={`Go to section: ${section.title ?? `Section ${index + 1}`}`}
              title={section.title ?? `Section ${index + 1}`}
              style={{ left: `${position}%` }}
              disabled={!onSeek}
              onClick={() => onSeek?.(stepIndex)}
            />;
          })}
        </div>
      </div>
      <div className="presentation-progress-actions">
        {onExportPdf && <button
          type="button"
          className="shortcut-help-button"
          aria-label="Export PDF"
          title="Export PDF"
          onClick={onExportPdf}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v11m0 0-3.5-3.5M12 15l3.5-3.5M6 19h12"
            />
          </svg>
        </button>}
        {onSettings && <button
          type="button"
          className="shortcut-help-button"
          aria-label="Presentation settings"
          title="Presentation settings [S]"
          onClick={onSettings}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              d="M5 8h8m6 0h-4M5 16h4m10 0H11"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              d="M13 6v4M11 14v4"
            />
          </svg>
        </button>}
        {onHelp && <button
          type="button"
          className="shortcut-help-button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts [?]"
          onClick={onHelp}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.2 9.2a2.8 2.8 0 1 1 3.7 2.7c-.8.3-1.3.9-1.3 1.7V14m0 2.6h.01"
            />
          </svg>
        </button>}
      </div>
    </footer>
  );
}
