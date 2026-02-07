// Check recording state on popup open
async function init() {
  const btn = document.getElementById('recordBtn');
  const status = document.getElementById('status');
  const btnContent = btn.querySelector('.btn-content span:last-child');
  const recIcon = btn.querySelector('.rec-icon');

  // Check if currently recording
  const response = await chrome.runtime.sendMessage({ action: 'getState' });
  if (response?.recording) {
    showStopState(btn, btnContent, recIcon, status);
  }

  btn.addEventListener('click', async () => {
    // If recording, stop it
    if (btn.dataset.mode === 'stop') {
      chrome.runtime.sendMessage({ action: 'forceStop' });
      status.textContent = 'Stopping...';
      btn.disabled = true;
      setTimeout(() => window.close(), 1000);
      return;
    }

    // Start recording
    const duration = parseInt(document.getElementById('duration').value) || 60;
    const delay = parseInt(document.getElementById('delay').value) || 2;

    btn.disabled = true;
    status.textContent = 'Starting recording...';
    status.className = 'status recording';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      chrome.runtime.sendMessage({
        action: 'startRecording',
        tabId: tab.id,
        duration,
        delay,
      });

      status.textContent = `Recording ${duration}s — stay on this tab!`;
      setTimeout(() => window.close(), 2000);

    } catch (error) {
      console.error('Error:', error);
      status.textContent = `Error: ${error.message}`;
      status.className = 'status';
      btn.disabled = false;
    }
  });
}

function showStopState(btn, btnContent, recIcon, status) {
  btn.dataset.mode = 'stop';
  btnContent.textContent = 'Stop';
  recIcon.style.animation = 'pulse 1s ease-in-out infinite';
  btn.style.background = 'linear-gradient(180deg, #e05555 0%, #c41e3a 100%)';
  btn.style.boxShadow = '0 4px 15px rgba(196, 30, 58, 0.3), inset 0 1px 0 rgba(255,255,255,0.3)';
  status.textContent = 'Recording in progress...';
  status.className = 'status recording';
}

init();
