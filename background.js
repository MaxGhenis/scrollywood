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
      target: { tabId, allFrames: true },
      func: (scrollDuration, overrideCSS, overrideId, minThreshold) => {
        console.log('[Scrollywood] Scroll script injected, duration:', scrollDuration);

        // Check for iframe-wrapped content (common cause of scroll issues)
        const iframes = document.querySelectorAll('iframe');
        if (iframes.length > 0 && document.body.children.length <= 2) {
          console.warn('[Scrollywood] Page appears to be iframe-wrapped. Content inside cross-origin iframes cannot be scrolled. Try navigating directly to:', iframes[0]?.src);
        }

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

          // Look for scrollable containers - check ALL elements with scrollHeight > clientHeight
          if (fallbackMaxScroll < minThreshold) {
            console.log('[Scrollywood] Searching for scrollable containers...');
            const allElements = document.querySelectorAll('*');
            const candidates = [];

            for (const el of allElements) {
              if (el.scrollHeight > el.clientHeight + 50) {
                candidates.push({
                  el,
                  tag: el.tagName,
                  className: el.className?.toString().slice(0, 30),
                  scrollHeight: el.scrollHeight,
                  clientHeight: el.clientHeight,
                  diff: el.scrollHeight - el.clientHeight,
                });
              }
            }

            console.log('[Scrollywood] Candidates with scrollHeight > clientHeight:', candidates.length);
            candidates.slice(0, 5).forEach(c => console.log('[Scrollywood] Candidate:', c));

            // Try scrolling each candidate
            for (const { el } of candidates) {
              const before = el.scrollTop;
              el.scrollTop = 999999;
              const scrolled = el.scrollTop;
              el.scrollTop = before;

              if (scrolled > fallbackMaxScroll) {
                console.log('[Scrollywood] Found better scrollable:', el.tagName, el.className, 'scrolled to', scrolled);
                fallbackMaxScroll = scrolled;
                window.__scrollywoodContainer = el;
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

        // Get scroll target (either a container element or window)
        const scrollContainer = window.__scrollywoodContainer;

        // Use setInterval pattern (matches tested createScrollExecutor)
        const INTERVAL_MS = 16; // ~60fps
        const totalMs = scrollDuration * 1000;
        const startTime = Date.now();

        let intervalId = null;

        function tick() {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / totalMs, 1);
          const targetY = totalHeight * progress;

          if (scrollContainer) {
            scrollContainer.scrollTop = targetY;
            scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
          } else {
            window.scrollTo({ top: targetY, behavior: 'instant' });
            window.dispatchEvent(new Event('scroll'));
          }

          if (progress >= 1) {
            clearInterval(intervalId);
            // Restore original scroll behavior
            const override = document.getElementById(overrideId);
            if (override) override.remove();
            delete window.__scrollywoodContainer;
            console.log('[Scrollywood] Scroll complete');
          }
        }

        console.log('[Scrollywood] Starting scroll, totalHeight:', totalHeight, 'container:', scrollContainer ? scrollContainer.tagName : 'window');
        intervalId = setInterval(tick, INTERVAL_MS);
        tick(); // Execute immediately
      },
      args: [duration, getScrollBehaviorOverrideCSS(), SCROLL_OVERRIDE_ID, MIN_SCROLL_THRESHOLD],
    });
  } catch (error) {
    console.error('Failed to inject scroll script:', error);
  }
}
