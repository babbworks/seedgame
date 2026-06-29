/**
 * oware-rules.mjs — Pure ES module extraction of the Oware rules engine.
 *
 * Exports all core game logic for use by the EDB Builder (build-edb.mjs)
 * and property tests. Produces IDENTICAL results to the logic in index.html
 * for any given state and move.
 *
 * All exported functions that depend on rule variations accept a `rules`
 * parameter tuple: { capture, grandslam, terminal }
 *   - capture:   '23' | '34'
 *   - grandslam: 'nocap' | 'forbid' | 'oppkeeps' | 'leavelast'
 *   - terminal:  'academic' | 'ownrow'
 *
 * Optional extra fields (used by full game, not required by builder):
 *   - endMode:    'firstto' | 'allcap'
 *   - target:     number (default 25)
 *   - cycleLimit: number (default 100, 0 = unlimited)
 *   - repetition: 'split' | 'ownrow' | 'lastmover'
 *
 * No browser dependencies. Pure Node.js / ES module.
 */

// ─── Constants ─────────────────────────────────────────────────────────────────
export const HOUSES = 12;
export const SIDE = 6;

// ─── State constructors ────────────────────────────────────────────────────────

/**
 * Create a fresh starting state (4 seeds in each of 12 houses).
 */
export function newState() {
  const s = {
    h: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    score: [0, 0],
    turn: 0,
    ncp: 0,
    hashHistory: new Set()
  };
  s.hashHistory.add(positionHash(s));
  return s;
}

/**
 * Deep-clone a game state.
 */
export function clone(s) {
  return {
    h: s.h.slice(),
    score: s.score.slice(),
    turn: s.turn,
    ncp: s.ncp,
    hashHistory: new Set(s.hashHistory || [])
  };
}

// ─── Helper utilities ──────────────────────────────────────────────────────────

/**
 * Returns true if house index `i` belongs to player `p`.
 * Houses 0–5 belong to player 0, houses 6–11 belong to player 1.
 */
export function belongs(i, p) {
  return (i < SIDE) === (p === 0);
}

/**
 * Sum of seeds on player `p`'s side of the board.
 */
export function sideSeeds(s, p) {
  let t = 0;
  for (let i = 0; i < HOUSES; i++) {
    if (belongs(i, p)) t += s.h[i];
  }
  return t;
}

/**
 * Total seeds remaining on the board.
 */
export function boardSeeds(s) {
  let t = 0;
  for (let i = 0; i < HOUSES; i++) t += s.h[i];
  return t;
}

/**
 * Returns true if count `c` is capturable under the given capture rule.
 * '23' captures on 2 or 3; '34' captures on 3 or 4.
 */
export function capturable(c, rule) {
  return rule === '34' ? (c === 3 || c === 4) : (c === 2 || c === 3);
}

// ─── Position hashing (for repetition detection) ──────────────────────────────

/**
 * Compute a unique string hash for a board position.
 * Encodes h[0..11] + turn. Store-independent (ignores banked scores).
 */
export function positionHash(s) {
  return s.h.join(',') + '|' + s.turn;
}

/**
 * Check if the current position has already been visited in this game.
 */
export function checkRepetition(s) {
  return s.hashHistory.has(positionHash(s));
}

// ─── Core rules engine ─────────────────────────────────────────────────────────

/**
 * Simulate sowing from `house` without committing the move.
 * Returns { out: clonedState, res: { landing, captured, grandSlam } } or null
 * if the move is invalid.
 *
 * @param {object} s     - Current game state
 * @param {number} house - House index to sow from (0–11)
 * @param {object} rules - Rules tuple { capture, grandslam, terminal, ... }
 * @returns {{ out: object, res: { landing: number, captured: number, grandSlam: boolean } } | null}
 */
