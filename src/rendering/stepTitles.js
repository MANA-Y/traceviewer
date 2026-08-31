/* Authors often number their steps in the title ("01. Context"), and the badge numbers
   them again, so the reader sees "01  01. Context". Drop the author's ordinal and let
   the badge carry the count — a title that is only a number keeps it. */
const LEADING_ORDINAL = /^\s*\d{1,3}\s*[.)\]:]\s+(?=\S)/;

export function stripStepOrdinal(title) {
  if (typeof title !== 'string') return '';
  return title.replace(LEADING_ORDINAL, '');
}
