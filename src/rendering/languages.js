import hljs from 'highlight.js/lib/core';


const LANGUAGE_BY_EXTENSION = new Map([
  ['dart', 'dart'],
  ['py', 'python'],
  ['bash', 'bash'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
]);

const LANGUAGE_LOADERS = {
  bash: () => import('highlight.js/lib/languages/bash'),
  dart: () => import('highlight.js/lib/languages/dart'),
  diff: () => import('highlight.js/lib/languages/diff'),
  python: () => import('highlight.js/lib/languages/python'),
};

const loadingLanguages = new Map();

function normalizedLanguage(language) {
  const value = String(language || 'plaintext').toLowerCase();
  return value === 'shell' ? 'bash' : value;
}

async function ensureLanguage(language) {
  const normalized = normalizedLanguage(language);
  if (normalized === 'plaintext' || hljs.getLanguage(normalized)) return normalized;
  const loader = LANGUAGE_LOADERS[normalized];
  if (!loader) return 'plaintext';
  if (!loadingLanguages.has(normalized)) {
    loadingLanguages.set(normalized, loader().then((module) => {
      hljs.registerLanguage(normalized, module.default);
      return normalized;
    }));
  }
  return loadingLanguages.get(normalized);
}

export function languageForPath(path) {
  const extension = String(path).split('.').pop()?.toLowerCase();
  return LANGUAGE_BY_EXTENSION.get(extension) ?? 'plaintext';
}

export function escapeCode(source) {
  return String(source)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function highlightCode(source, language) {
  const resolved = await ensureLanguage(language);
  if (resolved === 'plaintext') return escapeCode(source);
  return hljs.highlight(String(source), { language: resolved }).value;
}

export async function highlightSourceFiles(files) {
  const result = new Map();
  await Promise.all(Object.entries(files).map(async ([path, content]) => {
    result.set(path, (await highlightCode(content, languageForPath(path))).split('\n'));
  }));
  return result;
}
