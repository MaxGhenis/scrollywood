// Offscreen document for MediaRecorder (needs DOM context)

let mediaRecorder = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    startCapture(message.streamId, message.tabId, message.duration, message.delay, message.format);
    return true;
  }
  if (message.action === 'stopCapture') {
    console.log('Received stopCapture, stopping now');
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    return true;
  }
  // Don't handle other messages — let the service worker respond
});

async function startCapture(streamId, tabId, duration, delay, format) {
  format = format || 'webm';

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

      if (format === 'gif') {
        await convertToGif(blob);
      } else {
        await downloadWebM(blob);
      }

      chrome.runtime.sendMessage({ action: 'recordingComplete' });
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

// Download WebM video (original behavior)
async function downloadWebM(blob) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `scrollywood-${timestamp}.webm`;

  // Download via blob URL. Try multiple approaches since offscreen
  // documents have limited API access and base64 via sendMessage
  // silently fails for large recordings (100MB+ at 16Mbps).
  const blobUrl = URL.createObjectURL(blob);
  console.log('Downloading via blob URL, blob size:', blob.size);

  let downloaded = false;

  // Approach 1: chrome.downloads API directly in offscreen
  if (typeof chrome.downloads?.download === 'function') {
    try {
      const downloadId = await chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: true,
      });
      console.log('chrome.downloads succeeded, ID:', downloadId);
      downloaded = true;
    } catch (e) {
      console.warn('chrome.downloads failed:', e.message);
    }
  }

  // Approach 2: anchor element click (DOM-based download)
  if (!downloaded) {
    try {
      console.log('Trying anchor click download...');
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      console.log('Anchor click download triggered');
      downloaded = true;
    } catch (e) {
      console.warn('Anchor click failed:', e.message);
    }
  }

  // Approach 3: send blob URL to service worker (small message)
  if (!downloaded) {
    console.log('Sending blob URL to service worker for download...');
    chrome.runtime.sendMessage({
      action: 'downloadVideo',
      dataUrl: blobUrl,
      filename: filename,
    });
  }

  // Revoke after delay to let download read the blob
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

// Convert WebM blob to GIF and download
async function convertToGif(webmBlob) {
  console.log('Converting to GIF...');
  chrome.runtime.sendMessage({
    action: 'updateBadge',
    text: 'GIF',
  });

  try {
    const video = document.getElementById('gifVideo');
    const canvas = document.getElementById('gifCanvas');
    const ctx = canvas.getContext('2d');

    // Load the WebM into the video element
    const videoUrl = URL.createObjectURL(webmBlob);
    video.src = videoUrl;

    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Failed to load video'));
      setTimeout(() => reject(new Error('Video load timeout')), 30000);
    });

    // Calculate output dimensions (max 960px wide)
    const MAX_WIDTH = 960;
    const GIF_FPS = 10;
    let outWidth = video.videoWidth;
    let outHeight = video.videoHeight;

    if (outWidth > MAX_WIDTH) {
      const scale = MAX_WIDTH / outWidth;
      outWidth = MAX_WIDTH;
      outHeight = Math.round(video.videoHeight * scale);
    }

    // Ensure even dimensions
    outWidth = outWidth & ~1;
    outHeight = outHeight & ~1;

    canvas.width = outWidth;
    canvas.height = outHeight;

    const frameDelay = Math.round(1000 / GIF_FPS);
    const encoder = new GifEncoder(outWidth, outHeight, { delay: frameDelay });

    // Get video duration
    // Some WebM files report Infinity duration; seek to end to get real duration
    if (!isFinite(video.duration)) {
      video.currentTime = 1e10;
      await new Promise(resolve => {
        video.onseeked = resolve;
        setTimeout(resolve, 5000);
      });
      video.currentTime = 0;
      await new Promise(resolve => {
        video.onseeked = resolve;
        setTimeout(resolve, 2000);
      });
    }

    const videoDuration = video.duration;
    console.log('Video duration:', videoDuration, 'Output:', outWidth, 'x', outHeight, '@', GIF_FPS, 'fps');

    const totalFrames = Math.floor(videoDuration * GIF_FPS);
    let framesEncoded = 0;

    // Seek through video and capture frames
    for (let i = 0; i < totalFrames; i++) {
      const seekTime = i / GIF_FPS;
      video.currentTime = seekTime;

      await new Promise((resolve) => {
        video.onseeked = resolve;
        setTimeout(resolve, 1000); // timeout fallback
      });

      // Draw frame to canvas
      ctx.drawImage(video, 0, 0, outWidth, outHeight);
      const imageData = ctx.getImageData(0, 0, outWidth, outHeight);
      encoder.addFrame(imageData.data);

      framesEncoded++;

      // Update badge with progress
      if (framesEncoded % 5 === 0 || framesEncoded === totalFrames) {
        const pct = Math.round((framesEncoded / totalFrames) * 100);
        chrome.runtime.sendMessage({
          action: 'updateBadge',
          text: `${pct}%`,
        });
        console.log(`GIF encoding: ${pct}% (${framesEncoded}/${totalFrames} frames)`);
      }
    }

    encoder.finish();
    const gifBlob = encoder.getBlob();
    console.log('GIF encoded:', gifBlob.size, 'bytes,', framesEncoded, 'frames');

    URL.revokeObjectURL(videoUrl);

    // Download the GIF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `scrollywood-${timestamp}.gif`;
    const gifUrl = URL.createObjectURL(gifBlob);

    let downloaded = false;

    if (typeof chrome.downloads?.download === 'function') {
      try {
        await chrome.downloads.download({
          url: gifUrl,
          filename: filename,
          saveAs: true,
        });
        downloaded = true;
      } catch (e) {
        console.warn('chrome.downloads failed for GIF:', e.message);
      }
    }

    if (!downloaded) {
      const a = document.createElement('a');
      a.href = gifUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    setTimeout(() => URL.revokeObjectURL(gifUrl), 60000);

  } catch (error) {
    console.error('GIF conversion failed:', error);
    console.log('Falling back to WebM download...');
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      text: 'ERR',
    });
    // Fall back to WebM
    await downloadWebM(webmBlob);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
