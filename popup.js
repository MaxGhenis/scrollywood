document.getElementById('recordBtn').addEventListener('click', async () => {
  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('status');
  const duration = parseInt(document.getElementById('duration').value) || 60;
  const delay = parseInt(document.getElementById('delay').value) || 2;

  btn.disabled = true;
  status.textContent = 'Starting recording...';
  status.className = 'recording';

  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to background script to start recording
    chrome.runtime.sendMessage({
      action: 'startRecording',
      tabId: tab.id,
      duration,
      delay,
    });

    status.textContent = `Recording! (${duration}s scroll + ${delay}s delay)`;

    // Close popup after a moment - recording continues in background
    setTimeout(() => window.close(), 1500);

  } catch (error) {
    console.error('Error:', error);
    status.textContent = `Error: ${error.message}`;
    status.className = '';
    btn.disabled = false;
  }
});
