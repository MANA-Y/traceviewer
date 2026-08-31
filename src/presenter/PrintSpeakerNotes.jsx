import { useMemo } from 'react';
import { marked } from 'marked';
import { sanitizeMarkdown } from '../rendering/security';
import { noteText } from './noteUtils';

export default function PrintSpeakerNotes({ notes, comment }) {
  const text = noteText(notes);
  const privateText = typeof comment === 'string' ? comment.trim() : '';
  const html = useMemo(
    () => (text ? sanitizeMarkdown(marked.parse(text)) : ''),
    [text],
  );
  if (!text && !privateText) return null;
  return (
    <aside className="print-speaker-notes">
      {html ? <div className="print-speaker-notes-body" dangerouslySetInnerHTML={{ __html: html }} /> : null}
      {privateText ? <p className="print-speaker-notes-comment">{privateText}</p> : null}
    </aside>
  );
}
