import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { sanitizeMarkdown } from '../rendering/security';
import { loadStepComment, saveStepComment } from '../openTrace';
import { noteText, notesSummary } from './noteUtils';

export default function Notes({ notes, nextNotes, presentationId, stepIndex }) {
  const text = noteText(notes);
  const nextSummary = notesSummary(nextNotes);
  const safeNotes = useMemo(
    () => sanitizeMarkdown(marked.parse(text || '*No speaker notes for this step.*')),
    [text],
  );
  const [comment, setComment] = useState(() => loadStepComment(presentationId, stepIndex));

  useEffect(() => {
    setComment(loadStepComment(presentationId, stepIndex));
  }, [presentationId, stepIndex]);

  const updateComment = (value) => {
    setComment(value);
    saveStepComment(presentationId, stepIndex, value);
  };

  return (
    <section className="presenter-notes" aria-labelledby="speaker-notes-title">
      <h2 id="speaker-notes-title">Speaker notes</h2>
      <div
        className={`presenter-notes-body ${!text ? 'presenter-empty' : ''}`}
        dangerouslySetInnerHTML={{ __html: safeNotes }}
      />
      {nextSummary && (
        <p className="presenter-next-note">
          <small>Next</small>
          <span>{nextSummary}</span>
        </p>
      )}
      <label className="presenter-comments" htmlFor="step-comment">
        <span>Comments</span>
        <textarea
          id="step-comment"
          rows={3}
          value={comment}
          placeholder="Private notes for this step. Saved in this browser."
          onChange={(event) => updateComment(event.target.value)}
        />
      </label>
    </section>
  );
}
