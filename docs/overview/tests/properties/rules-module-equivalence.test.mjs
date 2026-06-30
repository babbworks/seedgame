/**
 * Property 9: Rules Module equivalence (Task 3.2)
 *
 * For any valid (state, house, rules) triple, simulate(state, house, rules)
 * from the Rules Module (tools/oware-rules.mjs) shall produce identical output
 * to the corresponding logic in index.html.
 *
 * Also tests applyMove, legalMoves, and isOver for equivalence.
 *
 * **Validates: Requirements 4.2, 4.4**
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

// Import from the Rules Module (tools/oware-rules.mjs)
import * as rulesMod from '../../tools/oware-rules.mjs';

// Import from index.html engine (via helper)
import * as htmlEngine from '../helpers/engine.mjs';

// --- Generators ---

/**
 * Generate a random valid board: 12 houses summing to at most 48,
 * with valid scores such that total seeds + scores <= 48.
 */
const arbBoard = fc.array(fc.nat(12), { minLength: 12, maxLength: 12 }).map(arr => {
  // Clamp total to <=48
  const raw = arr.slice();
  let sum = raw.reduce((a, b) => a + b, 0);
  if (sum > 48) {
    const factor = 48 / sum;
    for (let i = 0; i < 12; i++) raw[i] = Math.floor(raw[i] * factor);
    sum = raw.reduce((a, b) => a + b, 0);
    // Distribute remainder
    let diff = 48 - sum;
    // Actually, just cap at 48 by reducing
    while (sum > 48) { raw[sum % 12]--; sum--; }
  }
  return raw;
});

const arbTurn = fc.constantFrom(0, 1);

const arbCapture = fc.constantFrom('23', '34');
const arbGrandslam = fc.constantFrom('nocap', 'forbid', 'oppkeeps', 'leavelast');
const arbTerminal = fc.constantFrom('academic', 'ownrow');
const arbEndMode = fc.constantFrom('firstto', 'allcap');
const arbCycleLimit = fc.constantFrom(20, 50, 100, 200, 0);

const arbRules = fc.record({
  capture: arbCapture,
  grandslam: arbGrandslam,
  terminal: arbTerminal,
  endMode: arbEndMode,
  target: fc.constant(25),
  cycleLimit: arbCycleLimit
});

/**
 * Generate a valid game state: board with seeds, valid scores,
 * turn, ncp, and a hashHistory.
 */
const arbState = fc.tuple(arbBoard, arbTurn, fc.nat(20), fc.nat(20), fc.nat(100)).map(
  ([h, turn, scoreS, scoreN, ncp]) => {
    const boardSum = h.reduce((a, b) => a + b, 0);
    // Ensure total seeds + scores <= 48
    const maxScores = 48 - boardSum;
    const adjScoreS = Math.min(scoreS, maxScores);
    const adjScoreN = Math.min(scoreN, Math.max(0, maxScores - adjScoreS));
    return {
      h: h.slice(),
      score: [adjScoreS, adjScoreN],
      turn,
      ncp: Math.min(ncp, 200),
      hashHistory: new Set()
    };
  }
);

/**
 * Generate a state that has at least one legal move for the current player.
 * We filter for states where the mover's side has at least one non-zero house.
 */
const arbStateWithMoves = arbState.filter(s => {
  const start = s.turn === 0 ? 0 : 6;
  for (let i = start; i < start + 6; i++) {
    if (s.h[i] > 0) return true;
  }
  return false;
});

// --- Comparison Utilities ---

function statesEqual(a, b, label) {
  assert.deepEqual(a.h, b.h, `${label}: h arrays differ`);
  assert.deepEqual(a.score, b.score, `${label}: scores differ`);
  assert.equal(a.turn, b.turn, `${label}: turn differs`);
  assert.equal(a.ncp, b.ncp, `${label}: ncp differs`);
}

function simResultsEqual(modRes, htmlRes, label) {
  if (modRes === null && htmlRes === null) return;
  if (modRes === null || htmlRes === null) {
    assert.fail(`${label}: one result is null, other is not. mod=${modRes}, html=${htmlRes}`);
  }
  statesEqual(modRes.out, htmlRes.out, `${label}.out`);
  assert.equal(modRes.res.landing, htmlRes.res.landing, `${label}: landing differs`);
  assert.equal(modRes.res.captured, htmlRes.res.captured, `${label}: captured differs`);
  assert.equal(modRes.res.grandSlam, htmlRes.res.grandSlam, `${label}: grandSlam differs`);
}

