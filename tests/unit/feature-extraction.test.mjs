/**
 * Unit tests for feature extraction (Task 6.1)
 * Tests: countEmpty, countReach, countKroo, extractFeatures
 * Validates: Requirements 10.1
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUSES, SIDE, belongs,
  countEmpty, countReach, countKroo, extractFeatures
} from '../helpers/engine.mjs';

function makeState(h, score = [0, 0], turn = 0) {
  return { h: h.slice(), score: score.slice(), turn, ncp: 0, hashHistory: new Set() };
}

// ========================================================================
// countEmpty
// ========================================================================

describe('countEmpty', () => {
  it('counts zero-valued pits on a player side', () => {
    const h = [0, 4, 0, 3, 0, 2, 1, 0, 5, 0, 0, 3];
    const s = makeState(h);
    // Player 0 (South, pits 0-5): pits 0, 2, 4 are empty → 3
    assert.equal(countEmpty(s, 0), 3);
    // Player 1 (North, pits 6-11): pits 7, 9, 10 are empty → 3
    assert.equal(countEmpty(s, 1), 3);
  });

  it('returns 0 when no pits are empty', () => {
    const h = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const s = makeState(h);
    assert.equal(countEmpty(s, 0), 0);
    assert.equal(countEmpty(s, 1), 0);
  });

  it('returns 6 when all pits on a side are empty', () => {
    const h = [0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4];
    const s = makeState(h);
    assert.equal(countEmpty(s, 0), 6);
    assert.equal(countEmpty(s, 1), 0);
  });
});

// ========================================================================
// countReach
// ========================================================================

describe('countReach', () => {
  it('player 0: pit i needs h[i] >= (6 - i) to reach opponent territory', () => {
    // Player 0 pits: 0,1,2,3,4,5
    // Thresholds: pit 0 needs 6, pit 1 needs 5, pit 2 needs 4, pit 3 needs 3, pit 4 needs 2, pit 5 needs 1
    const h = [6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    // All pits meet their exact threshold → all 6 reach
    assert.equal(countReach(s, 0), 6);
  });

  it('player 0: pits below threshold do not reach', () => {
    // Each pit has 1 less than threshold
    const h = [5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    // Pit 0: 5 < 6 (no), pit 1: 4 < 5 (no), pit 2: 3 < 4 (no),
    // pit 3: 2 < 3 (no), pit 4: 1 < 2 (no), pit 5: 0 (no)
    assert.equal(countReach(s, 0), 0);
  });

  it('player 1: pit i needs h[i] >= (12 - i) to reach opponent territory', () => {
    // Player 1 pits: 6,7,8,9,10,11
    // Thresholds: pit 6 needs 6, pit 7 needs 5, pit 8 needs 4, pit 9 needs 3, pit 10 needs 2, pit 11 needs 1
    const h = [0, 0, 0, 0, 0, 0, 6, 5, 4, 3, 2, 1];
    const s = makeState(h);
    assert.equal(countReach(s, 1), 6);
  });

  it('player 1: pits below threshold do not reach', () => {
    const h = [0, 0, 0, 0, 0, 0, 5, 4, 3, 2, 1, 0];
    const s = makeState(h);
    assert.equal(countReach(s, 1), 0);
  });

  it('mixed: some pits reach, some do not', () => {
    // Player 0: pit 0 needs 6 (has 7 ✓), pit 1 needs 5 (has 3 ✗),
    //           pit 2 needs 4 (has 4 ✓), pit 3 needs 3 (has 0 ✗),
    //           pit 4 needs 2 (has 2 ✓), pit 5 needs 1 (has 0 ✗)
    const h = [7, 3, 4, 0, 2, 0, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    assert.equal(countReach(s, 0), 3);
  });

  it('empty pits do not count as reaching', () => {
    const h = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    assert.equal(countReach(s, 0), 0);
    assert.equal(countReach(s, 1), 0);
  });
});

// ========================================================================
// countKroo
// ========================================================================

describe('countKroo', () => {
  it('counts pits with more than 12 seeds', () => {
    const h = [13, 12, 14, 1, 0, 48, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    // Player 0: pit 0 (13>12 ✓), pit 1 (12 not >12 ✗), pit 2 (14>12 ✓), pit 5 (48>12 ✓) → 3
    assert.equal(countKroo(s, 0), 3);
  });

  it('returns 0 when no pits exceed 12', () => {
    const h = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const s = makeState(h);
    assert.equal(countKroo(s, 0), 0);
    assert.equal(countKroo(s, 1), 0);
  });

  it('exactly 12 does NOT count as kroo', () => {
    const h = [12, 12, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0];
    const s = makeState(h);
    assert.equal(countKroo(s, 0), 0);
  });

  it('counts kroo for player 1 on their side', () => {
    const h = [0, 0, 0, 0, 0, 0, 15, 13, 20, 0, 0, 0];
    const s = makeState(h);
    assert.equal(countKroo(s, 1), 3);
    assert.equal(countKroo(s, 0), 0);
  });
});

// ========================================================================
// extractFeatures
// ========================================================================

describe('extractFeatures', () => {
  it('computes all features correctly for a known position', () => {
    //                 pit: 0  1  2  3  4  5  6  7  8  9 10 11
    const h =             [7, 0, 4, 0, 2, 0, 0, 5, 0, 3, 0, 1];
    const s = makeState(h, [10, 8]);

    const f = extractFeatures(s, 0);

    // material: score[0] - score[1] = 10 - 8 = 2
    assert.equal(f.material, 2);

    // oppEmptyPits: player 1's side (pits 6-11), empty: pit 6, 8, 10 → 3
    assert.equal(f.oppEmptyPits, 3);

    // ownEmptyPits: player 0's side (pits 0-5), empty: pit 1, 3, 5 → 3
    assert.equal(f.ownEmptyPits, 3);

    // reach for player 0:
    // pit 0: 7 >= 6 ✓, pit 1: 0 (skip), pit 2: 4 >= 4 ✓, pit 3: 0 (skip),
    // pit 4: 2 >= 2 ✓, pit 5: 0 (skip) → 3
    assert.equal(f.reach, 3);

    // krooCount for player 0: no pit > 12 → 0
    assert.equal(f.krooCount, 0);
  });

  it('computes features for player 1 perspective', () => {
    const h = [0, 0, 0, 0, 0, 0, 6, 0, 15, 3, 2, 1];
    const s = makeState(h, [5, 12]);

    const f = extractFeatures(s, 1);

    // material: score[1] - score[0] = 12 - 5 = 7
    assert.equal(f.material, 7);

    // oppEmptyPits: player 0's side (pits 0-5), all empty → 6
    assert.equal(f.oppEmptyPits, 6);

    // ownEmptyPits: player 1's side (pits 6-11), pit 7 empty → 1
    assert.equal(f.ownEmptyPits, 1);

    // reach for player 1:
    // pit 6: 6 >= 6 ✓, pit 7: 0 (skip), pit 8: 15 >= 4 ✓,
    // pit 9: 3 >= 3 ✓, pit 10: 2 >= 2 ✓, pit 11: 1 >= 1 ✓ → 5
    assert.equal(f.reach, 5);

    // krooCount: pit 8 (15 > 12) → 1
    assert.equal(f.krooCount, 1);
  });

  it('starting position features for player 0', () => {
    const h = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const s = makeState(h, [0, 0]);

    const f = extractFeatures(s, 0);

    assert.equal(f.material, 0);
    assert.equal(f.oppEmptyPits, 0);
    assert.equal(f.ownEmptyPits, 0);
    // Reach: pit 0: 4 < 6 (no), pit 1: 4 < 5 (no), pit 2: 4 >= 4 ✓,
    //        pit 3: 4 >= 3 ✓, pit 4: 4 >= 2 ✓, pit 5: 4 >= 1 ✓ → 4
    assert.equal(f.reach, 4);
    assert.equal(f.krooCount, 0);
  });
});
