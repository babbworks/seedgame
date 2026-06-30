/**
 * Property-based tests for rank/unrank and canonicalisation (Task 4.2)
 * Properties 10–11 from the design document.
 * Validates: Requirements 5.2, 5.3, 5.4
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { comb, rank, unrank, canonicalise } from '../../tools/build-edb.mjs';

// --- Generators ---

/**
 * Generate a valid board distribution: 12 non-negative integers summing to s.
 * Uses a Dirichlet-like approach for even coverage of the distribution space.
 */
function boardDistribution(s) {
  // Generate 12 values using a "breaks" approach:
  // pick 11 breakpoints in [0, s], sort them, and use differences as house values.
  if (s === 0) return fc.constant(new Array(12).fill(0));

  return fc.array(fc.integer({ min: 0, max: s }), { minLength: 11, maxLength: 11 })
    .map(breaks => {
      const sorted = [0, ...breaks.sort((a, b) => a - b), s];
      const h = new Array(12);
      for (let i = 0; i < 12; i++) {
        h[i] = sorted[i + 1] - sorted[i];
      }
      return h;
    });
}

/**
 * Generate a random total seed count in range [0, maxS].
 * (Kept for reference; individual tests inline this for clarity.)
 */

// ========================================================================
// Property 10: Rank/unrank round-trip
// ========================================================================

describe('Property 10: Rank/unrank round-trip', () => {

  /**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any valid board distribution h[0..11] with Σh = s,
   * unrank(rank(h, s), s) shall produce the original distribution h.
   */
  it('unrank(rank(h, s), s) === h for any valid distribution', () => {
    fc.assert(
      fc.property(
        // Use s in [0, 30] — covers realistic game range while keeping computation fast
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s).map(h => ({ h, s }))),
        ({ h, s }) => {
          const idx = rank(h, s);

          // rank must be within valid bounds [0, C(s+11, 11) - 1]
          const layerSize = comb(s + 11, 11);
          assert.ok(idx >= 0, `rank must be >= 0, got ${idx}`);
          assert.ok(idx < layerSize,
            `rank must be < C(${s}+11, 11) = ${layerSize}, got ${idx}`);

          // Round-trip: unrank must recover original distribution
          const recovered = unrank(idx, s);
          assert.deepEqual(recovered, h,
            `unrank(rank(h, ${s}), ${s}) failed.\n` +
            `  h = [${h}]\n  rank = ${idx}\n  recovered = [${recovered}]`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('rank produces unique indices for distinct distributions within same layer', () => {
    fc.assert(
      fc.property(
        // Pick a reasonable s so layer sizes stay manageable
        fc.integer({ min: 1, max: 10 }).chain(s =>
          fc.tuple(
            boardDistribution(s),
            boardDistribution(s)
          ).map(([h1, h2]) => ({ h1, h2, s }))
        ),
        ({ h1, h2, s }) => {
          // If they happen to be the same distribution, skip
          if (h1.every((v, i) => v === h2[i])) return;

          const r1 = rank(h1, s);
          const r2 = rank(h2, s);
          assert.notEqual(r1, r2,
            `Distinct distributions should have distinct ranks.\n` +
            `  h1 = [${h1}], rank = ${r1}\n  h2 = [${h2}], rank = ${r2}`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('unrank always produces a valid distribution (sum = s, all non-negative)', () => {
    fc.assert(
      fc.property(
        // Cap s at 20 so layer sizes stay within safe integer range for fc.integer
        fc.integer({ min: 0, max: 20 }).chain(s => {
          const layerSize = comb(s + 11, 11);
          return fc.integer({ min: 0, max: layerSize - 1 }).map(idx => ({ s, idx }));
        }),
        ({ s, idx }) => {
          const h = unrank(idx, s);

          // Must have exactly 12 elements
          assert.equal(h.length, 12, `unrank should produce 12-element array`);

          // All values must be non-negative integers
          for (let i = 0; i < 12; i++) {
            assert.ok(Number.isInteger(h[i]) && h[i] >= 0,
              `h[${i}] = ${h[i]} must be a non-negative integer`);
          }

          // Sum must equal s
          const sum = h.reduce((a, b) => a + b, 0);
          assert.equal(sum, s,
            `Sum of unrank(${idx}, ${s}) = ${sum}, expected ${s}`);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ========================================================================
// Property 11: Canonicalisation idempotence and symmetry
// ========================================================================

describe('Property 11: Canonicalisation idempotence and symmetry', () => {

  /**
   * **Validates: Requirements 5.4**
   *
   * (a) Canonicalising an already-canonical position returns the same position.
   */
  it('(a) canonicalising an already-canonical position (South-to-move) is idempotent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s)),
        (h) => {
          // A South-to-move position is already canonical
          const first = canonicalise(h, 0);
          assert.deepEqual(first.h, h,
            'South-to-move should return unchanged');
          assert.equal(first.rotated, false);

          // Canonicalising the result again (still South-to-move) should be identical
          const second = canonicalise(first.h, 0);
          assert.deepEqual(second.h, first.h,
            'Re-canonicalising a canonical position should be unchanged');
          assert.equal(second.rotated, false);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('(a) canonicalising a North-to-move result as South-to-move is idempotent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s)),
        (h) => {
          // After canonicalising North-to-move, we get a South-to-move canonical form
          const canon = canonicalise(h, 1);

          // Canonicalising the result as South-to-move should not change it
          const again = canonicalise(canon.h, 0);
          assert.deepEqual(again.h, canon.h,
            'Canonical result re-canonicalised as South should be unchanged');
          assert.equal(again.rotated, false);
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 5.4**
   *
   * (b) A position (h, North) and its 180°-rotated equivalent (rotate(h), South)
   *     produce the same canonical form and rank.
   */
  it('(b) (h, North) and (rotate(h), South) produce the same canonical form', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s).map(h => ({ h, s }))),
        ({ h, s }) => {
          // Position A: board h, North-to-move
          const canonA = canonicalise(h, 1);

          // Position B: manually rotated board, South-to-move
          const rotatedH = [...h.slice(6), ...h.slice(0, 6)];
          const canonB = canonicalise(rotatedH, 0);

          // Both should produce the same canonical distribution
          assert.deepEqual(canonA.h, canonB.h,
            `(h, North) and (rotate(h), South) should yield same canonical form.\n` +
            `  h = [${h}]\n  canonA = [${canonA.h}]\n  canonB = [${canonB.h}]`);

          // Both should produce the same rank
          const rankA = rank(canonA.h, s);
          const rankB = rank(canonB.h, s);
          assert.equal(rankA, rankB,
            `Canonical forms should have same rank: ${rankA} vs ${rankB}`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('(b) canonicalise(h, 1) equals the 180° rotation of h', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s)),
        (h) => {
          const canon = canonicalise(h, 1);
          const expectedRotation = [...h.slice(6), ...h.slice(0, 6)];
          assert.deepEqual(canon.h, expectedRotation,
            `canonicalise(h, 1) should swap h[0..5] with h[6..11]`);
          assert.equal(canon.rotated, true);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('double rotation is identity: canonicalise(canonicalise(h,1).h, 1).h === h', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }).chain(s => boardDistribution(s)),
        (h) => {
          const first = canonicalise(h, 1);
          const second = canonicalise(first.h, 1);
          assert.deepEqual(second.h, h,
            'Applying 180° rotation twice should return the original');
        }
      ),
      { numRuns: 500 }
    );
  });
});
