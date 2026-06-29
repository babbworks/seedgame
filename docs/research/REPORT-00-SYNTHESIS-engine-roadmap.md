# Synthesis & Engine Roadmap — What the 11 Reports Tell Us to Build

**Purpose.** This is the capstone over `REPORT-01`…`REPORT-11`. It exists to (a) **guide
coding** of the `oware-web` engine and (b) **drive decisions** on the open problems — above
all **database size**. Where the individual reports each read one paper, this one reads *across
all of them* and resolves their forward-links into a single plan. Every claim cites the
report(s) that support it, so you can drill down.

**Audience & use.** Read §2–§3 before touching the engine; §3.2 is the decision section for the
database-size question; §7 is the human-decision register; §8 is the ordered build sequence.
Companion file: `learning-engine-note.md` (the math-concept index for the learning component).

---

## 1. The one-paragraph thesis

Oware is **convergent** (seeds only leave the board), which makes a **perfect endgame database
by retrograde analysis** both possible and the single highest-leverage component of a strong
engine (`R-01`, `R-04`, `R-05`). Perfect Oware is a **draw** (`R-01`, `R-07`), so the engine's
job is to *never lose and punish mistakes*, not to "win." The full game's solution is enormous
(178 GB, the largest solution size of any solved game — `R-04`), and cannot ship in a browser
(`R-05`), so we **truncate**: solve every position with ≤ N seeds and play perfectly there,
heuristically above. Strength above the database comes from a **good evaluation function, not
deep search** (`R-08`, `R-09`) — and the *same* truncated database doubles as the **training
data** to learn that evaluator (`R-08`). Finally, the endgame/repetition **rules are a choice**,
and each choice is a different game with a different database (`R-06`, `R-10`, `R-11`).

---

## 2. Target & architecture

### 2.1 Solution-strength target (decide once — `R-01`, `R-04`)
- **Unbeatable from the opening** needs only a *weak* solution.
- **A teaching tool that grades any position the user reaches** wants *strong* play in the
  region it covers → an **endgame database**. `oware-web`'s learning angle points here.
- **Recommendation:** target *strong play within the truncated endgame* + *solid heuristic
  play above it*. Don't promise "perfect solved-Awari play" unless we adopt the academic rules
  (see §3.4).

### 2.2 The architecture: the Lithidion stack (`R-01`, `R-09`)
Proven template, three layers, front to back:

```
   opening book   →   α-β search (iterative deepening + transposition table)   →   endgame DB
   (not built)        (index.html has plain negamax+αβ + evalState)                (to build: REPORT-02)
```

- **What exists** (`index.html`): `negamax` + α-β, a hand-weighted `evalState`, move ordering.
- **What to build:** the **endgame database** (§3) — the high-leverage piece — then optionally
  upgrade `evalState` (§4) and add a book (later).

---

## 3. The endgame database — the load-bearing component

### 3.1 Why it is central
Four reports converge: Oware is *convergent* so retrograde analysis applies (`R-01`, `R-04`);
it is the **only essential** solving procedure for Oware (`R-04` Table 2); and empirically
**only methods using an endgame DB beat the grandmaster** (`R-05`). Everything else is support.

### 3.2 ★ The database-size problem — the central decision

This is the question the whole project keeps returning to. Here is the complete picture.

**The size equation.** A *configuration* is the 12-pit seed distribution, **ignoring captured
seeds** (the store-independent encoding — see §3.5). The number of configurations with ≤ N
seeds is `C(N+12, 12)`. With the **color/180° symmetry** (`R-04`, `R-06`, `R-11`) we store only
the *South-to-move* value per configuration (North-to-move = rotate 180° + look up), so:

> **bytes(N) ≈ C(N+12, 12) × (bits-per-value / 8)**, where bits-per-value = ⌈log₂(N+1)⌉ because
> the stored value (mover's netted board seeds) ranges 0…N.

**The decision table** (color symmetry applied; "board %" = N/48 = fraction of a 48-seed game
the DB covers from the bottom):

| N | configs ≤ N | @ 1 byte | packed | value bits | board % | notes |
|---|---|---|---|---|---|---|
| 10 | 646,646 | 0.6 MB | **0.3 MB** | 4 | 21% | ultra-light / mobile floor |
| 12 | 2,704,156 | 2.7 MB | **1.4 MB** | 4 | 25% | |
| 14 | 9,657,700 | 9.7 MB | **4.8 MB** | 4 | 29% | |
| **15** | **17,383,860** | **17.4 MB** | **8.7 MB** | **4** | **31%** | **sweet spot ✅** |
| 16 | 30,421,755 | 30.4 MB | 19.0 MB | 5 | 33% | value spills to 5 bits |
| 17 | 51,895,935 | 51.9 MB | 32.4 MB | 5 | 35% | |
| 18 | 86,493,225 | 86.5 MB | 54.1 MB | 5 | 38% | |
| 20 | 225,792,840 | 225.8 MB | 141.1 MB | 5 | 42% | too big for browser |

(gzip transport typically shaves a further ~1.3–2× on top, helped by the odd/even value
clustering noted in `R-07`; treat as a bonus, not a budget.)

**The size-reduction levers, ranked by value:**

1. **Store-independent encoding** — drop the `score` dimension; index only the on-board
   configuration. *The single biggest reduction, and free* — it collapses the millions of
   positions differing only by banked seeds into one entry. Confirmed by **five** sources
   (`R-02 §2.1`, `R-06`, `R-07`, `R-08`, `R-10`). **Non-negotiable.**
2. **Truncation to ≤ N** — the macro lever; turns 178 GB into megabytes (`R-02`, `R-05`).
3. **Color/180° symmetry** — ~2× for free (`R-04`, `R-06`). ⚠ **Fold at exactly one level**
   (canonicalise the whole `(h,turn)` to South-to-move *before* ranking) — folding twice
   creates index collisions and silently corrupts the DB (`R-11` §2).
4. **Bit-packing the value** — 1 byte → ⌈log₂(N+1)⌉ bits. At N=15 the value is 0…15 = **exactly
   4 bits** (`R-10` used 4 bits for Kalah; `R-06`'s WLD-decomposition / 1-bit tricks exist for
   the 10–47 GB regime we avoid).
5. **gzip on transport** — lazy-load per-layer slices (`R-02 §5`).
6. *(Not recommended)* excluding unreachable configs — possible but complicates `rank/unrank`;
   both `R-02` and `R-10` chose to keep them for simpler indexing.

**Recommendation (the answer to "how big?"):**
> **N = 15, color symmetry, 4-bit packed ≈ 8.7 MB raw (~5–6 MB gzipped).** It covers the last
> **third** of every game perfectly (and is reached *early* in capture-heavy lines), and N = 15
> is the **largest N whose value still fits in 4 bits** — past it you pay 5 bits *and* the
> coverage gain per MB collapses. Ship N = 15 as the default; offer **N = 12 (~1.4 MB)** as a
> "lite" tier for low-end mobile, and keep **N = 17 (~32 MB)** as a "max" option if a desktop
> build wants more reach. (`R-02`, `R-05`, `R-06`, `R-07`, `R-10`.)

**Per-layer build cost is cheap at this scale** (`R-07` Table 1): the largest layer at N=15 is
~7.7 M configs converging in ~45 fixed-point sweeps — a few hundred million move evaluations,
i.e. seconds-to-minutes in Node. The build is *not* the bottleneck; the *shipped asset size* is,
which is why §3.2 is framed around bytes.

### 3.3 The build algorithm (consolidated spec)

Use **van der Goot's forward-move, three-phase retrograde** (`R-07`) — it matches `REPORT-02 §4`
and lets the builder **reuse `index.html`'s existing `simulate`/`applyMove`** instead of writing
error-prone *reverse* moves (`R-07`, `R-10` both stress reverse moves are costly/buggy in
mancala). Per seed-layer `s`, low → high:

1. **Capture-DB pre-pass** (`R-07`): for each config, max over *capture* moves of
   `−value(child)` where the child is in an already-solved smaller layer. Seeds the fixed point
   and touches smaller layers only once.
2. **Initialise** non-terminal in-layer values; set **terminal** values via
   `terminalValue` (§3.4).
3. **Fixed-point iteration** over *non-capture* (same-layer) moves until a full sweep is stable:
   `V(h,turn) = S − min_m V(child)` (`R-02 §6.1`); unresolved-at-convergence = the cycle
   convention (§3.4).
4. **Verification sweep** (`R-11` §3): one extra pass re-deriving each entry from its successors
   and asserting equality — the standard catch for `rank/unrank` or fixed-point bugs. Add to
   `REPORT-02 §7`.

Indexing: combinatorial-number-system `rank/unrank` over stars-and-bars (`R-02 §3`), with the
one-level symmetry canonicalisation from §3.2 lever 3.

### 3.4 ⚠ Rules/convention dependency — one DB per ruleset

The capture, sowing, and grand-slam rules are identical across sources, **but the
terminal/repetition *division* differs** (`R-06 §3`, corroborated by `R-07`, `R-10`, `R-11`):

| Case | Academic / solved-Awari | `index.html` (`collectSides`) |
|---|---|---|
| No legal move | opponent takes **all** | each keeps **own** row |
| Repetition | stones **split** (board value 0) | each keeps **own** row |

Consequences for the build:
- `terminalValue`/cycle value **must match the active ruleset** or the DB disagrees with play.
- `REPORT-02 §6` locked the **own-row** convention to match the engine — correct for *our* game,
  but it means the DB won't reproduce the literature's "Awari is a draw" in those lines, so the
  §7 "start evaluates to a draw" check is only meaningful under the academic convention.
- Capture rule (`2-3` vs `3-4`) and grand-slam mode also change the game → **one DB per
  `(capture, grandslam, terminal-convention)` tuple** (`R-02 §6.3`, `R-11 §4`). The rules menu
  (§5) and the builder must share one "active ruleset" definition.

### 3.5 Value encoding (settled, with a future option)
Store the **stone-difference / mover's-netted-seeds**, *not* win/loss/draw and *not* the score
split — store-independent, ≤ 4–7 bits (`R-02 §2.1`, `R-06`). This is "WLD **with magnitude**."
`R-11`'s framing notes a *future* refinement: if we ever want the engine to play the **fastest**
winning/drawing line (not just a correct one), add a **distance-to-conversion/-mate** tiebreak.
Not needed for v1 (Oware is a draw and usually has a unique best move — `R-06`).

---

## 4. Evaluation function & search (above-the-database play)

The consistent message of `R-05`, `R-08`, `R-09`: **invest in the evaluator, not search depth.**

- **`index.html`'s `evalState` is "hand-tuned" level** — material, attack/vulnerability,
  hoarding, mobility (`R-08`, `R-09`). A learned 3-leaf decision tree already beats hand-tuning
  (`R-08`); more features at depth-5 beat fewer at depth-7 (`R-09`).
- **Add the features we lack** (`R-09`): **empty-pit counts** (Ayo's highest-weighted feature),
  **reach** (pits with enough seeds to cross), explicit **kroo / >12** (we only have a max-pile
  proxy).
- **Tune the weights against the endgame DB** (`R-08`): mine the (small, N=15) DB for either a
  decision tree of `(μ, σ)` leaves or fitted weights; the z-score `(μ_S + m)/σ_S` is a
  principled replacement for the linear sum. Generalises from 15→35 seeds, so the truncated DB
  is *enough* training data.
- **Search upgrades, only if needed** (`R-10`), in ROI order: enhanced transposition cut-off
  (tree ↓ up to 8×), **safe** futility pruning, then MTD(f) (a bigger rewrite). Better features
  likely beat all of these for effort spent.

---

## 5. Rules optionality & variants

Kalah is the proof that **rule toggles flip a game's value** — capture-into-own-empty +
extra-turn + no-feeding turn a drawn, cyclic, hard game (Oware) into a first-player-win,
acyclic, easy one (Kalah) (`R-10`). This is the evidence base for the **rules-menu optionality**
backlog (`game-evolution-notes.md`): expose terminal/repetition convention, capture rule,
grand-slam mode, end mode, cycle limit; sliding scales for AI depth/strength. **Each combination
is a different game → its own endgame DB** (§3.4). Oware's *cycles* are its special burden
(they force the fixed-point iteration of §3.3); a Kalah-like variant would make the builder
simpler.

---

## 6. The learning component (research → lessons)

The corpus is rich teaching material; the exhaustive concept index lives in
**`learning-engine-note.md`**. Headline reusable assets:
- **Pure-math lessons** from Broline-Loeb (`R-03`): Tchoukaillon's unique winning move, the
  periodicity (`lcm(1..k)`), seeds-grow-like-`n²/π`, the two-sieves contrast.
- **DB-mined puzzles** (`R-11` §5): trim the DB to optimal-move edges, surface max-distance
  "source" positions as studies; (`R-08`) mining the DB for human-facing value.
- **Combinatorics complexity rating** (`game-evolution-notes.md`): the per-layer `C(s+11,11)`
  counts and the `n²/π` density (`R-03`), normalised against state-space ≈10¹² / game-tree
  ≈10³² (`R-01`) — a "distance travelled" metric. Formula to be fixed from `R-01/03/04`.

---

## 7. Decision register (open human calls)

| # | Decision | Options | Recommendation | Source |
|---|---|---|---|---|
| D1 | **Database size N** | 10 / 12 / 15 / 17 / 20 | **15** (default), 12 (lite), 17 (max) | §3.2 |
| D2 | **Value packing** | 1 byte / 4-bit / WLD-2-bit | **4-bit** at N=15 | §3.2, `R-06`, `R-10` |
| D3 | **Terminal/repetition rule** | own-row (engine) / academic split | *product call*: own-row keeps current game; academic enables "solved-Awari" claims | §3.4, `R-06` |
| D4 | **Engine strength path** | deeper search / richer features / DB-mined eval | **features + DB-mined eval** | §4, `R-08`, `R-09` |
| D5 | **Rules optionality scope** | fixed ruleset / full menu | full menu, **one DB per ruleset** | §5, `R-10` |
| D6 | **Fastest-line play** | value-only / add DTC-DTM | value-only for v1 | §3.5, `R-11` |

## 8. Build sequence (ordered roadmap)

1. **Consolidate `REPORT-02`** with the refinements scattered across the reports (forward-move +
   `applyMove` reuse, capture-DB pre-pass, one-level color symmetry, verification sweep, 4-bit
   packing, per-ruleset note). *(Pure doc work; do first so the spec is single-source.)*
2. **Decide D1–D3** (size, packing, rule convention) — they parameterise the builder.
3. **Write `tools/oware-rules.mjs`** = the engine rules lifted from `index.html` (forward moves).
4. **Write `tools/build-edb.mjs`**: `rank/unrank` (+ symmetry canonicalisation) → round-trip
   test → 3-phase retrograde → **verification sweep** → emit packed binary per layer.
5. **Validate**: round-trip, cross-check vs brute-force negamax on layers s ≤ 10, self-consistency
   (`R-02 §7` + `R-11` verification).
6. **Wire `dbProbe` into `negamax`** (`R-02 §5`): perfect play once `boardSeeds ≤ N`.
7. *(Later)* **Mine the DB** to upgrade `evalState` (`R-08`); **add Ayo features** (`R-09`).
8. *(Later)* **Rules menu** + per-ruleset DB builds (`R-10`); **opening book** with `cycle-draw`
   values (`R-06`).

## 9. Traceability (decision → reports)

| Theme | Primary reports |
|---|---|
| Convergence → DB is the lever | R-01, R-04, R-05 |
| Database size & encoding | R-02, R-05, R-06, R-07, R-10, R-11 |
| Build algorithm (forward, fixed-point, verify) | R-02, R-07, R-10, R-11 |
| Color symmetry (and its one-level caveat) | R-04, R-06, R-11 |
| Rules change value / per-ruleset DB | R-06, R-10, R-11 |
| Evaluator > search; mine the DB | R-05, R-08, R-09 |
| Pure-math / learning component | R-03, R-08, R-11 |
