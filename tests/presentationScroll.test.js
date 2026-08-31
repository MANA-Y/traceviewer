import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPresentationScroll,
  setScrollTop,
} from '../src/core/presentationScroll.js';

const viewportHeight = 800;

test('pins a new section heading that is still below the fold', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: true,
    sectionTop: 520,
    lineTop: 520,
    lineHeight: 90,
    viewportHeight,
    imagesReady: true,
  }), { type: 'pin-section', behavior: 'smooth' });
});

test('does not scroll a heading to the section start when that is disabled', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: true,
    scrollToSection: false,
    sectionTop: 520,
    lineTop: 520,
    lineHeight: 90,
    viewportHeight,
    imagesReady: true,
  }), { type: 'none', behavior: 'auto' });
});

test('does not move a heading that is already at the top', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: true,
    sectionTop: 16,
    lineTop: 16,
    lineHeight: 90,
    viewportHeight,
    imagesReady: true,
  }), { type: 'none', behavior: 'auto' });
});

test('leaves a fully visible block in place', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: false,
    sectionTop: 14,
    lineTop: 220,
    lineHeight: 180,
    viewportHeight,
    imagesReady: true,
  }), { type: 'none', behavior: 'auto' });
});

test('centers an image that is clipped by the timeline', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: false,
    sectionTop: 14,
    lineTop: 520,
    lineHeight: 400,
    viewportHeight,
    imagesReady: true,
  }), { type: 'center-line', behavior: 'smooth' });
});

test('waits for images before moving a clipped line', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: false,
    sectionTop: 14,
    lineTop: 520,
    lineHeight: 400,
    viewportHeight,
    imagesReady: false,
  }), { type: 'none', behavior: 'auto' });
});

test('does not treat a collapsed line as already visible', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: false,
    sectionTop: 14,
    lineTop: 520,
    lineHeight: 0,
    viewportHeight,
    imagesReady: true,
  }), { type: 'none', behavior: 'auto' });
});

test('starts a taller-than-viewport line instead of centering it', () => {
  assert.deepEqual(planPresentationScroll({
    isHeading: false,
    sectionTop: -900,
    lineTop: 200,
    lineHeight: 900,
    viewportHeight,
    imagesReady: true,
  }), { type: 'pin-line', behavior: 'auto' });
});

test('delegates a smooth transition to one native scroll request', (context) => {
  const calls = [];
  const root = {
    scrollTop: 40,
    scrollTo(...args) {
      calls.push(args);
    },
  };
  const previousDocument = globalThis.document;
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.document = {
    scrollingElement: root,
    documentElement: root,
  };
  globalThis.matchMedia = () => ({ matches: false });
  context.after(() => {
    globalThis.document = previousDocument;
    globalThis.matchMedia = previousMatchMedia;
  });

  setScrollTop(320, 'smooth');

  assert.deepEqual(calls, [[{ top: 320, behavior: 'smooth' }]]);
});
