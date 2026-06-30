# Synthesis & Engine Roadmap — What the Research Tells Us to Build

**Purpose.** This is the capstone over `REPORT-01` through `REPORT-11` plus the
`DEFENSE` report. It exists to (a) **guide coding** of the `oware-web` engine,
(b) **drive decisions** on open problems — above all **database size and delivery**,
and (c) serve as a **primary source document** for the user-facing architecture
documentation. Every claim cites the report(s) that support it.

**Companion files:**
- `REPORT-00-DEFENSE-architecture-decisions.md` — alternatives weighed and rejected
- `learning-engine-note.md` — exhaustive math/game concept index for the learning component
- `docs/oware-mathematical-architecture.md` — the program's current mathematical state

**Reading guide:** §1 = thesis; §2 = what we have now; §3 = target architecture;
§4 = the endgame database (the load-bearing section); §5 = evaluation & search;
§6 = rules; §7 = delivery; §8 = learning component; §9 = decisions; §10 = build
sequence; §11 = traceability.

---

## 1. Thesis

Oware is **convergent** (seeds only leave the board), which makes a **perfect
endgame database by retrograde analysis** both possible and the single
highest-leverage component of a strong engine (R-01, R-04, R-05).

Perfect Oware is a **draw** (R-01, R-07; confirmed by the 2023 48stones strong
solution under Abapa rules). The engine's job is to *never lose and punish
mistakes*, not to "win."

The full game's solution is enormous — 889 billion positions / 178 GB (Romein &
Bal 2002) or 827 billion under Abapa rules (Salen 2023) — and cannot ship in a
browser (R-05). So we **truncate**: solve every position with ≤ N seeds on the
board and play perfectly there, heuristically above.

Strength above the database comes from a **good evaluation function, not deep
search** (R-08, R-09) — and the *same* truncated database doubles as **training
data** to learn that evaluator (R-08). Finally, the endgame/repetition **rules
are a choice**, and each choice is a different game with a different database
(R-06, R-10, R-11).

---

## 2. Current Engine — What We Have

The entire game lives in a single `index.html`. The engine's state is:

```
state = { h:[12 ints], score:[2 ints], turn:0|1, ncp:int }
```

**What works:**
- Full Oware rules: sowing (mod-12, skip origin), capture (2-3 or 3-4 variant),
  backward chaining, feeding obligation, grand slam (4 modes), cycle detection
- α-β search (`negamax`) at fixed depth 6 (Medium) / 8 (Hard)
- Hand-weighted `evalState`: material (×100), attack/vulnerability (±8),
  hoarding (×3), mobility (×2)
- Opening variety via "near-best" margin randomization
- Records, learning component, knowledge rail, hue theming — all working

**What's missing (the gaps this roadmap fills):**
- No endgame database → no perfect endgame play
- No transposition table → repeated work in search
- No iterative deepening → no time management
- Hand-tuned weights → not validated against perfect data
- Missing eval features → empty-pit counts, reach, explicit kroo (R-09)
- Arbitrary cycle limit (100 plies) → not the canonical repetition rule
- Terminal convention (own-row) → differs from academic/competitive Awari

---

## 3. Target Architecture — The Lithidion Stack

The proven template, validated by every Oware world champion since 1990
(Lithidion → Marvin → Softwari → Aalina) and defended against MCTS, full-DB,
and pure-NN alternatives in the DEFENSE report:

```
┌──────────────────────────────────────────────────────────┐
│  Opening Book (future)                                    │
│  → known good first moves; cycle-draw values (R-06)       │
├──────────────────────────────────────────────────────────┤
│  α-β Search + Evaluation                                  │
│  → negamax, transposition table, DB-mined evalState        │
│  → features: material, empty-pits, reach, kroo, mobility  │
├──────────────────────────────────────────────────────────┤
│  Endgame Database (≤ N seeds on board)                     │
│  → perfect O(1) lookup via rank/unrank                     │
│  → N=15 default (8.7 MB packed / ~5-6 MB gzipped)         │
│  → stored in OPFS or IndexedDB, probed from Web Worker     │
└──────────────────────────────────────────────────────────┘
```

