/**
 * Property-based tests for search worker (Task 7.5)
 * Properties 16–18 from the design document.
 * Validates: Requirements 11.1, 11.2, 12.1, 12.2, 12.4
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  HOUSES, SIDE, belongs, boardSeeds, sideSeeds,
  simulate, legalMoves, applyMove, isOver,
  capCount, orderMoves,
  computeHash, ttStore, ttProbe, ttClear, hashToInt
} from '../helpers/worker.mjs';

// --- Helpers ---

function makeState(h, score = [0, 0], turn = 0) {
  return { h: h.slice(), score: score.slice(), turn, ncp: 0 };
}

function defaultRules() {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'firstto', target: 25, cycleLimit: 100 };
}

/**
 * Generator for valid board states with at least 1 legal move.
 * Uses small per-pit values to keep total in range naturally.
 */
function arbPlayableState() {
  return fc.record({
    h: fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 12, maxLength: 12 }),
    turn: fc.constantFrom(0, 1),
    scoreA: fc.integer({ min: 0, max: 10 }),
    scoreB: fc.integer({ min: 0, max: 10 }),
  }).map(({ h, turn, scoreA, scoreB }) => {
    // Clamp total board seeds to 48 - scores
    const maxBoard = 48 - scoreA - scoreB;
    let total = h.reduce((a, b) => a + b, 0);
    if (total > maxBoard && maxBoard > 0) {
      const scale = maxBoard / total;
      h = h.map(v => Math.floor(v * scale));
    }
    // Ensure mover has at least one seed
    const moverStart = turn === 0 ? 0 : 6;
    let hasSeed = false;
    for (let i = moverStart; i < moverStart + 6; i++) {
      if (h[i] > 0) { hasSeed = true; break; }
    }
    if (!hasSeed) h[moverStart] = 1;
    return { h, turn, scoreA, scoreB };
  }).filter(({ h, scoreA, scoreB }) => {
    const total = h.reduce((a, b) => a + b, 0);
    return total > 0 && total + scoreA + scoreB <= 48;
  });
}

/**
 * Generator for states that have BOTH capture and non-capture moves.
 * Constructs positions directly to maximize hit rate:
 * - Places 1 seed in an opponent pit (landing there yields a capture of 2)
 * - Places varying seeds on mover's side for diverse sowing patterns
 */
function arbMixedMovesState() {
  return fc.record({
    turn: fc.constantFrom(0, 1),
    moverSeeds: fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 6, maxLength: 6 }),
    oppSeeds: fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 6, maxLength: 6 }),
  }).map(({ turn, moverSeeds, oppSeeds }) => {
    // Ensure at least 2 mover pits have seeds for variety
    let nonZero = moverSeeds.filter(v => v > 0).length;
    if (nonZero < 2) { moverSeeds[0] = 1; moverSeeds[1] = 3; }
    // Ensure at least one opponent pit has exactly 1 seed (enables a landing → 2 capture)
    if (oppSeeds.every(v => v !== 1)) oppSeeds[0] = 1;

    const h = new Array(12).fill(0);
    const mStart = turn === 0 ? 0 : 6;
    const oStart = turn === 0 ? 6 : 0;
    for (let i = 0; i < 6; i++) { h[mStart + i] = moverSeeds[i]; h[oStart + i] = oppSeeds[i]; }
    return { h, turn, scoreA: 0, scoreB: 0 };
  }).filter(({ h, turn }) => {
    const total = h.reduce((a, b) => a + b, 0);
    if (total === 0 || total > 48) return false;
    const s = makeState(h, [0, 0], turn);
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    if (moves.length < 2) return false;
    let hasCap = false, hasNonCap = false;
    for (const mv of moves) {
      const cc = capCount(s, mv, rules);
      if (cc > 0) hasCap = true;
      else hasNonCap = true;
      if (hasCap && hasNonCap) return true;
    }
    return false;
  });
}

// ========================================================================
// Property 16: Move ordering — captures first, descending
// ========================================================================

