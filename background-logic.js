// Background logic - testable functions

import {
  getScrollBehaviorOverrideCSS,
  getScrollbarHideCSS,
  SCROLL_OVERRIDE_ID,
} from './scroll-utils.js';
import {
  DEFAULT_EXPORT_FORMAT,
  getUnsupportedFormatMessage,
  normalizeExportFormat,
} from './media-format.js';

let recording = false;
const DEFAULT_OPTIONS = {
  duration: 60,
  delay: 2,
  format: DEFAULT_EXPORT_FORMAT,
};

function normalizeDuration(duration) {
  const value = Number.parseInt(duration, 10);
  if (Number.isNaN(value)) {
    return DEFAULT_OPTIONS.duration;
  }

  return Math.min(300, Math.max(5, value));
}

function normalizeDelay(delay) {
  const value = Number.parseInt(delay, 10);
  if (Number.isNaN(value)) {
    return DEFAULT_OPTIONS.delay;
  }

  return Math.min(10, Math.max(0, value));
}

function normalizeFormat(format) {
  return normalizeExportFormat(format);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PRE_CAPTURE_CSS = `${getScrollBehaviorOverrideCSS()}\n${getScrollbarHideCSS()}`;

async function prepareCaptureSurface(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (overrideId, css) => {
      window.scrollTo({ top: 0, behavior: 'instant' });

      const mount = document.head || document.documentElement;
      if (!mount) {
        return;
      }

      let styleOverride = document.getElementById(overrideId);
      if (!styleOverride) {
        styleOverride = document.createElement('style');
        styleOverride.id = overrideId;
        mount.appendChild(styleOverride);
      }

      styleOverride.textContent = css;
    },
    args: [SCROLL_OVERRIDE_ID, PRE_CAPTURE_CSS],
  });
}

async function clearCaptureSurface(tabId) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (overrideId) => {
        if (typeof window.__scrollywoodCancel === 'function') {
          window.__scrollywoodCancel();
          return;
        }

        const styleOverride = document.getElementById(overrideId);
        if (styleOverride) {
          styleOverride.remove();
        }
      },
      args: [SCROLL_OVERRIDE_ID],
    });
  } catch (error) {
    console.warn('Failed to clear capture surface:', error);
  }
}

async function isExportFormatSupported(format) {
  const response = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'checkFormatSupport', format }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(result || null);
    });
  });

  return response?.supported !== false;
}

export async function startRecording(tabId, duration, delay, format) {
  if (!tabId) {
    return {
      started: false,
      message: 'No active tab is available to capture.',
    };
  }

  if (recording) {
    return {
      started: false,
      message: 'Recording already in progress.',
    };
  }

  recording = true;
  const normalizedDuration = normalizeDuration(duration);
  const normalizedDelay = normalizeDelay(delay);
  const normalizedFormat = normalizeFormat(format);

  // Show "REC" badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });

  try {
    // Create offscreen document for MediaRecorder
    await setupOffscreenDocument();

    if (!(await isExportFormatSupported(normalizedFormat))) {
      recording = false;
      chrome.action.setBadgeText({ text: '' });
      return {
        started: false,
        message: getUnsupportedFormatMessage(normalizedFormat),
      };
    }

    await prepareCaptureSurface(tabId);

    await sleep(500);

    // Get a MediaStream for the tab
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(id);
        }
      });
    });

    // Send stream ID to offscreen document to start recording
    chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId,
      tabId,
      duration: normalizedDuration,
      delay: normalizedDelay,
      format: normalizedFormat,
    });

    return {
      started: true,
      duration: normalizedDuration,
      delay: normalizedDelay,
      format: normalizedFormat,
    };

  } catch (error) {
    console.error('Recording error:', error);
    await clearCaptureSurface(tabId);
    recording = false;
    chrome.action.setBadgeText({ text: '' });
    return {
      started: false,
      message: error.message || 'Unable to start recording.',
    };
  }
}

export async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab video with MediaRecorder',
  });
}

export function handleRecordingComplete() {
  recording = false;
  chrome.action.setBadgeText({ text: '' });
}

export function isRecording() {
  return recording;
}

export function resetRecordingState() {
  recording = false;
}

// Schedule recording stop after scroll duration + buffer
const STOP_BUFFER_MS = 1500;
let stopTimerId = null;

export function scheduleRecordingStop(duration) {
  // Cancel any previous scheduled stop
  cancelScheduledStop();
  const delayMs = (duration * 1000) + STOP_BUFFER_MS;
  stopTimerId = setTimeout(() => {
    chrome.runtime.sendMessage({ action: 'stopCapture' });
    stopTimerId = null;
  }, delayMs);
}

export function cancelScheduledStop() {
  if (stopTimerId !== null) {
    clearTimeout(stopTimerId);
    stopTimerId = null;
  }
}
