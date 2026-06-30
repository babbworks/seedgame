/**
 * Property-based tests for 4-bit packing round-trip (Task 4.5)
 * Property 12 from the design document.
 *
 * **Validates: Requirements 5.7**
 *
 * For any array of values in range 0–15, packing into the 4-bit binary format
 * and then unpacking shall produce the original array.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { emitPackedBinary, unpackBinary } from '../../tools/build-edb.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ========================================================================
// Property 12: 4-bit packing round-trip
// ========================================================================

describe('Property 12: 4-bit packing round-trip', () => {

  /**
   * **Validates: Requirements 5.7**
   *
   * For any array of nibble values (0–15), packing then unpacking
   * recovers the original values exactly.
   */
  it('emitPackedBinary then unpackBinary recovers original nibble array', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-pbt-'));
    const outPath = path.join(tmpDir, 'test.bin');

    try {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 15 }), { minLength: 0, maxLength: 200 }),
          (values) => {
            const input = new Uint8Array(values);
            emitPackedBinary(input, outPath);

            const packed = fs.readFileSync(outPath);

            // Packed size invariant: ceil(length / 2) bytes
            assert.equal(packed.length, Math.ceil(input.length / 2));

            const recovered = unpackBinary(packed, input.length);
            assert.deepEqual([...recovered], [...input]);
          }
        ),
        { numRuns: 50 }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
