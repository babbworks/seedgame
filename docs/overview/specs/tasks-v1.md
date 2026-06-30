# Implementation Plan: Engine v1 Full Build

## Overview

This plan transforms the existing single-file Oware game (`index.html`) into a full v1 engine with perfect endgame play, off-thread AI, database-mined evaluation, configurable rules, and social features. Tasks are ordered so each builds on the last without breaking the game: rules reform first, then offline tools in parallel, then engine upgrades, then UI features.

## Tasks

- [x] 1. Rules convention reform
  - [x] 1.1 Implement academic terminal convention logic
    - Add `positionHash(state)` function that encodes `h[0..11]` + `turn` into a unique string key
    - Add `hashHistory: Set<string>` to the game state, recording every position visited
    - Modify `isOver` to check for repetition (hash exists in history) and apply academic split rule
    - Modify terminal logic: when mover has no legal move under academic convention, award all `boardSeeds` to opponent
    - Modify terminal logic: on repetition under academic convention, split remaining seeds equally (floor/ceil)
    - Set academic convention as the default on first load / settings reset
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

  - [x] 1.2 Implement own-row terminal convention logic
    - Add own-row terminal path in `isOver` and `collectSides`: each player collects seeds on their own 6 houses
    - Own-row repetition: each player collects own side on cycle detection
    - Wire terminal convention selection to a `rules.terminal` field ('academic' | 'ownrow')
    - _Requirements: 1.4, 4.4_

  - [x] 1.3 Implement repetition detection and ncp cycle limit
    - Reset `hashHistory` at the start of each new game
    - After each `applyMove`, add the resulting position hash to the history
    - Add `checkRepetition(state)` that returns true if `positionHash(state)` already exists in `hashHistory`
    - Retain `ncp` counter; when `ncp >= cycleLimit` (and cycleLimit > 0), trigger terminal convention
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.4 Implement end-mode parity (first-to-25 and all-capture)
    - Add `rules.endMode` field ('firstto' | 'allcap') and `rules.target` (default 25)
    - In `isOver`: if `endMode === 'firstto'` and either score >= target, return over
    - In `isOver`: if `endMode === 'allcap'`, continue until board empty / repetition / no move
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.5 Expand the Rules menu UI
    - Add terminal-convention selector: "Academic (opponent-takes-all)" / "Own-row (each keeps own side)"
    - Add repetition-resolution selector: "Split evenly" / "Own-row" / "Last mover takes all"
    - Add end-mode selector: "First to 25 (majority)" / "All capture (play to finality)"
    - Add cycle-limit control with values: 20 / 50 / 100 / 200 / unlimited (0), default 100
    - Ensure rule changes apply to next game (not mid-game)
    - Persist all rule options in localStorage alongside existing preferences
    - Keep existing capture-rule and grand-slam selectors in place
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x] 1.6 Write property tests for rules engine (Properties 1–8)
    - **Property 1: Academic terminal — opponent receives all seeds on no-move**
    - **Property 2: Academic repetition — seeds split equally**
    - **Property 3: Own-row terminal — each player collects own side**
    - **Property 4: Hash history grows with each move**
    - **Property 5: Repetition detection correctness**
    - **Property 6: ncp counter triggers terminal at cycle limit**
    - **Property 7: First-to-25 terminates at threshold**
    - **Property 8: All-capture mode continues despite high scores**
    - **Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.4, 3.2, 3.3**

- [x] 2. Checkpoint — rules reform
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Rules module extraction
  - [x] 3.1 Create `tools/oware-rules.mjs` ES module
    - Extract `simulate`, `applyMove`, `legalMoves`, `isOver`, `collectSides`, `newState`, `clone` from `index.html`
    - Export helper utilities: `belongs`, `sideSeeds`, `boardSeeds`, `capturable`
    - Accept a `rules` parameter tuple `{capture, grandslam, terminal}` in all exported functions
    - Implement both academic and own-row terminal logic, selectable via `rules.terminal`
    - Ensure the module is pure ES module importable by Node.js without browser dependencies
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 3.2 Write property test for Rules Module equivalence (Property 9)
    - **Property 9: Rules Module equivalence**
    - Generate random `(state, move, rules)` triples; verify identical output between module and `index.html` logic
    - **Validates: Requirements 4.2, 4.4**

