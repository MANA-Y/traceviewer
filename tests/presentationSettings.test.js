import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_FONTS,
  DEFAULT_PRESENTATION_SETTINGS,
  FONT_FAMILIES,
  PDF_STYLES,
  STEP_HIGHLIGHTS,
  TEXT_SCALES,
  normalizePresentationSettings,
} from '../src/presentationSettings.js';

test('normalizes missing and invalid presentation settings', () => {
  assert.deepEqual(normalizePresentationSettings(null), DEFAULT_PRESENTATION_SETTINGS);
  assert.deepEqual(normalizePresentationSettings({
    textScale: '2',
    fontFamily: 'comic',
    codeFont: 'wingdings',
    imageFit: 'huge',
    pdfStyle: 'scroll',
    stepHighlight: 'neon',
    showLineNumbers: 'yes',
    pinHeadings: 'yes',
    scrollToSection: 'yes',
    centerHeadings: 'yes',
    centerBlocks: 'yes',
  }), DEFAULT_PRESENTATION_SETTINGS);
});

test('accepts known text scales, highlights, and explicit boolean preferences', () => {
  for (const textScale of TEXT_SCALES) {
    assert.equal(normalizePresentationSettings({ textScale }).textScale, textScale);
  }
  for (const fontFamily of FONT_FAMILIES) {
    assert.equal(normalizePresentationSettings({ fontFamily }).fontFamily, fontFamily);
  }
  for (const codeFont of CODE_FONTS) {
    assert.equal(normalizePresentationSettings({ codeFont }).codeFont, codeFont);
  }
  for (const stepHighlight of STEP_HIGHLIGHTS) {
    assert.equal(normalizePresentationSettings({ stepHighlight }).stepHighlight, stepHighlight);
  }
  for (const pdfStyle of PDF_STYLES) {
    assert.equal(normalizePresentationSettings({ pdfStyle }).pdfStyle, pdfStyle);
  }
  assert.deepEqual(normalizePresentationSettings({
    textScale: '1.15',
    fontFamily: 'serif',
    codeFont: 'monaco',
    imageFit: 'width',
    pdfStyle: 'slides',
    stepHighlight: 'green',
    showLineNumbers: false,
    pinHeadings: false,
    scrollToSection: false,
    centerHeadings: true,
    centerBlocks: true,
  }), {
    ...DEFAULT_PRESENTATION_SETTINGS,
    textScale: '1.15',
    fontFamily: 'serif',
    codeFont: 'monaco',
    imageFit: 'width',
    pdfStyle: 'slides',
    stepHighlight: 'green',
    showLineNumbers: false,
    pinHeadings: false,
    scrollToSection: false,
    centerHeadings: true,
    centerBlocks: true,
  });
});
