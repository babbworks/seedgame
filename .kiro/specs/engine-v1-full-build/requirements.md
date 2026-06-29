# Requirements Document

## Introduction

This specification defines the full v1 engine build for oware-web — a comprehensive reform of the existing single-file browser game (`index.html`) that implements Oware. The reform upgrades the rules engine, AI search architecture, evaluation function, endgame database integration, and scoring features while preserving the single-file constraint. The game code remains in one `index.html` (with Web Worker instantiated via inline Blob URL); offline build tools and binary database assets are external.

## Glossary

- **Engine**: The Oware rules engine implemented in `index.html` — the functions `simulate`, `applyMove`, `legalMoves`, `isOver`, `collectSides`, and supporting logic.
- **Worker**: A dedicated Web Worker instantiated from an inline Blob URL that runs the AI search (negamax, evaluation, DB probing) off the main thread.
- **EDB**: Endgame Database — a precomputed binary file containing perfect-play values for all board positions with ≤ N seeds remaining on board.
- **Layer**: A slice of the EDB covering all positions with exactly `s` seeds on board (one layer per value of `s` from 2 to N).
- **Rank**: The combinatorial-number-system index mapping a seed distribution `h[0..11]` with `Σh = s` to a unique integer in `0 … C(s+11, 11) - 1`.
- **OPFS**: Origin Private File System — a browser API providing synchronous file access within a Web Worker via `FileSystemSyncAccessHandle`.
- **Academic_Convention**: Terminal rule where the opponent captures all remaining seeds when the mover has no legal move, and seeds are split equally on repetition.
- **Own_Row_Convention**: Terminal rule where each player collects the seeds on their own side when the game ends by cycle or no-move.
- **Transposition_Table**: A hash table storing previously evaluated positions (board hash → value, depth, bound type) to avoid re-searching identical game states.
- **Pondering**: The Worker continues searching the expected reply position during the opponent's turn, discarding results if the opponent plays a different move.
- **Builder**: The offline Node.js script (`tools/build-edb.mjs`) that constructs the EDB via forward-move retrograde analysis.
- **Rules_Module**: The reusable ES module (`tools/oware-rules.mjs`) that extracts the Engine's rules logic for use by the Builder.
- **Seed_Tally**: A per-pairing cumulative total of seeds captured by each player across all games between a specific pairing, persisted in localStorage.
- **Progressive_Loading**: Background downloading and caching of EDB layers in tiers (N=12 first, then N=13-15) so the game is playable immediately without the database.
- **DB_Probe**: The function `rank → seek → read nibble → return value` that looks up a position's perfect-play value from the EDB.
- **Canonicalisation**: The 180° rotation that maps any North-to-move position to its South-to-move equivalent for EDB lookup, halving storage requirements.

## Requirements

### Requirement 1: Academic Terminal Convention as Default

**User Story:** As a player, I want the game to use the academic/competitive terminal convention by default, so that the engine aligns with the solved-game literature and competitive software.

#### Acceptance Criteria

1. WHEN the mover has no legal move, THE Engine SHALL award all remaining on-board seeds to the opponent under the Academic_Convention.
2. WHEN a position recurs (detected via hash history), THE Engine SHALL split the remaining on-board seeds equally between both players under the Academic_Convention.
3. THE Engine SHALL use the Academic_Convention as the default terminal rule on first load and after a settings reset.
4. WHERE the Own_Row_Convention is selected in the Rules menu, THE Engine SHALL instead collect each player's own-row seeds to their respective stores on terminal conditions.

### Requirement 2: Repetition Detection via Position Hash History

**User Story:** As a player, I want the engine to detect repeated positions accurately, so that cyclic games terminate correctly under the active convention.

#### Acceptance Criteria

1. THE Engine SHALL maintain a hash history recording the board state (`h[0..11]` combined with `turn`) for every position visited in the current game.
2. WHEN a position hash matches any previously recorded hash in the current game, THE Engine SHALL declare the position a repetition and apply the active terminal convention's repetition rule.
3. THE Engine SHALL reset the hash history at the start of each new game.
4. THE Engine SHALL retain the `ncp` counter (no-capture ply counter) as a secondary safety-net timeout, applying the terminal convention when `ncp` reaches the cycle limit.