- [x] 4. EDB builder (`tools/build-edb.mjs`)
  - [x] 4.1 Implement combinatorial rank/unrank functions
    - Implement `comb(n, k)` binomial coefficient with memoisation
    - Implement `rank(h, s)` mapping distributions to indices via combinatorial number system
    - Implement `unrank(idx, s)` reconstructing distributions from indices
    - Implement `canonicalise(h, turn)` — 180° rotation for North-to-move positions
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 4.2 Write property tests for rank/unrank and canonicalisation (Properties 10–11)
    - **Property 10: Rank/unrank round-trip**
    - **Property 11: Canonicalisation idempotence and symmetry**
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 4.3 Implement forward-move retrograde builder
    - Import Rules_Module functions for move generation
    - Phase 1 (capture pre-pass): seed resolved values from solved smaller layers
    - Phase 2 (terminal initialisation): set values for positions with no legal moves
    - Phase 3 (fixed-point iteration): iterate until all values converge
    - Phase 4 (verification sweep): re-derive every entry from successors, abort on mismatch
    - Accept ruleset tuple `{capture, grandslam, terminal}` as build parameter, defaulting to `{capture:'23', grandslam:'nocap', terminal:'academic'}`
    - Support configurable max N: 12 (lite), 15 (default), 17 (max)
    - _Requirements: 5.1, 5.5, 5.6, 5.8, 5.9, 5.10_

  - [x] 4.4 Implement 4-bit packed binary output
    - Pack two nibble values per byte (high nibble first, low nibble second)
    - Emit layer files as `edb/layer-{s}.bin`
    - _Requirements: 5.7_

  - [x] 4.5 Write property test for 4-bit packing round-trip (Property 12)
    - **Property 12: 4-bit packing round-trip**
    - **Validates: Requirements 5.7**

- [x] 5. Checkpoint — offline tools
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Evaluation function upgrade
  - [x] 6.1 Implement feature extraction
    - Implement `extractFeatures(state, me)` computing: material difference, oppEmptyPits, ownEmptyPits, reach, krooCount
    - `reach`: count own pits with enough seeds to sow into opponent territory
    - `krooCount`: count own pits with more than 12 seeds
    - _Requirements: 10.1_

  - [x] 6.2 Implement decision-tree evaluator
    - Define `EVAL_TREE` structure with binary splits on features; leaves hold `(μ, σ)` pairs
    - Implement `evalDecisionTree(state, rules, me)`: classify position through tree, compute `round(((μ + material) / σ) * 100)`
    - Replace current hand-set linear weights for Medium and Hard difficulties
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 6.3 Write property tests for evaluation (Properties 14–15)
    - **Property 14: Feature extraction correctness**
    - **Property 15: Evaluation formula correctness**
    - **Validates: Requirements 10.1, 10.3**

- [x] 7. Web Worker migration
  - [x] 7.1 Create the Worker source string and instantiation
    - Define `WORKER_CODE` as a string literal in `index.html` containing: rules engine subset, search, evaluation, TT, DB probe
    - Instantiate via `new Worker(URL.createObjectURL(new Blob([WORKER_CODE], {type:'application/javascript'})))`
    - Implement `onmessage` handler in Worker supporting message types: `init`, `search`, `stop`, `ponder`, `ponderHit`, `ponderMiss`, `dbLayerReady`
    - _Requirements: 6.1, 6.2, 16.1, 16.2_

  - [x] 7.2 Implement negamax/alpha-beta search in Worker
    - Port existing search into the Worker string
    - Implement `rootSearch(state, rules, config)` returning `{bestMove, eval, pv}`
    - Handle `stop` messages: check abort flag per iteration, return best move found so far
    - Map difficulty presets to `SearchConfig` (depth, blunderRate → margin, useDB)
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 7.3 Implement move ordering
    - Order capture moves before non-capture moves
    - Sort captures by captured-seed count descending
    - If TT entry exists with best-move hint, try that move first
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 7.4 Implement transposition table
    - Define `TTEntry`: hash, value, depth, bound (exact/lower/upper), bestMove
    - Implement store-independent hash: encode `h[0..11]` + turn (no banked scores)
    - Implement enhanced transposition cut-off (exact/lower/upper bounds)
    - Implement safe futility pruning: prune when `score[me] + boardSeeds <= alpha`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 7.5 Write property tests for move ordering and TT (Properties 16–18)
    - **Property 16: Move ordering — captures first, descending**
    - **Property 17: Transposition table store/probe round-trip**
    - **Property 18: Safe futility pruning soundness**
    - **Validates: Requirements 11.1, 11.2, 12.1, 12.2, 12.4**

  - [x] 7.6 Wire Worker into main thread UI
    - Replace direct `chooseMove` call with Worker message passing
    - Send `{type:'search', state, rules, difficulty}` on AI turn
    - Receive `{type:'result', bestMove, eval, pv}` and apply the move
    - Ensure main thread remains responsive during search
    - Add Worker error handling: fallback to main-thread search if Worker fails
    - _Requirements: 6.3, 6.4_

