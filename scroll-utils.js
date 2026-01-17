// Scroll utility functions

export function calculateScrollParams({ scrollHeight, windowHeight, duration }) {
  const totalScrollDistance = Math.max(0, scrollHeight - windowHeight);
  const scrollsPerSecond = 60; // 60fps target
  const totalFrames = duration * scrollsPerSecond;
  const pixelsPerFrame = totalScrollDistance / totalFrames;

  return {
    totalScrollDistance,
    scrollsPerSecond,
    pixelsPerFrame,
  };
}

export function createSmoothScrollFunction(totalDistance) {
  return (progress) => totalDistance * progress;
}

// ID for the style element that overrides scroll-behavior
export const SCROLL_OVERRIDE_ID = 'scrollywood-scroll-override';

/**
 * Returns CSS that disables smooth scrolling to allow programmatic control.
 * This overrides scroll-behavior: smooth set in stylesheets, which can
 * conflict with window.scrollTo({ behavior: 'instant' }) in some browsers.
 */
export function getScrollBehaviorOverrideCSS() {
  return 'html, body, * { scroll-behavior: auto !important; }';
}

/**
 * Calculate the total scrollable height, trying multiple approaches.
 * Uses the larger of documentElement or body scrollHeight, minus window height.
 * Falls back to a provided maxScroll value if standard calculation yields 0.
 *
 * @param {Object} metrics - Scroll metrics from the page
 * @param {number} metrics.docScrollHeight - document.documentElement.scrollHeight
 * @param {number} metrics.bodyScrollHeight - document.body.scrollHeight
 * @param {number} metrics.windowHeight - window.innerHeight
 * @param {number} [metrics.fallbackMaxScroll] - Optional fallback from actual scroll test
 * @returns {number} Total scrollable distance (0 if no scrollable content)
 */
export function calculateTotalScrollHeight({
  docScrollHeight,
  bodyScrollHeight,
  windowHeight,
  fallbackMaxScroll = 0,
}) {
  const maxScrollHeight = Math.max(docScrollHeight, bodyScrollHeight);
  const standardHeight = maxScrollHeight - windowHeight;

  if (standardHeight > 0) {
    return standardHeight;
  }

  // Standard calculation failed, use fallback if provided
  return Math.max(0, fallbackMaxScroll);
}
