/**
 * Smoke tests for combinatorial rank/unrank and canonicalisation (Task 4.1)
 * Validates Requirements 5.2, 5.3, 5.4
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { comb, rank, unrank, canonicalise } from '../../tools/build-edb.mjs';

// ========================================================================
// comb() — binomial coefficient
// ========================================================================

describe('comb — binomial coefficient', () => {
  it('returns 1 for C(n, 0) and C(n, n)', () => {
    for (let n = 0; n <= 20; n++) {
      assert.equal(comb(n, 0), 1);
      assert.equal(comb(n, n), 1);
    }
  });

  it('returns 0 for k > n or k < 0', () => {
    assert.equal(comb(5, 6), 0);
    assert.equal(comb(3, -1), 0);
  });

  it('computes known values correctly', () => {
    assert.equal(comb(5, 2), 10);
    assert.equal(comb(10, 3), 120);
    assert.equal(comb(12, 6), 924);
    assert.equal(comb(20, 10), 184756);
    // C(s+11, 11) for s=2: C(13, 11) = C(13, 2) = 78
    assert.equal(comb(13, 11), 78);
    // C(s+11, 11) for s=48 (full board): C(59, 11) = 279871768995
    assert.equal(comb(59, 11), 279871768995);
  });

  it('obeys Pascal identity: C(n,k) = C(n-1,k-1) + C(n-1,k)', () => {
    for (let n = 2; n <= 15; n++) {
      for (let k = 1; k < n; k++) {
        assert.equal(comb(n, k), comb(n - 1, k - 1) + comb(n - 1, k));
      }
    }
  });
});

// ========================================================================
// rank/unrank — round-trip
// ========================================================================

describe('rank/unrank — round-trip', () => {
  it('round-trips for s=0 (all zeros)', () => {
    const h = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const idx = rank(h, 0);
    assert.equal(idx, 0);
    assert.deepEqual(unrank(idx, 0), h);
  });

  it('round-trips for s=1 (single seed in each position)', () => {
    for (let pos = 0; pos < 12; pos++) {
      const h = new Array(12).fill(0);
      h[pos] = 1;
      const idx = rank(h, 1);
      const recovered = unrank(idx, 1);
      assert.deepEqual(recovered, h, `failed for seed at position ${pos}`);
    }
  });

  it('round-trips for s=2 (all 78 distributions)', () => {
    const s = 2;
    const size = comb(s + 11, 11); // C(13, 11) = 78
    assert.equal(size, 78);

    const seen = new Set();
    for (let idx = 0; idx < size; idx++) {
      const h = unrank(idx, s);
      // Verify sum
      const sum = h.reduce((a, b) => a + b, 0);
      assert.equal(sum, s, `unrank(${idx}, ${s}) sum mismatch`);
      // Verify round-trip
      const reranked = rank(h, s);
      assert.equal(reranked, idx, `rank(unrank(${idx}, ${s})) !== ${idx}`);
      // Verify uniqueness
      const key = h.join(',');
      assert.ok(!seen.has(key), `duplicate distribution at idx=${idx}`);
      seen.add(key);
    }
  });

  it('round-trips for s=4 (starting position layer)', () => {
    // The standard starting position: 4 seeds in each house
    const startH = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const idx = rank(startH, 48);
    const recovered = unrank(idx, 48);
    assert.deepEqual(recovered, startH);
  });

  it('round-trips for various hand-picked distributions', () => {
    const cases = [
      { h: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], s: 5 },
      { h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5], s: 5 },
      { h: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], s: 5 },
      { h: [0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 0], s: 15 },
      { h: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], s: 12 },
      { h: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 1, 1], s: 48 },
    ];
    for (const { h, s } of cases) {
      const idx = rank(h, s);
      const recovered = unrank(idx, s);
      assert.deepEqual(recovered, h, `failed for h=${JSON.stringify(h)}`);
    }
  });

  it('ranks are unique within a layer (s=3, exhaustive)', () => {
    const s = 3;
    const size = comb(s + 11, 11); // C(14, 11) = 364
    const ranks = new Set();
    for (let idx = 0; idx < size; idx++) {
      const h = unrank(idx, s);
      const r = rank(h, s);
      assert.ok(!ranks.has(r), `duplicate rank ${r}`);
      ranks.add(r);
    }
    assert.equal(ranks.size, size);
  });

  it('rank is bounded by layer size', () => {
    const cases = [
      { s: 0, expected: 1 },
      { s: 1, expected: 12 },
      { s: 2, expected: 78 },
      { s: 3, expected: 364 },
      { s: 5, expected: comb(16, 11) },
    ];
    for (const { s, expected } of cases) {
      assert.equal(comb(s + 11, 11), expected);
      // Check that max rank is size - 1
      const maxH = new Array(12).fill(0);
      maxH[11] = s; // all seeds in last house should give highest rank
      const maxRank = rank(maxH, s);
      assert.ok(maxRank < expected, `max rank ${maxRank} >= size ${expected} for s=${s}`);
    }
  });
});

// ========================================================================
// canonicalise
// ========================================================================

describe('canonicalise — 180° rotation', () => {
  it('returns unchanged for South-to-move (turn=0)', () => {
    const h = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = canonicalise(h, 0);
    assert.deepEqual(result.h, h);
    assert.equal(result.rotated, false);
  });

  it('rotates for North-to-move (turn=1)', () => {
    const h = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const result = canonicalise(h, 1);
    // Swap h[0..5] with h[6..11]
    assert.deepEqual(result.h, [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
    assert.equal(result.rotated, true);
  });

  it('double rotation returns original', () => {
    const h = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const first = canonicalise(h, 1);
    // Manually apply rotation again (simulating North-to-move on rotated)
    const second = canonicalise(first.h, 1);
    assert.deepEqual(second.h, h);
  });

  it('symmetric position is invariant under rotation', () => {
    const h = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    const result = canonicalise(h, 1);
    assert.deepEqual(result.h, h);
  });

  it('North-to-move and rotated South-to-move produce same rank', () => {
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0];
    const s = h.reduce((a, b) => a + b, 0); // 55... let's use a valid one
    // Position as seen by North: h, turn=1
    const canon1 = canonicalise(h, 1);
    // Position as seen by South after rotation
    const rotH = [...h.slice(6), ...h.slice(0, 6)];
    const canon2 = canonicalise(rotH, 0);
    // Both should produce the same distribution for ranking
    assert.deepEqual(canon1.h, rotH);
    assert.deepEqual(canon2.h, rotH);
    assert.equal(rank(canon1.h, s), rank(canon2.h, s));
  });
});
