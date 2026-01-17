// Background service worker for Scrollywood
import { startRecording, handleRecordingComplete } from './background-logic.js';
import {
  getScrollBehaviorOverrideCSS,
  SCROLL_OVERRIDE_ID,
  calculateTotalScrollHeight,
} from './scroll-utils.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Service worker received message:', message.action, message);

  if (message.action === 'startRecording') {
    startRecording(message.tabId, message.duration, message.delay);
    sendResponse({ status: 'started' });
  }
  if (message.action === 'injectScroll') {
    console.log('Got injectScroll request for tab', message.tabId, 'duration', message.duration);
    injectScrollScript(message.tabId, message.duration);
    sendResponse({ status: 'injected' });
  }
  if (message.action === 'downloadVideo') {
    console.log('Downloading video:', message.filename);
    downloadVideo(message.dataUrl, message.filename);
    sendResponse({ status: 'downloading' });
  }
  if (message.action === 'recordingComplete') {
    handleRecordingComplete();
    console.log('Recording saved!');
  }
  return true;
});

// Download video from data URL (called by offscreen document)
async function downloadVideo(dataUrl, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true,
    });
    console.log('Download started, ID:', downloadId);
  } catch (error) {
    console.error('Download error:', error);
  }
}

// Inject scroll script into target tab (called by offscreen document)
async function injectScrollScript(tabId, duration) {
  try {
    console.log('Injecting scroll script for', duration, 'seconds');
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (scrollDuration, overrideCSS, overrideId) => {
        console.log('[Scrollywood] Scroll script injected, duration:', scrollDuration);

        // Override CSS scroll-behavior to prevent conflicts with programmatic scrolling
        const styleOverride = document.createElement('style');
        styleOverride.id = overrideId;
        styleOverride.textContent = overrideCSS;
        document.head.appendChild(styleOverride);

        // Calculate scroll height using multiple approaches
        const docScrollHeight = document.documentElement.scrollHeight;
        const bodyScrollHeight = document.body.scrollHeight;
        const windowHeight = window.innerHeight;
        const maxScrollHeight = Math.max(docScrollHeight, bodyScrollHeight);
        let totalHeight = maxScrollHeight - windowHeight;

        console.log('[Scrollywood] Scroll metrics:', {
          docScrollHeight,
          bodyScrollHeight,
          windowHeight,
          calculatedHeight: totalHeight,
        });

        // Fallback: if standard calculation shows no scroll, try actual scrolling
        if (totalHeight <= 0) {
          window.scrollTo({ top: 999999, behavior: 'instant' });
          const fallbackMaxScroll = window.scrollY;
          window.scrollTo({ top: 0, behavior: 'instant' });

          console.log('[Scrollywood] Fallback scroll test: maxScroll =', fallbackMaxScroll);

          if (fallbackMaxScroll > 0) {
            totalHeight = fallbackMaxScroll;
          } else {
            console.warn('[Scrollywood] No scrollable content detected');
            const override = document.getElementById(overrideId);
            if (override) override.remove();
            return;
          }
        }

        const startTime = Date.now();
        const endTime = startTime + (scrollDuration * 1000);

        function smoothScroll() {
          const now = Date.now();
          if (now >= endTime) {
            // Restore original scroll behavior
            const override = document.getElementById(overrideId);
            if (override) override.remove();
            console.log('[Scrollywood] Scroll complete');
            return;
          }

          const progress = (now - startTime) / (scrollDuration * 1000);
          const targetY = totalHeight * progress;
          window.scrollTo({ top: targetY, behavior: 'instant' });

          requestAnimationFrame(smoothScroll);
        }

        console.log('[Scrollywood] Starting scroll, totalHeight:', totalHeight);
        smoothScroll();
      },
      args: [duration, getScrollBehaviorOverrideCSS(), SCROLL_OVERRIDE_ID],
    });
  } catch (error) {
    console.error('Failed to inject scroll script:', error);
  }
}
