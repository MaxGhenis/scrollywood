import { describe, expect, it } from 'vitest';

import {
  buildTimestampedFilename,
  getUnsupportedFormatMessage,
  normalizeExportFormat,
  resolveRecorderProfile,
} from './media-format.js';

describe('media-format', () => {
  it('normalizes unsupported export formats back to webm', () => {
    expect(normalizeExportFormat('avi')).toBe('webm');
  });

  it('keeps mp4 as a supported export format', () => {
    expect(normalizeExportFormat('mp4')).toBe('mp4');
  });

  it('resolves an mp4 recorder profile when the mime type is supported', () => {
    const profile = resolveRecorderProfile('mp4', (mimeType) => mimeType.startsWith('video/mp4'));
    expect(profile).toEqual(expect.objectContaining({
      exportFormat: 'mp4',
      recorderFormat: 'mp4',
      extension: 'mp4',
      blobType: 'video/mp4',
    }));
  });

  it('returns null when no mp4 recorder profile is supported', () => {
    expect(resolveRecorderProfile('mp4', () => false)).toBeNull();
  });

  it('uses webm as the recorder format for gif exports', () => {
    const profile = resolveRecorderProfile('gif', () => true);
    expect(profile).toEqual(expect.objectContaining({
      exportFormat: 'gif',
      recorderFormat: 'webm',
      extension: 'webm',
    }));
  });

  it('builds timestamped output filenames with the requested extension', () => {
    const date = new Date('2026-04-05T12:34:56.000Z');
    expect(buildTimestampedFilename('mp4', date)).toBe('scrollywood-2026-04-05T12-34-56.mp4');
  });

  it('returns a clear unsupported message for mp4', () => {
    expect(getUnsupportedFormatMessage('mp4')).toBe(
      'MP4 export is not supported in this Chrome build. Try WebM or GIF.'
    );
  });
});