**Why this stack and not alternatives (summary from DEFENSE):**
- **Not MCTS:** Oware's branching factor is ≤6 — too narrow for MCTS to beat α-β.
  MCTS also can't compete with a perfect lookup on endgame positions.
- **Not full-DB:** 178–200+ GB is not deliverable to a browser. Truncation at N=15
  gives perfect play for the last third of the game at 0.003% of full storage.
- **Not pure neural net:** NNUE is a valid *eval-layer* upgrade within the stack,
  not a replacement for it. Deferred to v2 (see DEFENSE §4).

---

## 4. The Endgame Database

### 4.1 Why It's Central

Four reports converge:
- Oware is *convergent* so retrograde analysis applies (R-01, R-04)
- It is the **only essential** solving procedure for Oware (R-04 Table 2)
- Empirically, **only methods using an endgame DB beat the grandmaster** (R-05)
- The game's *solution size* (~10¹²) is inseparable from storage (R-04) — playing
  perfectly and having the database are nearly the same statement

### 4.2 ★ The Size Decision

**Recommendation (defended in DEFENSE §2):**

> **N = 15, color symmetry, 4-bit packed ≈ 8.7 MB raw (~5–6 MB gzipped).**

**Why N = 15 specifically:**
- Largest N whose value (0…15) fits in **exactly 4 bits** (a nibble). Past 15,
  values need 5 bits and the implementation complexity/size ratio worsens.
- Covers the last **31%** of every game perfectly — and is reached earlier in
  capture-heavy lines.
- ~6 MB gzipped is well within browser comfort (typical web page: 2-4 MB).
- Cached permanently in IndexedDB/OPFS — zero download on subsequent visits.

**The tiered offering:**

| Tier | N | Packed size | Gzipped | Coverage | Use case |
|------|---|-------------|---------|----------|----------|
| Lite | 12 | 1.4 MB | ~0.8 MB | 25% | First-load fallback; low-end mobile |
| **Default** | **15** | **8.7 MB** | **~5-6 MB** | **31%** | Standard; cached permanently |
| Max | 17 | 32 MB | ~20 MB | 35% | Desktop opt-in; enthusiast |

**The size equation:** configs with ≤ N seeds = `C(N+12, 12)`. With color/180°
symmetry we store only the South-to-move value per configuration:

> **bytes(N) ≈ C(N+12, 12) × ⌈log₂(N+1)⌉ / 8**

**The reduction levers, ranked by value:**

1. **Store-independent encoding** — index only on-board seeds, not banked score.
   Collapses millions of positions into one entry. *Free, non-negotiable.* Five
   independent sources confirm: R-02, R-06, R-07, R-08, R-10.
2. **Truncation to ≤ N** — the macro lever; turns 178 GB into megabytes.
3. **Color/180° symmetry** — ~2× for free. ⚠ Fold at **exactly one level**
   (canonicalise the whole `(h,turn)` to South-to-move before ranking). Folding
   twice creates index collisions and silently corrupts the DB (R-11 §2).
4. **4-bit packing** — at N=15, value range 0…15 = exactly one nibble. Two
   entries per byte.
5. **gzip on transport** — lazy-load per-layer slices (R-02 §5).
6. *(Not used)* excluding unreachable configs — both R-02 and R-10 chose not to,
   for simpler indexing.

### 4.3 Encoding & Indexing

**Stored value:** `V(h, turn)` = the number of on-board seeds the side-to-move
will ultimately capture, under optimal play. Range: `0 … boardSeeds`. To get a
live game result:

```
finalMover = score[turn]   + V(h, turn)
finalOpp   = score[1-turn] + (boardSeeds - V(h, turn))
result     = sign(finalMover - finalOpp)
```

