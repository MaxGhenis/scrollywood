import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  tabs: {
    query: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabCapture: {
    capture: vi.fn(),
  },
  downloads: {
    download: vi.fn(),
  },
  runtime: {
    lastError: null,
  },
};

global.chrome = mockChrome;

// Extract testable logic into separate functions
import { calculateScrollParams, createSmoothScrollFunction } from './scroll-utils.js';

describe('Scrollywood', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateScrollParams', () => {
    it('should calculate correct scroll parameters for a given duration', () => {
      const params = calculateScrollParams({
        scrollHeight: 5000,
        windowHeight: 1000,
        duration: 60,
      });

      expect(params.totalScrollDistance).toBe(4000); // 5000 - 1000
      expect(params.scrollsPerSecond).toBe(60); // 60fps
      expect(params.pixelsPerFrame).toBeCloseTo(4000 / (60 * 60), 2);
    });

    it('should handle short pages', () => {
      const params = calculateScrollParams({
        scrollHeight: 500,
        windowHeight: 1000,
        duration: 30,
      });

      expect(params.totalScrollDistance).toBe(0); // Can't scroll, page fits
    });
  });

  describe('createSmoothScrollFunction', () => {
    it('should return a function that calculates scroll position based on progress', () => {
      const scrollFn = createSmoothScrollFunction(4000); // 4000px total

      expect(scrollFn(0)).toBe(0);
      expect(scrollFn(0.5)).toBe(2000);
      expect(scrollFn(1)).toBe(4000);
    });
  });

  describe('Chrome API integration', () => {
    it('should query the active tab', async () => {
      mockChrome.tabs.query.mockResolvedValue([{ id: 123 }]);

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      expect(tab.id).toBe(123);
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it('should capture tab with correct options', async () => {
      const mockStream = { getTracks: () => [] };
      mockChrome.tabCapture.capture.mockImplementation((options, callback) => {
        callback(mockStream);
      });

      const capturedStream = await new Promise((resolve) => {
        chrome.tabCapture.capture({ audio: false, video: true }, (stream) => {
          resolve(stream);
        });
      });

      expect(capturedStream).toBe(mockStream);
      expect(mockChrome.tabCapture.capture).toHaveBeenCalledWith(
        { audio: false, video: true },
        expect.any(Function)
      );
    });
  });
});
