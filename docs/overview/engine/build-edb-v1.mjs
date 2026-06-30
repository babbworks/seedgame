/**
 * build-edb.mjs — Endgame Database Builder for Oware.
 *
 * This module implements the combinatorial number system rank/unrank
 * for stars-and-bars distributions of s seeds into 12 houses, plus
 * canonicalisation (180° rotation for North-to-move positions).
 *
 * It also implements van der Goot's forward-move retrograde analysis
 * to build perfect-play endgame database layers.
 *
 * Exports: comb, rank, unrank, canonicalise, buildLayer, verifyLayer
 */

import fs from 'node:fs';
import path from 'node:path';
import { simulate, legalMoves, boardSeeds } from './oware-rules.mjs';

// ─── Binomial coefficient with memoisation ─────────────────────────────────────

const _combCache = new Map();

/**
 * Compute binomial coefficient C(n, k) with memoisation.
 * Returns 0 for invalid inputs (k < 0 or k > n).
 */
export function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  // Exploit symmetry: C(n, k) = C(n, n-k)
  if (k > n - k) k = n - k;

  const key = (n << 16) | k; // pack into a single integer key
  if (_combCache.has(key)) return _combCache.get(key);

  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  result = Math.round(result); // guard against floating-point drift

  _combCache.set(key, result);
  return result;
}

// ─── Rank: distribution → index ────────────────────────────────────────────────

/**
 * Map a board distribution h[0..11] with Σh = s to a unique index
 * in 0..C(s+11, 11)-1 using the combinatorial number system
 * (stars-and-bars encoding, colex order).
 *
 * The mapping uses the bijection between weak compositions of s into 12 parts
 * and 11-element subsets of {0, ..., s+10}. Bar positions b[j] = h[0]+...+h[j]+j
 * for j=0..10, and rank = Σ C(b[j], j+1).
 *
 * @param {number[]} h  - 12-element array of house seed counts
 * @param {number}   s  - total seeds (sum of h)
 * @returns {number}    - rank index
 */
export function rank(h, s) {
  let idx = 0;
  let cumulative = 0;
  for (let j = 0; j <= 10; j++) {
    cumulative += h[j];
    const b = cumulative + j;  // bar position
    idx += comb(b, j + 1);
  }
  return idx;
}

// ─── Unrank: index → distribution ──────────────────────────────────────────────

/**
 * Reconstruct the board distribution h[0..11] from a rank index and
 * the layer's total seed count s.
 *
 * Recovers bar positions b[10] > b[9] > ... > b[0] from the rank using
 * the combinatorial number system, then converts back to house counts.
 *
 * @param {number} idx - rank index in 0..C(s+11, 11)-1
 * @param {number} s   - total seeds for this layer
 * @returns {number[]} - 12-element distribution array
 */
