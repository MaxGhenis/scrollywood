import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  readStoredSettings,
  writeStoredSettings,
  buildCapturePlan,
  getRecordButtonMeta,
  parseTabOverride,
  getTabContext,
} from './popup-logic.js';
import { resolveRecorderProfile } from './media-format.js';

const panel = document.getElementById('panel');
const targetChip = document.getElementById('targetChip');
const targetMeta = document.getElementById('targetMeta');
const planTitle = document.getElementById('planTitle');
const planNote = document.getElementById('planNote');
const durationInput = document.getElementById('duration');
const delayInput = document.getElementById('delay');
const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const recordMeta = document.getElementById('recordMeta');
const status = document.getElementById('status');

const presetButtons = [...document.querySelectorAll('.preset')];
const formatButtons = [...document.querySelectorAll('.format-option')];

let currentFormat = DEFAULT_SETTINGS.format;
let currentTab = null;
let currentlyRecording = false;
const overrideTabId = parseTabOverride(window.location.search);
const mp4Supported = resolveRecorderProfile(
  'mp4',
  typeof MediaRecorder?.isTypeSupported === 'function'
    ? MediaRecorder.isTypeSupported.bind(MediaRecorder)
    : null
) !== null;

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(tabs[0] || null);
    });
  });
}

function getTabById(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(tab || null);
    });
  });
}

function resolveTargetTab() {
  return overrideTabId === null
    ? queryActiveTab()
    : getTabById(overrideTabId);
}

function readSettingsFromForm() {
  return normalizeSettings({
    duration: durationInput.value,
    delay: delayInput.value,
    format: currentFormat,
  });
}

function applySettings(settings) {
  const normalized = normalizeSettings(settings);
  durationInput.value = String(normalized.duration);
  delayInput.value = String(normalized.delay);
  currentFormat = normalized.format === 'mp4' && !mp4Supported
    ? DEFAULT_SETTINGS.format
    : normalized.format;
}

function setStatus(message, tone = 'idle') {
  status.textContent = message;
  status.dataset.tone = tone;
}

function setControlsDisabled(disabled) {
  durationInput.disabled = disabled;
  delayInput.disabled = disabled;
  presetButtons.forEach((button) => {
    button.disabled = disabled;
  });
  formatButtons.forEach((button) => {
    const unsupportedMp4 = button.dataset.format === 'mp4' && !mp4Supported;
    button.disabled = disabled || unsupportedMp4;
  });
}

function syncPresetSelection(duration) {
  presetButtons.forEach((button) => {
    const presetDuration = Number.parseInt(button.dataset.duration, 10);
    button.setAttribute('aria-pressed', String(presetDuration === duration));
  });
}

function syncFormatSelection(format) {
  formatButtons.forEach((button) => {
    const pressed = button.dataset.format === format;
    button.setAttribute('aria-pressed', String(pressed));
  });
}

function syncFormatAvailability() {
  formatButtons.forEach((button) => {
    if (button.dataset.format === 'mp4' && !mp4Supported) {
      button.title = 'MP4 export is not supported in this Chrome build.';
    } else {
      button.removeAttribute('title');
    }
  });
}

function renderPlan() {
  const settings = readSettingsFromForm();
  const plan = buildCapturePlan(settings);

  const titleChanged = planTitle.textContent !== plan.title;
  planTitle.textContent = plan.title;
  planNote.textContent = plan.note;
  recordMeta.textContent = getRecordButtonMeta(settings);

  // Brief flash on plan text when it changes
  if (titleChanged) {
    planTitle.style.opacity = '0.5';
    planNote.style.opacity = '0.5';
    requestAnimationFrame(() => {
      planTitle.style.opacity = '';
      planNote.style.opacity = '';
    });
  }

  syncPresetSelection(settings.duration);
  syncFormatSelection(settings.format);
  syncFormatAvailability();

  writeStoredSettings(settings);
  return settings;
}

