/**
 * Property-based test for DB probe (Task 9.3)
 * Property 13 from the design document.
 *
 * **Validates: Requirements 7.1**
 *
 * For any position within a loaded EDB layer, the DB probe
 * (canonicalise → rank → seek → read nibble) shall return the same value
 * as the builder stored for that position's canonical form.
 *
 * Strategy: Build the s=2 layer (only 78 positions) using the builder,
 * pack it into 4-bit binary, then for every position probe via the Worker's
 * DB probe pipeline and verify the value matches.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  comb, rank, unrank, canonicalise, buildLayer, emitPackedBinary
} from '../../tools/build-edb.mjs';

// ========================================================================
// Property 13: DB probe returns correct value for known positions
// ========================================================================

/**
 * Replicate the Worker's DB probe pipeline in pure JS for testing.
 * This mirrors the dbCanonicalise → dbRank → byte seek → nibble read logic.
 */
function workerDbCanonicalise(h, turn) {
  if (turn === 0) return h;
  return [h[6], h[7], h[8], h[9], h[10], h[11], h[0], h[1], h[2], h[3], h[4], h[5]];
}

function workerDbRank(h, s) {
  let idx = 0, cumulative = 0;
  for (let j = 0; j <= 10; j++) {
    cumulative += h[j];
    const b = cumulative + j;
    idx += comb(b, j + 1);
  }
  return idx;
}

function workerDbProbe(h, turn, packedLayer) {
  const canon = workerDbCanonicalise(h, turn);
  const s = h.reduce((a, b) => a + b, 0);
  const idx = workerDbRank(canon, s);
  const byteOffset = Math.floor(idx / 2);

  if (byteOffset >= packedLayer.length) return null;

  const byte = packedLayer[byteOffset];
  return (idx % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
}

describe('Property 13: DB probe returns correct value for known positions', () => {

  /**
   * **Validates: Requirements 7.1**
   *
   * Build the s=2 layer via the EDB builder, pack it to 4-bit binary,
   * then probe every canonical position (both turns) via the Worker's
   * probe pipeline and assert the result matches the builder's stored value.
   */
  it('probe returns builder value for all s=2 positions (both turns)', () => {
    const s = 2;
    const size = comb(s + 11, 11); // C(13, 11) = 78
    assert.equal(size, 78, 'Layer s=2 should have 78 positions');

    // Build the layer using the EDB builder
    const solvedLayers = new Map();
    solvedLayers.set(0, new Uint8Array(1).fill(0));
    solvedLayers.set(1, buildLayer(1, { capture: '23', grandslam: 'nocap', terminal: 'academic' }, new Map([[0, new Uint8Array(1).fill(0)]])));

    const values = buildLayer(s, { capture: '23', grandslam: 'nocap', terminal: 'academic' }, solvedLayers);
    assert.equal(values.length, size);

    // Pack into 4-bit binary (same format the Worker reads)
    const packed = new Uint8Array(Math.ceil(size / 2));
    for (let i = 0; i < size; i += 2) {
      const hi = values[i] & 0x0F;
      const lo = (i + 1 < size) ? (values[i + 1] & 0x0F) : 0;
      packed[i >> 1] = (hi << 4) | lo;
    }

    // For every position in the layer, probe with turn=0 (South-to-move)
    // The DB stores values from South's perspective, so turn=0 is the canonical case.
    for (let idx = 0; idx < size; idx++) {
      const h = unrank(idx, s);
      const probed = workerDbProbe(h, 0, packed);
      assert.equal(
        probed, values[idx],
        `Mismatch at idx=${idx} (turn=0): probe=${probed}, expected=${values[idx]}, h=${JSON.stringify(h)}`
      );
    }

    // Also test turn=1 (North-to-move): the probe should canonicalise (rotate)
    // and still return the correct value for the rotated position.
    for (let idx = 0; idx < size; idx++) {
      const h = unrank(idx, s);
      // Create a North-to-move position from this distribution.
      // The rotated (canonical) form is h[6..11]+h[0..5] which should be
      // looked up as a South-to-move position.
      const rotatedH = [...h.slice(6), ...h.slice(0, 6)];
      const { h: expectedCanon } = canonicalise(rotatedH, 1);
      const expectedIdx = rank(expectedCanon, s);
      const expectedVal = values[expectedIdx];

      const probed = workerDbProbe(rotatedH, 1, packed);
      assert.equal(
        probed, expectedVal,
        `Mismatch for rotated position at base idx=${idx} (turn=1): probe=${probed}, expected=${expectedVal}`
      );
    }
  });
});