// --- Build state objects for each engine ---

function makeModState(s) {
  return {
    h: s.h.slice(),
    score: s.score.slice(),
    turn: s.turn,
    ncp: s.ncp,
    hashHistory: new Set(s.hashHistory || [])
  };
}

function makeHtmlState(s) {
  return {
    h: s.h.slice(),
    score: s.score.slice(),
    turn: s.turn,
    ncp: s.ncp,
    hashHistory: new Set(s.hashHistory || [])
  };
}

// ========================================================================
// Property 9: Rules Module equivalence — simulate
// ========================================================================

describe('Property 9: Rules Module equivalence', () => {

  /**
   * **Validates: Requirements 4.2**
   *
   * For any valid (state, house, rules) triple, simulate() from the Rules
   * Module shall produce identical output to simulate() from index.html.
   */
  it('simulate produces identical output between module and index.html', () => {
    fc.assert(
      fc.property(
        arbStateWithMoves,
        arbRules,
        fc.integer({ min: 0, max: 11 }),
        (state, rules, house) => {
          const modState = makeModState(state);
          const htmlState = makeHtmlState(state);

          const modResult = rulesMod.simulate(modState, house, rules);
          const htmlResult = htmlEngine.simulate(htmlState, house, rules);

          simResultsEqual(modResult, htmlResult, `simulate(house=${house})`);
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 4.2**
   *
   * For any valid (state, legalHouse, rules) triple, applyMove() from the
   * Rules Module shall produce identical output to applyMove() from index.html.
   */
  it('applyMove produces identical output between module and index.html', () => {
    fc.assert(
      fc.property(
        arbStateWithMoves,
        arbRules,
        (state, rules) => {
          const modState = makeModState(state);
          const htmlState = makeHtmlState(state);

          // Get legal moves from each (should be same — tested below)
          const modMoves = rulesMod.legalMoves(modState, rules);
          if (modMoves.length === 0) return; // skip if no legal moves

          // Test applyMove for each legal move
          for (const move of modMoves) {
            const ms = makeModState(state);
            const hs = makeHtmlState(state);

            const modResult = rulesMod.applyMove(ms, move, rules);
            const htmlResult = htmlEngine.applyMove(hs, move, rules);

            statesEqual(modResult.state, htmlResult.state, `applyMove(house=${move}).state`);
            assert.equal(modResult.info.landing, htmlResult.info.landing, `applyMove(house=${move}).info.landing`);
            assert.equal(modResult.info.captured, htmlResult.info.captured, `applyMove(house=${move}).info.captured`);
            assert.equal(modResult.info.grandSlam, htmlResult.info.grandSlam, `applyMove(house=${move}).info.grandSlam`);
          }
        }
      ),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 4.2, 4.4**
   *
   * For any valid (state, rules), legalMoves() from the Rules Module
   * shall produce the same set of legal moves as legalMoves() from index.html.
   */
  it('legalMoves produces identical output between module and index.html', () => {
    fc.assert(
      fc.property(
        arbState,
        arbRules,
        (state, rules) => {
          const modState = makeModState(state);
          const htmlState = makeHtmlState(state);

          const modMoves = rulesMod.legalMoves(modState, rules);
          const htmlMoves = htmlEngine.legalMoves(htmlState, rules);

          assert.deepEqual(
            modMoves.sort(),
            htmlMoves.sort(),
            `legalMoves differ: mod=[${modMoves}], html=[${htmlMoves}]`
          );
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 4.4**
   *
   * For any valid (state, rules), isOver() from the Rules Module shall produce
   * identical output to isOver() from index.html.
   */
  it('isOver produces identical output between module and index.html', () => {
    fc.assert(
      fc.property(
        arbState,
        arbRules,
        (state, rules) => {
          const modState = makeModState(state);
          const htmlState = makeHtmlState(state);

          const modResult = rulesMod.isOver(modState, rules);
          const htmlResult = htmlEngine.isOver(htmlState, rules);

          assert.equal(modResult.over, htmlResult.over,
            `isOver.over differs: mod=${modResult.over}, html=${htmlResult.over}`);
          assert.deepEqual(modResult.score, htmlResult.score,
            `isOver.score differs: mod=[${modResult.score}], html=[${htmlResult.score}]`);
          assert.equal(modResult.outcome, htmlResult.outcome,
            `isOver.outcome differs: mod=${modResult.outcome}, html=${htmlResult.outcome}`);
        }
      ),
      { numRuns: 500 }
    );
  });
});
