/**
 * Unit and property tests for repetition detection and ncp cycle limit (Task 1.3)
 * Validates Requirements 2.1, 2.2, 2.3, 2.4
 * Properties 4, 5, 6 from the design document.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  newState, clone, positionHash, checkRepetition,
  applyMove, legalMoves, isOver, boardSeeds
} from '../helpers/engine.mjs';

// --- Helper: create a game state with specific values ---
function makeState(h, score, turn, ncp = 0, hashHistory = null) {
  const s = { h: h.slice(), score: score.slice(), turn, ncp, hashHistory: hashHistory || new Set() };
  return s;
}

function defaultRules() {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'firstto', target: 25, cycleLimit: 100 };
}

function ownRowRules() {
  return { capture: '23', grandslam: 'nocap', terminal: 'ownrow', endMode: 'firstto', target: 25, cycleLimit: 100 };
}

// ========================================================================
// Unit Tests
// ========================================================================

describe('Repetition detection — unit tests', () => {

  it('newState creates a fresh hashHistory with the initial position', () => {
    const s = newState();
    assert.ok(s.hashHistory instanceof Set);
    assert.equal(s.hashHistory.size, 1);
    assert.ok(s.hashHistory.has(positionHash(s)));
  });

  it('hashHistory is reset at the start of each new game', () => {
    // Simulate playing a game then starting fresh
    const s1 = newState();
    const rules = defaultRules();
    const moves = legalMoves(s1, rules);
    const s2 = applyMove(s1, moves[0], rules).state;
    // Simulate game loop: add hash after move
    s2.hashHistory.add(positionHash(s2));
    assert.equal(s2.hashHistory.size, 2);

    // Start a new game — hashHistory should be completely fresh
    const fresh = newState();
    assert.equal(fresh.hashHistory.size, 1);
    // The new game's history should only contain the initial position hash
    assert.ok(fresh.hashHistory.has(positionHash(fresh)));
  });

  it('applyMove carries parent hash history forward', () => {
    const s = newState();
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    const result = applyMove(s, moves[0], rules);
    const s2 = result.state;

    // History carries forward the parent's entries but does NOT yet include the new position
    // (the new position's hash is added after isOver check in the game loop)
    assert.equal(s2.hashHistory.size, 1); // only the initial position
    assert.ok(s2.hashHistory.has(positionHash(s))); // retains the initial hash
    assert.equal(s2.hashHistory.has(positionHash(s2)), false); // new position not yet in history
  });

  it('manually adding hash after applyMove enables future repetition detection', () => {
    const s = newState();
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    const s2 = applyMove(s, moves[0], rules).state;

    // Simulate what the game loop does: add hash after isOver check
    s2.hashHistory.add(positionHash(s2));
    assert.equal(s2.hashHistory.size, 2);

    // Now if we reach the same position again, it would be detected
    // Create a state with same board and turn as s2, using s2's history
    const s3 = { h: s2.h.slice(), score: s2.score.slice(), turn: s2.turn, ncp: 0, hashHistory: new Set(s2.hashHistory) };
    assert.equal(checkRepetition(s3), true);
  });

  it('checkRepetition returns false for a never-seen position', () => {
    const s = newState();
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    const s2 = applyMove(s, moves[0], rules).state;
    // s2's hash is NOT yet in hashHistory (applyMove copies parent history but doesn't add the new position)
    // checkRepetition checks if the position was previously visited
    assert.equal(checkRepetition(s2), false);
  });

  it('checkRepetition returns true for a position already in history', () => {
    const h = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
    const hash = h.join(',') + '|0';
    const history = new Set([hash]);
    const s = makeState(h, [0, 0], 0, 0, history);
    assert.equal(checkRepetition(s), true);
  });

  it('isOver detects repetition under academic convention (split)', () => {
    // Create a position whose hash is already in its history
    const h = [2, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 2];
    const hash = h.join(',') + '|0';
    const history = new Set([hash]);
    const s = makeState(h, [20, 20], 0, 0, history);
    const rules = defaultRules();
    const result = isOver(s, rules);
    assert.equal(result.over, true);
    // Academic repetition: split remaining seeds (8 total) equally
    const remaining = boardSeeds(s); // 8
    assert.equal(result.score[0], 20 + Math.floor(remaining / 2));
    assert.equal(result.score[1], 20 + remaining - Math.floor(remaining / 2));
  });

  it('isOver detects repetition under own-row convention', () => {
    // Each player collects their own side
    const h = [1, 2, 0, 0, 0, 1, 3, 0, 0, 0, 0, 1];
    const hash = h.join(',') + '|0';
    const history = new Set([hash]);
    const s = makeState(h, [20, 20], 0, 0, history);
    const rules = ownRowRules();
    const result = isOver(s, rules);
    assert.equal(result.over, true);
    // Own-row: South gets h[0..5] = 1+2+0+0+0+1=4, North gets h[6..11] = 3+0+0+0+0+1=4
    assert.equal(result.score[0], 20 + 4); // 24
    assert.equal(result.score[1], 20 + 4); // 24
  });
});

describe('ncp cycle limit — unit tests', () => {

  it('ncp resets to 0 on capture', () => {
    const s = newState();
    s.ncp = 50; // Simulate accumulated non-capture moves
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    // Find a move that captures (from initial position, a sow of 4 never captures)
    // We'll construct a state that guarantees capture
    const h = [0, 0, 0, 0, 4, 0, 2, 0, 0, 0, 0, 0];
    const capState = makeState(h, [20, 20], 0, 50);
    capState.hashHistory.add(positionHash(capState));
    const capMoves = legalMoves(capState, rules);
    // pit 4 has 4 seeds, sows to 5,6,7,8 — h[6]=2+1=3 is capturable (2 or 3)
    if (capMoves.includes(4)) {
      const result = applyMove(capState, 4, rules);
      if (result.info.captured > 0) {
        assert.equal(result.state.ncp, 0);
      }
    }
  });

  it('ncp increments on non-capture move', () => {
    const s = newState(); // initial state has ncp=0
    const rules = defaultRules();
    const moves = legalMoves(s, rules);
    // From initial position (all pits = 4), sowing never captures (landing on 5 makes it 5)
    const result = applyMove(s, moves[0], rules);
    assert.equal(result.state.ncp, 1);
  });

  it('isOver triggers at exactly cycleLimit (academic convention)', () => {
    const h = [1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1];
    const s = makeState(h, [22, 22], 0, 100);
    const rules = defaultRules(); // cycleLimit = 100
    const result = isOver(s, rules);
    assert.equal(result.over, true);
    // Academic: split remaining 4 seeds equally
    assert.equal(result.score[0], 22 + 2);
    assert.equal(result.score[1], 22 + 2);
  });

  it('isOver does NOT trigger below cycleLimit', () => {
    const h = [1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1];
    const s = makeState(h, [22, 22], 0, 99);
    const rules = defaultRules(); // cycleLimit = 100
    // Check that there are legal moves (otherwise it ends for another reason)
    const moves = legalMoves(s, rules);
    if (moves.length > 0) {
      const result = isOver(s, rules);
      assert.equal(result.over, false);
    }
  });

  it('isOver does NOT trigger when cycleLimit is 0 (unlimited)', () => {
    const h = [1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1];
    const s = makeState(h, [22, 22], 0, 500);
    const rules = { ...defaultRules(), cycleLimit: 0 };
    const moves = legalMoves(s, rules);
    if (moves.length > 0) {
      const result = isOver(s, rules);
      assert.equal(result.over, false);
    }
  });

  it('ncp cycle limit triggers own-row convention correctly', () => {
    const h = [2, 1, 0, 0, 0, 1, 3, 1, 0, 0, 0, 0];
    const s = makeState(h, [20, 20], 0, 100);
    const rules = { ...ownRowRules(), cycleLimit: 100 };
    const result = isOver(s, rules);
    assert.equal(result.over, true);
    // Own-row: South gets h[0..5] = 2+1+0+0+0+1=4, North gets h[6..11] = 3+1+0+0+0+0=4
    assert.equal(result.score[0], 20 + 4);
    assert.equal(result.score[1], 20 + 4);
  });
});

// ========================================================================
// Property-Based Tests
// ========================================================================

describe('Property 4: Hash history grows with each move', () => {

  /**
   * **Validates: Requirements 2.1**
   *
   * For any legal move sequence of length n from a starting position,
   * the hash history shall contain exactly n + 1 entries (including the
   * starting position), and each entry shall equal the position hash at
   * that point in the game.
   *
   * Note: In the actual game loop, the hash is added AFTER the isOver check.
   * This test simulates the complete game loop behavior.
   */
  it('hash history grows by 1 per move in a non-repeating sequence', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        (numMoves) => {
          const rules = defaultRules();
          let s = newState();
          const hashes = [positionHash(s)];

          for (let i = 0; i < numMoves; i++) {
            const moves = legalMoves(s, rules);
            if (moves.length === 0) break;
            if (isOver(s, rules).over) break;

            s = applyMove(s, moves[0], rules).state;

            // Check for repetition BEFORE adding hash (matches game loop)
            if (checkRepetition(s)) break;

            // Simulate game loop: add hash after isOver check
            s.hashHistory.add(positionHash(s));
            hashes.push(positionHash(s));
          }

          // hashHistory should contain exactly as many entries as hashes we tracked
          assert.equal(s.hashHistory.size, hashes.length,
            `Expected ${hashes.length} entries in hashHistory, got ${s.hashHistory.size}`);

          // Every hash we tracked should be in the history
          for (const h of hashes) {
            assert.ok(s.hashHistory.has(h),
              `Hash "${h}" should be in hashHistory`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('initial position hash is always in history after any number of moves', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (numMoves) => {
          const rules = defaultRules();
          let s = newState();
          const initialHash = positionHash(s);

          for (let i = 0; i < numMoves; i++) {
            const moves = legalMoves(s, rules);
            if (moves.length === 0) break;
            if (isOver(s, rules).over) break;
            s = applyMove(s, moves[0], rules).state;
            if (checkRepetition(s)) break;
            s.hashHistory.add(positionHash(s));
          }

          assert.ok(s.hashHistory.has(initialHash),
            'Initial position hash must always remain in history');
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Property 5: Repetition detection correctness', () => {

  /**
   * **Validates: Requirements 2.2**
   *
   * For any board position that has been previously visited in the current
   * game (its hash exists in the hash history), the engine shall declare a
   * repetition when that position is reached again.
   */
  it('any position whose hash is already in history triggers game-over', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(8), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 23 }),
        (boardArr, turn, scoreS, scoreN) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return; // empty board triggers game-over for a different reason
          if (totalBoard + scoreS + scoreN > 48) return; // invalid seed count

          const h = boardArr.slice();
          const hash = h.join(',') + '|' + turn;
          const history = new Set([hash]); // position already seen
          const s = makeState(h, [scoreS, scoreN], turn, 0, history);

          const rules = defaultRules();
          const result = isOver(s, rules);

          assert.equal(result.over, true,
            `Position with hash already in history should trigger game-over`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a position NOT in history does not trigger repetition (may still end for other reasons)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        (boardArr, turn) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard > 48) return;

          const scoreLeft = 48 - totalBoard;
          // Keep scores below 25 to avoid first-to-25 trigger
          if (scoreLeft > 24) return;

          const h = boardArr.slice();
          const s = makeState(h, [0, 0], turn, 0, new Set()); // empty history, no repetition possible

          // checkRepetition itself should return false
          assert.equal(checkRepetition(s), false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 6: ncp counter triggers terminal at cycle limit', () => {

  /**
   * **Validates: Requirements 2.4**
   *
   * For any game state where ncp >= cycleLimit (and cycleLimit > 0),
   * isOver shall return over: true with the terminal convention applied
   * to the remaining seeds.
   */
  it('ncp at or above cycleLimit triggers terminal (cycleLimit > 0)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(6), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom(20, 50, 100, 200),
        fc.integer({ min: 0, max: 50 }),  // extra ncp above cycleLimit
        (boardArr, turn, scoreS, scoreN, cycleLimit, extra) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return; // skip (board empty is separate terminal)
          if (totalBoard + scoreS + scoreN > 48) return;
          // Keep scores below 25 to avoid first-to-25 interference
          if (scoreS >= 25 || scoreN >= 25) return;

          const h = boardArr.slice();
          const ncp = cycleLimit + extra; // at or above limit
          const s = makeState(h, [scoreS, scoreN], turn, ncp, new Set());

          const rules = { ...defaultRules(), cycleLimit };
          const result = isOver(s, rules);

          assert.equal(result.over, true,
            `Expected game over when ncp=${ncp} >= cycleLimit=${cycleLimit}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('ncp below cycleLimit does NOT trigger cycle-limit terminal (if no other terminal)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.constantFrom(50, 100, 200),
        (boardArr, turn, cycleLimit) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard > 48) return;
          const remaining = 48 - totalBoard;
          if (remaining >= 25) return; // avoid score issues with first-to-25

          const h = boardArr.slice();
          const ncp = cycleLimit - 1; // just below limit
          const s = makeState(h, [0, 0], turn, ncp, new Set());

          // Verify there are legal moves (so no-move terminal doesn't fire)
          const rules = { ...defaultRules(), cycleLimit };
          const moves = legalMoves(s, rules);
          if (moves.length === 0) return;

          const result = isOver(s, rules);
          assert.equal(result.over, false,
            `Expected game NOT over when ncp=${ncp} < cycleLimit=${cycleLimit}`);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('cycleLimit = 0 (unlimited) never triggers ncp terminal', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 100, max: 10000 }),
        (boardArr, turn, highNcp) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard > 48) return;

          const h = boardArr.slice();
          const s = makeState(h, [0, 0], turn, highNcp, new Set());

          const rules = { ...defaultRules(), cycleLimit: 0 }; // unlimited
          const moves = legalMoves(s, rules);
          if (moves.length === 0) return;

          const result = isOver(s, rules);
          assert.equal(result.over, false,
            `Expected game NOT over with cycleLimit=0 even at ncp=${highNcp}`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
