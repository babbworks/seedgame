/**
 * Unit tests for 4-bit packed binary output (Task 4.4)
 * Validates Requirement 5.7
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emitPackedBinary, unpackBinary, comb } from '../../tools/build-edb.mjs';

// ========================================================================
// emitPackedBinary / unpackBinary — round-trip
// ========================================================================

describe('emitPackedBinary — 4-bit packing format', () => {
  it('packs high nibble first, low nibble second', () => {
    const values = new Uint8Array([0x0A, 0x05]); // 10, 5
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'test.bin');

    emitPackedBinary(values, outPath);
    const packed = fs.readFileSync(outPath);

    // Byte[0] = (10 << 4) | 5 = 0xA5
    assert.equal(packed.length, 1);
    assert.equal(packed[0], 0xA5);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('zero-pads the low nibble for odd-length arrays', () => {
    const values = new Uint8Array([0x07]); // single value: 7
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'test.bin');

    emitPackedBinary(values, outPath);
    const packed = fs.readFileSync(outPath);

    // Byte[0] = (7 << 4) | 0 = 0x70
    assert.equal(packed.length, 1);
    assert.equal(packed[0], 0x70);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('produces correct file size: ceil(length / 2) bytes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));

    for (const len of [1, 2, 3, 4, 5, 10, 77, 78, 100]) {
      const values = new Uint8Array(len).fill(3);
      const outPath = path.join(tmpDir, `test-${len}.bin`);
      emitPackedBinary(values, outPath);
      const packed = fs.readFileSync(outPath);
      assert.equal(packed.length, Math.ceil(len / 2), `wrong size for length=${len}`);
    }

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates output directory if it does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'nested', 'deep', 'layer.bin');

    const values = new Uint8Array([1, 2, 3, 4]);
    emitPackedBinary(values, outPath);

    assert.ok(fs.existsSync(outPath));

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ========================================================================
// unpackBinary — inverse operation
// ========================================================================

describe('unpackBinary — unpacking', () => {
  it('unpacks a single byte into two nibble values', () => {
    const packed = new Uint8Array([0xA5]);
    const result = unpackBinary(packed, 2);
    assert.deepEqual([...result], [10, 5]);
  });

  it('unpacks odd-length array correctly (ignores padding)', () => {
    const packed = new Uint8Array([0x70]); // high=7, low=0 (padding)
    const result = unpackBinary(packed, 1);
    assert.deepEqual([...result], [7]);
  });

  it('unpacks multiple bytes correctly', () => {
    const packed = new Uint8Array([0x12, 0x34, 0x56]);
    const result = unpackBinary(packed, 6);
    assert.deepEqual([...result], [1, 2, 3, 4, 5, 6]);
  });
});

// ========================================================================
// Round-trip: emitPackedBinary → read → unpackBinary
// ========================================================================

describe('4-bit packing round-trip', () => {
  it('round-trips an even-length array of nibble values', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'rt-even.bin');

    const values = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    emitPackedBinary(values, outPath);
    const packed = fs.readFileSync(outPath);
    const recovered = unpackBinary(packed, values.length);

    assert.deepEqual([...recovered], [...values]);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips an odd-length array of nibble values', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'rt-odd.bin');

    const values = new Uint8Array([3, 7, 11, 15, 0, 8, 2]);
    emitPackedBinary(values, outPath);
    const packed = fs.readFileSync(outPath);
    const recovered = unpackBinary(packed, values.length);

    assert.deepEqual([...recovered], [...values]);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips a layer-sized array (s=2, size=78)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const outPath = path.join(tmpDir, 'layer-2.bin');

    const size = comb(2 + 11, 11); // C(13,11) = 78
    assert.equal(size, 78);

    // Fill with values in range 0..2 (valid for layer s=2)
    const values = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      values[i] = i % 3; // cycles 0, 1, 2
    }

    emitPackedBinary(values, outPath);
    const packed = fs.readFileSync(outPath);

    assert.equal(packed.length, Math.ceil(78 / 2)); // 39 bytes
    const recovered = unpackBinary(packed, size);
    assert.deepEqual([...recovered], [...values]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips all-zero and all-max arrays', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));

    // All zeros
    const zeros = new Uint8Array(100).fill(0);
    const zPath = path.join(tmpDir, 'zeros.bin');
    emitPackedBinary(zeros, zPath);
    const zPacked = fs.readFileSync(zPath);
    assert.deepEqual([...unpackBinary(zPacked, 100)], [...zeros]);

    // All 15s (max nibble)
    const maxes = new Uint8Array(100).fill(15);
    const mPath = path.join(tmpDir, 'maxes.bin');
    emitPackedBinary(maxes, mPath);
    const mPacked = fs.readFileSync(mPath);
    assert.deepEqual([...unpackBinary(mPacked, 100)], [...maxes]);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('emits to edb/layer-{s}.bin path format correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-test-'));
    const edbDir = path.join(tmpDir, 'edb');

    for (const s of [2, 5, 10]) {
      const layerPath = path.join(edbDir, `layer-${s}.bin`);
      const values = new Uint8Array(comb(s + 11, 11)).fill(Math.min(s, 15));
      emitPackedBinary(values, layerPath);
      assert.ok(fs.existsSync(layerPath), `layer-${s}.bin should exist`);
    }

    fs.rmSync(tmpDir, { recursive: true });
  });
});