- [x] 8. Checkpoint — Worker migration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. DB integration and progressive loading
  - [x] 9.1 Implement Storage Manager
    - Detect OPFS availability (`navigator.storage.getDirectory`); fall back to IndexedDB
    - Implement `hasLayer(s)`, `storeLayer(s, data)`, `getLayerHandle(s)` for both backends
    - OPFS path: use `FileSystemSyncAccessHandle` for synchronous reads in Worker
    - IndexedDB fallback: load layer `ArrayBuffer` into Worker RAM on game start
    - _Requirements: 7.4, 7.5, 8.5_

  - [x] 9.2 Implement DB probe in Worker
    - Implement full probe pipeline: `canonicalise → rank → seek to byte offset rank/2 → read nibble → return value`
    - High nibble for even rank, low nibble for odd rank
    - Implement `dbValueToScore` converting DB value to search score relative to the searching player
    - Use DB probe as leaf evaluator when child positions fall within loaded layers
    - When `boardSeeds <= N` and layer loaded, return exact game-theoretic result instead of heuristic
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 9.3 Write property test for DB probe (Property 13)
    - **Property 13: DB probe returns correct value for known positions**
    - Build a small test layer (s=2 or s=3), probe all positions, verify against builder output
    - **Validates: Requirements 7.1**

  - [x] 9.4 Implement progressive loading
    - On game load, begin background fetch of layers s=2..12 (lite tier) in order
    - On lite tier complete, continue fetching s=13..15 (full tier)
    - On each layer completion, persist to OPFS/IndexedDB and notify Worker via `{type:'dbLayerReady', layer, storageType}`
    - Make new layers immediately available without page reload
    - Handle fetch failures with exponential backoff (3 retries)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.5 Implement AI strength indicator
    - Display strength label near difficulty selector: "AI: heuristic" / "AI: lite (≤12)" / "AI: full (≤15)"
    - Update label when tier transitions occur (lite tier complete, full tier complete)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. Checkpoint — DB integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Pondering
  - [x] 11.1 Implement pondering in Worker
    - On `{type:'ponder', state, rules, expectedMove}`: begin searching the expected reply position
    - On `{type:'ponderHit'}`: return pondering result immediately as the AI's move
    - On `{type:'ponderMiss', state, rules, difficulty}`: discard ponder result, start fresh search
    - Ensure pondering responds to `stop` messages and doesn't block new search requests
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 11.2 Wire pondering into main thread
    - After AI moves, predict best human response (from PV) and send ponder message
    - On human move: if matches prediction, send ponderHit; else send ponderMiss with actual position
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 12. AI configurability
  - [x] 12.1 Implement AI configuration UI
    - Add search-depth selector (4 / 6 / 8 / 10 / 12 plies)
    - Add blunder-rate slider (0–100%) mapping to near-best margin
    - Add endgame-DB toggle (on/off)
    - Add difficulty presets: Easy (depth 4, blunder 60%, DB off), Medium (depth 6, blunder 20%, DB on), Hard (depth 8, blunder 0%, DB on), Custom
    - When preset selected, set all three parameters; when any parameter manually adjusted, switch to "Custom"
    - Persist AI config in localStorage under `zako-oware-ai`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [x] 13. Per-pairing seed tally and player profiles
  - [x] 13.1 Implement player profiles
    - Add profile registration: name entry creating a profile stored in localStorage under `zako-oware-profiles`
    - Maintain a list of unique registered profile names
    - In 2-player mode, allow each side to select a registered profile or "Guest"
    - _Requirements: 19.1, 19.2, 19.3, 19.5_

  - [x] 13.2 Implement per-pairing seed tally
    - On game end, add each player's final score to cumulative tally for the active pairing
    - Key tally by pairing: `vs-cpu-easy`, `vs-cpu-medium`, `vs-cpu-hard`, `vs-<username>` for 2P (sorted alphabetically)
    - Persist tally in localStorage under `zako-oware-tally`
    - Display tally in records plaque: "You [N] — [M] [Opponent Name]"
    - Provide "reset tally" action (separate from "new game" / "reset records") clearing only active pairing
    - Preserve tally across new games
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 19.4_

  - [x] 13.3 Write property tests for seed tally (Properties 19–21)
    - **Property 19: Seed tally accumulates correctly**
    - **Property 20: Seed tally persists across new games**
    - **Property 21: Tally display format**
    - **Validates: Requirements 14.1, 14.3, 14.5**

