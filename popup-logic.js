import {
  DEFAULT_EXPORT_FORMAT,
  normalizeExportFormat,
} from './media-format.js';

export const DEFAULT_SETTINGS = {
  duration: 60,
  delay: 2,
  format: DEFAULT_EXPORT_FORMAT,
};

export const DURATION_LIMITS = {
  min: 5,
  max: 300,
};

export const DELAY_LIMITS = {
  min: 0,
  max: 10,
};

export const STORAGE_KEY = 'scrollywood.popupSettings';

const BLOCKED_PROTOCOLS = new Set([
  'about:',
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'devtools:',
  'edge:',
  'view-source:',
]);

function clampNumber(value, limits, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(limits.max, Math.max(limits.min, number));
}

export function normalizeSettings(settings = {}) {
  const normalized = {
    duration: clampNumber(settings.duration, DURATION_LIMITS, DEFAULT_SETTINGS.duration),
    delay: clampNumber(settings.delay, DELAY_LIMITS, DEFAULT_SETTINGS.delay),
    format: normalizeExportFormat(settings.format),
  };

  return normalized;
}

export function readStoredSettings(storage = globalThis.localStorage) {
  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeStoredSettings(settings, storage = globalThis.localStorage) {
  if (!storage) {
    return normalizeSettings(settings);
  }

  const normalized = normalizeSettings(settings);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function buildCapturePlan(settings = {}) {
  const normalized = normalizeSettings(settings);
  const formatLabel = normalized.format.toUpperCase();
  const leadIn = normalized.delay === 0
    ? 'starts scrolling immediately'
    : `starts after ${normalized.delay}s`;

  let note = 'WebM exports fastest and keeps the cleanest motion.';
  if (normalized.format === 'mp4') {
    note = 'MP4 plays best in social upload flows. Availability depends on Chrome support.';
  }
  if (normalized.format === 'gif' && normalized.duration < 45) {
    note = 'GIF adds a loopable export and encodes right after capture.';
  }
  if (normalized.format === 'gif' && normalized.duration >= 45) {
    note = 'Long GIF takes can take a bit to encode after the pass finishes.';
  }

  return {
    title: `${normalized.duration}s ${formatLabel} with ${normalized.delay}s lead-in`,
    note,
    meta: `${formatLabel} • ${leadIn}`,
  };
}

export function getRecordButtonMeta(settings = {}) {
  const normalized = normalizeSettings(settings);
  if (normalized.format === 'mp4') {
    return 'Best for platforms that reject WebM.';
  }
  if (normalized.format === 'gif') {
    return 'Encodes after capture finishes.';
  }

  return 'Saves when the pass is complete.';
}

export function parseTabOverride(search = '') {
  const params = new URLSearchParams(search);
  const rawTabId = params.get('tab');
  if (!rawTabId) {
    return null;
  }

  const tabId = Number.parseInt(rawTabId, 10);
  if (!Number.isInteger(tabId) || tabId < 0) {
    return null;
  }

  return tabId;
}

function compactHost(hostname) {
  return hostname.replace(/^www\./, '') || 'Current tab';
}

function compactTitle(title = '') {
  if (!title) {
    return 'Ready to record the page currently in focus.';
  }

  return title.length > 52 ? `${title.slice(0, 49)}...` : title;
}

export function getTabContext(tab = {}) {
  const rawUrl = tab.url || tab.pendingUrl || '';

  if (!rawUrl) {
    return {
      supported: true,
      chip: 'Current tab',
      detail: 'Ready to record the page currently in focus.',
    };
  }

  try {
    const parsed = new URL(rawUrl);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
      return {
        supported: false,
        chip: 'Unsupported',
        detail: 'Open a normal webpage before rolling camera.',
      };
    }

    return {
      supported: true,
      chip: compactHost(parsed.hostname || parsed.protocol.replace(':', '')),
      detail: compactTitle(tab.title),
    };
  } catch {
    return {
      supported: true,
      chip: 'Current tab',
      detail: compactTitle(tab.title),
    };
  }
}
