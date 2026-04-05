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

import {
  startRecording,
  resetRecordingState,
} from './background-logic.js';

describe('Format parameter flow', () => {
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

  it('should forward format=webm to offscreen document', async () => {
    mockChrome.scripting.executeScript.mockResolvedValue([]);
    mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
    mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

    await startRecording(123, 60, 2, 'webm');

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'startCapture',
        format: 'webm',
      })
    );
  });

  it('should forward format=gif to offscreen document', async () => {
    mockChrome.scripting.executeScript.mockResolvedValue([]);
    mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
    mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

    await startRecording(123, 60, 2, 'gif');

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'startCapture',
        format: 'gif',
      })
    );
  });

  it('should forward format=mp4 to offscreen document', async () => {
    mockChrome.scripting.executeScript.mockResolvedValue([]);
    mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
    mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

    await startRecording(123, 60, 2, 'mp4');

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'startCapture',
        format: 'mp4',
      })
    );
  });

  it('should default to webm when format is not specified', async () => {
    mockChrome.scripting.executeScript.mockResolvedValue([]);
    mockChrome.tabCapture.getMediaStreamId.mockImplementation((opts, cb) => cb('stream-123'));
    mockChrome.runtime.getContexts.mockResolvedValue([{ type: 'OFFSCREEN_DOCUMENT' }]);

    await startRecording(123, 60, 2);

    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'startCapture',
        format: 'webm',
      })
    );
  });
});