- [x] 14. Game complexity metric
  - [x] 14.1 Implement complexity metric
    - Compute `C(boardSeeds + 11, 11)` as the raw layer configuration count
    - Normalise against full state-space benchmark (~8.9 × 10¹¹) using log-scale to 0–100
    - Display as a subtle indicator (small numeric readout or thin bar) that doesn't interfere with gameplay
    - Update after every move
    - Indicate "solved" when `boardSeeds <= N` (DB covers the position)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 14.2 Write property test for complexity metric (Property 22)
    - **Property 22: Complexity metric computation**
    - Verify `raw === C(s+11,11)`, normalised in [0,100], monotonically non-decreasing with layer size
    - **Validates: Requirements 18.1, 18.2**

- [x] 15. Alternate numeral display modes
  - [x] 15.1 Implement numeral formatter and UI
    - Implement `formatNumeral(n, mode)` supporting: Arabic, Binary (6-bit padded), Hexadecimal (uppercase), Tally (𝍸 groups + · remainder), Roman
    - Add display-mode selector in settings/Rules area
    - Apply numeral mode to all pit seed counts across the board (including move preview and demo boards)
    - Persist selected mode in localStorage; restore on reload
    - Adjust font-size responsively for wider representations (binary, tally)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 15.2 Write property test for numeral formatting (Property 23)
    - **Property 23: Numeral formatting correctness**
    - For seed counts 0–48: verify Arabic = `String(n)`, Binary = 6-char `0`/`1` string, Hex = uppercase, Tally = correct mark/dot counts, Roman = standard representation
    - **Validates: Requirements 20.2, 20.3**

- [x] 16. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The offline builder tools (tasks 3–4) can be built in parallel with in-game engine changes
- The Worker migration (task 7) should happen after rules/eval are stable
- Progressive loading and OPFS depend on the Worker being in place
- UI features (numerals, profiles, tally, complexity) are largely independent of each other
- All runtime code stays in `index.html`; only build tools and binary assets are external

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 5, "tasks": ["4.4", "6.2"] },
    { "id": 6, "tasks": ["4.5", "6.3", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4", "7.5"] },
    { "id": 9, "tasks": ["7.6"] },
    { "id": 10, "tasks": ["9.1", "9.2"] },
    { "id": 11, "tasks": ["9.3", "9.4"] },
    { "id": 12, "tasks": ["9.5", "11.1"] },
    { "id": 13, "tasks": ["11.2", "12.1"] },
    { "id": 14, "tasks": ["13.1", "14.1", "15.1"] },
    { "id": 15, "tasks": ["13.2", "13.3", "14.2", "15.2"] }
  ]
}
```
