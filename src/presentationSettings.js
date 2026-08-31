import { useEffect, useState } from 'react';

export const SETTINGS_STORAGE_KEY = 'traceviewer-presentation-settings';
export const TEXT_SCALES = ['0.85', '1', '1.15', '1.35'];
export const TEXT_SCALE_LABELS = {
  '0.85': 'Small',
  '1': 'Medium',
  '1.15': 'Large',
  '1.35': 'Extra large',
};
export const FONT_FAMILIES = ['system', 'serif', 'humanist', 'geometric'];
export const FONT_FAMILY_LABELS = {
  system: 'System',
  serif: 'Serif',
  humanist: 'Humanist',
  geometric: 'Geometric',
};
export const FONT_FAMILY_STACKS = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
  humanist: '"Avenir Next", Calibri, "Gill Sans", "Trebuchet MS", sans-serif',
  geometric: 'Avenir, Futura, "Century Gothic", "Trebuchet MS", sans-serif',
};
export const CODE_FONTS = ['mono', 'monaco', 'courier'];
export const CODE_FONT_LABELS = {
  mono: 'Mono',
  monaco: 'Monaco',
  courier: 'Courier',
};
export const CODE_FONT_STACKS = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  monaco: 'Monaco, Menlo, Consolas, monospace',
  courier: '"Courier New", Courier, monospace',
};
export const IMAGE_FITS = ['natural', 'width', 'height'];
export const IMAGE_FIT_LABELS = {
  natural: 'Image size',
  width: 'Fit width',
  height: 'Fill frame height',
};
export const PDF_STYLES = ['book', 'slides'];
export const PDF_STYLE_LABELS = {
  book: 'Book',
  slides: 'Slides',
};
export const STEP_HIGHLIGHTS = ['default', 'yellow', 'amber', 'green', 'blue', 'none'];
export const STEP_HIGHLIGHT_LABELS = {
  default: 'Theme',
  yellow: 'Yellow',
  amber: 'Amber',
  green: 'Green',
  blue: 'Blue',
  none: 'None',
};
export const STEP_HIGHLIGHT_COLORS = {
  yellow: { light: '#efe488', dark: '#5a5424' },
  amber: { light: '#f0cf5c', dark: '#6b3a12' },
  green: { light: '#b8f0c8', dark: '#1d7040' },
  blue: { light: '#b8d4fc', dark: '#2a4d7a' },
  none: { light: 'transparent', dark: 'transparent' },
};
export const DEFAULT_PRESENTATION_SETTINGS = Object.freeze({
  textScale: '1',
  fontFamily: 'system',
  codeFont: 'mono',
  imageFit: 'natural',
  pdfStyle: 'book',
  stepHighlight: 'default',
  showLineNumbers: true,
  pinHeadings: true,
  scrollToSection: true,
  centerHeadings: false,
  centerBlocks: false,
});

function readBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizePresentationSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    textScale: TEXT_SCALES.includes(source.textScale) ? source.textScale : DEFAULT_PRESENTATION_SETTINGS.textScale,
    fontFamily: FONT_FAMILIES.includes(source.fontFamily)
      ? source.fontFamily
      : DEFAULT_PRESENTATION_SETTINGS.fontFamily,
    codeFont: CODE_FONTS.includes(source.codeFont) ? source.codeFont : DEFAULT_PRESENTATION_SETTINGS.codeFont,
    imageFit: IMAGE_FITS.includes(source.imageFit) ? source.imageFit : DEFAULT_PRESENTATION_SETTINGS.imageFit,
    pdfStyle: PDF_STYLES.includes(source.pdfStyle) ? source.pdfStyle : DEFAULT_PRESENTATION_SETTINGS.pdfStyle,
    stepHighlight: STEP_HIGHLIGHTS.includes(source.stepHighlight)
      ? source.stepHighlight
      : DEFAULT_PRESENTATION_SETTINGS.stepHighlight,
    showLineNumbers: readBoolean(source.showLineNumbers, DEFAULT_PRESENTATION_SETTINGS.showLineNumbers),
    pinHeadings: readBoolean(source.pinHeadings, DEFAULT_PRESENTATION_SETTINGS.pinHeadings),
    scrollToSection: readBoolean(source.scrollToSection, DEFAULT_PRESENTATION_SETTINGS.scrollToSection),
    centerHeadings: readBoolean(source.centerHeadings, DEFAULT_PRESENTATION_SETTINGS.centerHeadings),
    centerBlocks: readBoolean(source.centerBlocks, DEFAULT_PRESENTATION_SETTINGS.centerBlocks),
  };
}

export function readPresentationSettings() {
  try {
    return normalizePresentationSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_PRESENTATION_SETTINGS };
  }
}

export function applyPresentationSettings(settings) {
  const next = normalizePresentationSettings(settings);
  document.documentElement.style.setProperty('--presentation-scale', next.textScale);
  document.documentElement.style.setProperty('--font-ui', FONT_FAMILY_STACKS[next.fontFamily]);
  document.documentElement.style.setProperty('--font-mono', CODE_FONT_STACKS[next.codeFont]);
  document.documentElement.dataset.fontFamily = next.fontFamily;
  document.documentElement.dataset.codeFont = next.codeFont;
  const highlight = STEP_HIGHLIGHT_COLORS[next.stepHighlight];
  if (highlight) {
    document.documentElement.style.setProperty('--current-line-custom', highlight.light);
    document.documentElement.style.setProperty('--current-line-custom-dark', highlight.dark);
  } else {
    document.documentElement.style.removeProperty('--current-line-custom');
    document.documentElement.style.removeProperty('--current-line-custom-dark');
  }
  document.documentElement.dataset.imageFit = next.imageFit;
  document.documentElement.dataset.pdfStyle = next.pdfStyle;
  document.documentElement.dataset.stepHighlight = next.stepHighlight;
  document.documentElement.dataset.lineNumbers = next.showLineNumbers ? 'on' : 'off';
  document.documentElement.dataset.pinHeadings = next.pinHeadings ? 'on' : 'off';
  document.documentElement.dataset.scrollToSection = next.scrollToSection ? 'on' : 'off';
  document.documentElement.dataset.centerHeadings = next.centerHeadings ? 'on' : 'off';
  document.documentElement.dataset.centerBlocks = next.centerBlocks ? 'on' : 'off';
  return next;
}

export function initializePresentationSettings() {
  return applyPresentationSettings(readPresentationSettings());
}

export function usePresentationSettings() {
  const [settings, setSettingsState] = useState(readPresentationSettings);

  useEffect(() => {
    applyPresentationSettings(settings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch { /* Storage may be unavailable. */ }
  }, [settings]);

  const setSettings = (update) => {
    setSettingsState((current) => normalizePresentationSettings(
      typeof update === 'function' ? update(current) : { ...current, ...update },
    ));
  };

  return [settings, setSettings];
}
