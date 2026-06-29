/**
 * Consolidated property-based tests for the rules engine (Task 1.6)
 * Properties 1–8 from the design document.
 * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.4, 3.2, 3.3
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  newState, positionHash, checkRepetition,
  boardSeeds, legalMoves, applyMove, isOver
} from '../helpers/engine.mjs';

// --- Helpers ---

function makeState(h, score, turn, ncp = 0, hashHistory = null) {
  return { h: h.slice(), score: score.slice(), turn, ncp, hashHistory: hashHistory || new Set() };
}

function academicRules(overrides = {}) {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'allcap', target: 25, cycleLimit: 100, ...overrides };
}

function ownRowRules(overrides = {}) {
  return { capture: '23', grandslam: 'nocap', terminal: 'ownrow', endMode: 'allcap', target: 25, cycleLimit: 100, ...overrides };
}

function firstToRules(overrides = {}) {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'firstto', target: 25, cycleLimit: 100, ...overrides };
}

function allCapRules(overrides = {}) {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'allcap', target: 25, cycleLimit: 100, ...overrides };
}



// ========================================================================
// Property 1: Academic terminal — opponent receives all seeds on no-move
// ========================================================================

describe('Property 1: Academic terminal — opponent receives all seeds on no-move', () => {

  /**
   * **Validates: Requirements 1.1**
   *
   * For any board state where the mover has no legal move under academic
   * convention, applying the terminal rule shall award all remaining on-board
   * seeds to the opponent (opponent's score increases by exactly boardSeeds).
   */
  it('opponent receives all board seeds when mover has no legal move', () => {
    fc.assert(
      fc.property(
        // Seeds only on the opponent's side (mover's side empty = no legal moves)
        fc.integer({ min: 1, max: 40 }),   // total seeds on board
        fc.constantFrom(0, 1),             // turn (mover)
        fc.integer({ min: 0, max: 20 }),   // mover's banked score
        fc.integer({ min: 0, max: 20 }),   // opponent's banked score
        (totalSeeds, turn, moverScore, oppScore) => {
          if (moverScore + oppScore + totalSeeds > 48) return;

          // Place all seeds on opponent's side so mover has no legal moves
          const opp = turn ^ 1;
          const h = new Array(12).fill(0);
          const oppStart = opp === 0 ? 0 : 6;
          // Distribute seeds across opponent's 6 pits
          let remaining = totalSeeds;
          for (let i = 0; i < 6 && remaining > 0; i++) {
            const give = i < 5 ? Math.min(remaining, Math.ceil(remaining / (6 - i))) : remaining;
            h[oppStart + i] = give;
            remaining -= give;
          }

          const score = turn === 0 ? [moverScore, oppScore] : [oppScore, moverScore];
          const s = makeState(h, score, turn);
          const rules = academicRules();

          // Verify precondition: mover has no legal moves
          const moves = legalMoves(s, rules);
          if (moves.length > 0) return; // precondition not met

          const result = isOver(s, rules);
          assert.equal(result.over, true, 'Game should be over when mover has no legal moves');

          // Under academic convention, opponent gets ALL remaining board seeds
          const bs = boardSeeds(s);
          assert.equal(result.score[opp], oppScore + bs,
            `Opponent should receive all ${bs} board seeds. ` +
            `Expected ${oppScore + bs}, got ${result.score[opp]}`);
          // Mover's score unchanged
          assert.equal(result.score[turn], moverScore,
            `Mover's score should remain ${moverScore}`);
        }
      ),
      { numRuns: 300 }
    );
  });
});

// ========================================================================
// Property 2: Academic repetition — seeds split equally
// ========================================================================

