// Offscreen document for MediaRecorder (needs DOM context)

let mediaRecorder = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    await startCapture(message.streamId, message.tabId, message.duration, message.delay);
  }
  if (message.action === 'stopCapture') {
    console.log('Received stopCapture, stopping now');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
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
          minFrameRate: 30,
          maxFrameRate: 60,
        },
      },
    });

    // Set up MediaRecorder
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 16000000,
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

      // Convert blob to base64 and send to service worker for download
      // (chrome.downloads API not available in offscreen documents)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result;
        console.log('Sending blob to service worker for download, size:', base64data.length);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `scrollywood-${timestamp}.webm`;

        chrome.runtime.sendMessage({
          action: 'downloadVideo',
          dataUrl: base64data,
          filename: filename,
        }, (response) => {
          console.log('Download response:', response);
          chrome.runtime.sendMessage({ action: 'recordingComplete' });
        });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event.error);
    };

    // Start recording
    mediaRecorder.start(100);
    console.log('Recording started, waiting for delay...');

    // Wait for initial delay
    await sleep(delay * 1000);

    // Ask service worker to inject scroll script (scripting API not available in offscreen)
    console.log('Requesting scroll injection for tab', tabId, 'duration', duration);
    chrome.runtime.sendMessage({
      action: 'injectScroll',
      tabId,
      duration,
    }, (response) => {
      console.log('Scroll injection response:', response);
    });

    // Stop recording after scroll completes + short buffer.
    // This is the primary stop mechanism — the offscreen document's timers
    // are reliable (unlike the service worker which sleeps after 30s in MV3).
    await sleep((duration + 2) * 1000);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('Stopping recording (scroll duration + 2s buffer elapsed)');
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