export function simulate(s, house, rules) {
  const p = s.turn;
  if (house < 0 || house >= HOUSES) return null;
  if (!belongs(house, p)) return null;
  if (s.h[house] === 0) return null;

  const out = clone(s);
  let seeds = out.h[house];
  out.h[house] = 0;
  let i = house;
  while (seeds > 0) {
    i = (i + 1) % HOUSES;
    if (i === house) continue; // skip origin
    out.h[i]++;
    seeds--;
  }
  const landing = i;

  // Walk backwards from landing to find capturable houses on opponent's side
  const cap = [];
  let j = landing;
  for (;;) {
    if (belongs(j, p)) break;
    if (!capturable(out.h[j], rules.capture)) break;
    cap.push(j);
    if (cap.length >= SIDE) break;
    j = (j === 0) ? HOUSES - 1 : j - 1;
  }

  const res = { landing, captured: 0, grandSlam: false };
  if (cap.length === 0) return { out, res };

  const opp = p ^ 1;
  let capTotal = 0;
  for (const k of cap) capTotal += out.h[k];
  const grandSlam = (capTotal === sideSeeds(out, opp));
  res.grandSlam = grandSlam;

  const take = (k) => {
    out.score[p] += out.h[k];
    res.captured += out.h[k];
    out.h[k] = 0;
  };

  if (!grandSlam) {
    for (const k of cap) take(k);
    return { out, res };
  }

  // Grand slam handling
  switch (rules.grandslam) {
    case 'nocap':
      break; // keep sown, capture nothing
    case 'forbid':
      break; // filtered in legalMoves
    case 'oppkeeps':
      for (const k of cap) take(k);
      for (let k = 0; k < HOUSES; k++) {
        out.score[opp] += out.h[k];
        out.h[k] = 0;
      }
      break;
    case 'leavelast':
      for (let c = 0; c + 1 < cap.length; c++) take(cap[c]); // spare furthest-back
      break;
    default:
      break;
  }
  return { out, res };
}

/**
 * Compute all legal moves for the current player.
 *
 * @param {object} s     - Current game state
 * @param {object} rules - Rules tuple
 * @returns {number[]}   - Array of legal house indices
 */
export function legalMoves(s, rules) {
  const p = s.turn;
  const opp = p ^ 1;
  const oppEmpty = sideSeeds(s, opp) === 0;
  const moves = [];

  for (let hh = 0; hh < HOUSES; hh++) {
    if (!belongs(hh, p) || s.h[hh] === 0) continue;
    const sim = simulate(s, hh, rules);
    if (!sim) continue;
    if (sim.res.grandSlam && rules.grandslam === 'forbid') continue;
    if (oppEmpty && sideSeeds(sim.out, opp) === 0) continue; // feeding obligation
    moves.push(hh);
  }
  return moves;
}

/**
 * Apply a move, advancing the game state. Returns the new state and move info.
 * Does NOT add the resulting position to hashHistory (caller should do that
 * after checking for repetition if playing a full game).
 *
 * @param {object} s     - Current game state
 * @param {number} house - House to sow from
 * @param {object} rules - Rules tuple
 * @returns {{ state: object, info: { landing: number, captured: number, grandSlam: boolean } }}
 */
export function applyMove(s, house, rules) {
  const sim = simulate(s, house, rules);
  const out = sim.out;
  out.ncp = sim.res.captured > 0 ? 0 : s.ncp + 1;
  out.turn = s.turn ^ 1;
  out.hashHistory = new Set(s.hashHistory || []);
  return { state: out, info: sim.res };
}

/**
 * Collect remaining seeds to each player's store according to the terminal
 * convention. Mutates `s` in place.
 *
 * @param {object} s     - Game state to collect into
 * @param {object} rules - Rules tuple (uses rules.terminal)
 */