**Rank/unrank:** combinatorial-number-system bijection over stars-and-bars. Maps
a distribution `h = [h0…h11]` with `Σh = s` to an integer `0 … C(s+11,11)-1`.
The DB for layer `s` is `PackedArray(C[s+11][11])`, indexed by `rank(h,s)` after
canonicalising `(h, turn)` to its South-to-move representative.

**Symmetry canonicalisation:** for any `(h, turn)`, if `turn == North`, rotate
the board 180° (swap `h[0..5]` with `h[6..11]`) and look up as South-to-move.
This halves storage. **One level only** — never apply per-pit symmetries (R-11).

### 4.4 Build Algorithm

Use **van der Goot's forward-move, three-phase retrograde** (R-07) — it matches
REPORT-02 §4 and lets the builder **reuse `index.html`'s existing
`simulate`/`applyMove`** without writing error-prone reverse moves (confirmed
independently by R-07, R-10). Per seed-layer `s`, low → high:

**Phase 1 — Capture-DB pre-pass:** For each config, take the max over *capture*
moves of `−value(child)` where the child is in an already-solved smaller layer.
Seeds the fixed point; touches smaller layers only once.

**Phase 2 — Initialise:** Set terminal values via `terminalValue(h, turn)`;
mark non-terminals as unresolved.

**Phase 3 — Fixed-point iteration:** Repeatedly sweep all unresolved configs;
for each, compute `V(h,turn) = S − min_m V(applyMove(h,turn,m))`. Repeat until
a full sweep changes nothing. Convergence is guaranteed because every capture
edge strictly decreases `s`, so all infinite paths are pure no-capture cycles —
handled by the terminal convention.

**Phase 4 — Verification sweep** (R-11 §3): One extra pass re-deriving each
entry from its successors and asserting equality. O(states) and the standard
catch for rank/unrank or fixed-point bugs.

**Convergence budget:** ~45 iterations at N=15 (R-07 Table 1). The largest
layer (~7.7M configs) × ~45 sweeps = a few hundred million move evaluations —
seconds to minutes in Node. Build cost is *not* the bottleneck; shipped asset
size is.

### 4.5 Rules Dependency — One DB Per Ruleset

The terminal/repetition convention changes the game's value (R-06, R-07, R-10).

| Case | Academic / Competitive Abapa | Current `index.html` |
|------|------------------------------|---------------------|
| No legal move | Opponent captures **all** remaining | Each keeps **own row** |
| Repetition | Seeds **split** (board value 0) | Each keeps **own row** |

**Decision (revised per DEFENSE §6):** Build the DB under **academic/competitive
rules** as the default. Change `index.html` to match. Expose own-row as a rules
toggle for the folk/casual variant.

**Per-ruleset builds:** because capture rule (2-3 vs 3-4) and grand-slam mode
also change the game, a shipped DB is keyed to a specific `(capture, grandslam,
terminal-convention)` tuple. The rules menu and the builder must agree on the
active ruleset (R-02 §6.3).

**Note: `endMode` (first-to-25 vs all-capture) is NOT a DB parameter.** The DB
is store-independent — it computes the optimal division of remaining on-board
seeds regardless of how many are already banked. The `firstto` early-termination
check is a play-time rule enforced *on top* of the DB value: if the banked score
+ DB value crosses 25, the game ends. This means `endMode` does not multiply
the number of DB variants to build — one fewer axis to worry about.

### 4.6 Future: DTC/DTM Tiebreaking

The current value encoding ("WDL with magnitude") tells the engine which moves
win/draw/lose and by how much, but not which wins *fastest*. If we ever want the
engine to play the snappiest endgame (capture quickest, prolong opponent's
losses), add a **distance-to-conversion** tiebreak (R-11 §1). Not needed for v1
— Oware is a draw and usually has a unique optimal move (R-06).

---

