// Offscreen document for MediaRecorder (needs DOM context)

let mediaRecorder = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    await startCapture(message.streamId, message.tabId, message.duration, message.delay);
  }
  return true;
});

async function startCapture(streamId, tabId, duration, delay) {
  try {
    // Get the media stream from the streamId
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });

    // Set up MediaRecorder
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000,
    });

    mediaRecorder.ondataavailable = (event) => {
      console.log('Data available:', event.data.size, 'bytes');
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      console.log('MediaRecorder stopped, chunks:', recordedChunks.length);
      stream.getTracks().forEach(track => track.stop());

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('Blob size:', blob.size, 'bytes');

      if (blob.size === 0) {
        console.error('Empty recording - no data captured');
        chrome.runtime.sendMessage({ action: 'recordingComplete' });
        return;
      }

      const url = URL.createObjectURL(blob);
      console.log('Blob URL:', url);

      // Download the video
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `scrollywood-${timestamp}.webm`;
      console.log('Downloading as:', filename);

      try {
        const downloadId = await chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: true,
        });
        console.log('Download started, ID:', downloadId);
      } catch (err) {
        console.error('Download error:', err);
      }

      chrome.runtime.sendMessage({ action: 'recordingComplete' });
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };

    // Start recording
    mediaRecorder.start(1000);
    console.log('Recording started, waiting for delay...');

    // Wait for initial delay
    await sleep(delay * 1000);

    // Ask service worker to inject scroll script (scripting API not available in offscreen)
    console.log('Requesting scroll injection...');
    chrome.runtime.sendMessage({
      action: 'injectScroll',
      tabId,
      duration,
    });

    // Wait for scroll to complete plus extra time at the end
    await sleep((duration + 2) * 1000);

    // Stop recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

  } catch (error) {
    console.error('Capture error:', error);
    chrome.runtime.sendMessage({ action: 'recordingComplete' });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
