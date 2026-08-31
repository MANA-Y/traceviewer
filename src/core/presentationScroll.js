export const SCROLL_TOP_OFFSET = 12;
export const SCROLL_BOTTOM_CHROME = 96;
export const PIN_TOLERANCE = 48;
export const CENTER_TOLERANCE = 64;

function idle() {
  return { type: 'none', behavior: 'auto' };
}

function action(type, behavior) {
  return { type, behavior };
}

function near(value, target, tolerance) {
  return Math.abs(value - target) < tolerance;
}

export function headingsArePinned() {
  return document.documentElement.dataset.pinHeadings !== 'off';
}

export function sectionStartScrollEnabled() {
  return document.documentElement.dataset.scrollToSection !== 'off';
}

export function planPresentationScroll({
  isHeading,
  scrollToSection = true,
  sectionTop,
  lineTop,
  lineHeight,
  viewportHeight,
  imagesReady,
  topOffset = SCROLL_TOP_OFFSET,
  bottomChrome = SCROLL_BOTTOM_CHROME,
}) {
  const available = Math.max(160, viewportHeight - topOffset - bottomChrome);
  const lineBottom = lineTop + lineHeight;
  const visibleBottom = viewportHeight - bottomChrome;
  const laidOut = lineHeight >= 8;
  const fullyVisible = laidOut && lineTop >= topOffset && lineBottom <= visibleBottom;

  if (isHeading && scrollToSection) {
    return near(sectionTop, topOffset, PIN_TOLERANCE)
      ? idle()
      : action('pin-section', 'smooth');
  }

  if (!laidOut || !imagesReady) return idle();
  if (fullyVisible) return idle();

  if (lineHeight > available) {
    return lineTop >= topOffset && near(lineTop, topOffset, PIN_TOLERANCE)
      ? idle()
      : action('pin-line', 'auto');
  }

  const mid = lineTop + lineHeight / 2;
  const targetMid = topOffset + available / 2;
  return lineTop >= topOffset && near(mid, targetMid, CENTER_TOLERANCE)
    ? idle()
    : action('center-line', 'smooth');
}

export function getScrollRoot() {
  return document.scrollingElement ?? document.documentElement;
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setScrollTop(top, behavior = 'auto') {
  const y = Math.max(0, top);
  const root = getScrollRoot();
  if (behavior === 'smooth' && !prefersReducedMotion()) {
    root.scrollTo({ top: y, behavior: 'smooth' });
    return;
  }
  root.scrollTo(0, y);
}

export function scrollElementTo(el, { offset = SCROLL_TOP_OFFSET, behavior = 'auto' } = {}) {
  const root = getScrollRoot();
  setScrollTop(root.scrollTop + el.getBoundingClientRect().top - offset, behavior);
}

export function measurePresentationChrome(lineEl, { pinHeadings = true } = {}) {
  const heading = pinHeadings
    ? lineEl.closest('.presentation-section')?.querySelector(':scope > .section-heading')
    : null;
  const headingHeight = heading && heading !== lineEl
    ? (heading.offsetHeight || heading.getBoundingClientRect().height)
    : 0;
  const topOffset = headingHeight > 0
    ? Math.max(SCROLL_TOP_OFFSET, headingHeight + 16)
    : SCROLL_TOP_OFFSET;
  const bar = document.querySelector('.presentation-progress');
  const barTop = bar?.getBoundingClientRect().top;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const bottomChrome = Number.isFinite(barTop)
    ? Math.max(SCROLL_BOTTOM_CHROME, viewportHeight - barTop)
    : SCROLL_BOTTOM_CHROME;
  return { topOffset, bottomChrome, viewportHeight };
}

export function alignCurrentPresentationLine(lineEl, {
  reducedMotion = false,
  pinHeadings,
  scrollToSection,
} = {}) {
  if (!lineEl) return;
  const pin = pinHeadings ?? headingsArePinned();
  const scrollSection = scrollToSection ?? sectionStartScrollEnabled();
  const sectionEl = lineEl.closest('.presentation-section') ?? lineEl;
  const { topOffset, bottomChrome, viewportHeight } = measurePresentationChrome(lineEl, { pinHeadings: pin });
  const lineRect = lineEl.getBoundingClientRect();
  const plan = planPresentationScroll({
    isHeading: lineEl.classList.contains('section-heading'),
    scrollToSection: scrollSection,
    sectionTop: sectionEl.getBoundingClientRect().top,
    lineTop: lineRect.top,
    lineHeight: lineRect.height,
    viewportHeight,
    imagesReady: [...lineEl.querySelectorAll('img')].every((image) => image.complete && image.naturalWidth > 0),
    topOffset,
    bottomChrome,
  });
  if (plan.type === 'none') return;
  const behavior = reducedMotion || prefersReducedMotion() ? 'auto' : plan.behavior;
  if (plan.type === 'pin-section') {
    scrollElementTo(sectionEl, { behavior });
    return;
  }
  if (plan.type === 'pin-line') {
    scrollElementTo(lineEl, { offset: topOffset, behavior });
    return;
  }
  const viewMid = topOffset + (viewportHeight - topOffset - bottomChrome) / 2;
  const root = getScrollRoot();
  setScrollTop(root.scrollTop + (lineRect.top + lineRect.bottom) / 2 - viewMid, behavior);
}
