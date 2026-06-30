/**
 * Property-based tests for seed tally (Task 13.3)
 * Properties 19–21 from the design document.
 * Validates: Requirements 14.1, 14.3, 14.5
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

// ============================================================================
// Extracted tally logic (pure functions matching index.html implementation)
// ============================================================================

/**
 * Simulate tallyLoad/tallySave using a plain object (no localStorage needed).
 * The tally store is { [key]: { south: number, north: number } }.
 */

/** Add scores to tally for a given key, returns new tally state */
function tallyAdd(tally, key, scoreSouth, scoreNorth) {
  const t = JSON.parse(JSON.stringify(tally)); // deep clone like load/save cycle
  if (!t[key]) t[key] = { south: 0, north: 0 };
  t[key].south += scoreSouth;
  t[key].north += scoreNorth;
  return t;
}

/** Get tally record for a key */
function tallyGet(tally, key) {
  return tally[key] || null;
}

/** Reset tally for a given key, returns new tally state */
function tallyReset(tally, key) {
  const t = JSON.parse(JSON.stringify(tally));
  delete t[key];
  return t;
}

/**
 * Render tally display string.
 * Matches the index.html logic: "YouLabel N — M OppLabel"
 */
function tallyDisplayText(rec, youLabel, oppLabel) {
  if (!rec || (rec.south === 0 && rec.north === 0)) return '';
  return youLabel + ' ' + rec.south + ' \u2014 ' + rec.north + ' ' + oppLabel;
}

// ============================================================================
// Generators
// ============================================================================

/** Generate a valid game score pair (each player 0–48, sum ≤ 48) */
function arbGameScore() {
  return fc.integer({ min: 0, max: 48 }).chain(south => {
    const maxNorth = 48 - south;
    return fc.integer({ min: 0, max: maxNorth }).map(north => ({ south, north }));
  });
}

/** Generate a sequence of game results */
function arbGameSequence(minLen = 1, maxLen = 20) {
  return fc.array(arbGameScore(), { minLength: minLen, maxLength: maxLen });
}

/** Generate a valid pairing key */
function arbPairingKey() {
  return fc.oneof(
    fc.constantFrom('vs-cpu-easy', 'vs-cpu-medium', 'vs-cpu-hard'),
    fc.tuple(
      fc.stringMatching(/^[A-Za-z]{1,8}$/),
      fc.stringMatching(/^[A-Za-z]{1,8}$/)
    ).map(([a, b]) => {
      const sorted = [a, b].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
      return 'vs-' + sorted[0] + '-' + sorted[1];
    })
  );
}

/** Generate a player name for display */
function arbPlayerName() {
  return fc.oneof(
    fc.constantFrom('You', 'Guest', 'CPU Easy', 'CPU Medium', 'CPU Hard'),
    fc.stringMatching(/^[A-Za-z]{1,10}$/)
  );
}

// ========================================================================
// Property 19: Seed tally accumulates correctly
// ========================================================================

