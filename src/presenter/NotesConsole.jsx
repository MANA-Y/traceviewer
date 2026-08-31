import { openAudienceWindow } from '../core/urlState';
import Inspector from './Inspector';
import Notes from './Notes';
import RehearsalTimer from './RehearsalTimer';
import Timeline from './Timeline';

function sectionAtStep(sections, stepIndex) {
  let match = null;
  for (const section of sections ?? []) {
    if (section.stepIndex <= stepIndex) {
      match = section;
    } else {
      break;
    }
  }
  return match;
}

export default function NotesConsole({
  currentStepIndex,
  notes,
  nextNotes,
  environment,
  step,
  steps,
  presentationId,
  live,
  audienceUrl,
  canControl,
  sections,
  totalSteps,
  stepIndices,
  onSeek,
  onPrevious,
  onNext,
  onHelp,
  onSettings,
}) {
  const section = sectionAtStep(sections, currentStepIndex);
  const atStart = currentStepIndex <= (stepIndices?.[0] ?? 0);
  const lastStep = stepIndices?.[stepIndices.length - 1] ?? totalSteps - 1;
  const atEnd = currentStepIndex >= lastStep;

  return (
    <main className="notes-console" aria-label="Presenter notes and control">
      <header className="notes-console-header">
        <RehearsalTimer presentationId={presentationId} />
        <div className="notes-console-meta">
          <p>
            {section?.title
              ? <strong>{section.title}</strong>
              : <strong>Presenter notes</strong>}
            {section?.subtitle && <span>{section.subtitle}</span>}
          </p>
        </div>
      </header>

      <div className="notes-console-hint" role="note">
        {live
          ? canControl
            ? <>
              <p>Опциональные заметки. Основное управление и шаринг — в окне Presenter. Next/Previous здесь, если отошёл с телефоном.</p>
              {audienceUrl && (
                <button type="button" onClick={() => openAudienceWindow(audienceUrl)}>
                  Open audience view
                </button>
              )}
            </>
            : <p>Этот токен не управляет докладом. Открой Presenter URL из терминала.</p>
          : <p>Для шаринга нужен live Presenter URL. Статический снимок меняет только это окно.</p>}
      </div>

      <Notes
        notes={notes}
        nextNotes={nextNotes}
        presentationId={presentationId}
        stepIndex={currentStepIndex}
      />

      <div className="notes-console-transport">
        <button
          type="button"
          className="notes-console-step"
          disabled={!canControl || atStart}
          onClick={onPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          className="notes-console-step is-next"
          disabled={!canControl || atEnd}
          onClick={onNext}
        >
          Next
        </button>
      </div>

      <Timeline
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        stepIndices={stepIndices}
        sections={sections}
        onSeek={canControl ? onSeek : undefined}
        onHelp={onHelp}
        onSettings={onSettings}
      />

      <Inspector
        environment={environment}
        step={step}
        steps={steps}
        currentStepIndex={currentStepIndex}
      />
    </main>
  );
}
