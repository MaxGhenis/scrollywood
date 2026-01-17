import { describe, it, expect, vi } from 'vitest';
import {
  calculateScrollParams,
  createSmoothScrollFunction,
  getScrollBehaviorOverrideCSS,
  SCROLL_OVERRIDE_ID,
  calculateTotalScrollHeight,
  createScrollExecutor,
} from './scroll-utils.js';

describe('scroll-utils', () => {
  describe('calculateScrollParams', () => {
    it('should calculate correct scroll distance', () => {
      const result = calculateScrollParams({
        scrollHeight: 2000,
        windowHeight: 800,
        duration: 10,
      });
      expect(result.totalScrollDistance).toBe(1200);
    });

    it('should return 0 distance when page is not scrollable', () => {
      const result = calculateScrollParams({
        scrollHeight: 500,
        windowHeight: 800,
        duration: 10,
      });
      expect(result.totalScrollDistance).toBe(0);
    });
  });

  describe('createSmoothScrollFunction', () => {
    it('should return correct position for progress', () => {
      const scroll = createSmoothScrollFunction(1000);
      expect(scroll(0)).toBe(0);
      expect(scroll(0.5)).toBe(500);
      expect(scroll(1)).toBe(1000);
    });
  });

  describe('getScrollBehaviorOverrideCSS', () => {
    it('should return CSS that disables smooth scrolling', () => {
      const css = getScrollBehaviorOverrideCSS();
      expect(css).toContain('scroll-behavior');
      expect(css).toContain('auto');
      expect(css).toContain('!important');
    });

    it('should target html and body elements', () => {
      const css = getScrollBehaviorOverrideCSS();
      expect(css).toContain('html');
      expect(css).toContain('body');
    });

    it('should use wildcard selector to catch nested scrollables', () => {
      const css = getScrollBehaviorOverrideCSS();
      expect(css).toContain('*');
    });

    it('should override overflow:hidden that blocks scrolling', () => {
      const css = getScrollBehaviorOverrideCSS();
      expect(css).toContain('overflow');
      expect(css).toContain('auto');
    });
  });

  describe('SCROLL_OVERRIDE_ID', () => {
    it('should be a non-empty string for DOM element identification', () => {
      expect(typeof SCROLL_OVERRIDE_ID).toBe('string');
      expect(SCROLL_OVERRIDE_ID.length).toBeGreaterThan(0);
    });
  });

  describe('calculateTotalScrollHeight', () => {
    it('should use documentElement scrollHeight when larger', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 3000,
        bodyScrollHeight: 2000,
        windowHeight: 800,
      });
      expect(result).toBe(2200); // 3000 - 800
    });

    it('should use body scrollHeight when larger', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 2000,
        bodyScrollHeight: 3000,
        windowHeight: 800,
      });
      expect(result).toBe(2200); // 3000 - 800
    });

    it('should return 0 when content fits in viewport', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 800,
        bodyScrollHeight: 800,
        windowHeight: 800,
      });
      expect(result).toBe(0);
    });

    it('should return 0 when content is smaller than viewport', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 500,
        bodyScrollHeight: 600,
        windowHeight: 800,
      });
      expect(result).toBe(0);
    });

    it('should use fallbackMaxScroll when standard calculation is 0', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 800,
        bodyScrollHeight: 800,
        windowHeight: 800,
        fallbackMaxScroll: 5000,
      });
      expect(result).toBe(5000);
    });

    it('should use fallbackMaxScroll when standard calculation is below minimum threshold', () => {
      // 4 pixels is too small to be meaningful scroll
      const result = calculateTotalScrollHeight({
        docScrollHeight: 804,
        bodyScrollHeight: 800,
        windowHeight: 800,
        fallbackMaxScroll: 5000,
      });
      expect(result).toBe(5000);
    });

    it('should use standard calculation when above minimum threshold', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 1000,
        bodyScrollHeight: 800,
        windowHeight: 800,
        fallbackMaxScroll: 5000,
      });
      expect(result).toBe(200); // 1000 - 800, above 100px threshold
    });

    it('should prefer standard calculation over fallback when positive', () => {
      const result = calculateTotalScrollHeight({
        docScrollHeight: 2000,
        bodyScrollHeight: 1500,
        windowHeight: 800,
        fallbackMaxScroll: 5000,
      });
      expect(result).toBe(1200); // Uses standard: 2000 - 800
    });
  });

  describe('createScrollExecutor', () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    it('should call scrollTo with increasing positions', async () => {
      const scrollTo = vi.fn();
      const onScroll = vi.fn();
      const onComplete = vi.fn();

      const executor = createScrollExecutor({
        totalHeight: 1000,
        duration: 0.1, // 100ms for fast test
        scrollTo,
        onScroll,
        onComplete,
      });

      executor.start();
      await delay(60); // Wait ~60% through

      // Should have called scrollTo multiple times with increasing values
      expect(scrollTo).toHaveBeenCalled();
      const calls = scrollTo.mock.calls;
      const lastPosition = calls[calls.length - 1][0];
      expect(lastPosition).toBeGreaterThan(0);
      expect(lastPosition).toBeLessThanOrEqual(1000);

      executor.stop(); // Cleanup
    });

    it('should dispatch scroll events via onScroll callback', async () => {
      const scrollTo = vi.fn();
      const onScroll = vi.fn();
      const onComplete = vi.fn();

      const executor = createScrollExecutor({
        totalHeight: 1000,
        duration: 0.1,
        scrollTo,
        onScroll,
        onComplete,
      });

      executor.start();
      await delay(50);

      expect(onScroll).toHaveBeenCalled();
      executor.stop();
    });

    it('should call onComplete when scroll finishes', async () => {
      const scrollTo = vi.fn();
      const onScroll = vi.fn();
      const onComplete = vi.fn();

      const executor = createScrollExecutor({
        totalHeight: 1000,
        duration: 0.05, // 50ms
        scrollTo,
        onScroll,
        onComplete,
      });

      executor.start();
      await delay(100); // Wait for completion

      expect(onComplete).toHaveBeenCalled();
    });

    it('should reach totalHeight at completion', async () => {
      const scrollTo = vi.fn();
      const onScroll = vi.fn();
      const onComplete = vi.fn();

      const executor = createScrollExecutor({
        totalHeight: 1000,
        duration: 0.05,
        scrollTo,
        onScroll,
        onComplete,
      });

      executor.start();
      await delay(100);

      // Last scroll position should be at or near totalHeight
      const calls = scrollTo.mock.calls;
      const lastPosition = calls[calls.length - 1][0];
      expect(lastPosition).toBeGreaterThanOrEqual(950); // Allow some tolerance
    });

    it('should be stoppable via stop method', async () => {
      const scrollTo = vi.fn();
      const onScroll = vi.fn();
      const onComplete = vi.fn();

      const executor = createScrollExecutor({
        totalHeight: 1000,
        duration: 0.2, // 200ms
        scrollTo,
        onScroll,
        onComplete,
      });

      executor.start();
      await delay(50);

      const callCountBeforeStop = scrollTo.mock.calls.length;
      executor.stop();

      await delay(100);

      // Should not have made significantly more calls after stop
      // Allow 1 extra call due to timing
      expect(scrollTo.mock.calls.length).toBeLessThanOrEqual(callCountBeforeStop + 1);
    });
  });
});
