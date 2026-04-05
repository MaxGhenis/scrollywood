import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  buildCapturePlan,
  getTabContext,
  normalizeSettings,
  parseTabOverride,
  readStoredSettings,
  writeStoredSettings,
} from './popup-logic.js';

function createStorage(initialValue) {
  let value = initialValue;

  return {
    getItem() {
      return value ?? null;
    },
    setItem(_key, nextValue) {
      value = nextValue;
    },
  };
}

describe('popup logic', () => {
  it('normalizes settings and clamps out-of-range values', () => {
    expect(normalizeSettings({
      duration: 500,
      delay: -2,
      format: 'avi',
    })).toEqual({
      duration: 300,
      delay: 0,
      format: 'webm',
    });
  });

  it('keeps mp4 as a supported export format', () => {
    expect(normalizeSettings({
      duration: 30,
      delay: 1,
      format: 'mp4',
    })).toEqual({
      duration: 30,
      delay: 1,
      format: 'mp4',
    });
  });

  it('reads defaults when stored settings are missing or invalid', () => {
    expect(readStoredSettings(createStorage())).toEqual(DEFAULT_SETTINGS);
    expect(readStoredSettings(createStorage('not-json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('writes normalized settings to storage', () => {
    const storage = createStorage();
    const result = writeStoredSettings({
      duration: 30,
      delay: 1,
      format: 'gif',
    }, storage);

    expect(result).toEqual({
      duration: 30,
      delay: 1,
      format: 'gif',
    });
    expect(readStoredSettings(storage)).toEqual(result);
  });

  it('builds a stronger warning for long GIF exports', () => {
    expect(buildCapturePlan({
      duration: 75,
      delay: 2,
      format: 'gif',
    })).toEqual({
      title: '75s GIF with 2s lead-in',
      note: 'Long GIF takes can take a bit to encode after the pass finishes.',
      meta: 'GIF • starts after 2s',
    });
  });

  it('describes mp4 as a social-friendly export', () => {
    expect(buildCapturePlan({
      duration: 20,
      delay: 1,
      format: 'mp4',
    })).toEqual({
      title: '20s MP4 with 1s lead-in',
      note: 'MP4 plays best in social upload flows. Availability depends on Chrome support.',
      meta: 'MP4 • starts after 1s',
    });
  });

  it('marks Chrome internal pages as unsupported', () => {
    expect(getTabContext({
      url: 'chrome://extensions',
      title: 'Extensions',
    })).toEqual({
      supported: false,
      chip: 'Unsupported',
      detail: 'Open a normal webpage before rolling camera.',
    });
  });

  it('extracts a compact hostname for supported tabs', () => {
    expect(getTabContext({
      url: 'https://www.example.com/path',
      title: 'An example page title',
    })).toEqual({
      supported: true,
      chip: 'example.com',
      detail: 'An example page title',
    });
  });

  it('parses a numeric tab override from popup query params', () => {
    expect(parseTabOverride('?tab=17')).toBe(17);
    expect(parseTabOverride('?foo=1&tab=42')).toBe(42);
  });

  it('ignores invalid tab overrides', () => {
    expect(parseTabOverride('')).toBeNull();
    expect(parseTabOverride('?tab=abc')).toBeNull();
    expect(parseTabOverride('?tab=-1')).toBeNull();
  });
});
