# Architecture Decisions — v1 Reference

**Purpose.** A single reference capturing every architectural decision made for
the oware-web engine v1 build. Organized for use as source material when writing
formal user-facing documentation. Each entry states the decision, rationale,
alternatives considered, and outcome.

**Scope:** v1 means the *full* engine — there is no deferred "v2." Everything
listed here ships together.

---

## 1. Engine Architecture

### D-ARCH-01: The Lithidion Stack
**Decision:** Three-layer architecture — opening book → α-β search with
DB-mined evaluation → endgame database.

**Rationale:** Proven by every Oware world champion since 1990 (Lithidion,
Marvin, Softwari, Aalina). Validated against MCTS (wrong for narrow ≤6
branching), full-DB delivery (impossible at 178+ GB), and pure neural network
(a compatible internal upgrade, not a replacement).

**Alternatives rejected:**
- MCTS/UCT — requires thousands of rollouts per move; can't match a perfect
  DB lookup; designed for wide trees (Go: b≈250), not Oware (b≤6).
- Full database oracle (à la 48stones) — requires server backend or 200+ GB
  client storage; violates offline/single-file constraint.
- Pure NNUE — replaces only the eval layer; still needs α-β + DB underneath.

### D-ARCH-02: Single-File Constraint Preserved
**Decision:** The game remains a single `index.html` with no external
dependencies, working offline and from `file://`.

**Implication for Worker:** The AI Web Worker is instantiated from an inline
Blob URL (`new Worker(URL.createObjectURL(new Blob([code])))`), keeping all
code in one file.

**Implication for DB:** The endgame database is an *external binary asset*
downloaded and cached in OPFS/IndexedDB — it is data, not code. The game is
fully playable without it (heuristic-only AI). This is analogous to how the
`docs/` folder is external content fetched by the knowledge rail.

### D-ARCH-03: Web Worker for AI Search
**Decision:** Move all search (negamax, DB probing, eval) into a dedicated
Web Worker.

