// Background logic - testable functions

let recording = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startRecording(tabId, duration, delay) {
  if (recording) return;
  recording = true;

  // Show "REC" badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#ff6b6b' });

  try {
    // Scroll to top first (allFrames to handle iframe-wrapped pages)
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => window.scrollTo({ top: 0, behavior: 'instant' }),
    });

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

    // Create offscreen document for MediaRecorder
    await setupOffscreenDocument();

    // Send stream ID to offscreen document to start recording
    chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId,
      tabId,
      duration,
      delay,
    });

  } catch (error) {
    console.error('Recording error:', error);
    recording = false;
    chrome.action.setBadgeText({ text: '' });
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
