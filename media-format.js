export const DEFAULT_EXPORT_FORMAT = 'webm';
export const SUPPORTED_EXPORT_FORMATS = new Set(['webm', 'gif', 'mp4']);

const RECORDER_PROFILES = {
  webm: [
    { mimeType: 'video/webm;codecs=vp9', blobType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', blobType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/webm', blobType: 'video/webm', extension: 'webm' },
  ],
  mp4: [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', blobType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1', blobType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/mp4', blobType: 'video/mp4', extension: 'mp4' },
  ],
};

export function normalizeExportFormat(format) {
  return SUPPORTED_EXPORT_FORMATS.has(format) ? format : DEFAULT_EXPORT_FORMAT;
}

export function resolveRecorderProfile(
  format,
  isTypeSupported = (mimeType) => MediaRecorder.isTypeSupported(mimeType)
) {
  const exportFormat = normalizeExportFormat(format);
  const recorderFormat = exportFormat === 'gif' ? 'webm' : exportFormat;
  const profiles = RECORDER_PROFILES[recorderFormat] || RECORDER_PROFILES.webm;

  for (const profile of profiles) {
    if (typeof isTypeSupported !== 'function' || isTypeSupported(profile.mimeType)) {
      return {
        exportFormat,
        recorderFormat,
        ...profile,
      };
    }
  }

  return null;
}

export function getUnsupportedFormatMessage(format) {
  const exportFormat = normalizeExportFormat(format);

  if (exportFormat === 'mp4') {
    return 'MP4 export is not supported in this Chrome build. Try WebM or GIF.';
  }

  return 'This Chrome build cannot record the selected export format.';
}

export function buildTimestampedFilename(extension, date = new Date()) {
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `scrollywood-${timestamp}.${extension}`;
}
