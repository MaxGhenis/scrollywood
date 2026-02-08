// Minimal GIF89a encoder with LZW compression and median-cut color quantization.
// Designed for Chrome extension offscreen documents — no workers, no dependencies.

export class GifEncoder {
  constructor(width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.delay = options.delay || 100; // ms between frames
    this.frames = [];
    this.output = [];
    this.headerWritten = false;
  }

  addFrame(rgbaPixels) {
    if (!this.headerWritten) {
      this._writeHeader();
      this._writeNetscapeExt();
      this.headerWritten = true;
    }
    const { indices, palette } = this._quantize(rgbaPixels);
    this._writeGraphicControlExt();
    this._writeImageDescriptor(palette);
    this._writePalette(palette);
    this._writeLZW(indices, palette.length);
  }

  finish() {
    if (!this.headerWritten) {
      this._writeHeader();
    }
    this.output.push(0x3B); // GIF trailer
  }

  getOutput() {
    return new Uint8Array(this.output);
  }

  getBlob() {
    return new Blob([this.getOutput()], { type: 'image/gif' });
  }

  // --- Header ---

  _writeHeader() {
    // GIF89a signature
    const sig = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // GIF89a
    this.output.push(...sig);

    // Logical Screen Descriptor
    this._writeShort(this.width);
    this._writeShort(this.height);
    // Packed: no global color table
    this.output.push(0x00); // packed field
    this.output.push(0x00); // background color index
    this.output.push(0x00); // pixel aspect ratio
  }

  // --- Netscape Application Extension (looping) ---

  _writeNetscapeExt() {
    this.output.push(0x21); // extension introducer
    this.output.push(0xFF); // application extension
    this.output.push(0x0B); // block size
    // NETSCAPE2.0
    const id = [0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30];
    this.output.push(...id);
    this.output.push(0x03); // sub-block size
    this.output.push(0x01); // loop sub-block id
    this._writeShort(0);    // loop count (0 = infinite)
    this.output.push(0x00); // block terminator
  }

  // --- Graphic Control Extension ---

  _writeGraphicControlExt() {
    this.output.push(0x21); // extension introducer
    this.output.push(0xF9); // graphic control label
    this.output.push(0x04); // block size
    this.output.push(0x00); // packed: no disposal, no transparency
    this._writeShort(Math.round(this.delay / 10)); // delay in centiseconds
    this.output.push(0x00); // transparent color index
    this.output.push(0x00); // block terminator
  }

  // --- Image Descriptor ---

  _writeImageDescriptor(palette) {
    this.output.push(0x2C); // image separator
    this._writeShort(0);    // left
    this._writeShort(0);    // top
    this._writeShort(this.width);
    this._writeShort(this.height);

    // Local color table, size = palette.length
    const bits = this._paletteBits(palette.length);
    const tableSize = (1 << bits);
    // Packed: local color table flag (0x80) | table size (bits - 1)
    this.output.push(0x80 | (bits - 1));
  }

  // --- Color Palette ---

  _writePalette(palette) {
    const bits = this._paletteBits(palette.length);
    const tableSize = 1 << bits;
    for (let i = 0; i < tableSize; i++) {
      if (i < palette.length) {
        this.output.push(palette[i][0], palette[i][1], palette[i][2]);
      } else {
        this.output.push(0, 0, 0); // pad
      }
    }
  }

  // --- Color Quantization (median cut) ---

  _quantize(rgbaPixels) {
    const pixelCount = this.width * this.height;
    // Sample pixels for palette generation (skip every N for speed)
    const sampleStep = Math.max(1, Math.floor(pixelCount / 10000));
    const samples = [];

    for (let i = 0; i < pixelCount; i += sampleStep) {
      const off = i * 4;
      samples.push([rgbaPixels[off], rgbaPixels[off + 1], rgbaPixels[off + 2]]);
    }

    // Median cut to 256 colors
    const palette = this._medianCut(samples, 256);

    // Map every pixel to nearest palette color
    const indices = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      const r = rgbaPixels[off];
      const g = rgbaPixels[off + 1];
      const b = rgbaPixels[off + 2];
      indices[i] = this._nearestColor(palette, r, g, b);
    }

