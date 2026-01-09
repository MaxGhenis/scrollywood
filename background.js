// Background service worker for Scrollywood
import { startRecording, handleRecordingComplete } from './background-logic.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startRecording(message.tabId, message.duration, message.delay);
    sendResponse({ status: 'started' });
  }
  if (message.action === 'recordingComplete') {
    handleRecordingComplete();
    console.log('Recording saved!');
  }
  return true;
});
