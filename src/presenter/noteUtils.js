export function noteText(notes) {
  if (Array.isArray(notes)) {
    return notes.map((note) => typeof note === 'string' ? note : note?.data ?? '').filter(Boolean).join('\n\n');
  }
  return typeof notes === 'string' ? notes : notes?.data ?? '';
}

export function notesSummary(notes) {
  return noteText(notes).trim().split(/\n|(?<=[.!?])\s/)[0];
}
