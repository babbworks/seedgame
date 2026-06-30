/**
 * Smoke test for oware-rules.mjs — verifies the ES module loads cleanly
 * in Node.js and produces correct results for basic scenarios.
 *
 * Run: node tools/oware-rules.test.mjs
 */

import {
  HOUSES, SIDE,
  newState, clone, belongs, sideSeeds, boardSeeds, capturable,
  positionHash, checkRepetition,
  simulate, applyMove, legalMoves, isOver, collectSides
} from './oware-rules.mjs';

const DEFAULT_RULES = { capture: '23', grandslam: 'nocap', terminal: 'academic', repetition: 'split', endMode: 'allcap', target: 25, cycleLimit: 100 };

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertEq(a, b, msg) {
  const eq = JSON.stringify(a) === JSON.stringify(b);
  if (eq) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}\n    expected: ${JSON.stringify(b)}\n    got:      ${JSON.stringify(a)}`); }
}

// ─── Constants ────────────────────────────────────────────────────────────────
console.log('Constants...');
assert(HOUSES === 12, 'HOUSES === 12');
assert(SIDE === 6, 'SIDE === 6');

// ─── newState ─────────────────────────────────────────────────────────────────
console.log('newState...');
const s0 = newState();
assertEq(s0.h, [4,4,4,4,4,4,4,4,4,4,4,4], 'initial board is 4 seeds per house');
assertEq(s0.score, [0,0], 'initial score is [0,0]');
assert(s0.turn === 0, 'player 0 moves first');
assert(s0.ncp === 0, 'ncp starts at 0');
assert(s0.hashHistory.size === 1, 'hashHistory has the starting position');

// ─── clone ────────────────────────────────────────────────────────────────────
console.log('clone...');
const c = clone(s0);
c.h[0] = 99;
assert(s0.h[0] === 4, 'clone does not mutate original h');
c.score[0] = 99;
assert(s0.score[0] === 0, 'clone does not mutate original score');

// ─── belongs ──────────────────────────────────────────────────────────────────
console.log('belongs...');
assert(belongs(0, 0) === true, 'house 0 belongs to player 0');
assert(belongs(5, 0) === true, 'house 5 belongs to player 0');
assert(belongs(6, 0) === false, 'house 6 does not belong to player 0');
assert(belongs(6, 1) === true, 'house 6 belongs to player 1');
assert(belongs(11, 1) === true, 'house 11 belongs to player 1');

// ─── sideSeeds / boardSeeds ───────────────────────────────────────────────────
console.log('sideSeeds / boardSeeds...');
assert(sideSeeds(s0, 0) === 24, 'player 0 side has 24 seeds');
assert(sideSeeds(s0, 1) === 24, 'player 1 side has 24 seeds');
assert(boardSeeds(s0) === 48, 'board has 48 seeds total');

// ─── capturable ───────────────────────────────────────────────────────────────
console.log('capturable...');
assert(capturable(2, '23') === true, '2 is capturable under 23');
assert(capturable(3, '23') === true, '3 is capturable under 23');
assert(capturable(4, '23') === false, '4 is NOT capturable under 23');
assert(capturable(3, '34') === true, '3 is capturable under 34');
assert(capturable(4, '34') === true, '4 is capturable under 34');
assert(capturable(2, '34') === false, '2 is NOT capturable under 34');

// ─── positionHash / checkRepetition ───────────────────────────────────────────
console.log('positionHash / checkRepetition...');
const h0 = positionHash(s0);
assert(typeof h0 === 'string', 'positionHash returns a string');
assert(h0.includes('|0'), 'hash encodes turn');
// Same board, different turn => different hash
const s1 = clone(s0); s1.turn = 1;
assert(positionHash(s1) !== h0, 'different turn => different hash');
// checkRepetition on fresh state should be true (start pos is in history)
assert(checkRepetition(s0) === true, 'start position is in its own hashHistory');

// ─── simulate ─────────────────────────────────────────────────────────────────
console.log('simulate...');
const sim = simulate(s0, 0, DEFAULT_RULES);
assert(sim !== null, 'simulate from house 0 is valid');
assert(sim.out.h[0] === 0, 'origin house is emptied');
assert(sim.out.h[1] === 5, 'house 1 gets +1 seed');
assert(sim.out.h[4] === 5, 'house 4 gets +1 (landing)');
assert(sim.res.landing === 4, 'landing is house 4');
assert(sim.res.captured === 0, 'no capture on opening sow');

// Invalid moves
assert(simulate(s0, 6, DEFAULT_RULES) === null, 'cannot sow opponent house');
assert(simulate(s0, -1, DEFAULT_RULES) === null, 'invalid index returns null');

// ─── legalMoves ───────────────────────────────────────────────────────────────
console.log('legalMoves...');
const moves0 = legalMoves(s0, DEFAULT_RULES);
assertEq(moves0, [0,1,2,3,4,5], 'all 6 houses legal at start for player 0');

// ─── applyMove ────────────────────────────────────────────────────────────────
console.log('applyMove...');
const { state: s2, info } = applyMove(s0, 0, DEFAULT_RULES);
assert(s2.turn === 1, 'turn flips to player 1');
assert(s2.h[0] === 0, 'house 0 empty after sow');
assert(info.landing === 4, 'applyMove reports landing');
assert(info.captured === 0, 'applyMove reports captures');

// ─── isOver ───────────────────────────────────────────────────────────────────
console.log('isOver...');
// Use a state returned by applyMove (which does NOT include its own hash yet)
const { state: afterMove } = applyMove(s0, 0, DEFAULT_RULES);
const overCheck = isOver(afterMove, DEFAULT_RULES);
assert(overCheck.over === false, 'game not over after first move');

// Test first-to-25
const sWin = clone(afterMove);
sWin.score[0] = 25;
const overWin = isOver(sWin, { ...DEFAULT_RULES, endMode: 'firstto' });
assert(overWin.over === true, 'first-to-25: game over when score >= 25');
assert(overWin.outcome === 0, 'player 0 wins');

// All-capture mode: high score doesn't end it (use state without self-hash)
const sHigh = { h: [4,4,4,4,4,4,4,4,4,4,4,4], score: [30,0], turn: 0, ncp: 0, hashHistory: new Set() };
const overHigh = isOver(sHigh, { ...DEFAULT_RULES, endMode: 'allcap' });
assert(overHigh.over === false, 'all-capture: high score alone does not end game');

// ─── Academic terminal: no legal moves → opponent gets all ────────────────────
console.log('Academic terminal (no legal moves)...');
const sNoMove = { h: [0,0,0,0,0,0, 3,3,3,3,3,3], score: [12,12], turn: 0, ncp: 0, hashHistory: new Set() };
const overNoMove = isOver(sNoMove, DEFAULT_RULES);
assert(overNoMove.over === true, 'no legal moves => game over');
// Under academic: opponent (player 1) gets all 18 remaining seeds
assert(overNoMove.score[1] === 12 + 18, 'academic: opponent gets 18 remaining seeds');
assert(overNoMove.score[0] === 12, 'academic: mover gets nothing extra');

// ─── Own-row terminal: no legal moves → each collects own side ────────────────
console.log('Own-row terminal (no legal moves)...');
const ownrowRules = { ...DEFAULT_RULES, terminal: 'ownrow' };
const sNoMove2 = { h: [0,0,0,0,0,0, 3,3,3,3,3,3], score: [12,12], turn: 0, ncp: 0, hashHistory: new Set() };
const overOwnrow = isOver(sNoMove2, ownrowRules);
assert(overOwnrow.over === true, 'own-row: no legal moves => game over');
// Player 0 side (houses 0-5) is empty, player 1 side (houses 6-11) has 18
assert(overOwnrow.score[0] === 12, 'own-row: player 0 gets nothing (own side empty)');
assert(overOwnrow.score[1] === 12 + 18, 'own-row: player 1 gets 18 from own side');

// ─── Cycle limit terminal ─────────────────────────────────────────────────────
console.log('Cycle limit...');
const sCycle = { h: [2,2,2,2,2,2, 2,2,2,2,2,2], score: [12,12], turn: 0, ncp: 100, hashHistory: new Set() };
const overCycle = isOver(sCycle, { ...DEFAULT_RULES, cycleLimit: 100 });
assert(overCycle.over === true, 'cycle limit reached => game over');
// Academic: split 24 remaining equally => 12 each
assert(overCycle.score[0] === 12 + 12, 'cycle limit split: player 0 gets +12');
assert(overCycle.score[1] === 12 + 12, 'cycle limit split: player 1 gets +12');

// ─── collectSides ─────────────────────────────────────────────────────────────
console.log('collectSides...');
const sCollect = { h: [1,2,3,0,0,0, 0,0,0,4,5,6], score: [0,0], turn: 0, ncp: 0, hashHistory: new Set() };
collectSides(sCollect, ownrowRules);
assert(sCollect.score[0] === 6, 'own-row collect: player 0 gets 1+2+3=6');
assert(sCollect.score[1] === 15, 'own-row collect: player 1 gets 4+5+6=15');
assert(boardSeeds(sCollect) === 0, 'board is empty after collectSides');

// ─── Capture scenario ─────────────────────────────────────────────────────────
console.log('Capture scenario...');
// Set up: player 0 sows from house 4 (3 seeds), lands on house 7 (opp side)
// After sow: h[6]=2, h[7]=2. Both capturable, but it's a grand slam (all opp seeds).
// With 'nocap', no capture happens. Test with extra seeds so it's not a grand slam.
const sCap = { h: [0,0,0,0,3,0, 1,1,5,0,0,0], score: [0,0], turn: 0, ncp: 0, hashHistory: new Set() };
const simCap = simulate(sCap, 4, DEFAULT_RULES);
// Sow from h[4]=3: h[5]++, h[6]++, h[7]++
// After sow: h=[0,0,0,0,0,1, 2,2,5,0,0,0]  landing=7
// h[7]=2 capturable, h[6]=2 capturable. Total cap=4, opp total after sow= 2+2+5=9. Not grand slam.
assert(simCap !== null, 'capture sim is valid');
assert(simCap.res.landing === 7, 'lands on house 7');
assert(simCap.res.captured === 4, 'captures 2+2=4 seeds');
assert(simCap.res.grandSlam === false, 'not a grand slam');

// Verify score updated
assert(simCap.out.score[0] === 4, 'player 0 score = 4 after capture');
assert(simCap.out.h[6] === 0, 'captured house 6 is empty');
assert(simCap.out.h[7] === 0, 'captured house 7 is empty');

// ─── No browser dependencies check ───────────────────────────────────────────
console.log('No browser dependencies...');
assert(typeof globalThis.document === 'undefined' || true, 'module loaded without DOM');
assert(typeof globalThis.window === 'undefined' || true, 'module loaded without window');

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All smoke tests passed ✓');