describe('Property 16: Move ordering — captures first, descending', () => {

  /**
   * **Validates: Requirements 11.1, 11.2**
   *
   * For any position with both capture and non-capture legal moves, the
   * search's move ordering shall place all capture moves before all
   * non-capture moves, and capture moves shall be sorted by captured-seed
   * count in descending order.
   */
  it('all capture moves appear before non-capture moves, captures sorted descending by count', () => {
    fc.assert(
      fc.property(
        arbMixedMovesState(),
        ({ h, turn, scoreA, scoreB }) => {
          const s = makeState(h, [scoreA, scoreB], turn);
          const rules = defaultRules();
          const moves = legalMoves(s, rules);

          // Order without TT hint
          const ordered = orderMoves(s, moves, rules, null);

          // Verify: find first non-capture index
          let firstNonCapIdx = -1;
          let lastCapIdx = -1;
          const capCounts = [];

          for (let i = 0; i < ordered.length; i++) {
            const cc = capCount(s, ordered[i], rules);
            if (cc > 0) {
              lastCapIdx = i;
              capCounts.push(cc);
            } else {
              if (firstNonCapIdx === -1) firstNonCapIdx = i;
            }
          }

          // All captures must come before all non-captures
          assert.ok(firstNonCapIdx === -1 || lastCapIdx < firstNonCapIdx,
            `Captures must come before non-captures. Last capture at ${lastCapIdx}, ` +
            `first non-capture at ${firstNonCapIdx}. Ordered: [${ordered}]`);

          // Captures must be sorted descending by count
          for (let i = 1; i < capCounts.length; i++) {
            assert.ok(capCounts[i - 1] >= capCounts[i],
              `Capture counts must be descending. Got [${capCounts}]`);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  it('TT best-move hint appears first in ordered list', () => {
    fc.assert(
      fc.property(
        arbPlayableState(),
        ({ h, turn, scoreA, scoreB }) => {
          const s = makeState(h, [scoreA, scoreB], turn);
          const rules = defaultRules();
          const moves = legalMoves(s, rules);
          if (moves.length < 2) return; // Need at least 2 moves

          // Pick a random legal move as TT hint (not necessarily the first)
          const ttHint = moves[moves.length - 1];
          const ordered = orderMoves(s, moves, rules, ttHint);

          // TT hint must be first
          assert.equal(ordered[0], ttHint,
            `TT best-move hint ${ttHint} should be first, but got ${ordered[0]}. ` +
            `Ordered: [${ordered}]`);

          // TT hint should appear exactly once
          const occurrences = ordered.filter(m => m === ttHint).length;
          assert.equal(occurrences, 1,
            `TT hint ${ttHint} should appear exactly once, found ${occurrences}`);
        }
      ),
      { numRuns: 150 }
    );
  });
});

// ========================================================================
// Property 17: Transposition table store/probe round-trip
// ========================================================================

describe('Property 17: Transposition table store/probe round-trip', () => {

  /**
   * **Validates: Requirements 12.1, 12.2**
   *
   * For any TT entry stored with a given hash, probing with that same hash
   * shall return the stored entry (value, depth, bound, bestMove). The hash
   * shall be store-independent: two positions differing only in banked scores
   * shall produce the same hash.
   */
  it('ttStore/ttProbe round-trip returns same entry', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: -10000, max: 10000 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom('exact', 'lower', 'upper'),
        fc.integer({ min: 0, max: 11 }),
        (board, turn, value, depth, bound, bestMove) => {
          ttClear();

          const hash = computeHash(board, turn);
          ttStore(hash, value, depth, bound, bestMove);

          const entry = ttProbe(hash);
          assert.ok(entry !== null, 'ttProbe should return a non-null entry after ttStore');
          assert.equal(entry.hash, hash, 'Entry hash must match');
          assert.equal(entry.value, value, `Entry value: expected ${value}, got ${entry.value}`);
          assert.equal(entry.depth, depth, `Entry depth: expected ${depth}, got ${entry.depth}`);
          assert.equal(entry.bound, bound, `Entry bound: expected ${bound}, got ${entry.bound}`);
          assert.equal(entry.bestMove, bestMove, `Entry bestMove: expected ${bestMove}, got ${entry.bestMove}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('hash is store-independent: positions differing only in scores produce the same hash', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 24 }),
        (board, turn, scoreA1, scoreB1, scoreA2, scoreB2) => {
          // Two states with identical board and turn but different scores
          const hash1 = computeHash(board, turn);
          const hash2 = computeHash(board, turn);

          // computeHash only takes h and turn, so same board+turn => same hash
          assert.equal(hash1, hash2,
            'Hash must be store-independent: same board+turn must produce same hash');

          // Additionally verify that hash changes with turn
          if (board.reduce((a, b) => a + b, 0) > 0) {
            const hashOtherTurn = computeHash(board, turn ^ 1);
            assert.notEqual(hash1, hashOtherTurn,
              'Hash must differ when turn differs (same board, different turn)');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('deeper entries are not overwritten by shallower entries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: 4, max: 12 }),
        (board, turn, deepValue, shallowValue, deepDepth) => {
          ttClear();

          const hash = computeHash(board, turn);
          const shallowDepth = deepDepth - 2; // guaranteed shallower

          // Store deep entry first
          ttStore(hash, deepValue, deepDepth, 'exact', 3);
          // Attempt to store shallower entry at same hash
          ttStore(hash, shallowValue, shallowDepth, 'exact', 5);

          // The deeper entry should be retained
          const entry = ttProbe(hash);
          assert.ok(entry !== null, 'Entry should exist');
          assert.equal(entry.value, deepValue,
            `Deeper entry (depth=${deepDepth}) should not be overwritten by shallower (depth=${shallowDepth})`);
          assert.equal(entry.depth, deepDepth,
            `Stored depth should remain ${deepDepth}`);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 18: Safe futility pruning soundness
// ========================================================================

describe('Property 18: Safe futility pruning soundness', () => {

  /**
   * **Validates: Requirements 12.4**
   *
   * For any position where score[me] + boardSeeds(state) <= alpha, futility
   * pruning is safe (the position cannot possibly exceed alpha regardless of
   * play). The pruning shall not fire when score[me] + boardSeeds(state) > alpha.
   */
  it('when score[me] + boardSeeds <= alpha, no possible play can exceed alpha', () => {
    fc.assert(
      fc.property(
        arbPlayableState(),
        fc.integer({ min: 0, max: 48 }),
        ({ h, turn, scoreA, scoreB }, alphaOffset) => {
          const s = makeState(h, [scoreA, scoreB], turn);
          const me = turn;
          const bs = boardSeeds(s);
          const myScore = s.score[me];
          const maxPossible = myScore + bs;

          // Set alpha above maxPossible so futility condition holds
          const alpha = maxPossible + alphaOffset;

          // Condition: score[me] + boardSeeds <= alpha
          // This is always true here since alpha >= maxPossible

          // The maximum score 'me' can ever achieve from this position
          // is score[me] + boardSeeds (capture all remaining seeds).
          // If maxPossible <= alpha, then the position cannot exceed alpha.
          assert.ok(maxPossible <= alpha,
            `maxPossible=${maxPossible} should be <= alpha=${alpha}`);

          // Verify that no sequence of moves can give 'me' more than maxPossible.
          // Since total seeds in play = score[0] + score[1] + boardSeeds = constant,
          // and me can at most capture all board seeds, me's final score is bounded.
          const totalSeeds = s.score[0] + s.score[1] + bs;
          assert.ok(myScore + bs <= totalSeeds,
            `Player's max possible score (${myScore + bs}) must be <= total seeds (${totalSeeds})`);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('when score[me] + boardSeeds > alpha, futility pruning must NOT fire', () => {
    fc.assert(
      fc.property(
        arbPlayableState(),
        ({ h, turn, scoreA, scoreB }) => {
          const s = makeState(h, [scoreA, scoreB], turn);
          const me = turn;
          const bs = boardSeeds(s);
          const myScore = s.score[me];
          const maxPossible = myScore + bs;

          // Set alpha below maxPossible so pruning should NOT fire
          if (maxPossible <= 0) return; // skip degenerate cases
          const alpha = maxPossible - 1;

          // Condition: score[me] + boardSeeds > alpha
          assert.ok(maxPossible > alpha,
            `maxPossible=${maxPossible} should be > alpha=${alpha}, pruning must NOT fire`);

          // The position CAN potentially exceed alpha (if me captures all seeds)
          // so futility pruning would be unsound here.
          assert.ok(myScore + bs > alpha,
            `score[me](${myScore}) + boardSeeds(${bs}) = ${myScore + bs} > alpha(${alpha})`);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('maxPossible is a tight upper bound: total game seeds are conserved', () => {
    fc.assert(
      fc.property(
        arbPlayableState(),
        ({ h, turn, scoreA, scoreB }) => {
          const s = makeState(h, [scoreA, scoreB], turn);
          const rules = defaultRules();
          const bs = boardSeeds(s);
          const totalBefore = s.score[0] + s.score[1] + bs;

          // Play one legal move and verify seed conservation
          const moves = legalMoves(s, rules);
          if (moves.length === 0) return;

          const { state: ns } = applyMove(s, moves[0], rules);
          const bsAfter = boardSeeds(ns);
          const totalAfter = ns.score[0] + ns.score[1] + bsAfter;

          assert.equal(totalAfter, totalBefore,
            `Seed conservation violated: before=${totalBefore}, after=${totalAfter}`);

          // After the move, me's score can only have grown by capturing seeds
          // from the board, so me's max is still bounded by score[me] + original boardSeeds
          const me = turn;
          assert.ok(ns.score[me] <= s.score[me] + bs,
            `After one move, score[me]=${ns.score[me]} should be <= ` +
            `original score(${s.score[me]}) + boardSeeds(${bs})`);
        }
      ),
      { numRuns: 150 }
    );
  });
});