describe('Property 2: Academic repetition — seeds split equally', () => {

  /**
   * **Validates: Requirements 1.2**
   *
   * For any board state that recurs in the hash history under academic
   * convention, the terminal rule shall split remaining on-board seeds
   * equally between both players (each receives floor(boardSeeds/2) or
   * ceil(boardSeeds/2)).
   */
  it('remaining seeds split equally on repetition under academic convention', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(6), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (boardArr, turn, scoreS, scoreN) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return; // empty board ends for another reason
          if (totalBoard + scoreS + scoreN > 48) return;
          // Keep scores below 25 to avoid first-to-25 interference
          if (scoreS >= 25 || scoreN >= 25) return;

          const h = boardArr.slice();
          // Create a state whose hash is already in its history (repetition)
          const hash = positionHash({ h, turn });
          const history = new Set([hash]);
          const s = makeState(h, [scoreS, scoreN], turn, 0, history);

          const rules = academicRules();
          const result = isOver(s, rules);

          assert.equal(result.over, true, 'Game should be over on repetition');

          // Academic repetition: split equally
          const rem = totalBoard;
          const half = Math.floor(rem / 2);
          assert.equal(result.score[0], scoreS + half,
            `South should get floor(${rem}/2) = ${half} extra seeds`);
          assert.equal(result.score[1], scoreN + (rem - half),
            `North should get ceil(${rem}/2) = ${rem - half} extra seeds`);
        }
      ),
      { numRuns: 300 }
    );
  });
});

// ========================================================================
// Property 3: Own-row terminal — each player collects own side
// ========================================================================

