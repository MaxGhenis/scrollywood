import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    lastError: null,
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};
global.chrome = mockChrome;

import { GifEncoder } from './gif-encoder.js';

describe('GifEncoder', () => {
  describe('initialization', () => {
    it('should create an encoder with specified dimensions', () => {
      const encoder = new GifEncoder(320, 240);
      expect(encoder.width).toBe(320);
      expect(encoder.height).toBe(240);
    });

    it('should default to 100ms frame delay', () => {
      const encoder = new GifEncoder(320, 240);
      expect(encoder.delay).toBe(100);
    });

    it('should accept custom frame delay', () => {
      const encoder = new GifEncoder(320, 240, { delay: 50 });
      expect(encoder.delay).toBe(50);
    });
  });

  describe('GIF header', () => {
    it('should produce valid GIF89a header bytes', () => {
      const encoder = new GifEncoder(320, 240);
      encoder.finish();
      const output = encoder.getOutput();

      // GIF89a magic bytes
      expect(output[0]).toBe(0x47); // G
      expect(output[1]).toBe(0x49); // I
      expect(output[2]).toBe(0x46); // F
      expect(output[3]).toBe(0x38); // 8
      expect(output[4]).toBe(0x39); // 9
      expect(output[5]).toBe(0x61); // a
    });

    it('should encode width and height in logical screen descriptor', () => {
      const encoder = new GifEncoder(320, 240);
      encoder.finish();
      const output = encoder.getOutput();

      // Width (little-endian) at offset 6-7
      expect(output[6] | (output[7] << 8)).toBe(320);
      // Height (little-endian) at offset 8-9
      expect(output[8] | (output[9] << 8)).toBe(240);
    });

    it('should end with GIF trailer byte 0x3B', () => {
      const encoder = new GifEncoder(320, 240);
      encoder.finish();
      const output = encoder.getOutput();
      expect(output[output.length - 1]).toBe(0x3B);
    });
  });

  describe('frame encoding', () => {
    it('should add a frame from RGBA pixel data', () => {
      const encoder = new GifEncoder(2, 2);
      // 2x2 image, all red: RGBA
      const pixels = new Uint8Array([
        255, 0, 0, 255,
        255, 0, 0, 255,
        255, 0, 0, 255,
        255, 0, 0, 255,
      ]);
      encoder.addFrame(pixels);
      encoder.finish();
      const output = encoder.getOutput();

      // Should have content beyond just header + trailer
      expect(output.length).toBeGreaterThan(13);
      // Should still have valid header
      expect(output[0]).toBe(0x47);
      // Should still end with trailer
      expect(output[output.length - 1]).toBe(0x3B);
    });

    it('should handle multiple frames', () => {
      const encoder = new GifEncoder(2, 2);
      const red = new Uint8Array([
        255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255,
      ]);
      const blue = new Uint8Array([
        0, 0, 255, 255, 0, 0, 255, 255,
        0, 0, 255, 255, 0, 0, 255, 255,
      ]);

      encoder.addFrame(red);
      encoder.addFrame(blue);
      encoder.finish();
      const output = encoder.getOutput();

      // Multiple frames should produce larger output than single frame
      const singleEncoder = new GifEncoder(2, 2);
      singleEncoder.addFrame(red);
      singleEncoder.finish();
      const singleOutput = singleEncoder.getOutput();

      expect(output.length).toBeGreaterThan(singleOutput.length);
    });

    it('should include Netscape looping extension for animation', () => {
      const encoder = new GifEncoder(2, 2);
      const pixels = new Uint8Array([
        255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255,
      ]);
      encoder.addFrame(pixels);
      encoder.addFrame(pixels);
      encoder.finish();
      const output = encoder.getOutput();

      // Look for NETSCAPE2.0 application extension
      const outputStr = Array.from(output.slice(0, 100))
        .map(b => String.fromCharCode(b))
        .join('');
      expect(outputStr).toContain('NETSCAPE');
    });
  });

  describe('output', () => {
    it('should return a Uint8Array', () => {
      const encoder = new GifEncoder(2, 2);
      encoder.finish();
      const output = encoder.getOutput();
      expect(output).toBeInstanceOf(Uint8Array);
    });

    it('should produce a valid Blob', () => {
      const encoder = new GifEncoder(2, 2);
      const pixels = new Uint8Array([
        255, 0, 0, 255, 255, 0, 0, 255,
        255, 0, 0, 255, 255, 0, 0, 255,
      ]);
      encoder.addFrame(pixels);
      encoder.finish();
      const blob = encoder.getBlob();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/gif');
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
