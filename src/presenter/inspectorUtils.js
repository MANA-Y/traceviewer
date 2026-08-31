export const VALUE_PREVIEW_LIMIT = 500;

export function renderInspectorValue(value) {
  if (typeof value === 'number') {
    if (Math.abs(value) > 1e12) return value.toExponential(3);
    if (Math.abs(value) < 1e6) return value.toString();
    return value.toLocaleString();
  }
  const serialized = JSON.stringify(value, null, 2);
  return serialized === undefined ? String(value) : serialized;
}

export function previewValue(value, limit = VALUE_PREVIEW_LIMIT) {
  const text = renderInspectorValue(value);
  return text.length > limit
    ? { text: `${text.slice(0, limit)}…`, fullText: text, truncated: true }
    : { text, fullText: text, truncated: false };
}

export function cumulativeStream(steps, currentStepIndex, name) {
  return (steps ?? [])
    .slice(0, Math.max(0, currentStepIndex) + 1)
    .map((step) => step?.[name] ?? '')
    .filter(Boolean)
    .join('');
}

export function includesQuery(values, query) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || values.some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
}