### Requirement 3: End Mode Parity

**User Story:** As a player, I want both first-to-25 and all-capture end modes available as equal options, so that I can choose my preferred style of play.

#### Acceptance Criteria

1. THE Engine SHALL present first-to-25 (majority) and all-capture (play to finality) as selectable options in the Rules menu with no default privilege between them.
2. WHEN first-to-25 mode is active and either player's banked score reaches 25 or more, THE Engine SHALL end the game immediately.
3. WHEN all-capture mode is active, THE Engine SHALL continue play until the board is empty, a repetition is detected, or no legal move remains.

### Requirement 4: Rules Module Extraction

**User Story:** As a developer, I want the engine's rules logic extracted into a reusable ES module, so that the offline EDB Builder can use the same verified logic.

#### Acceptance Criteria

1. THE Rules_Module SHALL export the functions `simulate`, `applyMove`, `legalMoves`, `isOver`, `collectSides`, `newState`, `clone`, and supporting utilities (`belongs`, `sideSeeds`, `boardSeeds`, `capturable`).
2. THE Rules_Module SHALL accept a `rules` parameter tuple of `(capture, grandslam, terminal)` and produce identical results to the corresponding logic in `index.html` for any given state and move.
3. THE Rules_Module SHALL be a valid ES module (`tools/oware-rules.mjs`) importable by Node.js without browser dependencies.
4. THE Rules_Module SHALL implement both Academic_Convention and Own_Row_Convention terminal logic, selectable via the `terminal` field in the rules parameter.

### Requirement 5: Endgame Database Builder

**User Story:** As a developer, I want an offline build tool that generates perfect-play endgame databases, so that the AI can play perfectly in positions with few seeds.

#### Acceptance Criteria

1. THE Builder SHALL import the Rules_Module and use its `simulate`/`applyMove`/`legalMoves` functions for all move generation during the build.
2. THE Builder SHALL implement rank and unrank functions using the combinatorial number system over the stars-and-bars distribution of `s` seeds into 12 houses, mapping each valid distribution to a unique index in `0 … C(s+11, 11) - 1`.
3. FOR ALL valid board distributions `h` with `Σh = s`, unranking the rank of `h` SHALL produce the original distribution `h` (round-trip property).
4. THE Builder SHALL apply one-level 180° color symmetry Canonicalisation: store only South-to-move values and rotate North-to-move positions before lookup.
5. THE Builder SHALL execute van der Goot's three-phase forward-move retrograde analysis per layer: (a) capture pre-pass seeding from solved smaller layers, (b) terminal value initialisation, (c) fixed-point iteration until convergence.
6. THE Builder SHALL run a verification sweep after each layer, re-deriving every entry from its successors and asserting equality with the stored value.
7. THE Builder SHALL emit 4-bit packed binary output (two entries per byte, high nibble then low nibble) for each layer file.
8. THE Builder SHALL accept a ruleset tuple `(capture, grandslam, terminal)` as a build parameter, defaulting to `{capture: '23', grandslam: 'nocap', terminal: 'academic'}`.
9. THE Builder SHALL support configurable maximum N (tier): N=12 (lite), N=15 (default), N=17 (max).
10. IF the verification sweep detects any mismatch between stored and re-derived values, THEN THE Builder SHALL abort with a diagnostic error identifying the layer and position index.

### Requirement 6: Web Worker AI Architecture

**User Story:** As a player, I want the AI search to run in a background thread, so that the game interface remains responsive during computation.

#### Acceptance Criteria

1. THE Worker SHALL be instantiated from an inline Blob URL constructed from a string embedded in `index.html`, preserving the single-file constraint.
2. THE Worker SHALL contain the complete negamax/alpha-beta search, evaluation function, Transposition_Table, and DB_Probe logic.
3. WHEN the main thread sends a message `{type: 'search', state, rules, difficulty}`, THE Worker SHALL return a message `{type: 'result', bestMove, eval, pv}` containing the chosen move, its evaluation score, and the principal variation.
4. WHILE the Worker is searching, THE main thread SHALL remain responsive to user input and rendering.
5. IF the Worker receives a `{type: 'stop'}` message during search, THEN THE Worker SHALL abort the current search and return the best move found so far.

### Requirement 7: Endgame Database Integration