## 5. Evaluation & Search (Above the Database)

### 5.1 Principle: Features Over Depth

The consistent message of R-05, R-08, R-09: **invest in the evaluator, not
search depth.** Ayo at minimax depth-5 with 12 features beats Davis at depth-7
with 6 features (R-09). A 3-leaf decision tree mined from the DB already beats
hand-tuning (R-08). The DB is the training data; deeper search is the *wrong*
lever.

### 5.2 Current evalState Audit

| Feature | In `evalState`? | Weight | Notes |
|---------|----------------|--------|-------|
| Material (score diff) | ✅ | ×100 | Dominant term |
| Attack (opp pits one short of capturable) | ✅ | +8 | |
| Vulnerability (own pits one short) | ✅ | −8 | |
| Hoarding (max pile on own side) | ✅ | ×3 | Crude kroo proxy |
| Mobility (# legal moves) | ✅ | ×2 | |
| **Empty-pit counts (opponent)** | ❌ | — | Highest-value feature per R-09 |
| **Reach (pits with enough seeds to cross)** | ❌ | — | R-09 a5/a6 |
| **Explicit kroo / >12** | ❌ | — | R-09 a7/a8 |

### 5.3 Upgrade Path: DB-Mined Evaluation (R-08)

The van Rijswijck method:
1. Build the N=15 DB (17M labelled positions with perfect values).
2. Compute feature correlations (`r²`) against DB values.
3. Partition positions into classes by the best-correlating feature splits
   → a **decision tree** whose leaves hold `(μ, σ)`.
4. At runtime: classify the position → read `μ, σ` → evaluate as
   `z = (μ_S + material) / σ_S`.

Key finding: features mined at N=15 **generalize to N=35** (R-08 §3). Our
truncated DB is enough training data for the full midgame.

This replaces the hand-set linear sum with a principled, fitted alternative.
A 9-leaf tree beats the best human-crafted feature; the method is cheap (no
training loop, no GPU, no external tooling — just a one-time offline analysis
of the DB).

### 5.4 Search Upgrades (Ranked by ROI)

Only if needed — features likely beat all of these for effort spent (R-08, R-09):

1. **Enhanced transposition cut-off** — tree size ↓ up to 8×, runtime ~3× (R-10)
2. **Safe futility pruning** — completely safe in mancala because a hard score
   bound is computable from seeds in play (R-10)
3. **Transposition table** — one 180° symmetry + many move orders = high
   transposition rate; store active counters only (R-04, R-10)
4. **MTD(f)** with iterative deepening — a bigger rewrite of `negamax` (R-10)

### 5.5 The NNUE Option (Deferred)

A small neural network (12 inputs + side-to-move → scalar) trained on the DB is
a valid v2 upgrade for the eval layer. Model size would be ~2-8 KB. See DEFENSE
§4 for the full analysis. Deferred because the decision tree is sufficient for
v1 and doesn't require training infrastructure.

---

## 6. Rules Optionality & Variants

### 6.1 Why Rules Matter

Kalah (R-10) is the proof: three small rule toggles — capture-into-own-empty,
extra-turn-on-store, no-feeding — turn a drawn, cyclic, hard game (Oware) into a
first-player-win, acyclic, easy game (Kalah). **Each rule the menu exposes
defines a genuinely different game with a different value.**

### 6.2 The Conventions That Define "Which Game"

| Axis | Options | Default (revised) |
|------|---------|-------------------|
| Terminal (no legal move) | Own-row / Opponent-takes-all | **Opponent-takes-all** |
| Repetition | Own-row / Split (value 0) / Last-mover-takes | **Split** |
| Capture threshold | {2,3} / {3,4} | {2,3} |
| Grand slam | nocap / forbid / oppkeeps / leavelast | nocap |
| End mode | First-to-25 / All-capture | First-to-25 |
| Cycle limit | Configurable (plies without capture) | 100 (may revise) |

### 6.3 Per-Ruleset DB Implication

Each `(capture, grandslam, terminal-convention)` tuple is a different game → its
own endgame DB. The builder must be parameterized. For v1, build one DB for the
default ruleset (academic terminal + 2-3 capture + nocap grand slam). Others are
future builds as the rules menu expands.

### 6.4 The 48stones Discovery: 11- and 13-Seed Loops

The 2023 strong solution discovered loops at 11 and 13 seeds that cycle
indefinitely without capture under standard Abapa rules. These fall *within* our
N=15 range. The cycle convention must handle them — under "split," their value
is 0 (each player keeps half). Our fixed-point iteration naturally converges on
this: positions unresolved after convergence receive `terminalValue` (split),
which is correct.

### 6.5 Repetition Detection During Play

Below N seeds, the DB already encodes the correct value for cyclic positions —
no runtime detection needed. Above N seeds, the engine must detect repetition
to apply the "split" terminal convention. Implementation: maintain a **position
hash history** (hash of `h + turn` for each position visited in the current
game). If a position recurs, invoke the split convention. This replaces the
cruder `ncp` counter, which cannot detect short cycles that include captures.
The `ncp` counter is retained as a *secondary* safety net (a backstop timeout
if the hash history somehow fails or for games exceeding a practical length).

---

## 7. Delivery Architecture

### 7.1 Progressive Loading Strategy

The game must be **playable immediately** regardless of network speed. The DB is
a performance upgrade, not a gate on play.

1. **First visit:** Game loads; AI uses heuristic-only search. Instant play.
2. **Background (phase 1):** Fetch N=12 layers (~0.8 MB gzipped). Store in
   OPFS/IndexedDB. AI upgrades to perfect endgame at ≤12 seeds. Seconds.
3. **Background (phase 2):** Fetch N=13, 14, 15 layers (~4-5 MB more). AI
   reaches full default strength. Tens of seconds on broadband.
4. **Subsequent visits:** DB already cached. No download. Instant full strength.

### 7.2 Storage Backend: OPFS (Primary) / IndexedDB (Fallback)

**OPFS (Origin Private File System)** is the recommended storage:
- Provides `FileSystemSyncAccessHandle` in a Web Worker — synchronous random
  reads at arbitrary byte offsets, mimicking POSIX `fread`/`fseek`.
- The AI search (moved to a Worker) probes the DB with zero async overhead.
- Files persist across browser restarts; survive until user clears site data.
- Per-layer files enable downloading/caching individual layers independently.
- Supports multiple DB files (per-ruleset variants) without RAM bloat.
- Browser support (2026): Chrome 102+, Firefox 111+, Safari 15.2+, Edge = Chrome.

**IndexedDB as fallback** for older browsers or environments where OPFS is
unavailable. Stores each layer as an `ArrayBuffer`; pulled into RAM on game start.
At 8.7 MB total for N=15, this is acceptable even on low-end devices.

### 7.3 The Web Worker Architecture

Move the AI search into a **dedicated Web Worker**:
- Main thread stays responsive (no jank during search)
- Worker holds the DB file handle (OPFS sync access) and the `negamax` logic
- Communication via `postMessage`: main sends `{state, rules}`, worker returns
  `{bestMove, eval, pv}`
- The DB is probed synchronously within the worker's search loop — no promises,
  no callbacks, just `rank → seek → read nibble → return value`
- **Single-file preserved:** the Worker script is embedded as an inline string
  and instantiated via `new Worker(URL.createObjectURL(new Blob([code])))`
  — no separate `.js` file needed

---

## 8. Learning Component — Research Concepts Index

The exhaustive math/game concept catalogue lives in **`learning-engine-note.md`**
(companion file). It covers ~50+ concepts across six categories:

1. **Game Theory & Classification** — solution strengths, convergence, zero-sum,
   Sprague-Grundy inapplicability, complexity metrics, the solved result
2. **Combinatorics & Counting** — stars-and-bars, combinatorial number system,
   layer sizes, Tchoukaillon, periodicity (`lcm`), the `n²/π` density, sieves
3. **Algorithms & Database Engineering** — retrograde analysis, forward-move
   method, fixed-point iteration, store-independent encoding, symmetry, packing
4. **Search & Evaluation** — minimax/negamax, α-β, MTD(f), transposition tables,
   features (material, mobility, empty-pits, reach, kroo), z-score eval, NNUE
5. **Rules & Variants** — capture rules, grand slam, terminal conventions,
   feeding, Kalah contrast, cycle handling
6. **Cross-Game & Meta-Methods** — puzzle generation from optimal-edge trimming,
   DB mining, parity comb, generalisation findings

Each entry has: concept name, source report(s), one-sentence summary,
elaboration notes (what a deeper lesson would cover), and persistent Wikipedia/
MathWorld links for further reading.

### 8.1 DB-Mined Puzzles (R-11 §5, R-08)

Trim the endgame state graph to **optimal-move edges only**; positions with no
parent in that trimmed graph are "sources" — the positions hardest to find the
winning line from. Surface the max-distance sources as **endgame studies** in
the learning component. A ready-made puzzle generator from the DB we're building.

### 8.2 Combinatorics Complexity Rating

The per-layer configuration count `C(boardSeeds+11, 11)` gives a live measure of
"how many positions exist at this point in the game." As seeds leave the board,
this shrinks. A **convergence metric** — normalised against state-space ≈10¹²
(R-01) and the `n²/π` density (R-03) — could surface as a "distance travelled"
indicator during play. Formula to be fixed from R-01/R-03/R-04; pairs naturally
with the on-board formula overlay and the resource rail.

---

## 9. Decision Register

| # | Decision | Options | Recommendation | Source |
|---|----------|---------|----------------|--------|
| D1 | Database size N | 10/12/15/17/20 | **15** (default), 12 (lite), 17 (max) | §4.2 |
| D2 | Value packing | 1 byte / 4-bit / WLD 2-bit | **4-bit** at N=15 | §4.2, R-06, R-10 |
| D3 | Terminal/repetition rule | own-row / academic | **Academic** (opponent-takes-all / split) | §4.5, DEFENSE §6 |
| D4 | Engine strength path | deeper search / features / DB-mined | **DB-mined features** | §5, R-08, R-09 |
| D5 | Rules optionality scope | fixed / full menu | Full menu, **one DB per ruleset** | §6, R-10 |
| D6 | Fastest-line play | value-only / add DTC | **Value-only for v1** | §4.6, R-11 |
| D7 | Storage backend | IndexedDB / OPFS / RAM only | **OPFS primary, IndexedDB fallback** | §7.2 |
| D8 | AI thread | main thread / Web Worker | **Dedicated Web Worker** | §7.3 |

---

## 10. Build Sequence (Ordered Roadmap)

1. **Consolidate REPORT-02** with refinements from R-07/R-10/R-11 (capture-DB
   pre-pass, one-level symmetry guardrail, verification sweep, 4-bit packing,
   per-ruleset note, forward-move reuse of `applyMove`). Pure doc work.
2. **Settle D1–D3** (size, packing, rule convention) — they parameterise the
   builder. Default: N=15, 4-bit, academic rules.
3. **Implement the rule convention change** in `index.html`: make `isOver`/
   `collectSides` conditional on the active terminal rule; default to academic.
4. **Write `tools/oware-rules.mjs`** — the engine rules lifted from `index.html`
   as a reusable ES module (forward moves, `simulate`, `applyMove`, `legalMoves`).
5. **Write `tools/build-edb.mjs`**: `rank/unrank` (+ symmetry canonicalisation)
   → round-trip test → 3-phase retrograde → verification sweep → emit packed
   binary per layer.
6. **Validate**: round-trip, cross-check vs. brute-force negamax on layers s ≤ 10,
   self-consistency, start-position-evaluates-to-draw (under academic rules).
7. **Wire `dbProbe` into search** (R-02 §5): move search to a Web Worker; probe
   the DB via OPFS sync access handle; perfect play once `boardSeeds ≤ N`.
8. **Progressive loading + caching**: per-layer fetch → OPFS storage → IndexedDB
   fallback path → UI indicator ("AI strength: loading…/lite/full").
9. *(Later)* **Mine the DB** to upgrade `evalState` (R-08 decision tree + R-09
   features: empty-pits, reach, kroo).
10. *(Later)* **Rules menu expansion** + per-ruleset DB builds (R-10).
11. *(Later)* **Opening book** with cycle-draw values (R-06 Chapter 4).

---

## 11. Traceability Matrix

| Theme | Primary reports |
|-------|----------------|
| Convergence → DB is the lever | R-01, R-04, R-05 |
| Database size, encoding & indexing | R-02, R-05, R-06, R-07, R-10, R-11 |
| Build algorithm (forward, fixed-point, verify) | R-02, R-07, R-10, R-11 |
| Color symmetry (and its one-level guardrail) | R-04, R-06, R-11 |
| Rules change value / per-ruleset DB | R-06, R-10, R-11 |
| Terminal/repetition convention divergence | R-06, R-07 |
| Evaluator > search; mine the DB | R-05, R-08, R-09 |
| Features to add (empty-pits, reach, kroo) | R-09 |
| The z-score / decision-tree eval | R-08 |
| Pure-math / learning component | R-03, R-08, R-11 |
| Cycle handling / Oware's special burden | R-06, R-07, R-10 |
| Opening book / cycle-draw values | R-06 |
| Search upgrades (ETC, futility, MTD(f)) | R-10 |
| Puzzle generation from DB | R-11 |
| 48stones 2023 strong solution | Web research (DEFENSE §8.1) |
| OPFS / delivery architecture | Web research (DEFENSE §8.3) |

---

## 12. Source Documents for User-Facing Documentation

This synthesis report will serve as the primary source for creating detailed
user-accessible documentation about the game's architecture and decisions. The
complete set of source material available:

### Research Reports (in `docs/research/`)
- `REPORT-00-SYNTHESIS-engine-roadmap.md` — this document (capstone)
- `REPORT-00-DEFENSE-architecture-decisions.md` — alternatives weighed
- `REPORT-01` through `REPORT-11` — individual paper reviews (11 reports)
- `BIBLIOGRAPHY.md` — full citation registry
- Papers in `docs/research/papers/` (11 PDFs)

### Architecture & Design Documents
- `docs/oware-mathematical-architecture.md` — the program's current math state
  (Part I: implemented math; Part II: pure math; Part III: gaps; Part IV: hooks)
- `docs/game-evolution-notes.md` — backlog of future ideas with cross-references
- `docs/RESOURCE-CONVENTIONS.md` — how the knowledge rail auto-senses content

### Specs & Plans (in `docs/superpowers/`)
- `specs/2026-06-28-oware-learning-design.md` — learning component design
- `specs/2026-06-28-oware-resource-rail-design.md` — knowledge rail design
- `plans/2026-06-28-oware-learning.md` — learning implementation plan
- `plans/2026-06-28-oware-resource-rail.md` — rail implementation plan

### Code
- `index.html` — the single-file game (engine, UI, learning, rail — everything)
- `tools/build-resources.py` — resource manifest builder

### Companion File (to be created)
- `docs/research/learning-engine-note.md` — exhaustive math/game concept index

---

*This document supersedes the previous synthesis dated 2026-06-28. It reflects
the full 11-report corpus, the DEFENSE analysis, the 48stones 2023 strong
solution discovery, and the OPFS delivery architecture research. Update as the
engine evolves; treat §4 (the DB) and §9 (decisions) as the living reference.*
