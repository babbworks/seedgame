/**
 * Property-based tests for evaluation (Task 6.3)
 * Properties 14–15 from the design document.
 * Validates: Requirements 10.1, 10.3
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  HOUSES, SIDE, belongs,
  extractFeatures, evalDecisionTree, EVAL_TREE
} from '../helpers/engine.mjs';

// --- Helpers ---

function makeState(h, score = [0, 0], turn = 0) {
  return { h: h.slice(), score: score.slice(), turn, ncp: 0, hashHistory: new Set() };
}

function defaultRules() {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'firstto', target: 25, cycleLimit: 100 };
}

/**
 * Generator for valid board distributions.
 * Uses a smart approach: pick total seeds budget, then distribute across pits.
 */
function arbBoardState() {
  return fc.record({
    scoreMe: fc.nat(20),
    scoreOpp: fc.nat(20),
    me: fc.constantFrom(0, 1),
  }).chain(({ scoreMe, scoreOpp, me }) => {
    const maxBoard = 48 - scoreMe - scoreOpp;
    if (maxBoard <= 0) {
      // Force at least 1 seed on board
      return fc.constant({ h: [1,0,0,0,0,0,0,0,0,0,0,0], scoreMe: 0, scoreOpp: 0, me });
    }
    // Generate board total from 1..maxBoard, then distribute
    return fc.integer({ min: 1, max: Math.min(maxBoard, 48) }).chain(boardTotal => {
      // Distribute boardTotal seeds across 12 pits
      return fc.array(fc.nat(Math.min(boardTotal, 15)), { minLength: 12, maxLength: 12 })
        .map(raw => {
          // Normalize to sum to boardTotal
          const sum = raw.reduce((a, b) => a + b, 0);
          if (sum === 0) {
            const h = new Array(12).fill(0);
            h[0] = boardTotal;
            return { h, scoreMe, scoreOpp, me };
          }
          const h = raw.map(v => Math.floor(v * boardTotal / sum));
          // Fix rounding to hit exact total
          let diff = boardTotal - h.reduce((a, b) => a + b, 0);
          for (let i = 0; diff > 0; i = (i + 1) % 12) { h[i]++; diff--; }
          return { h, scoreMe, scoreOpp, me };
        });
    });
  });
}

// ========================================================================
// Property 14: Feature extraction correctness
// ========================================================================

describe('Property 14: Feature extraction correctness', () => {

  /**
   * **Validates: Requirements 10.1**
   *
   * For any board state, `oppEmptyPits` shall equal the count of zero-valued
   * houses on the opponent's side, `ownEmptyPits` shall equal the count on
   * the own side, `reach` shall equal the count of own houses with enough
   * seeds to reach opponent territory, and `krooCount` shall equal the count
   * of own houses with more than 12 seeds.
   */
  it('oppEmptyPits equals count of zero-valued houses on opponent side', () => {
    fc.assert(
      fc.property(
        arbBoardState(),
        ({ h, scoreMe, scoreOpp, me }) => {
          const opp = me ^ 1;
          const score = me === 0 ? [scoreMe, scoreOpp] : [scoreOpp, scoreMe];
          const s = makeState(h, score);

          const features = extractFeatures(s, me);

          // Independent calculation: count zeros on opponent's side
          let expected = 0;
          for (let i = 0; i < HOUSES; i++) {
            if (belongs(i, opp) && h[i] === 0) expected++;
          }
          assert.equal(features.oppEmptyPits, expected,
            `oppEmptyPits: expected ${expected}, got ${features.oppEmptyPits} for h=[${h}], me=${me}`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('ownEmptyPits equals count of zero-valued houses on own side', () => {
    fc.assert(
      fc.property(
        arbBoardState(),
        ({ h, scoreMe, scoreOpp, me }) => {
          const score = me === 0 ? [scoreMe, scoreOpp] : [scoreOpp, scoreMe];
          const s = makeState(h, score);

          const features = extractFeatures(s, me);

          // Independent calculation: count zeros on own side
          let expected = 0;
          for (let i = 0; i < HOUSES; i++) {
            if (belongs(i, me) && h[i] === 0) expected++;
          }
          assert.equal(features.ownEmptyPits, expected,
            `ownEmptyPits: expected ${expected}, got ${features.ownEmptyPits} for h=[${h}], me=${me}`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('reach equals count of own pits with enough seeds to reach opponent territory', () => {
    fc.assert(
      fc.property(
        arbBoardState(),
        ({ h, scoreMe, scoreOpp, me }) => {
          const score = me === 0 ? [scoreMe, scoreOpp] : [scoreOpp, scoreMe];
          const s = makeState(h, score);

          const features = extractFeatures(s, me);

          // Independent calculation of reach:
          // Player 0 (South): pit i (0..5) needs h[i] >= (6 - i) to reach pit 6+
          // Player 1 (North): pit i (6..11) needs h[i] >= (12 - i) to reach pit 0+
          let expected = 0;
          for (let i = 0; i < HOUSES; i++) {
            if (!belongs(i, me)) continue;
            if (h[i] === 0) continue;
            const threshold = me === 0 ? (SIDE - i) : (HOUSES - i);
            if (h[i] >= threshold) expected++;
          }
          assert.equal(features.reach, expected,
            `reach: expected ${expected}, got ${features.reach} for h=[${h}], me=${me}`);
        }
      ),
      { numRuns: 500 }
    );
  });

  it('krooCount equals count of own pits with more than 12 seeds', () => {
    fc.assert(
      fc.property(
        arbBoardState(),
        ({ h, scoreMe, scoreOpp, me }) => {
          const score = me === 0 ? [scoreMe, scoreOpp] : [scoreOpp, scoreMe];
          const s = makeState(h, score);

          const features = extractFeatures(s, me);

          // Independent calculation: count own pits with h[i] > 12
          let expected = 0;
          for (let i = 0; i < HOUSES; i++) {
            if (belongs(i, me) && h[i] > 12) expected++;
          }
          assert.equal(features.krooCount, expected,
            `krooCount: expected ${expected}, got ${features.krooCount} for h=[${h}], me=${me}`);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ========================================================================
// Property 15: Evaluation formula correctness
// ========================================================================

describe('Property 15: Evaluation formula correctness', () => {

  /**
   * **Validates: Requirements 10.3**
   *
   * For any position classified to a decision-tree leaf with (μ, σ), the
   * evaluation score shall equal round(((μ + material) / σ) * 100) where
   * material = score[me] - score[opp].
   */
  it('evalDecisionTree equals round(((mu + material) / sigma) * 100) for the reached leaf', () => {
    fc.assert(
      fc.property(
        arbBoardState(),
        ({ h, scoreMe, scoreOpp, me }) => {
          const score = me === 0 ? [scoreMe, scoreOpp] : [scoreOpp, scoreMe];
          const s = makeState(h, score);
          const rules = defaultRules();

          const actual = evalDecisionTree(s, rules, me);

          // Independent tree traversal to find the leaf
          const features = extractFeatures(s, me);
          let node = EVAL_TREE;
          while (node.feature) {
            node = features[node.feature] < node.threshold ? node.left : node.right;
          }

          // At the leaf, compute expected value
          const material = score[me] - score[me ^ 1];
          const expected = Math.round(((node.mu + material) / node.sigma) * 100);

          assert.equal(actual, expected,
            `evalDecisionTree: expected ${expected}, got ${actual} ` +
            `for leaf(mu=${node.mu}, sigma=${node.sigma}), material=${material}`);
        }
      ),
      { numRuns: 500 }
    );
  });
});
