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
 * Returns CSS that enables programmatic scrolling.
 * - Disables scroll-behavior: smooth which conflicts with scrollTo()
 * - Removes overflow: hidden which can block scrolling entirely
 */
export function getScrollBehaviorOverrideCSS() {
  return `
    html, body {
      overflow: auto !important;
      overflow-y: auto !important;
      scroll-behavior: auto !important;
    }
    * { scroll-behavior: auto !important; }
  `;
}

// Minimum scroll height threshold - anything below this is considered "not scrollable"
// and we should try the fallback approach
export const MIN_SCROLL_THRESHOLD = 100;

/**
 * Calculate the total scrollable height, trying multiple approaches.
 * Uses the larger of documentElement or body scrollHeight, minus window height.
 * Falls back to a provided maxScroll value if standard calculation yields 0
 * or is below the minimum threshold (100px).
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

  // Use standard calculation only if it's above minimum threshold
  if (standardHeight >= MIN_SCROLL_THRESHOLD) {
    return standardHeight;
  }

  // Standard calculation too small, use fallback if provided and meaningful
  if (fallbackMaxScroll >= MIN_SCROLL_THRESHOLD) {
    return fallbackMaxScroll;
  }

  // Both failed - return whatever we have (could be small positive or 0)
  return Math.max(0, standardHeight, fallbackMaxScroll);
}
