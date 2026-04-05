import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  tabCapture: {
    getMediaStreamId: vi.fn(),
  },
  offscreen: {
    createDocument: vi.fn(),
  },
  runtime: {
    lastError: null,
    sendMessage: vi.fn(),
    getContexts: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

global.chrome = mockChrome;

// Import the functions we'll test
import {
  startRecording,
  setupOffscreenDocument,
  handleRecordingComplete,
  resetRecordingState,
  scheduleRecordingStop,
  cancelScheduledStop,
} from './background-logic.js';

describe('Scrollywood Background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
    mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message?.action === 'checkFormatSupport' && typeof callback === 'function') {
        callback({ supported: true });
      }
    });
    resetRecordingState();
  });

  describe('startRecording', () => {
    it('should set REC badge when recording starts', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await startRecording(123, 60, 2);

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'REC' });
      expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#ff6b6b' });
    });

    it('should scroll page to top before recording', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await startRecording(123, 60, 2);

      expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
        target: { tabId: 123, allFrames: true },
        func: expect.any(Function),
        args: [
          expect.any(String),
          expect.stringContaining('scrollbar-width: none'),
        ],
      }));
    });

    it('should inject capture CSS before recording starts', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await startRecording(123, 60, 2);

      const call = mockChrome.scripting.executeScript.mock.calls[0][0];
      expect(call.args[1]).toContain('scroll-behavior: auto');
      expect(call.args[1]).toContain('::-webkit-scrollbar');
    });

    it('should get media stream ID for the tab', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await startRecording(123, 60, 2);

      expect(mockChrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith(
        { targetTabId: 123 },
        expect.any(Function)
      );
    });

    it('should clear badge on error', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockChrome.scripting.executeScript.mockRejectedValueOnce(new Error('Script failed'));
      mockChrome.scripting.executeScript.mockResolvedValueOnce([]);

      await startRecording(123, 60, 2);

      expect(mockChrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
      consoleErrorSpy.mockRestore();
    });

    it('should attempt to clear capture CSS when startup fails after injection', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockChrome.scripting.executeScript.mockResolvedValueOnce([]);
      mockChrome.scripting.executeScript.mockResolvedValueOnce([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => {
        mockChrome.runtime.lastError = { message: 'capture failed' };
        cb(undefined);
      });

      await startRecording(123, 60, 2);

      expect(mockChrome.scripting.executeScript).toHaveBeenCalledTimes(2);
      expect(mockChrome.scripting.executeScript.mock.calls[1][0]).toEqual(expect.objectContaining({
        target: { tabId: 123, allFrames: true },
        func: expect.any(Function),
        args: [expect.any(String)],
      }));
      consoleErrorSpy.mockRestore();
    });

    it('should send startCapture message to offscreen document', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await startRecording(123, 60, 2);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'startCapture',
        streamId: 'stream-123',
        tabId: 123,
        duration: 60,
        delay: 2,
        format: 'webm',
      });
    });

    it('should not start if already recording', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      // Start first recording
      const promise1 = startRecording(123, 60, 2);
      // Try to start second recording immediately
      const promise2 = startRecording(456, 30, 1);

      await Promise.all([promise1, promise2]);

      // Should only have been called once for tab 123
      expect(mockChrome.tabCapture.getMediaStreamId).toHaveBeenCalledTimes(1);
    });

    it('should return an error result when no tab is available', async () => {
      const result = await startRecording(undefined, 60, 2);

      expect(result).toEqual({
        started: false,
        message: 'No active tab is available to capture.',
      });
      expect(mockChrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should normalize invalid duration, delay, and format values', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      const result = await startRecording(123, 999, -3, 'avi');

      expect(result).toEqual({
        started: true,
        duration: 300,
        delay: 0,
        format: 'webm',
      });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'startCapture',
        streamId: 'stream-123',
        tabId: 123,
        duration: 300,
        delay: 0,
        format: 'webm',
      });
    });

    it('should preserve mp4 as a supported export format', async () => {
      mockChrome.scripting.executeScript.mockResolvedValue([]);
      mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      const result = await startRecording(123, 45, 1, 'mp4');

      expect(result).toEqual({
        started: true,
        duration: 45,
        delay: 1,
        format: 'mp4',
      });
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'startCapture',
          format: 'mp4',
        })
      );
    });

    it('should fail early when the selected export format is unsupported', async () => {
      mockChrome.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message?.action === 'checkFormatSupport' && typeof callback === 'function') {
          callback({ supported: false });
        }
      });
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      const result = await startRecording(123, 45, 1, 'mp4');

      expect(result).toEqual({
        started: false,
        message: 'MP4 export is not supported in this Chrome build. Try WebM or GIF.',
      });
      expect(mockChrome.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
    });
  });

  describe('setupOffscreenDocument', () => {
    it('should create offscreen document if none exists', async () => {
      mockChrome.runtime.getContexts.mockResolvedValue([]);
      mockChrome.offscreen.createDocument.mockResolvedValue();

      await setupOffscreenDocument();

      expect(mockChrome.offscreen.createDocument).toHaveBeenCalledWith({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording tab video with MediaRecorder',
      });
    });

    it('should not create offscreen document if one already exists', async () => {
      mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

      await setupOffscreenDocument();

      expect(mockChrome.offscreen.createDocument).not.toHaveBeenCalled();
    });
  });

  describe('handleRecordingComplete', () => {
    it('should clear badge when recording completes', () => {
      handleRecordingComplete();

      expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('scheduleRecordingStop', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      cancelScheduledStop();
      vi.useRealTimers();
    });

    it('should send stopCapture after duration + 1.5s buffer', () => {
      scheduleRecordingStop(10); // 10 second duration

      // Not sent yet
      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith({ action: 'stopCapture' });

      // Advance to duration + 1.5s
      vi.advanceTimersByTime(11500);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'stopCapture' });
    });

    it('should not send stopCapture before the buffer expires', () => {
      scheduleRecordingStop(10);

      // Advance to just before the buffer
      vi.advanceTimersByTime(11000);

      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith({ action: 'stopCapture' });
    });

    it('should cancel previous stop when called again', () => {
      scheduleRecordingStop(10);

      // Reschedule with longer duration
      scheduleRecordingStop(20);

      // Advance past first timer but before second
      vi.advanceTimersByTime(11500);

      // Should NOT have fired (first was cancelled)
      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith({ action: 'stopCapture' });

      // Advance to second timer
      vi.advanceTimersByTime(10000);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'stopCapture' });
    });

    it('should be cancellable', () => {
      scheduleRecordingStop(10);
      cancelScheduledStop();

      vi.advanceTimersByTime(20000);

      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith({ action: 'stopCapture' });
    });
  });
});
