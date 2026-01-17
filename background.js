// Background service worker for Scrollywood
import { startRecording, handleRecordingComplete } from './background-logic.js';
import {
  getScrollBehaviorOverrideCSS,
  SCROLL_OVERRIDE_ID,
  calculateTotalScrollHeight,
  MIN_SCROLL_THRESHOLD,
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
      func: (scrollDuration, overrideCSS, overrideId, minThreshold) => {
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

        // Debug: check page state
        const htmlStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);

        console.log('[Scrollywood] Scroll metrics:', {
          docScrollHeight,
          bodyScrollHeight,
          windowHeight,
          calculatedHeight: totalHeight,
          minThreshold,
        });

        console.log('[Scrollywood] Page state:', {
          readyState: document.readyState,
          htmlOverflow: htmlStyle.overflow,
          htmlOverflowY: htmlStyle.overflowY,
          bodyOverflow: bodyStyle.overflow,
          bodyOverflowY: bodyStyle.overflowY,
          htmlHeight: htmlStyle.height,
          bodyHeight: bodyStyle.height,
        });

        // Fallback: if standard calculation is below threshold, try actual scrolling
        if (totalHeight < minThreshold) {
          console.log('[Scrollywood] Standard calc below threshold, trying fallback...');

          // Try multiple scroll methods
          window.scrollTo({ top: 999999, behavior: 'instant' });
          let fallbackMaxScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;

          // Also try scrolling the documentElement directly
          if (fallbackMaxScroll === 0) {
            document.documentElement.scrollTop = 999999;
            fallbackMaxScroll = document.documentElement.scrollTop;
          }

          // And try body
          if (fallbackMaxScroll === 0) {
            document.body.scrollTop = 999999;
            fallbackMaxScroll = document.body.scrollTop;
          }

          // Look for scrollable containers
          if (fallbackMaxScroll === 0) {
            const containers = document.querySelectorAll('div, main, section, article');
            for (const el of containers) {
              const style = getComputedStyle(el);
              if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                el.scrollTop = 999999;
                if (el.scrollTop > 0) {
                  console.log('[Scrollywood] Found scrollable container:', el.tagName, el.className);
                  fallbackMaxScroll = el.scrollTop;
                  el.scrollTop = 0;
                  // Store reference for later scrolling
                  window.__scrollywoodContainer = el;
                  break;
                }
              }
            }
          }

          // Reset scroll position
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;

          console.log('[Scrollywood] Fallback scroll test: maxScroll =', fallbackMaxScroll);

          if (fallbackMaxScroll >= minThreshold) {
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

        // Get scroll target (either a container element or window)
        const scrollContainer = window.__scrollywoodContainer;

        function smoothScroll() {
          const now = Date.now();
          if (now >= endTime) {
            // Restore original scroll behavior
            const override = document.getElementById(overrideId);
            if (override) override.remove();
            delete window.__scrollywoodContainer;
            console.log('[Scrollywood] Scroll complete');
            return;
          }

          const progress = (now - startTime) / (scrollDuration * 1000);
          const targetY = totalHeight * progress;

          if (scrollContainer) {
            scrollContainer.scrollTop = targetY;
          } else {
            window.scrollTo({ top: targetY, behavior: 'instant' });
          }

          requestAnimationFrame(smoothScroll);
        }

        console.log('[Scrollywood] Starting scroll, totalHeight:', totalHeight, 'container:', scrollContainer ? scrollContainer.tagName : 'window');
        smoothScroll();
      },
      args: [duration, getScrollBehaviorOverrideCSS(), SCROLL_OVERRIDE_ID, MIN_SCROLL_THRESHOLD],
    });
  } catch (error) {
    console.error('Failed to inject scroll script:', error);
  }
}