**User Story:** As a player, I want the AI to play perfectly in endgame positions where the database covers, so that the engine strength is maximized.

#### Acceptance Criteria

1. THE DB_Probe function SHALL map a board state to its EDB value via: canonicalise position → compute rank for layer `s = boardSeeds` → seek to byte offset `rank / 2` → read the appropriate nibble (high for even rank, low for odd rank) → return the value.
2. WHEN `boardSeeds(state) ≤ N` and the corresponding layer is loaded, THE Worker SHALL use the DB_Probe value directly instead of heuristic evaluation, returning the exact game-theoretic result.
3. WHILE searching above the database threshold, THE Worker SHALL use DB_Probe as a leaf evaluator whenever a child position falls within the loaded layers.
4. THE Engine SHALL store EDB layer files in OPFS as the primary storage backend, using `FileSystemSyncAccessHandle` for synchronous reads within the Worker.
5. IF OPFS is unavailable, THEN THE Engine SHALL fall back to IndexedDB storage, loading layer ArrayBuffers into Worker RAM on game start.

### Requirement 8: Progressive Database Loading

**User Story:** As a player, I want the game to be playable immediately on first visit and for AI strength to improve progressively in the background, so that I never wait for downloads.

#### Acceptance Criteria

1. THE Engine SHALL be fully playable with heuristic-only AI when no EDB layers are cached.
2. WHEN the game loads and EDB layers are not fully cached, THE Engine SHALL begin background fetching of layers starting from s=2 up to s=12 (lite tier) as the first priority.
3. WHEN all lite-tier layers (s=2 through s=12) are cached, THE Engine SHALL continue background fetching of layers s=13 through s=15 (default tier).
4. WHEN a layer download completes, THE Engine SHALL immediately make that layer available to the Worker for probing without requiring a page reload.
5. THE Engine SHALL persist each downloaded layer in OPFS (primary) or IndexedDB (fallback) so that subsequent visits have instant full-strength AI with zero re-download.

### Requirement 9: AI Strength Indicator

**User Story:** As a player, I want to see what database tier is currently active, so that I understand the AI's playing strength.

#### Acceptance Criteria

1. THE Engine SHALL display a strength indicator label near the difficulty selector showing the current AI capability tier.
2. WHILE no EDB layers are loaded, THE Engine SHALL display "AI: heuristic" as the strength indicator.
3. WHEN all layers up to s=12 are loaded, THE Engine SHALL update the strength indicator to "AI: lite (≤12)".
4. WHEN all layers up to s=15 are loaded, THE Engine SHALL update the strength indicator to "AI: full (≤15)".

### Requirement 10: Evaluation Function Upgrade

**User Story:** As a player, I want the AI to evaluate positions more accurately using database-mined knowledge, so that it plays stronger above the database threshold.

#### Acceptance Criteria

1. THE Worker SHALL compute the following features for position evaluation: material difference, opponent empty-pit count, own empty-pit count, reach (number of own pits with enough seeds to sow into opponent territory), and explicit kroo count (own pits with more than 12 seeds).
2. THE Worker SHALL implement a decision-tree evaluator whose leaf nodes contain fitted `(μ, σ)` values derived from offline analysis of the N=15 EDB.
3. WHEN evaluating a position above the database threshold, THE Worker SHALL classify the position through the decision tree, then compute the evaluation as `z = (μ + material_score) / σ`.
4. THE Worker SHALL replace the current hand-set linear weight evaluation with the decision-tree evaluation for Medium and Hard difficulties.

### Requirement 11: Move Ordering

**User Story:** As a developer, I want efficient move ordering in the search, so that alpha-beta pruning is maximized and search completes faster.

#### Acceptance Criteria

1. THE Worker SHALL order capture moves before non-capture moves in the search loop.
2. THE Worker SHALL sort capture moves by captured-seed count in descending order.
3. WHEN a Transposition_Table entry exists for the current position with a best-move hint, THE Worker SHALL try that move first before other moves.

### Requirement 12: Transposition Table

**User Story:** As a developer, I want a transposition table in the search, so that identical positions reached by different move orders are not re-searched.

#### Acceptance Criteria

