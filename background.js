// Background service worker for Scrollywood
import { startRecording, handleRecordingComplete } from './background-logic.js';

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
      func: (scrollDuration) => {
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        const startTime = Date.now();
        const endTime = startTime + (scrollDuration * 1000);

        function smoothScroll() {
          const now = Date.now();
          if (now >= endTime) return;

          const progress = (now - startTime) / (scrollDuration * 1000);
          const targetY = totalHeight * progress;
          window.scrollTo({ top: targetY, behavior: 'instant' });

          requestAnimationFrame(smoothScroll);
        }

        smoothScroll();
      },
      args: [duration],
    });
  } catch (error) {
    console.error('Failed to inject scroll script:', error);
  }
}