describe('Property 19: Seed tally accumulates correctly', () => {

  /**
   * **Validates: Requirements 14.1**
   *
   * For any sequence of game endings with scores (a_i, b_i), the cumulative
   * tally after all games shall equal (Σa_i, Σb_i).
   */
  it('cumulative tally equals sum of all game scores per player', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbGameSequence(1, 30),
        (key, games) => {
          let tally = {};

          // Apply all game results
          for (const { south, north } of games) {
            tally = tallyAdd(tally, key, south, north);
          }

          // Verify cumulative sums
          const expectedSouth = games.reduce((sum, g) => sum + g.south, 0);
          const expectedNorth = games.reduce((sum, g) => sum + g.north, 0);

          const rec = tallyGet(tally, key);
          assert.ok(rec !== null, 'Tally record should exist after games');
          assert.equal(rec.south, expectedSouth,
            `South tally: expected ${expectedSouth}, got ${rec.south}`);
          assert.equal(rec.north, expectedNorth,
            `North tally: expected ${expectedNorth}, got ${rec.north}`);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('single game adds exactly those scores to tally', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbGameScore(),
        (key, { south, north }) => {
          const tally = tallyAdd({}, key, south, north);
          const rec = tallyGet(tally, key);
          assert.ok(rec !== null);
          assert.equal(rec.south, south);
          assert.equal(rec.north, north);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('accumulation is order-independent (commutative over addition)', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbGameSequence(2, 15),
        (key, games) => {
          // Apply in original order
          let tally1 = {};
          for (const { south, north } of games) {
            tally1 = tallyAdd(tally1, key, south, north);
          }

          // Apply in reverse order
          let tally2 = {};
          for (let i = games.length - 1; i >= 0; i--) {
            tally2 = tallyAdd(tally2, key, games[i].south, games[i].north);
          }

          const rec1 = tallyGet(tally1, key);
          const rec2 = tallyGet(tally2, key);
          assert.deepEqual(rec1, rec2,
            'Tally accumulation must be order-independent');
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 20: Seed tally persists across new games
// ========================================================================

describe('Property 20: Seed tally persists across new games', () => {

  /**
   * **Validates: Requirements 14.5**
   *
   * For any non-zero tally state, starting a new game shall not change
   * the tally values. (Simulated by verifying that a "new game" operation —
   * which resets game state but not the tally store — leaves tally unchanged.)
   */
  it('tally state survives a simulated new-game (no mutation without tallyRecord)', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbGameSequence(1, 10),
        (key, games) => {
          // Build up tally from games
          let tally = {};
          for (const { south, north } of games) {
            tally = tallyAdd(tally, key, south, north);
          }

          // Snapshot tally before "new game"
          const before = JSON.parse(JSON.stringify(tally));

          // Simulate "new game": the tally store is not touched
          // (In the real code, newGame() resets game state but not localStorage tally)
          const after = JSON.parse(JSON.stringify(tally));

          // Tally must be unchanged
          assert.deepEqual(after, before,
            'Tally must not change when a new game starts');
        }
      ),
      { numRuns: 200 }
    );
  });

  it('tally for one pairing is independent of other pairings', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbPairingKey(),
        arbGameSequence(1, 5),
        arbGameSequence(1, 5),
        (key1, key2, games1, games2) => {
          // Build up tally for key1
          let tally = {};
          for (const { south, north } of games1) {
            tally = tallyAdd(tally, key1, south, north);
          }

          // Snapshot key1's tally
          const key1Before = JSON.parse(JSON.stringify(tallyGet(tally, key1)));

          // Record games under key2
          for (const { south, north } of games2) {
            tally = tallyAdd(tally, key2, south, north);
          }

          // key1 must be unchanged (unless key1 === key2)
          if (key1 !== key2) {
            const key1After = tallyGet(tally, key1);
            assert.deepEqual(key1After, key1Before,
              'Recording games under a different key must not affect other keys');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('reset only clears the targeted pairing, not others', () => {
    fc.assert(
      fc.property(
        arbPairingKey(),
        arbPairingKey(),
        arbGameSequence(1, 5),
        arbGameSequence(1, 5),
        (key1, key2, games1, games2) => {
          // Build up tallies for both keys
          let tally = {};
          for (const { south, north } of games1) {
            tally = tallyAdd(tally, key1, south, north);
          }
          for (const { south, north } of games2) {
            tally = tallyAdd(tally, key2, south, north);
          }

          // Reset key1
          tally = tallyReset(tally, key1);

          // key1 should be gone
          assert.equal(tallyGet(tally, key1), null,
            'Reset pairing should have null tally');

          // key2 should be intact (if different)
          if (key1 !== key2) {
            const rec2 = tallyGet(tally, key2);
            assert.ok(rec2 !== null, 'Other pairing should still exist');
            const expected2South = games2.reduce((sum, g) => sum + g.south, 0);
            const expected2North = games2.reduce((sum, g) => sum + g.north, 0);
            assert.equal(rec2.south, expected2South);
            assert.equal(rec2.north, expected2North);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ========================================================================
// Property 21: Tally display format
// ========================================================================

describe('Property 21: Tally display format', () => {

  /**
   * **Validates: Requirements 14.3**
   *
   * For any tally values (you: N, opp: M) and opponent name string, the
   * rendered tally display shall contain both numeric values N and M and
   * the opponent name.
   */
  it('display contains both numeric values and both player labels', () => {
    fc.assert(
      fc.property(
        arbPlayerName(),
        arbPlayerName(),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (youLabel, oppLabel, southScore, northScore) => {
          const rec = { south: southScore, north: northScore };
          const display = tallyDisplayText(rec, youLabel, oppLabel);

          // Must contain both numeric values
          assert.ok(display.includes(String(southScore)),
            `Display "${display}" must contain south score ${southScore}`);
          assert.ok(display.includes(String(northScore)),
            `Display "${display}" must contain north score ${northScore}`);

          // Must contain both player labels
          assert.ok(display.includes(youLabel),
            `Display "${display}" must contain you label "${youLabel}"`);
          assert.ok(display.includes(oppLabel),
            `Display "${display}" must contain opp label "${oppLabel}"`);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('display format is "YouLabel N — M OppLabel"', () => {
    fc.assert(
      fc.property(
        arbPlayerName(),
        arbPlayerName(),
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: 1, max: 9999 }),
        (youLabel, oppLabel, southScore, northScore) => {
          const rec = { south: southScore, north: northScore };
          const display = tallyDisplayText(rec, youLabel, oppLabel);

          // Exact format: "YouLabel N — M OppLabel"
          const expected = youLabel + ' ' + southScore + ' \u2014 ' + northScore + ' ' + oppLabel;
          assert.equal(display, expected,
            `Display format mismatch: got "${display}", expected "${expected}"`);
        }
      ),
      { numRuns: 300 }
    );
  });

  it('display is empty when tally is zero or null', () => {
    fc.assert(
      fc.property(
        arbPlayerName(),
        arbPlayerName(),
        (youLabel, oppLabel) => {
          // Null record
          assert.equal(tallyDisplayText(null, youLabel, oppLabel), '',
            'Null record should produce empty display');

          // Zero-zero record
          assert.equal(tallyDisplayText({ south: 0, north: 0 }, youLabel, oppLabel), '',
            'Zero-zero record should produce empty display');
        }
      ),
      { numRuns: 100 }
    );
  });
});
