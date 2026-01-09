import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  resetRecordingState
} from './background-logic.js';

describe('Scrollywood Background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
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

      expect(mockChrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 123 },
        func: expect.any(Function),
      });
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
      mockChrome.scripting.executeScript.mockRejectedValue(new Error('Script failed'));

      await startRecording(123, 60, 2);

      expect(mockChrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
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
});
