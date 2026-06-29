/**
 * Unit tests for pondering implementation in the Worker (Task 11.1)
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4
 *
 * Since the Worker is single-threaded and rootSearch is synchronous,
 * we simulate the message handler logic by extracting key functions
 * and testing the state transitions directly.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', 'index.html');
const html = readFileSync(htmlPath, 'utf-8');

// Extract the WORKER_CODE and create a testable module with the message handler
const workerStart = html.indexOf("const WORKER_CODE = `");
const workerEnd = html.indexOf("`;", workerStart + 20);
const workerCode = html.substring(
  workerStart + "const WORKER_CODE = `".length,
  workerEnd
);

// Replace self.onmessage and self.postMessage with testable versions
const testWrapper = `
let __messages = [];
const self = { postMessage(msg) { __messages.push(msg); } };

${workerCode.replace('self.onmessage = function(e){', 'function handleMessage(e){')}

function getMessages() { const m = __messages.slice(); __messages = []; return m; }
function getPonderState() { return { isPondering, ponderResult }; }
function getAbortFlag() { return abortFlag; }

export { handleMessage, getMessages, getPonderState, getAbortFlag, rootSearch, legalMoves, applyMove, difficultyToConfig };
`;

const tmpFile = join(tmpdir(), `oware-ponder-test-${Date.now()}.mjs`);
writeFileSync(tmpFile, testWrapper);
const mod = await import(tmpFile);
unlinkSync(tmpFile);

const { handleMessage, getMessages, getPonderState, getAbortFlag } = mod;

// Test helpers
function makeState(h, score = [0, 0], turn = 0) {
  return { h: h.slice(), score: score.slice(), turn, ncp: 0 };
}

function defaultRules() {
  return { capture: '23', grandslam: 'nocap', terminal: 'academic', endMode: 'firstto', target: 25, cycleLimit: 100 };
}

// A simple position with legal moves for both sides
function simplePosition() {
  return makeState([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
}

// A position from the opponent's perspective (turn=1)
function opponentPosition() {
  return makeState([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], [0, 0], 1);
}

describe('Pondering in Worker (Task 11.1)', () => {

  beforeEach(() => {
    // Clear any pending messages
    getMessages();
    // Reset state via init
    handleMessage({ data: { type: 'init', dbLayers: [] } });
    getMessages(); // discard 'ready' message
  });

  describe('Req 13.1: ponder begins searching expected reply position', () => {
    it('ponder message sets isPondering=true and searches the given position', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });

      const ps = getPonderState();
      // After ponder completes (synchronous), result should be stored
      assert.ok(ps.ponderResult !== null, 'ponderResult should be set after ponder search completes');
      assert.ok(typeof ps.ponderResult.bestMove === 'number', 'ponderResult should have a bestMove');
      assert.ok(Array.isArray(ps.ponderResult.pv), 'ponderResult should have a pv array');

      // No message should be posted (ponder stores result silently)
      const msgs = getMessages();
      assert.equal(msgs.length, 0, 'ponder should not post a result message');
    });

    it('ponder uses hard difficulty by default when no difficulty specified', () => {
      const state = simplePosition();
      // Ponder without explicit difficulty
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });

      const ps = getPonderState();
      assert.ok(ps.ponderResult !== null, 'ponder should complete with default difficulty');
    });
  });

  describe('Req 13.2: ponderHit returns result immediately', () => {
    it('ponderHit posts stored result when ponder has completed', () => {
      const state = simplePosition();
      // First ponder
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages(); // clear

      // Then hit
      handleMessage({ data: { type: 'ponderHit' } });
      const msgs = getMessages();

      assert.equal(msgs.length, 1, 'ponderHit should post exactly one result');
      assert.equal(msgs[0].type, 'result');
      assert.ok(typeof msgs[0].bestMove === 'number', 'result should have bestMove');
      assert.ok(Array.isArray(msgs[0].pv), 'result should have pv');
    });

    it('ponderHit clears ponder state after posting', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      handleMessage({ data: { type: 'ponderHit' } });
      getMessages();

      const ps = getPonderState();
      assert.equal(ps.isPondering, false, 'isPondering should be false after ponderHit');
      assert.equal(ps.ponderResult, null, 'ponderResult should be null after ponderHit');
    });

    it('ponderHit with no stored result posts nothing', () => {
      // No ponder was started
      handleMessage({ data: { type: 'ponderHit' } });
      const msgs = getMessages();
      assert.equal(msgs.length, 0, 'ponderHit should not post if no ponder result');
    });
  });

  describe('Req 13.3: ponderMiss discards and starts fresh search', () => {
    it('ponderMiss discards ponder result and posts fresh search result', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      // Miss with a different position
      const newState = opponentPosition();
      handleMessage({ data: { type: 'ponderMiss', state: newState, rules: defaultRules(), difficulty: 'medium' } });
      const msgs = getMessages();

      assert.equal(msgs.length, 1, 'ponderMiss should post exactly one result from fresh search');
      assert.equal(msgs[0].type, 'result');
      assert.ok(typeof msgs[0].bestMove === 'number', 'result should have bestMove');
    });

    it('ponderMiss clears pondering state', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      const newState = opponentPosition();
      handleMessage({ data: { type: 'ponderMiss', state: newState, rules: defaultRules(), difficulty: 'easy' } });
      getMessages();

      const ps = getPonderState();
      assert.equal(ps.isPondering, false, 'isPondering should be false after ponderMiss');
      assert.equal(ps.ponderResult, null, 'ponderResult should be null after ponderMiss');
    });
  });

  describe('Req 13.4: pondering responds to stop and does not block new searches', () => {
    it('stop message clears pondering state', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      // Stop message arrives
      handleMessage({ data: { type: 'stop' } });

      const ps = getPonderState();
      assert.equal(ps.isPondering, false, 'isPondering should be false after stop');
      assert.equal(ps.ponderResult, null, 'ponderResult should be cleared by stop');
    });

    it('new search cancels any ponder result', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      // New search arrives — should override pondering
      handleMessage({ data: { type: 'search', state, rules: defaultRules(), difficulty: 'easy' } });
      const msgs = getMessages();

      // Should get a result from the search
      assert.equal(msgs.length, 1, 'search should post result');
      assert.equal(msgs[0].type, 'result');

      // Ponder state should be cleared
      const ps = getPonderState();
      assert.equal(ps.isPondering, false, 'isPondering should be false after search');
      assert.equal(ps.ponderResult, null, 'ponderResult should be null after search');
    });

    it('ponderHit after stop returns nothing (ponder was cancelled)', () => {
      const state = simplePosition();
      handleMessage({ data: { type: 'ponder', state, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      // Stop cancels the ponder
      handleMessage({ data: { type: 'stop' } });
      getMessages();

      // Now ponderHit arrives — nothing to return
      handleMessage({ data: { type: 'ponderHit' } });
      const msgs = getMessages();
      assert.equal(msgs.length, 0, 'ponderHit after stop should not post a result');
    });

    it('consecutive ponder calls: second ponder replaces first result', () => {
      const state1 = simplePosition();
      const state2 = makeState([0, 0, 1, 5, 5, 5, 5, 5, 5, 5, 5, 5], [0, 0], 0);

      handleMessage({ data: { type: 'ponder', state: state1, rules: defaultRules(), expectedMove: 0 } });
      getMessages();

      // Second ponder replaces first
      handleMessage({ data: { type: 'ponder', state: state2, rules: defaultRules(), expectedMove: 2 } });
      getMessages();

      // ponderHit returns the second result
      handleMessage({ data: { type: 'ponderHit' } });
      const msgs = getMessages();
      assert.equal(msgs.length, 1, 'ponderHit should return second ponder result');
      assert.equal(msgs[0].type, 'result');
    });
  });
});