export function unrank(idx, s) {
  // Recover bar positions b[10], b[9], ..., b[0] in descending order
  const bars = new Array(11);
  for (let j = 10; j >= 0; j--) {
    // Find largest b such that C(b, j+1) <= idx
    let b = j; // minimum possible value for bar j
    // Binary search for the largest b with C(b, j+1) <= idx
    let lo = j, hi = s + j; // bar j ranges from j to s+j at most (but limited by s+10)
    if (hi > s + 10) hi = s + 10;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (comb(mid, j + 1) <= idx) {
        b = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    bars[j] = b;
    idx -= comb(b, j + 1);
  }

  // Convert bar positions to house counts
  // b[j] = h[0] + h[1] + ... + h[j] + j
  // h[j] = b[j] - b[j-1] - 1  for j >= 1
  // h[0] = b[0]
  const h = new Array(12).fill(0);
  h[0] = bars[0];
  for (let j = 1; j <= 10; j++) {
    h[j] = bars[j] - bars[j - 1] - 1;
  }
  // h[11] = s - (h[0] + h[1] + ... + h[10])
  let sum = 0;
  for (let j = 0; j <= 10; j++) sum += h[j];
  h[11] = s - sum;

  return h;
}

// ─── Canonicalisation ──────────────────────────────────────────────────────────

/**
 * Canonicalise a position for EDB lookup.
 * The DB stores only South-to-move (turn=0) values.
 * For North-to-move (turn=1), we apply a 180° rotation: swap h[0..5] with h[6..11].
 *
 * @param {number[]} h    - 12-element house array
 * @param {number}   turn - 0 (South) or 1 (North)
 * @returns {{h: number[], rotated: boolean}}
 */
export function canonicalise(h, turn) {
  if (turn === 0) return { h, rotated: false };
  // 180° rotation: swap South side (0..5) with North side (6..11)
  const rotated = [...h.slice(6), ...h.slice(0, 6)];
  return { h: rotated, rotated: true };
}

// ─── Default rules for the builder ────────────────────────────────────────────

const DEFAULT_RULES = { capture: '23', grandslam: 'nocap', terminal: 'academic' };

// ─── Sentinel value for unresolved positions ──────────────────────────────────

const UNRESOLVED = 0xFF;

// ─── Helper: probe a solved layer for a child position ────────────────────────

/**
 * Probe a solved smaller layer for the value of a child position.
 * The child is first canonicalised (we always store South-to-move),
 * then ranked in its layer.
 *
 * @param {object} childState - Game state after a move { h, score, turn, ncp }
 * @param {number} childS    - boardSeeds of the child position
 * @param {Map}    solvedLayers - Map from s → Uint8Array of values
 * @returns {number|null} - The DB value (seeds the mover captures) or null if not resolved
 */
function probeSolvedLayer(childState, childS, solvedLayers) {
  const layer = solvedLayers.get(childS);
  if (!layer) return null;

  // Canonicalise: the child's turn tells us if rotation is needed
  const { h: canon } = canonicalise(childState.h, childState.turn);
  const idx = rank(canon, childS);
  const val = layer[idx];
  if (val === UNRESOLVED) return null;
  return val;
}

// ─── Build one layer ──────────────────────────────────────────────────────────

/**
 * Build a single EDB layer using van der Goot's forward-move retrograde analysis.
 *
 * For each position in the layer (all positions with exactly `s` seeds on board,
 * stored from South's perspective as the mover):
 *
 * Phase 1 (capture pre-pass): For moves that land in a smaller solved layer,
 *   seed the position's value as the best such move.
 * Phase 2 (terminal initialisation): Positions with no legal moves get value 0
 *   (academic convention: opponent takes all remaining s seeds).
 * Phase 3 (fixed-point iteration): Iterate until all values converge.
 * Phase 4 (verification sweep): Re-derive every entry and assert equality.
 *
 * @param {number} s            - Layer seed count (total seeds on board)
 * @param {object} rules        - Rules tuple { capture, grandslam, terminal }
 * @param {Map}    solvedLayers - Map from s → Uint8Array for all smaller solved layers
 * @returns {Uint8Array}        - Array of values indexed by rank
 */
export function buildLayer(s, rules = DEFAULT_RULES, solvedLayers = new Map()) {
  const size = comb(s + 11, 11);
  const values = new Uint8Array(size).fill(UNRESOLVED);

  // Phase 1: Capture pre-pass — seed from solved smaller layers
  for (let idx = 0; idx < size; idx++) {
    const h = unrank(idx, s);
    const state = { h: h.slice(), score: [0, 0], turn: 0, ncp: 0 };
    const moves = legalMoves(state, rules);

    if (moves.length === 0) continue; // handled in Phase 2

    let bestVal = null;
    for (const mv of moves) {
      const sim = simulate(state, mv, rules);
      if (!sim) continue;

      const child = sim.out;
      child.turn = state.turn ^ 1;
      const childS = boardSeeds(child);

      if (childS < s && solvedLayers.has(childS)) {
        const childVal = probeSolvedLayer(child, childS, solvedLayers);
        if (childVal !== null) {
          const moverVal = s - childVal;
          if (bestVal === null || moverVal > bestVal) {
            bestVal = moverVal;
          }
        }
      }
    }

    if (bestVal !== null) {
      values[idx] = bestVal;
    }
  }

  // Phase 2: Terminal value initialisation
  for (let idx = 0; idx < size; idx++) {
    if (values[idx] !== UNRESOLVED) continue; // already seeded

    const h = unrank(idx, s);
    const state = { h: h.slice(), score: [0, 0], turn: 0, ncp: 0 };
    const moves = legalMoves(state, rules);

    if (moves.length === 0) {
      // Academic convention: opponent gets all remaining seeds.
      // Mover captures 0 from the remaining board seeds.
      values[idx] = 0;
    }
  }

  // Phase 3: Fixed-point iteration
  // We iterate positions that have at least one successor in a smaller layer
  // or in a terminal state. Positions whose ALL successors are within the same
  // layer and form a cycle will never converge through iteration alone.
  //
  // Strategy: iterate until stable, then assign the academic repetition value
  // (floor(s/2)) to any remaining UNRESOLVED positions (they form cycles
  // with no escape to a smaller layer).

  let changed = true;
  while (changed) {
    changed = false;
    for (let idx = 0; idx < size; idx++) {
      if (values[idx] === UNRESOLVED) {
        // Try to compute value from successors that are already resolved
        const h = unrank(idx, s);
        const state = { h: h.slice(), score: [0, 0], turn: 0, ncp: 0 };
        const moves = legalMoves(state, rules);

        if (moves.length === 0) continue; // terminal — already handled in Phase 2

        let bestVal = null;

        for (const mv of moves) {
          const sim = simulate(state, mv, rules);
          if (!sim) continue;

          const child = sim.out;
          child.turn = state.turn ^ 1;
          const childS = boardSeeds(child);

          let childVal;

          if (childS < s) {
            childVal = probeSolvedLayer(child, childS, solvedLayers);
          } else if (childS === s) {
            const { h: canon } = canonicalise(child.h, child.turn);
            const childIdx = rank(canon, childS);
            childVal = values[childIdx] === UNRESOLVED ? null : values[childIdx];
          } else {
            continue;
          }

          if (childVal === null) {
            continue;
          }

          const moverVal = s - childVal;
          if (bestVal === null || moverVal > bestVal) {
            bestVal = moverVal;
          }
        }

        // Only update if we found at least one resolved successor
        if (bestVal !== null) {
          values[idx] = bestVal;
          changed = true;
        }
      } else {
        // Already has a value — re-check if we can improve it
        const h = unrank(idx, s);
        const state = { h: h.slice(), score: [0, 0], turn: 0, ncp: 0 };
        const moves = legalMoves(state, rules);

        if (moves.length === 0) continue;

        let bestVal = 0;

        for (const mv of moves) {
          const sim = simulate(state, mv, rules);
          if (!sim) continue;

          const child = sim.out;
          child.turn = state.turn ^ 1;
          const childS = boardSeeds(child);

          let childVal;

          if (childS < s) {
            childVal = probeSolvedLayer(child, childS, solvedLayers);
          } else if (childS === s) {
            const { h: canon } = canonicalise(child.h, child.turn);
            const childIdx = rank(canon, childS);
            childVal = values[childIdx] === UNRESOLVED ? null : values[childIdx];
          } else {
            continue;
          }

          if (childVal === null) continue;

          const moverVal = s - childVal;
          if (moverVal > bestVal) {
            bestVal = moverVal;
          }
        }

        if (bestVal !== values[idx]) {
          values[idx] = bestVal;
          changed = true;
        }
      }
    }
  }

  // Phase 3b: Assign repetition value to unresolved cycling positions.
  // Under academic convention, repetition splits remaining seeds equally.
  const repetitionValue = Math.floor(s / 2);
  for (let idx = 0; idx < size; idx++) {
    if (values[idx] === UNRESOLVED) {
      values[idx] = repetitionValue;
    }
  }

  return values;
}

// ─── Verification sweep ───────────────────────────────────────────────────────

/**
 * Re-derive every entry in a layer from its successors and assert equality
 * with the stored value. Throws an error on mismatch.
 *
 * For positions whose all same-layer successors also resolve to the repetition
 * value, the position itself should have the repetition value.
 *
 * @param {number}    s            - Layer seed count
 * @param {Uint8Array} values      - The computed layer values
 * @param {object}    rules        - Rules tuple
 * @param {Map}       solvedLayers - Map from s → Uint8Array for smaller layers
 */
export function verifyLayer(s, values, rules = DEFAULT_RULES, solvedLayers = new Map()) {
  const size = values.length;
  const repetitionValue = Math.floor(s / 2);

  for (let idx = 0; idx < size; idx++) {
    const h = unrank(idx, s);
    const state = { h: h.slice(), score: [0, 0], turn: 0, ncp: 0 };
    const moves = legalMoves(state, rules);

    let expectedVal;

    if (moves.length === 0) {
      // Terminal: mover captures 0 under academic convention
      expectedVal = 0;
    } else {
      // Compute best value from resolved successors
      let bestVal = null;

      for (const mv of moves) {
        const sim = simulate(state, mv, rules);
        if (!sim) continue;

        const child = sim.out;
        child.turn = state.turn ^ 1;
        const childS = boardSeeds(child);

        let childVal;

        if (childS < s) {
          childVal = probeSolvedLayer(child, childS, solvedLayers);
        } else if (childS === s) {
          const { h: canon } = canonicalise(child.h, child.turn);
          const childIdx = rank(canon, childS);
          childVal = values[childIdx];
        } else {
          continue;
        }

        if (childVal === null || childVal === undefined) continue;

        const moverVal = s - childVal;
        if (bestVal === null || moverVal > bestVal) {
          bestVal = moverVal;
        }
      }

      expectedVal = bestVal !== null ? bestVal : repetitionValue;
    }

    if (expectedVal !== values[idx]) {
      throw new Error(
        `Verification failed: layer=${s}, idx=${idx}, ` +
        `stored=${values[idx]}, derived=${expectedVal}, ` +
        `position=${JSON.stringify(unrank(idx, s))}`
      );
    }
  }
}

// ─── 4-bit Packed Binary Output ───────────────────────────────────────────────

/**
 * Pack an array of nibble values (0–15) into 4-bit packed binary format.
 * Two entries per byte: high nibble first (value[2i]), low nibble second (value[2i+1]).
 *
 * Byte[i] = (value[2i] << 4) | value[2i + 1]
 *
 * If the array has an odd length, the final byte's low nibble is zero-padded.
 *
 * @param {Uint8Array} values    - Array of values in range 0..15
 * @param {string}     outputPath - File path to write the packed binary
 */
export function emitPackedBinary(values, outputPath) {
  const packed = new Uint8Array(Math.ceil(values.length / 2));
  for (let i = 0; i < values.length; i += 2) {
    const hi = values[i] & 0x0F;
    const lo = (i + 1 < values.length) ? (values[i + 1] & 0x0F) : 0;
    packed[i >> 1] = (hi << 4) | lo;
  }
  // Ensure the output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, packed);
}

/**
 * Unpack a 4-bit packed binary buffer back into an array of nibble values.
 * Two entries per byte: high nibble first, low nibble second.
 *
 * @param {Uint8Array|Buffer} packed - The packed binary data
 * @param {number}            length - The number of values to unpack (needed to handle odd-length arrays)
 * @returns {Uint8Array}             - Array of unpacked values in range 0..15
 */
export function unpackBinary(packed, length) {
  const values = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const byteIdx = i >> 1;
    if (i % 2 === 0) {
      values[i] = (packed[byteIdx] >> 4) & 0x0F;
    } else {
      values[i] = packed[byteIdx] & 0x0F;
    }
  }
  return values;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

/**
 * Build all EDB layers from s=2 to maxN.
 *
 * @param {object} options
 * @param {number} options.maxN   - Maximum layer to build (12=lite, 15=default, 17=max)
 * @param {object} options.rules  - Rules tuple
 */
export async function main(options = {}) {
  const maxN = options.maxN ?? 15;
  const rules = options.rules ?? DEFAULT_RULES;
  const outputDir = options.outputDir ?? path.resolve(process.cwd(), 'edb');

  if (maxN < 2 || maxN > 17) {
    console.error(`Error: maxN must be between 2 and 17, got ${maxN}`);
    process.exit(1);
  }

  const validMaxN = [12, 15, 17];
  if (!validMaxN.includes(maxN)) {
    console.warn(`Warning: maxN=${maxN} is not a standard tier (12/15/17), proceeding anyway.`);
  }

  console.log(`Building EDB layers s=1..${maxN}`);
  console.log(`Rules: capture=${rules.capture}, grandslam=${rules.grandslam}, terminal=${rules.terminal}`);
  console.log(`Output: ${outputDir}`);

  const solvedLayers = new Map();

  // Layer s=0: single position (empty board), terminal. Value = 0.
  const v0 = new Uint8Array(1).fill(0);
  solvedLayers.set(0, v0);

  for (let s = 1; s <= maxN; s++) {
    const size = comb(s + 11, 11);
    console.log(`\nLayer s=${s}: ${size} positions`);

    const t0 = performance.now();
    const values = buildLayer(s, rules, solvedLayers);
    const buildTime = ((performance.now() - t0) / 1000).toFixed(2);
    console.log(`  Built in ${buildTime}s`);

    // Verification sweep
    const t1 = performance.now();
    verifyLayer(s, values, rules, solvedLayers);
    const verifyTime = ((performance.now() - t1) / 1000).toFixed(2);
    console.log(`  Verified in ${verifyTime}s`);

    // Stats
    const resolved = values.filter(v => v !== UNRESOLVED).length;
    console.log(`  Resolved: ${resolved}/${size} (${((resolved / size) * 100).toFixed(1)}%)`);

    // Emit 4-bit packed binary output
    const layerPath = path.join(outputDir, `layer-${s}.bin`);
    emitPackedBinary(values, layerPath);
    const packedSize = Math.ceil(size / 2);
    console.log(`  Written: ${layerPath} (${packedSize} bytes)`);

    solvedLayers.set(s, values);
  }

  console.log(`\nDone. All layers built, verified, and written to ${outputDir}.`);
  return solvedLayers;
}

// ─── CLI invocation ───────────────────────────────────────────────────────────

// Run main() when invoked directly from command line
import { fileURLToPath as _fileURLToPath } from 'url';

const _thisFile = _fileURLToPath(import.meta.url);
const _isMain = process.argv[1] === _thisFile;

if (_isMain) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse --max-n=<N> or --maxN=<N>
  for (const arg of args) {
    const match = arg.match(/^--(?:max-n|maxN|max_n)=(\d+)$/);
    if (match) {
      options.maxN = parseInt(match[1], 10);
      continue;
    }
    const outDirMatch = arg.match(/^--(?:output-dir|outputDir|output_dir)=(.+)$/);
    if (outDirMatch) {
      options.outputDir = path.resolve(outDirMatch[1]);
      continue;
    }
    const captureMatch = arg.match(/^--capture=(23|34)$/);
    if (captureMatch) {
      options.rules = options.rules || { ...DEFAULT_RULES };
      options.rules.capture = captureMatch[1];
      continue;
    }
    const gsMatch = arg.match(/^--grandslam=(nocap|forbid|oppkeeps|leavelast)$/);
    if (gsMatch) {
      options.rules = options.rules || { ...DEFAULT_RULES };
      options.rules.grandslam = gsMatch[1];
      continue;
    }
    const termMatch = arg.match(/^--terminal=(academic|ownrow)$/);
    if (termMatch) {
      options.rules = options.rules || { ...DEFAULT_RULES };
      options.rules.terminal = termMatch[1];
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node build-edb.mjs [options]
Options:
  --max-n=<N>           Maximum layer (12=lite, 15=default, 17=max)
  --output-dir=<path>   Output directory for layer files (default: ./edb)
  --capture=<23|34>     Capture rule (default: 23)
  --grandslam=<rule>    Grand slam rule: nocap|forbid|oppkeeps|leavelast (default: nocap)
  --terminal=<rule>     Terminal rule: academic|ownrow (default: academic)
  --help, -h            Show this help
`);
      process.exit(0);
    }
  }

  main(options).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