export function collectSides(s, rules) {
  if (rules && rules.terminal === 'ownrow') {
    // Own-row convention: each player collects seeds on their own 6 houses
    for (let i = 0; i < HOUSES; i++) {
      if (s.h[i] > 0) {
        s.score[belongs(i, 0) ? 0 : 1] += s.h[i];
        s.h[i] = 0;
      }
    }
  } else {
    // Academic convention (default): each side collects own row
    // (This mirrors the index.html logic for the general collect case)
    for (let i = 0; i < HOUSES; i++) {
      if (s.h[i] > 0) {
        s.score[i < SIDE ? 0 : 1] += s.h[i];
        s.h[i] = 0;
      }
    }
  }
}

/**
 * Check if the game is over and compute the final outcome.
 *
 * @param {object} s     - Current game state
 * @param {object} rules - Rules tuple (needs: capture, grandslam, terminal, endMode, target, cycleLimit, repetition)
 * @returns {{ over: boolean, outcome: 0|1|'draw'|null, score: [number, number] }}
 */
export function isOver(s, rules) {
  const res = { over: false, outcome: null, score: [s.score[0], s.score[1]] };

  // First-to-target check
  if (rules.endMode === 'firstto' && (s.score[0] >= rules.target || s.score[1] >= rules.target)) {
    res.over = true;
  }

  // Board empty
  if (!res.over && boardSeeds(s) === 0) {
    res.over = true;
  }

  // Repetition detection: position already seen in hash history
  if (!res.over && checkRepetition(s)) {
    const t = clone(s);
    const repMode = rules.repetition || (rules.terminal === 'ownrow' ? 'ownrow' : 'split');
    if (repMode === 'ownrow') {
      // Own-row repetition: each player collects own side
      collectSides(t, rules);
    } else if (repMode === 'lastmover') {
      // Last mover takes all remaining seeds
      const rem = boardSeeds(t);
      const lastMover = t.turn ^ 1; // turn already flipped, so last mover is the previous
      for (let i = 0; i < HOUSES; i++) t.h[i] = 0;
      t.score[lastMover] += rem;
    } else {
      // Split: split remaining seeds equally (default academic behaviour)
      const rem = boardSeeds(t);
      const half = Math.floor(rem / 2);
      for (let i = 0; i < HOUSES; i++) t.h[i] = 0;
      t.score[0] += half;
      t.score[1] += rem - half;
    }
    res.score = [t.score[0], t.score[1]];
    res.over = true;
  }

  // Cycle limit (ncp safety-net)
  if (!res.over && rules.cycleLimit > 0 && s.ncp >= rules.cycleLimit) {
    const t = clone(s);
    const repMode = rules.repetition || (rules.terminal === 'ownrow' ? 'ownrow' : 'split');
    if (repMode === 'ownrow') {
      collectSides(t, rules);
    } else if (repMode === 'lastmover') {
      const rem = boardSeeds(t);
      const lastMover = t.turn ^ 1;
      for (let i = 0; i < HOUSES; i++) t.h[i] = 0;
      t.score[lastMover] += rem;
    } else {
      // Split: split remaining seeds equally
      const rem = boardSeeds(t);
      const half = Math.floor(rem / 2);
      for (let i = 0; i < HOUSES; i++) t.h[i] = 0;
      t.score[0] += half;
      t.score[1] += rem - half;
    }
    res.score = [t.score[0], t.score[1]];
    res.over = true;
  }

  // No legal moves
  if (!res.over && legalMoves(s, rules).length === 0) {
    const t = clone(s);
    if (rules.terminal === 'ownrow') {
      // Own-row: each player collects their own side
      collectSides(t, rules);
    } else {
      // Academic: opponent gets all remaining seeds
      const opp = s.turn ^ 1;
      const rem = boardSeeds(t);
      for (let i = 0; i < HOUSES; i++) t.h[i] = 0;
      t.score[opp] += rem;
    }
    res.score = [t.score[0], t.score[1]];
    res.over = true;
  }

  if (res.over) {
    res.outcome = res.score[0] > res.score[1] ? 0
                : res.score[1] > res.score[0] ? 1
                : 'draw';
  }
  return res;
}