function renderTabContext() {
  const context = getTabContext(currentTab || {});

  targetChip.textContent = context.chip;
  targetMeta.textContent = context.detail;

  if (currentlyRecording) {
    panel.dataset.state = 'recording';
    recordBtn.disabled = false;
    return;
  }

  panel.dataset.state = context.supported ? 'ready' : 'unsupported';
  recordBtn.disabled = !context.supported;

  if (!context.supported) {
    setStatus('Chrome internal pages cannot be recorded. Switch to a regular webpage.', 'error');
  } else if (!status.textContent || status.dataset.tone === 'error') {
    setStatus('Ready when you are.', 'idle');
  }
}

function showStopState() {
  currentlyRecording = true;
  panel.dataset.state = 'recording';
  recordBtn.classList.add('is-stop');
  recordBtn.dataset.mode = 'stop';
  recordBtn.disabled = false;
  setControlsDisabled(true);
  recordLabel.textContent = 'Cut Recording';
  recordMeta.textContent = 'Stop and save what has been captured so far.';
  setStatus('Recording is already in progress. Reopen this panel anytime to stop it.', 'recording');
}

function showReadyState() {
  currentlyRecording = false;
  recordBtn.classList.remove('is-stop');
  recordBtn.dataset.mode = 'start';
  recordBtn.disabled = false;
  setControlsDisabled(false);
  recordLabel.textContent = 'Roll Camera';
  recordMeta.textContent = getRecordButtonMeta(readSettingsFromForm());
  syncFormatAvailability();
}

async function refreshCurrentTab() {
  currentTab = await resolveTargetTab();
  renderTabContext();
}

async function handleRecordClick() {
  if (recordBtn.dataset.mode === 'stop') {
    recordBtn.disabled = true;
    setStatus('Stopping the current pass...', 'loading');

    try {
      await sendRuntimeMessage({ action: 'forceStop' });
      setStatus('Stopping now. Your file dialog should follow.', 'recording');
      setTimeout(() => window.close(), 900);
    } catch (error) {
      recordBtn.disabled = false;
      setStatus(error.message, 'error');
    }
    return;
  }

  const settings = renderPlan();
  const context = getTabContext(currentTab || {});
  if (!context.supported) {
    renderTabContext();
    return;
  }

  recordBtn.disabled = true;
  setStatus('Arming camera and grabbing the active tab...', 'loading');

  try {
    await refreshCurrentTab();
    const refreshedContext = getTabContext(currentTab || {});
    if (!refreshedContext.supported) {
      throw new Error('Switch to a regular webpage before starting a recording.');
    }
    if (!currentTab?.id) {
      throw new Error('No active tab is available to capture.');
    }

    const response = await sendRuntimeMessage({
      action: 'startRecording',
      tabId: currentTab.id,
      duration: settings.duration,
      delay: settings.delay,
      format: settings.format,
    });

    if (!response || response.status !== 'started') {
      throw new Error(response?.message || 'Unable to start recording.');
    }

    setStatus(
      `Recording ${settings.duration}s on ${targetChip.textContent}. Keep that tab in front.`,
      'recording'
    );
    setTimeout(() => window.close(), 1200);
  } catch (error) {
    recordBtn.disabled = false;
    setStatus(error.message, 'error');
  }
}

function bindEvents() {
  durationInput.addEventListener('input', () => {
    if (currentlyRecording) {
      return;
    }
    renderPlan();
    showReadyState();
    renderTabContext();
  });

  delayInput.addEventListener('input', () => {
    if (currentlyRecording) {
      return;
    }
    renderPlan();
    showReadyState();
    renderTabContext();
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (currentlyRecording) {
        return;
      }
      durationInput.value = button.dataset.duration;
      renderPlan();
      showReadyState();
      renderTabContext();
    });
  });

  formatButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (currentlyRecording) {
        return;
      }
      currentFormat = button.dataset.format;
      renderPlan();
      showReadyState();
      renderTabContext();
    });
  });

  recordBtn.addEventListener('click', handleRecordClick);
}

async function init() {
  const storedSettings = readStoredSettings();
  applySettings(storedSettings);
  renderPlan();
  bindEvents();

  try {
    const [stateResponse, tab] = await Promise.all([
      sendRuntimeMessage({ action: 'getState' }),
      resolveTargetTab(),
    ]);

    currentTab = tab;
    if (stateResponse?.recording) {
      showStopState();
    } else {
      showReadyState();
    }

    renderTabContext();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

init();