**Rationale:** Keeps the main thread responsive during depth-8 search. Enables
synchronous DB access via OPFS `FileSystemSyncAccessHandle`. Enables future
pondering (search on opponent's time).

---

## 2. Endgame Database

### D-DB-01: Truncation Threshold N = 15
**Decision:** Default database covers all positions with ≤ 15 seeds on the
board. Tiered offering: N=12 (lite, 1.4 MB), N=15 (default, 8.7 MB), N=17
(max, 32 MB).

**Rationale:** N=15 is the largest N whose value range (0…15) fits in exactly
4 bits. Past 15, values require 5 bits — a 25% size increase per entry with
diminishing coverage gain. 8.7 MB raw (~5-6 MB gzipped) is comfortable for
browser delivery and permanent caching.

### D-DB-02: Store-Independent Encoding
**Decision:** Index only the on-board seed distribution; ignore banked scores.
Store `V(h, turn)` = seeds the mover ultimately captures (range 0…N).

**Rationale:** Five independent sources confirm (R-02, R-06, R-07, R-08, R-10).
Collapses millions of positions differing only by banked seeds into one entry.
Free, non-negotiable.

### D-DB-03: endMode Is NOT a DB Parameter
**Decision:** First-to-25 vs. all-capture is a play-time rule enforced on top
of the DB value. The DB does not vary by end mode.

**Rationale:** The DB answers "what happens to the remaining seeds under perfect
play" — a question independent of whether the game ends early at 25. If banked
score + DB value ≥ 25, the play-time layer stops the game. This removes one
axis from the per-ruleset DB multiplier.

### D-DB-04: Color / 180° Symmetry Halving
**Decision:** Store only South-to-move values. For North-to-move positions,
rotate the board 180° and look up. ~2× space savings.

**Guardrail (from R-11):** Apply this canonicalisation at exactly **one level**
— the global `(h, turn)` mapping. Never fold per-pit sub-symmetries or the
index will collide and silently corrupt entries.

### D-DB-05: 4-Bit Packed Values
**Decision:** Two entries per byte (high nibble + low nibble). Values 0…15
at N=15 fit perfectly.

### D-DB-06: Forward-Move Build Algorithm
**Decision:** Use van der Goot's three-phase forward-move retrograde (R-07).
Reuse `index.html`'s `simulate`/`applyMove` directly in the builder.

**Rationale:** Two independent teams (van der Goot, Irving/Donkers/Uiterwijk)
concluded reverse moves are "unnatural and a source of programming errors" in
mancala. Forward moves reuse tested code.

### D-DB-07: Verification Sweep
**Decision:** After building each layer, run one full verification pass
re-deriving every entry from its successors and asserting equality.

**Rationale:** From R-11 §3 — the standard catch for silent corruption in
rank/unrank or the fixed-point. O(states) cost, one-time during build.

### D-DB-08: Storage Backend — OPFS Primary, IndexedDB Fallback
**Decision:** Store DB layers as files in the Origin Private File System.
Probe via `FileSystemSyncAccessHandle` in the Worker. Fall back to IndexedDB
(load full ArrayBuffer into Worker RAM) on browsers without OPFS.

**Rationale:** OPFS gives synchronous random-access reads at arbitrary byte
offsets — ideal for the `rank → seek → read nibble` pattern. Persistent across
restarts. Supports multiple DB files (per-ruleset) without RAM bloat.

### D-DB-09: Progressive Layered Loading
**Decision:** Download DB layer-by-layer in the background. Game is playable
immediately (heuristic-only). AI strength upgrades progressively as layers
arrive (N=12 within seconds, N=15 within tens of seconds on broadband).

**Rationale:** A 6 MB blocking download on slow connections (common in West
Africa, where Oware originates) would mean 15+ seconds of nothing. Progressive
loading means *every completed layer is immediately useful*.

---

## 3. Rules & Conventions

### D-RULES-01: Academic Terminal Convention as Default
**Decision:** Default terminal rule is **opponent-takes-all** (no legal move)
and **split** (repetition). The previous "own-row" convention becomes a
selectable folk/casual variant in the Rules menu.

**Rationale:** Aligns the DB, the literature ("Oware is a draw"), competitive
software (48stones, Aalina), and the learning component's teaching claims.
The code change is small (`collectSides` becomes conditional on active rule).

### D-RULES-02: Per-Ruleset DB — Keyed to (capture, grandslam, terminal)
**Decision:** Each distinct combination of capture rule, grand-slam mode, and
terminal convention is a different game requiring its own DB. End mode
(first-to-25 / all-capture) does NOT vary the DB (see D-DB-03).

**Default v1 DB ruleset:** `{capture: '23', grandslam: 'nocap', terminal: 'academic'}`.

### D-RULES-03: Repetition Detection via Position Hash History
**Decision:** Maintain a hash history of all positions (`h + turn`) visited in
the current game. If a position recurs, invoke the active repetition convention
(default: split). The `ncp` counter is retained as a secondary safety net
(backstop timeout).

**Rationale:** Below N=15, the DB encodes the correct value for cyclic positions
already. Above N=15, the engine needs to detect repetition to apply "split"
correctly. A hash history is the canonical method (chess uses it for threefold
repetition). The ncp counter alone cannot detect short cycles that include
captures.

### D-RULES-04: Both End Modes Are Equal Player Options
**Decision:** First-to-25 (majority) and all-capture (play to finality) are
both presented as equal options via the Rules button. Neither is privileged
as "the real game." The DB serves both without modification.

---

## 4. Evaluation & Search

### D-EVAL-01: DB-Mined Decision-Tree Evaluation
**Decision:** Replace the hand-set linear `evalState` with a decision tree
whose leaves hold `(μ, σ)` values fitted to the N=15 DB. At runtime, classify
the position → read μ, σ → evaluate as `z = (μ + material) / σ`.

**Rationale:** Van Rijswijck (R-08) showed a 3-leaf tree beats hand-tuning;
features mined at N=15 generalize to N=35. Cheap (one-time offline analysis),
no training loop, no external tooling. Principled replacement for guessed
weights.

### D-EVAL-02: Add Missing Features
**Decision:** Add to `evalState`: empty-pit counts (opponent & own), reach
(pits with enough seeds to cross to opponent), explicit kroo / >12 count.

**Rationale:** Ayo (R-09) found opponent-empty-pits to be the highest-weighted
feature (1.0). Reach and kroo are explicitly tested as a5-a8 in R-09 and found
high-value. Our current eval has crude proxies only.

### D-EVAL-03: Transposition Table with Board Hash
**Decision:** Add a transposition table to the search. Hash the active-counters
board state (store-independent, matching the DB's encoding philosophy). Use a
full-board hash (not incremental Zobrist — R-10 notes Zobrist loses its
advantage in mancala where sowing changes many pits per move).

### D-EVAL-04: No Quiescence Search
**Decision:** Quiescence search is not added.

**Rationale:** In Oware, captures happen atomically within `applyMove` — there
is no "hanging piece" between moves. The chess concept of extending search on
tactical moves doesn't map to mancala's mechanics. Below N=15, the DB provides
perfect values. Above, feature improvements (D-EVAL-01/02) are higher ROI than
quiescence.

### D-EVAL-05: Move Ordering — Captures First
**Decision:** In the search loop, try capture moves before non-capture moves
(ordered by captured-seed count descending). After that, use the transposition
table's best-move hint if available.

**Rationale:** Trivial to implement; maximizes α-β pruning. R-10 found the
history heuristic "did not help" in mancala specifically.

### D-EVAL-06: Pondering (Search on Opponent's Time)
**Decision:** The Worker continues searching the expected reply position while
waiting for the opponent's move. If the opponent plays the predicted move, the
result is available instantly; otherwise, discard and re-search.

**Rationale:** Once the AI is in a Worker, pondering is a small addition with
significant UX improvement (faster apparent response on the opponent's actual
move).

---

## 5. Scoring & Social

### D-SOCIAL-01: Per-Pairing Cumulative Seed Tally
**Decision:** Maintain a running total of seeds captured by each player across
all games between a specific pairing (Player vs. Computer at a given level, or
Player A vs. Player B in 2P mode). This tally fluctuates with rounds of play —
it goes up when you capture more, down when you capture fewer. Persisted in
localStorage alongside existing records.

**Rationale:** Flagged by the user as an important feature. Creates a "debt/gain
ledger" — an ongoing relationship metric between two players that gives each
game stakes beyond its own result. This is the "relationship state" item from
`game-evolution-notes.md`.

**Implementation sketch:**
- Key: `zako-oware-tally` → `{ "vs-cpu-easy": {you: N, opp: M}, "vs-cpu-medium": ..., "vs-<username>": ... }`
- After each game: add each player's final score to their running total.
- Display: a compact "lifetime score" line in the records plaque or a dedicated
  view — e.g., "You 342 — 319 Computer (Medium)" showing the cumulative tally.
- The tally is never reset by a "new game" — only by an explicit "reset tally"
  action (separate from "reset records").

---

## 6. Delivery & Performance

### D-PERF-01: AI Strength Indicator
**Decision:** Show the user what DB tier is currently active:
"AI: heuristic" → "AI: lite (≤12)" → "AI: full (≤15)" as layers download.
Shown as a subtle label near the difficulty selector.

### D-PERF-02: No External Dependencies (Confirmed)
**Decision:** No npm, no bundler, no WASM, no framework. Vanilla JS.
The build tools (`build-resources.py`, `build-edb.mjs`) are offline scripts
that produce static assets; they are not runtime dependencies.

### D-PERF-03: C-Engine Parity Dropped
**Decision:** The reference to a native C engine (`oware_engine.c`/`oware_ai.c`)
is historical. The web engine in `index.html` IS the canonical engine going
forward. No parity testing against a C build is required.

---

## 7. Gaps Acknowledged (Known Limitations)

These are limitations accepted for v1, documented here for honesty:

| # | Limitation | Impact | Notes |
|---|-----------|--------|-------|
| 1 | DB covers only ≤15 seeds (31% of game) | Heuristic-only play for first ~69% | Mitigated by DB-mined eval generalizing upward |
| 2 | Unreachable configs stored in DB | Slight size overhead (~negligible at N=15) | Simpler rank/unrank is worth it |
| 3 | No opening book | Opening moves are heuristic, not perfect | 48stones shows pit-6 is the only drawing open |
| 4 | ncp counter retained as backup | Can't detect cycles with intermittent captures | Hash history is primary; ncp is safety net |
| 5 | Grand-slam modes (leavelast, oppkeeps) not formally verified | Possible edge-case divergence | No authoritative primary source found |
| 6 | Single-file size will grow | The inline Worker + LEARN data + resource module grows index.html | Acceptable for a self-contained artifact |

---

## 8. Document Lineage

This document synthesizes decisions from:
- `REPORT-00-SYNTHESIS-engine-roadmap.md` — the technical roadmap
- `REPORT-00-DEFENSE-architecture-decisions.md` — alternatives analysis
- `docs/oware-mathematical-architecture.md` — current engine state
- `docs/game-evolution-notes.md` — feature backlog and user priorities
- The 11 individual research reports (R-01 through R-11)
- Web research on OPFS, 48stones 2023 strong solution, Aalina engine, NNUE
- Direct user decisions on rules optionality and scoring features

---

*Last updated: 2026-06-29. This is the authoritative v1 architecture reference.
All decisions are final for implementation unless explicitly revisited here.*