1. THE Worker SHALL maintain a Transposition_Table mapping full-board hash keys to stored entries containing: value, search depth, bound type (exact/lower/upper), and best move.
2. THE Worker SHALL compute the board hash from the active on-board seed counters and side-to-move (store-independent, matching the EDB encoding philosophy).
3. WHEN a position is found in the Transposition_Table with sufficient depth and a usable bound, THE Worker SHALL apply an enhanced transposition cut-off to prune the search.
4. THE Worker SHALL implement safe futility pruning using the hard score bound computable from the total seeds remaining in play.

### Requirement 13: Pondering

**User Story:** As a player, I want the AI to think during my turn, so that its response appears faster when I move.

#### Acceptance Criteria

1. WHEN the human player's turn begins after the AI has moved, THE Worker SHALL begin searching the expected reply position (the position resulting from the AI's predicted best human response).
2. WHEN the human plays the predicted move, THE Worker SHALL use the pondering result immediately as its response.
3. WHEN the human plays a different move than predicted, THE Worker SHALL discard the pondering result and begin a fresh search on the actual resulting position.
4. WHILE pondering, THE Worker SHALL respond to stop messages and not block processing of new search requests.

### Requirement 14: Per-Pairing Cumulative Seed Tally

**User Story:** As a player, I want a running total of seeds captured across all games against each opponent, so that I have an ongoing relationship metric beyond individual game results.

#### Acceptance Criteria

1. WHEN a game ends, THE Engine SHALL add each player's final score (seeds captured in that game) to the cumulative seed tally for the active pairing.
2. THE Engine SHALL persist the seed tally in localStorage under the key `zako-oware-tally` as a JSON object with per-pairing entries (keys: `vs-cpu-easy`, `vs-cpu-medium`, `vs-cpu-hard`, `vs-<username>` for 2P mode).
3. THE Engine SHALL display the cumulative seed tally in the records plaque in the format "You [N] — [M] [Opponent Name]" (e.g., "You 342 — 319 Computer (Medium)").
4. THE Engine SHALL provide a "reset tally" action that is separate from "new game" and "reset records", clearing only the seed tally for the active pairing.
5. THE Engine SHALL preserve the seed tally across new games — only the explicit "reset tally" action clears it.

### Requirement 15: Rules Menu Expansion

**User Story:** As a player, I want every rule variation and game parameter exposed as a selectable option, so that I can configure the game in a myriad of ways reflecting the full optionality of Oware's rule space.

#### Acceptance Criteria

1. THE Engine SHALL add a terminal-convention selector to the Rules menu with options: "Academic (opponent-takes-all)" and "Own-row (each keeps own side)".
2. THE Engine SHALL add a repetition-resolution selector with options: "Split evenly", "Own-row (each keeps own side)", and "Last mover takes all".
3. THE Engine SHALL add an end-mode selector with options: "First to 25 (majority)" and "All capture (play to finality)".
4. THE Engine SHALL add a cycle-limit control (sliding scale or discrete selector) with values: 20 / 50 / 100 / 200 / unlimited (0), defaulting to 100.
5. WHEN the player changes any rule setting, THE Engine SHALL apply the new rule to the next game started (not mid-game).
6. THE Engine SHALL persist all selected rule options in localStorage alongside existing rules preferences.
7. THE Engine SHALL continue to expose the existing capture-rule selector (2-3 / 3-4) and grand-slam selector (no capture / forbidden / opponent keeps / leave last) as already present in the UI.

### Requirement 16: Single-File Preservation

**User Story:** As a developer, I want all game code to remain in a single `index.html` file with no external runtime dependencies, so that the game works offline and from `file://`.

#### Acceptance Criteria

1. THE Engine SHALL contain all game logic, UI code, Worker source, and styling within a single `index.html` file.
2. THE Worker SHALL be instantiated via `new Worker(URL.createObjectURL(new Blob([workerCode])))` where `workerCode` is a string literal embedded in `index.html`.
3. THE Engine SHALL function fully (heuristic-only AI mode) when served from `file://` protocol without any network access.
4. THE Engine SHALL have no runtime dependencies on npm packages, bundlers, frameworks, or external JavaScript files.

### Requirement 17: AI Strength & Behaviour Configurability

**User Story:** As a player, I want fine-grained control over the AI's playing strength and personality, so that I can tailor the challenge for learning, casual play, or maximum difficulty.