    return { indices, palette };
  }

  _medianCut(samples, maxColors) {
    if (samples.length === 0) {
      return [[0, 0, 0]];
    }

    let buckets = [samples];

    while (buckets.length < maxColors) {
      // Find the bucket with the widest channel range
      let bestIdx = 0;
      let bestRange = -1;
      let bestChannel = 0;

      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        if (bucket.length < 2) continue;

        for (let ch = 0; ch < 3; ch++) {
          let min = 255, max = 0;
          for (const px of bucket) {
            if (px[ch] < min) min = px[ch];
            if (px[ch] > max) max = px[ch];
          }
          const range = max - min;
          if (range > bestRange) {
            bestRange = range;
            bestIdx = i;
            bestChannel = ch;
          }
        }
      }

      if (bestRange <= 0) break;

      // Split the bucket along the median of the widest channel
      const bucket = buckets[bestIdx];
      bucket.sort((a, b) => a[bestChannel] - b[bestChannel]);
      const mid = Math.floor(bucket.length / 2);

      buckets.splice(bestIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    // Average each bucket to get palette color
    return buckets.map(bucket => {
      if (bucket.length === 0) return [0, 0, 0];
      let r = 0, g = 0, b = 0;
      for (const px of bucket) {
        r += px[0]; g += px[1]; b += px[2];
      }
      const n = bucket.length;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
  }

  _nearestColor(palette, r, g, b) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // --- LZW Compression ---

  _writeLZW(indices, paletteSize) {
    const bits = this._paletteBits(paletteSize);
    const minCodeSize = Math.max(2, bits);
    this.output.push(minCodeSize);

    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxTableSize = 4096;

    // Use a string-keyed map for the code table
    let table = new Map();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }

    let buffer = 0;
    let bufferBits = 0;
    const subBlocks = [];
    let currentSubBlock = [];

    function writeBits(code, size) {
      buffer |= (code << bufferBits);
      bufferBits += size;
      while (bufferBits >= 8) {
        currentSubBlock.push(buffer & 0xFF);
        buffer >>= 8;
        bufferBits -= 8;
        if (currentSubBlock.length === 255) {
          subBlocks.push(currentSubBlock);
          currentSubBlock = [];
        }
      }
    }

    // Start with clear code
    writeBits(clearCode, codeSize);

    if (indices.length === 0) {
      writeBits(eoiCode, codeSize);
    } else {
      let current = String(indices[0]);

      for (let i = 1; i < indices.length; i++) {
        const next = current + ',' + indices[i];
        if (table.has(next)) {
          current = next;
        } else {
          writeBits(table.get(current), codeSize);

          if (nextCode < maxTableSize) {
            table.set(next, nextCode++);
            if (nextCode > (1 << codeSize) && codeSize < 12) {
              codeSize++;
            }
          } else {
            // Table full, reset
            writeBits(clearCode, codeSize);
            table = new Map();
            for (let j = 0; j < clearCode; j++) {
              table.set(String(j), j);
            }
            codeSize = minCodeSize + 1;
            nextCode = eoiCode + 1;
          }

          current = String(indices[i]);
        }
      }

      // Write remaining
      writeBits(table.get(current), codeSize);
      writeBits(eoiCode, codeSize);
    }

    // Flush remaining bits
    if (bufferBits > 0) {
      currentSubBlock.push(buffer & 0xFF);
    }
    if (currentSubBlock.length > 0) {
      subBlocks.push(currentSubBlock);
    }

    // Write sub-blocks
    for (const block of subBlocks) {
      this.output.push(block.length);
      this.output.push(...block);
    }

    // Block terminator
    this.output.push(0x00);
  }

  // --- Utilities ---

  _writeShort(val) {
    this.output.push(val & 0xFF);
    this.output.push((val >> 8) & 0xFF);
  }

  _paletteBits(paletteSize) {
    let bits = 1;
    while ((1 << bits) < paletteSize) bits++;
    return Math.max(2, Math.min(8, bits));
  }
}

// Make available globally for offscreen document (loaded via <script> tag)
if (typeof globalThis !== 'undefined') {
  globalThis.GifEncoder = GifEncoder;
}
