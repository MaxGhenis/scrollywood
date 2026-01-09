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
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());

      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);

      // Download the video
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await chrome.downloads.download({
        url: url,
        filename: `scrollywood-${timestamp}.webm`,
        saveAs: true,
      });

      chrome.runtime.sendMessage({ action: 'recordingComplete' });
    };

    // Start recording
    mediaRecorder.start(1000);
    console.log('Recording started, waiting for delay...');

    // Wait for initial delay
    await sleep(delay * 1000);

    // Inject scroll script
    console.log('Starting scroll...');
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
