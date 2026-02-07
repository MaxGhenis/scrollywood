// Background service worker for Scrollywood
import { startRecording, handleRecordingComplete, isRecording } from './background-logic.js';
import {
  getScrollBehaviorOverrideCSS,
  getOverflowOverrideCSS,
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
  if (message.action === 'getState') {
    sendResponse({ recording: isRecording() });
  }
  if (message.action === 'forceStop') {
    console.log('Force stop requested');
    chrome.runtime.sendMessage({ action: 'stopCapture' });
    sendResponse({ status: 'stopping' });
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
      func: (scrollDuration, overrideCSS, overflowCSS, overrideId, minThreshold) => {
        console.log('[Scrollywood] Scroll script injected, duration:', scrollDuration);

        // Detect iframe-wrapped pages (e.g. maxghenis.com/mita wrapping maxghenis.github.io/mita/)
        // These outer frames have no scrollable content - the inner frame handles scrolling via allFrames: true
        const iframes = document.querySelectorAll('iframe');
        if (iframes.length > 0 && document.body.children.length <= 2) {
          const docHeight = document.documentElement.scrollHeight;
          const bodyHeight = document.body.scrollHeight;
          const winHeight = window.innerHeight;
          const outerScrollable = Math.max(docHeight, bodyHeight) - winHeight;
          if (outerScrollable < minThreshold) {
            console.log('[Scrollywood] Iframe wrapper detected, deferring to inner frame');
            return;
          }
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

          // Check if overflow:hidden is preventing scrolling, and override if so
          if (htmlStyle.overflow === 'hidden' || htmlStyle.overflowY === 'hidden' ||
              bodyStyle.overflow === 'hidden' || bodyStyle.overflowY === 'hidden') {
            console.log('[Scrollywood] overflow:hidden detected, adding overflow override');
            styleOverride.textContent += overflowCSS;

            // Recalculate with overflow fixed
            const newMaxHeight = Math.max(
              document.documentElement.scrollHeight,
              document.body.scrollHeight
            ) - window.innerHeight;
            if (newMaxHeight >= minThreshold) {
              totalHeight = newMaxHeight;
              console.log('[Scrollywood] After overflow fix, totalHeight:', totalHeight);
            }
          }
        }

        // If still below threshold after overflow fix, try more aggressive fallbacks
        if (totalHeight < minThreshold) {
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

        // Prefer smooth linear scrolling over step-based jumping.
        // Smooth scroll at 60fps naturally triggers IntersectionObserver as elements
        // cross viewport thresholds - exactly like manual scrolling. This is critical
        // for scrollytelling pages (react-scrollama, scrollama) where the smooth
        // continuous scroll IS the visual experience.
        // Step-based jumping is only used as a last resort for exotic pages that have
        // navigable step elements but no standard scrollable content.

        if (totalHeight >= minThreshold) {
          // Primary: smooth linear scroll
          const pixelsPerTick = totalHeight / (totalMs / INTERVAL_MS);
          let currentScroll = 0;
          let intervalId = null;

          function tick() {
            currentScroll += pixelsPerTick;
            if (currentScroll >= totalHeight) {
              currentScroll = totalHeight;
            }

            if (scrollContainer) {
              scrollContainer.scrollTop = currentScroll;
              scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
            } else {
              window.scrollTo({ top: currentScroll, behavior: 'instant' });
              window.dispatchEvent(new Event('scroll'));
              document.dispatchEvent(new Event('scroll'));
            }

            if (currentScroll >= totalHeight) {
              clearInterval(intervalId);
              const override = document.getElementById(overrideId);
              if (override) override.remove();
              delete window.__scrollywoodContainer;
              console.log('[Scrollywood] Scroll complete');
            }
          }

          console.log('[Scrollywood] Using smooth scroll, totalHeight:', totalHeight);
          intervalId = setInterval(tick, INTERVAL_MS);
          tick();
        } else {
          // Fallback: step-based scrolling for pages with no standard scroll
          const stepSelectors = [
            '[data-react-scrollama-id]',  // react-scrollama
            '.step',                       // common scrollytelling class
            '[data-step]',                 // data attribute pattern
            '.narrative-step',             // mita specific
          ];

          let stepElements = [];
          for (const selector of stepSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              stepElements = Array.from(elements);
              console.log('[Scrollywood] Found', stepElements.length, 'step elements with selector:', selector);
              break;
            }
          }

          if (stepElements.length > 0) {
            // Remove the CSS override - scrollIntoView doesn't need it
            const existingOverride = document.getElementById(overrideId);
            if (existingOverride) {
              existingOverride.remove();
              console.log('[Scrollywood] Removed CSS override for step-based scroll');
            }

            const timePerStep = (scrollDuration * 1000) / stepElements.length;
            let currentStep = 0;

            function scrollToNextStep() {
              if (currentStep >= stepElements.length) {
                console.log('[Scrollywood] Step-based scroll complete');
                return;
              }

              const element = stepElements[currentStep];
              element.scrollIntoView({ behavior: 'instant', block: 'start' });
              console.log('[Scrollywood] Scrolling to step', currentStep + 1, 'of', stepElements.length);
              currentStep++;
              setTimeout(scrollToNextStep, timePerStep);
            }

            console.log('[Scrollywood] Using step-based scroll with', stepElements.length, 'steps');
            scrollToNextStep();
          } else {
            console.log('[Scrollywood] No scrollable content and no step elements found');
            const override = document.getElementById(overrideId);
            if (override) override.remove();
          }
        }
      },
      args: [duration, getScrollBehaviorOverrideCSS(), getOverflowOverrideCSS(), SCROLL_OVERRIDE_ID, MIN_SCROLL_THRESHOLD],
    });
  } catch (error) {
    console.error('Failed to inject scroll script:', error);
  }
}