describe('Property 3: Own-row terminal — each player collects own side', () => {

  /**
   * **Validates: Requirements 1.4**
   *
   * For any board state reaching a terminal condition under own-row
   * convention, each player shall receive exactly the sum of seeds on
   * their own 6 houses.
   */
  it('each player collects own side on no-legal-move terminal (own-row)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (totalSeeds, turn, moverScore, oppScore) => {
          if (moverScore + oppScore + totalSeeds > 48) return;

          // Place all seeds on opponent's side so mover has no legal moves
          const opp = turn ^ 1;
          const h = new Array(12).fill(0);
          const oppStart = opp === 0 ? 0 : 6;
          let remaining = totalSeeds;
          for (let i = 0; i < 6 && remaining > 0; i++) {
            const give = i < 5 ? Math.min(remaining, Math.ceil(remaining / (6 - i))) : remaining;
            h[oppStart + i] = give;
            remaining -= give;
          }

          const score = turn === 0 ? [moverScore, oppScore] : [oppScore, moverScore];
          const s = makeState(h, score, turn);
          const rules = ownRowRules();

          // Verify precondition: mover has no legal moves
          const moves = legalMoves(s, rules);
          if (moves.length > 0) return;

          const result = isOver(s, rules);
          assert.equal(result.over, true, 'Game should be over when mover has no moves');

          // Own-row: each player gets seeds on their own side
          const southSeeds = h.slice(0, 6).reduce((a, b) => a + b, 0);
          const northSeeds = h.slice(6, 12).reduce((a, b) => a + b, 0);
          assert.equal(result.score[0], score[0] + southSeeds,
            `South should collect ${southSeeds} from own side`);
          assert.equal(result.score[1], score[1] + northSeeds,
            `North should collect ${northSeeds} from own side`);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('each player collects own side on repetition terminal (own-row)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(6), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (boardArr, turn, scoreS, scoreN) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return;
          if (totalBoard + scoreS + scoreN > 48) return;
          if (scoreS >= 25 || scoreN >= 25) return;

          const h = boardArr.slice();
          const hash = positionHash({ h, turn });
          const history = new Set([hash]);
          const s = makeState(h, [scoreS, scoreN], turn, 0, history);

          const rules = ownRowRules();
          const result = isOver(s, rules);

          assert.equal(result.over, true, 'Game should be over on repetition');

          // Own-row: each player collects their own 6 houses
          const southSeeds = h.slice(0, 6).reduce((a, b) => a + b, 0);
          const northSeeds = h.slice(6, 12).reduce((a, b) => a + b, 0);
          assert.equal(result.score[0], scoreS + southSeeds,
            `South should get ${southSeeds} from own pits`);
          assert.equal(result.score[1], scoreN + northSeeds,
            `North should get ${northSeeds} from own pits`);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('each player collects own side on ncp cycle-limit terminal (own-row)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(6), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom(20, 50, 100),
        (boardArr, turn, scoreS, scoreN, cycleLimit) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return;
          if (totalBoard + scoreS + scoreN > 48) return;
          if (scoreS >= 25 || scoreN >= 25) return;

          const h = boardArr.slice();
          // ncp at cycleLimit triggers terminal
          const s = makeState(h, [scoreS, scoreN], turn, cycleLimit, new Set());

          const rules = ownRowRules({ cycleLimit });
          const result = isOver(s, rules);

          assert.equal(result.over, true, 'Game should be over at cycle limit');

          const southSeeds = h.slice(0, 6).reduce((a, b) => a + b, 0);
          const northSeeds = h.slice(6, 12).reduce((a, b) => a + b, 0);
          assert.equal(result.score[0], scoreS + southSeeds,
            `South should get ${southSeeds} from own pits`);
          assert.equal(result.score[1], scoreN + northSeeds,
            `North should get ${northSeeds} from own pits`);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 4: Hash history grows with each move
// ========================================================================

describe('Property 4: Hash history grows with each move', () => {

  /**
   * **Validates: Requirements 2.1**
   *
   * For any legal move sequence of length n from a starting position,
   * the hash history shall contain exactly n + 1 entries (including the
   * starting position), and each entry shall equal the position hash at
   * that point in the game.
   */
  it('hash history grows by 1 per move in a non-repeating sequence', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        (numMoves) => {
          const rules = academicRules({ endMode: 'firstto' });
          let s = newState();
          const hashes = [positionHash(s)];

          for (let i = 0; i < numMoves; i++) {
            const moves = legalMoves(s, rules);
            if (moves.length === 0) break;
            if (isOver(s, rules).over) break;

            s = applyMove(s, moves[0], rules).state;
            if (checkRepetition(s)) break;

            s.hashHistory.add(positionHash(s));
            hashes.push(positionHash(s));
          }

          assert.equal(s.hashHistory.size, hashes.length,
            `Expected ${hashes.length} entries in hashHistory, got ${s.hashHistory.size}`);

          for (const h of hashes) {
            assert.ok(s.hashHistory.has(h), `Hash "${h}" should be in hashHistory`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ========================================================================
// Property 5: Repetition detection correctness
// ========================================================================

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
          if (totalBoard === 0) return;
          if (totalBoard + scoreS + scoreN > 48) return;

          const h = boardArr.slice();
          const hash = h.join(',') + '|' + turn;
          const history = new Set([hash]);
          const s = makeState(h, [scoreS, scoreN], turn, 0, history);

          const rules = academicRules({ endMode: 'firstto' });
          const result = isOver(s, rules);

          assert.equal(result.over, true,
            'Position with hash already in history should trigger game-over');
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 6: ncp counter triggers terminal at cycle limit
// ========================================================================

describe('Property 6: ncp counter triggers terminal at cycle limit', () => {

  /**
   * **Validates: Requirements 2.4**
   *
   * For any game state where ncp >= cycleLimit (and cycleLimit > 0),
   * isOver shall return over: true with the terminal convention applied.
   */
  it('ncp at or above cycleLimit triggers terminal (cycleLimit > 0)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(6), { minLength: 12, maxLength: 12 }),
        fc.constantFrom(0, 1),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom(20, 50, 100, 200),
        fc.integer({ min: 0, max: 50 }),
        (boardArr, turn, scoreS, scoreN, cycleLimit, extra) => {
          const totalBoard = boardArr.reduce((a, b) => a + b, 0);
          if (totalBoard === 0) return;
          if (totalBoard + scoreS + scoreN > 48) return;
          if (scoreS >= 25 || scoreN >= 25) return;

          const h = boardArr.slice();
          const ncp = cycleLimit + extra;
          const s = makeState(h, [scoreS, scoreN], turn, ncp, new Set());

          const rules = academicRules({ cycleLimit, endMode: 'firstto' });
          const result = isOver(s, rules);

          assert.equal(result.over, true,
            `Expected game over when ncp=${ncp} >= cycleLimit=${cycleLimit}`);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 7: First-to-25 terminates at threshold
// ========================================================================

describe('Property 7: First-to-25 terminates at threshold', () => {

  /**
   * **Validates: Requirements 3.2**
   *
   * For any game state in first-to-25 mode where either score[0] >= 25 or
   * score[1] >= 25, isOver shall return over: true.
   */
  it('any state with score >= 25 ends the game in first-to-25 mode', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(48), { minLength: 12, maxLength: 12 }),
        fc.integer({ min: 25, max: 48 }),
        fc.integer({ min: 0, max: 23 }),
        fc.constantFrom(0, 1),
        fc.constantFrom(0, 1),
        (boardArr, highScore, lowScore, highPlayer, turn) => {
          const totalScores = highScore + lowScore;
          const remainingSeeds = 48 - totalScores;
          if (remainingSeeds < 0) return;

          const boardSum = boardArr.reduce((a, b) => a + b, 0);
          let h;
          if (boardSum === 0) {
            h = new Array(12).fill(0);
          } else {
            h = boardArr.map(v => Math.floor((v / boardSum) * remainingSeeds));
            const diff = remainingSeeds - h.reduce((a, b) => a + b, 0);
            for (let i = 0; i < diff; i++) h[i % 12]++;
          }

          const score = highPlayer === 0 ? [highScore, lowScore] : [lowScore, highScore];
          const s = makeState(h, score, turn);
          const rules = firstToRules();
          const result = isOver(s, rules);

          assert.equal(result.over, true,
            `Expected game over when score is [${score}] in first-to-25 mode`);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 8: All-capture mode continues despite high scores
// ========================================================================

describe('Property 8: All-capture mode continues despite high scores', () => {

  /**
   * **Validates: Requirements 3.3**
   *
   * For any game state in all-capture mode where scores exceed 25 but
   * boardSeeds > 0, legal moves exist, and no repetition has occurred,
   * isOver shall return over: false.
   */
  it('game continues in all-capture mode with high scores if board has seeds, moves exist, no repetition', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 25, max: 46 }),
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom(0, 1),
        fc.constantFrom(0, 1),
        (highScore, lowScore, highPlayer, turn) => {
          const totalScores = highScore + lowScore;
          const remaining = 48 - totalScores;
          if (remaining <= 0) return;

          // Distribute seeds ensuring the mover has legal moves
          const h = new Array(12).fill(0);
          const moverStart = turn === 0 ? 0 : 6;
          const oppStart = turn === 0 ? 6 : 0;

          if (remaining >= 2) {
            h[moverStart] = Math.max(1, Math.floor(remaining / 2));
            h[oppStart] = remaining - h[moverStart];
          } else {
            h[moverStart] = remaining;
          }

          const score = highPlayer === 0 ? [highScore, lowScore] : [lowScore, highScore];
          const s = makeState(h, score, turn);
          const rules = allCapRules();

          // Verify preconditions
          const bs = boardSeeds(s);
          const moves = legalMoves(s, rules);
          const isRepetition = checkRepetition(s);

          if (bs === 0 || moves.length === 0 || isRepetition) return;

          const result = isOver(s, rules);
          assert.equal(result.over, false,
            `Expected game to continue in all-capture mode with score [${score}], ` +
            `board seeds=${bs}, legal moves=${moves.length}`);
        }
      ),
      { numRuns: 200 }
    );
  });
});