#### Acceptance Criteria

1. THE Engine SHALL provide an AI search-depth control (discrete selector: 4 / 6 / 8 / 10 / 12 plies) accessible from an expanded difficulty/AI panel.
2. THE Engine SHALL provide a blunder-rate control (sliding scale 0–100%) that governs how far from the best move the AI is willing to play, where 0% = always play the objectively best move and 100% = uniformly random legal move. This maps internally to the existing "near-best margin" mechanism.
3. THE Engine SHALL provide an endgame-DB usage toggle (on/off) that, when off, forces the AI to use heuristic evaluation even in positions the database covers.
4. THE Engine SHALL provide difficulty presets as convenience shortcuts that configure depth, blunder rate, and DB usage coherently:
   - Easy: depth 4, blunder 60%, DB off
   - Medium: depth 6, blunder 20%, DB on
   - Hard: depth 8, blunder 0%, DB on
   - Custom: user sets each parameter independently
5. WHEN the player selects a preset, THE Engine SHALL set all three parameters to the preset's values. WHEN the player manually adjusts any parameter, THE Engine SHALL switch the displayed preset to "Custom".
6. THE Engine SHALL persist the AI configuration (preset or custom values) in localStorage.

### Requirement 18: Game Complexity Metric

**User Story:** As a player, I want to see a live measure of how deep into the game's combinatorial space the current position sits, so that I gain intuition for the mathematical structure of Oware during play.

#### Acceptance Criteria

1. THE Engine SHALL compute a live "complexity rating" for the current board position based on the layer configuration count: the number of possible positions at the current board-seed count, expressed as `C(boardSeeds + 11, 11)`.
2. THE Engine SHALL normalise this count against the full state-space benchmark (≈ 8.9 × 10¹¹ reachable positions) to produce a 0–100 scale representing "how far into the game's combinatorial space this position sits."
3. THE Engine SHALL display the complexity metric as a subtle, non-dominant indicator (e.g., a small numeric readout or a thin progress-style bar) that does not interfere with gameplay.
4. THE Engine SHALL update the complexity metric after every move.
5. IF the board-seed count is within the database range (≤ N), THE Engine SHALL additionally indicate that the position is "solved" (the DB covers it perfectly).

### Requirement 19: Player Profiles for 2P Mode

**User Story:** As a player sharing a device with others, I want to register named profiles so that per-pairing tallies, records, and future features can track individual players.

#### Acceptance Criteria

1. THE Engine SHALL provide a simple player registration: a name entry that creates a profile stored in localStorage.
2. THE Engine SHALL maintain a list of registered profile names (unique usernames).
3. WHEN in 2-player mode, THE Engine SHALL allow each side to select a registered profile (or "Guest") before starting a game.
4. THE Engine SHALL key the per-pairing seed tally (Requirement 14) to the selected profile names, so that "Alice vs Bob" accumulates separately from "Alice vs Carol".
5. THE Engine SHALL persist profile data under a dedicated localStorage key (`zako-oware-profiles`).

### Requirement 20: Alternate Numeral Display Modes

**User Story:** As a player, I want to choose how seed counts are displayed in the cups, so that I can explore different numeral systems while playing and deepen my understanding of number representation.

#### Acceptance Criteria

1. THE Engine SHALL provide a display-mode selector (accessible from a settings panel or the Rules area) with the following numeral systems: Arabic (default), Binary, Hexadecimal, Tally, and Roman.
2. WHEN a numeral mode is selected, THE Engine SHALL render all pit seed counts in that mode across the board, including during move preview and in the demo boards of the learning component.
3. THE Engine SHALL format each mode as follows:
   - Arabic: standard decimal digits (e.g., "12")
   - Binary: zero-padded to 6 bits (e.g., "001100")
   - Hexadecimal: uppercase with no prefix (e.g., "C")
   - Tally: groups of five as `𝍸` (tally mark) with remainders as dots (e.g., "𝍸𝍸··" for 12)
   - Roman: standard Roman numerals (e.g., "XII"); values above 48 are not possible
4. THE Engine SHALL persist the selected numeral mode in localStorage and restore it on reload.
5. THE Engine SHALL ensure all numeral modes remain legible within the cup's container-query-sized text area, adjusting font-size responsively if a representation is wider than Arabic.
