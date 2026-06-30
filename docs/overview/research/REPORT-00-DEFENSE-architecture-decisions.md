# Defense Report — Architecture Decisions & Alternatives Weighed

**Purpose.** Before redrafting the synthesis report, this document examines the **main
architectural decisions** in our engine roadmap: each is stated, the alternatives are
presented with their strongest possible case, and the recommendation is defended or
revised. The goal is to surface any decision we might be wrong about — and to record
*why* we chose what we chose, so future-us doesn't re-litigate it.

**Key decisions examined:**
1. The Lithidion Stack (DB + search + book) vs. alternatives
2. Endgame database size: N = 15 vs. other thresholds
3. Forward-move retrograde vs. reverse-move vs. modern alternatives
4. Evaluation strategy: hand-tuned → DB-mined features vs. neural network
5. Delivery architecture: single binary blob vs. progressive/layered loading
6. Rules convention: engine-native (own-row) vs. academic (opponent-takes-all)

---

## 1. The Lithidion Stack vs. Alternatives

### The recommendation (current)
Three layers: **opening book → α-β search with evalState → endgame database**. This is
the architecture of every Oware world champion since 1990 (Lithidion, Marvin, Softwari,
the Romein-Bal solver).

### Alternative A: Pure MCTS (Monte Carlo Tree Search)

**Strongest case for MCTS:**
- No evaluation function needed — random rollouts replace domain knowledge.
- AlphaGo/AlphaZero proved MCTS + neural network can master games with ~10¹⁷⁰ states.
- An existing [MCTS Oware implementation](https://github.com/OMerkel/Oware) exists on
  GitHub (UCT-based), showing feasibility.
- No endgame database needed at all; the engine is "one algorithm."

**Why we reject it for oware-web:**
- Oware's branching factor is **≤ 6** — absurdly small by MCTS standards. Alpha-beta
  with a decent eval fully exploits such narrow trees; MCTS's strength is in *wide*
  trees (Go: ~250) where α-β can't reach meaningful depth.
- MCTS requires **many rollouts per move** (thousands to millions). In a browser on a
  phone with a ~50ms move-time budget, this is hostile. α-β at depth 8 with 6-branching
  is ~1.7M nodes — but most are pruned; MCTS of equivalent quality needs *more* samples
  because each is random, not directed.
- **The endgame database exists and is cheap.** Once you have perfect play for ≤ 15 seeds
  (~8.7 MB), MCTS cannot compete on those positions — it would need infinite rollouts to
  converge to perfect. The literature (R-05) is unambiguous: "no method without an
  endgame DB beat the grandmaster."
- MCTS with a neural value network (AlphaZero-style) would need **training
  infrastructure** — self-play at scale, a GPU, a trained model to ship. This violates
  the "single-file, no dependencies, runs offline" constraint fundamentally.

**Verdict: rejected.** MCTS is the wrong tool for a narrow, convergent, solved game
where a perfect endgame oracle is affordable. The Lithidion stack exploits Oware's
structure; MCTS ignores it.

### Alternative B: Pure endgame DB (no search layer)

**Strongest case:**
- If Oware is solved, just look up every position. Ship the full database.
- The 48stones.com project (Joan Sala Soler / Salen, 2023) claims a complete strong
  solution of Oware Abapa with all 827 billion positions resolved — and serves it online.
- This gives *literally perfect play* with no search, no evaluation, no approximation.

**Why we reject it for oware-web:**
- The full database is **~178 GB** (Romein-Bal) or ~200+ GB (48stones). This is not
  deliverable to a browser. Even with aggressive compression, you're looking at tens of
  GB — far beyond any browser cache, IndexedDB quota, or reasonable download.
- The 48stones.com project operates as a **server-side oracle** — the client queries the
  server per move. This requires internet connectivity and a hosted backend, which
  violates our "offline, single-file" constraint.
- Even partial downloads (say, all positions ≤ 35 seeds as Lincke and van der Goot
  explored) hit **13+ billion entries = ~13 GB** minimum — still absurd for a browser.
- **Truncation + heuristic search is the engineering sweet spot.** We get perfect play
  where it matters most (endgames, ≤ 15 seeds) and strong heuristic play above, all in
  ~6 MB gzipped.

**Verdict: rejected for delivery, but confirmed as the gold standard.** We are building
a *partial* version of this architecture (truncated to N=15). The full DB is the ceiling
we aspire toward in a "server mode" someday, not the shipped browser asset.

### Alternative C: NNUE (Efficiently Updatable Neural Network)

**Strongest case:**
- NNUE revolutionized Stockfish (chess) — a tiny neural network (~40 MB) replaces
  hand-tuned evaluation, trained on engine self-play, runs on CPU without a GPU.
- It compresses "evaluation knowledge" far more efficiently than a raw database: the net
  *generalizes* rather than memorizing every position.
- For Oware, with only 12 inputs (pit counts) + side-to-move, the network could be
  extremely small (kilobytes).
- Training data is free: our endgame DB at N=15 provides ~17M labelled positions.

**Analysis:**
- NNUE replaces the **evaluation function**, not the endgame database. Stockfish still
  uses Syzygy tablebases alongside NNUE. The architecture would be: opening book → α-β +
  NNUE eval → endgame DB. This is **still the Lithidion stack** — with NNUE as the eval.
- For Oware's 12-input, small-branching structure, a simple NNUE would likely be
  **overkill** but not harmful. van Rijswijck (R-08) showed a 3-leaf decision tree
  already beats hand-tuning — suggesting the eval surface is *simple enough* that a
  small net or even fitted weights suffice.
- **Implementation cost vs. gain:** a 3-9 leaf decision tree fitted to the DB (R-08's
  method) gives ~80-90% of NNUE's benefit with ~0.1% of the implementation complexity.
  No training loop, no weight format, no inference engine needed.

**Verdict: deferred, not rejected.** NNUE is a valid future upgrade path for the eval
layer. For v1, the DB-mined decision tree (R-08) is the higher-ROI path given our
constraints. The Lithidion stack architecture accommodates either.

### Conclusion on §1

The Lithidion Stack survives scrutiny. Its alternatives either ignore Oware's structural
advantages (MCTS), require impossible storage (full DB), or are compatible upgrades
*within* the stack rather than replacements (NNUE). **The stack is confirmed.**

---

## 2. Database Size: N = 15 vs. Alternatives

### The recommendation: N = 15 (~8.7 MB packed, ~5-6 MB gzipped)

### Challenge: Why not N = 10 or 12? (Ultra-light)

**Case for smaller:**
- N = 10 is **0.3 MB** — trivially downloadable, instant on any device.
- N = 12 is **1.4 MB** — still negligible; fits in a service worker cache easily.
- Covers 21% / 25% of the game from the bottom respectively.
- van Rijswijck (R-08) showed features learned from N = 15 generalize upward — but he
  also showed the *features* can be mined from any layer. Even N = 10 provides training
  data for a better eval.
- Minimizes first-load time; the game already works offline immediately.

**Why N = 15 is still better:**
- **Coverage jump:** N = 15 covers 31% vs. 21% (N=10) — that's 50% more of the game
  played perfectly. In practice, captures happen fast in many lines, so the DB is
  reached *much* earlier than move 31% would suggest.
- **4-bit boundary:** N = 15 is the **largest N whose value (0…15) fits in exactly 4
  bits** — a nibble. Past N = 15, values need 5 bits, and bit-packing becomes messier
  (values no longer align to byte boundaries cleanly). This is a real implementation
  simplicity win.
- **The 8.7 MB raw / ~5-6 MB gzipped size is well within browser comfort.** For
  context: a typical web page is 2-4 MB; Lichess's Stockfish WASM is ~2 MB; the full
  Syzygy 5-piece chess tablebase is ~1 GB but chess apps routinely ship 5-piece WDL at
  ~400 MB. Our 6 MB is tiny by modern standards.
- **IndexedDB can cache it permanently** after first download; subsequent visits are
  instant. The DB never changes (it's a mathematical truth), so it caches forever.

**Verdict: N = 15 confirmed.** N = 12 as a "lite" tier for extremely constrained devices
(or as a fallback that loads first while N = 15 progressively loads in background).

### Challenge: Why not N = 17 or 20? (More coverage)

**Case for larger:**
- N = 17 covers 35% (32 MB packed / ~20 MB gzipped). Still plausible for desktop.
- N = 20 covers 42% (141 MB packed). Marginal but some desktop apps ship this.
- More coverage = fewer positions where the heuristic matters = stronger overall play.
- The eval-improvement path (R-08/R-09) is *additive* — it helps above the DB, but
  below the DB it's irrelevant. A bigger DB simply eliminates more eval dependency.

**Why N = 15 remains the default:**
- **The 4→5 bit transition at N = 16** means N = 17 entries are 5 bits, increasing size
  by 25% for the same number of entries. The MB-per-coverage-point ratio worsens.
- **20 MB gzipped is a meaningful initial download.** For a "click and play" browser
  game, this approaches the boundary where users bounce. The game should be playable
  *immediately* (with heuristic-only or N=12 lite), with N=15 loading in background.
- **Diminishing returns:** the difference between 31% and 35% coverage in practice is
  ~4 extra seeds on the board when perfect play kicks in. Given that the eval above the
  DB will be *tuned against the DB* (R-08), the heuristic in that 4-seed gap is already
  near-optimal.

**Verdict: N = 17 offered as an opt-in "max" tier (desktop, enthusiast), not default.**

### The size budget, restated

| Tier | N | Packed size | Gzipped est. | Coverage | Use case |
|------|---|-------------|--------------|----------|----------|
| Lite | 12 | 1.4 MB | ~0.8 MB | 25% | First-load fallback; ultra-low-end |
| **Default** | **15** | **8.7 MB** | **~5-6 MB** | **31%** | Standard; cached in IndexedDB |
| Max | 17 | 32 MB | ~20 MB | 35% | Desktop opt-in; enthusiast |

---

## 3. Build Algorithm: Forward-Move Retrograde vs. Alternatives

### The recommendation: Van der Goot's 3-phase forward-move algorithm

### Alternative: Classic reverse-move retrograde (Ströhlein/Thompson)

**Strongest case:**
- Proven on chess tablebases since the 1970s (Thompson) — the original method.
- Converges in a single backward pass (no fixed-point iteration) when the graph is a
  DAG — which Kalah is (R-10).
- Requires no repeated full sweeps; each position is visited O(1) times once its
  children are resolved.

**Why we reject it:**
- **Oware's reverse moves are "unnatural and a source of programming errors"** (van der
  Goot, R-07, direct quote). In mancala, un-sowing is ambiguous: the same board can be
  reached by many different sowing origins, and reconstructing which house was the source
  requires tracking information the forward rules don't encode.
- **We already have a correct forward-move generator** (`simulate`/`applyMove` in
  `index.html`). Writing a reverse generator from scratch is the single most bug-prone
  task in the entire project — and any bug silently corrupts the database.
- **The within-layer cycle problem** (non-capture moves stay in the same layer) means
  Oware isn't a DAG within a layer anyway — so the classic single-pass reverse method
  doesn't even work cleanly. You'd still need the fixed-point or a counter-based
  propagation (R-11's approach) which adds complexity.
- Irving et al. (R-10) — solving a *different* mancala game — independently concluded
  "it is costly in mancala games to compute reverse moves" and used forward moves. Two
  independent teams, same conclusion.

**Verdict: forward-move confirmed.** Reuse `applyMove`, accept the ~45-iteration
fixed-point cost (which is seconds at N=15).

### Alternative: BDD/symbolic retrograde (Set-Based, 2024 paper)

**Strongest case:**
- Represents sets of positions symbolically (BDDs, ZDDs) rather than enumerating them
  individually. Can compute entire layers simultaneously.
- The 2024 paper in our collection is specifically about this approach.
- Could in principle compress the *stored* database using the symbolic representation.

**Why we don't use it:**
- BDD-based methods shine at the **10¹²+ position scale** where explicit enumeration
  runs out of memory. Our N = 15 scale (~17M positions) fits trivially in RAM with
  explicit methods. BDDs add implementation complexity (a BDD library) for no gain at
  this scale.
- The output must still be a flat lookup array for O(1) probing during play — so even
  if we built symbolically, we'd serialize to the same packed binary.
- No BDD library exists in our stack (vanilla JS, no dependencies). Adding one violates
  the project constraint.

**Verdict: not applicable at our scale.** Filed as reference for the full-48 regime.

---

## 4. Evaluation Strategy: DB-Mined Features vs. Neural Network

### The recommendation: Mine the N=15 DB for a decision-tree or fitted-weight eval

### Alternative: Train a small neural network (NNUE-style)

**Full analysis (expanding §1C):**

An NNUE for Oware would take the 12 pit values + side-to-move as input (13 features)
and output a single scalar evaluation. Given Oware's simplicity:
- **Input dimension:** 13 (vs. chess NNUE's ~40,000+ halfKP features)
- **Hidden layers:** likely 1 hidden layer of 16-64 neurons suffices
- **Model size:** ~2-8 KB of float32 weights — negligible
- **Training data:** 17M labelled positions from the DB — ample
- **Inference cost:** a few hundred multiply-adds per position — instant

This is legitimately attractive. The counter-arguments:

1. **Training infrastructure.** We'd need a training script (Python + PyTorch/TF), a
   data pipeline (export DB → training format), hyperparameter tuning, and a way to
   embed the trained weights into `index.html`. This is *possible* but adds a build
   pipeline that doesn't currently exist.
2. **Interpretability.** The learning component teaches *why* moves are good. A neural
   eval is a black box. The decision-tree approach (R-08) produces human-readable rules
   ("if empty-pit-count > 3 and material > +2, class B with μ=+4.2, σ=1.1"). This
   has pedagogical value the net doesn't.
3. **Diminishing returns.** Van Rijswijck (R-08) showed a 3-leaf tree already beats
   hand-tuning; a 9-leaf tree is competitive with purpose-trained methods. Given that
   the DB already provides perfect play for 31% of positions, the eval only matters in
   the remaining 69% — and there, a modest improvement (tree) vs. a larger one (net)
   may not be perceptible to a human player.
4. **The project's aesthetic.** `oware-web` is a single HTML file, no dependencies, no
   build step for the game itself. Embedding trained weights as a JS array is fine; but
   the *process* of training introduces external tooling that breaks the "everything is
   self-contained and auditable" philosophy.

**Verdict: DB-mined decision tree for v1; NNUE as a v2 option.** The tree is sufficient,
cheap, interpretable, and doesn't require training infrastructure. If we later want to
push past it, the NNUE path is straightforward given the DB as training data.

### Alternative: Genetic algorithm evolution (Ayo/R-09 style)

**Case:** Evolve weights by self-play, no DB needed for training.

**Why the DB-mining approach is strictly better:**
- Self-play produces *noisy* labels (who won a game ≠ which moves were perfect). The DB
  produces *perfect* labels — ground truth for every position it covers.
- The GA (R-09) needed 100 generations × 50 chromosomes × 20 games each = 100,000
  games of self-play. The DB gives 17 million labelled positions instantly.
- R-08's key finding: features mined at N=15 **generalize to N=35**. The small DB is
  enough training data; you don't need self-play's breadth.

**Verdict: GA rejected in favour of DB-mining.** No information is gained by self-play
that the DB doesn't provide more cheaply and accurately.

---

## 5. Delivery Architecture

### The recommendation: Layered progressive loading into IndexedDB

### How it works:
1. **First visit:** game loads and is playable immediately (heuristic-only AI).
2. **Background download:** fetch N=12 layers first (~0.8 MB gzipped) → store in
   IndexedDB. AI upgrades to perfect endgame at ≤12 seeds. Total: seconds.
3. **Continue in background:** fetch N=13, 14, 15 layers (~4-5 MB more). AI reaches
   full strength. Total: tens of seconds on broadband.
4. **Subsequent visits:** DB is already cached in IndexedDB. No download. Instant.

### Alternative: Single blob download

**Case:** Simpler implementation; one `fetch()` of the gzipped binary, done.

**Why progressive is better:**
- The game is **playable instantly** regardless of network speed. A 6 MB blocking
  download on a 3G connection (common in West Africa, where Oware originates) would be
  15+ seconds of nothing happening.
- Progressive layers mean **each layer is independently useful** — N=12 is already a
  massive improvement over heuristic-only. The user gets benefit *during* download.
- IndexedDB can store individual layers; if a download is interrupted, completed layers
  are retained.

### Alternative: Server-side oracle (à la 48stones.com)

**Case:** Perfect play from move 1, no storage budget at all. The full 827B-position
database lives on a server; the client queries it per move.

**Why we reject it:**
- Violates offline-first, single-file, no-dependencies. The game must work from
  `file://` and without internet.
- Introduces latency per move (network round-trip).
- Requires hosting a backend indefinitely — cost and maintenance.
- The 48stones project is the existence proof that this *works* — but it serves a
  different audience (researchers, analysts) than a "pick up and play" browser game.

**Verdict: progressive IndexedDB loading confirmed.** Server oracle as a potential
"analysis mode" addition later (not for play).

---

## 6. Rules Convention

### The decision: Which terminal/repetition rule does the *default* DB use?

### Option A: Engine-native ("own-row" / `collectSides`)

**Case:**
- Matches the existing `index.html` behaviour. No engine code changes needed.
- The DB agrees with live play — no mismatch between what the DB says and what the
  engine does.
- This is how most casual Oware is played (each player keeps their own side when the
  game stalls).
- We cannot claim "the game is a draw" under these rules (that was proven under
  academic rules), but we can say "the engine plays perfectly in the endgame under its
  own rules."

### Option B: Academic ("opponent-takes-all" on no-move, "split" on repetition)

**Case:**
- The *proven* result "Awari is a draw, 24-24" applies. This is the published,
  peer-reviewed game value.
- The Romein-Bal database was built under these rules; any comparison to the literature
  requires them.
- 48stones.com uses these rules (or a variant of them) and claims to have solved the
  game under competitive Abapa rules.
- If the learning component teaches "Oware is a draw," it should be *true under the
  rules the game is actually playing* — otherwise it's misleading.

### Option C: Both, selectable (per the rules-optionality backlog)

**Case:**
- The rules menu already exposes capture-rule and grand-slam toggles. Adding terminal
  convention is one more toggle.
- Build the DB for the default convention; offer the other as an option (with its own
  DB, or with a "heuristic only — no DB for this variant" note).

### Recommendation (revised from current synthesis):

**Build the DB under academic rules** (opponent-takes-all / split) as the *primary*
database. Then:
- Change `index.html`'s `isOver`/`collectSides` to the academic convention **by
  default**, so the default game matches the solved game and the learning content is
  truthful.
- Add a rules toggle exposing the "own-row" convention as the alternative (a folk/
  casual variant).
- This aligns the product, the DB, the literature, and the learning content.

**Rationale for the change from the current synthesis:** The current synthesis locked
"own-row" because that's what the engine does *now*. But the engine's convention was
never a deliberate design choice — it was inherited from an unattributed implementation.
The academic convention is:
1. Documented by two independent sources (Lincke R-06, van der Goot R-07)
2. The basis of the solved-game result
3. Used by competitive Oware software (48stones, Aalina/Aualé)
4. More interesting strategically (opponent-takes-all punishes starvation harder)

The code change is small (`collectSides` → a conditional based on the active rule),
and it makes the headline teaching claim ("Oware is a draw") *actually true* in the
game being played.

---

## 7. Summary of Decisions Confirmed / Revised

| # | Decision | Status | Notes |
|---|----------|--------|-------|
| 1 | Lithidion Stack architecture | **Confirmed** | MCTS, full-DB, pure-NN all rejected for this context |
| 2 | N = 15 default, tiered (12/15/17) | **Confirmed** | 4-bit boundary is the key insight; progressive loading |
| 3 | Forward-move retrograde | **Confirmed** | Two independent teams prefer it; reuses `applyMove` |
| 4 | DB-mined eval (decision tree, R-08) | **Confirmed for v1** | NNUE deferred; GA rejected |
| 5 | Progressive IndexedDB loading | **Confirmed** | Server oracle deferred to "analysis mode" |
| 6 | Terminal/repetition convention | **REVISED → academic rules as default** | Aligns DB, literature, learning content; expose own-row as toggle |

---

## 8. New Information from Web Research

### 8.1 "Oware is Strongly Solved" (Salen, 2023)

A 2023 publication (Springer, *Advances in Computer Games*) by the 48stones.com team
claims Oware (Abapa variant) is now **strongly solved** — all 827 billion+ reachable
positions computed. Key findings relevant to us:

- They discovered previously unknown **11-seed and 13-seed loops** that cannot be
  resolved under standard Abapa rules alone (the loop never produces a capture). These
  required a special resolution rule to complete the solve.
- Their solution confirms the **draw** result but adds nuance: **only the rightmost
  opening pit (pit 6) draws**; all other opening moves *lose by 1 seed* (23-25). This
  contradicts the 2002 Romein-Bal claim that "any opening move draws" and suggests their
  database had errors (the 48stones team explicitly states this).
- The ruleset used is **competitive Oware Abapa** as endorsed by the Oware Society (OWS)
  and the International Association of Warri Players (IAWP) — not the simplified
  "academic Awari" of Romein-Bal.

**Impact on our project:**
- The "any opening draws" claim in our learning content needs qualification.
- The special loops at 11 and 13 seeds mean our cycle convention *matters* even within
  the N=15 DB — these loops are inside our coverage range.
- This is the strongest evidence yet for matching the competitive Abapa rules.

### 8.2 Aalina Engine (Joan Sala Soler)

The strongest publicly available Oware engine. Java, UCI-protocol-adapted, uses an
endgame database and α-β search — **confirming the Lithidion stack is the architecture
of the current state of the art**, not just a historical template.

### 8.3 Browser Storage Landscape (2024-2026)

- **IndexedDB** is the standard for large binary data in the browser. Quotas are
  generous (typically unlimited with user permission; Chrome/Firefox allow hundreds of
  MB without prompting).
- **Cache Storage API** (via Service Workers) is an alternative for the same purpose but
  optimized for Request/Response pairs — IndexedDB is better for raw binary.
- **OPFS (Origin Private File System)** is the newest option — a true filesystem in the
  browser. Available in all modern browsers. Could store DB layers as actual files,
  accessed synchronously from a Web Worker. Worth considering for the read pattern (many
  small random-access lookups into a binary blob).

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| The N=15 DB has a bug that's silent (corrupted entries) | Medium | High | Verification sweep (R-11); cross-check vs. brute-force on N≤10; self-consistency checks |
| The academic rule convention has edge cases we don't understand (the 11/13-seed loops) | Medium | Medium | Study the 48stones/Salen 2023 paper before finalizing the cycle convention |
| 6 MB download is too slow for target users in West Africa | Low-Medium | Medium | Progressive loading; N=12 lite tier as immediate fallback (~0.8 MB) |
| The 4-bit packing at N=15 complicates the rank/unrank code | Low | Low | Values 0-15 = one nibble = two entries per byte; standard bit-packing, well-tested in chess tablebases |
| Future rule toggles require multiple DB variants | Certain | Medium (build cost) | Parameterize the builder; accept that each `(capture, grandslam, terminal)` tuple is a separate build |

---

*This document is a pre-requisite to the synthesis redraft. Its conclusions will be
incorporated into the new `REPORT-00-SYNTHESIS-engine-roadmap.md` as settled
architecture, with the §6 rules-convention revision being the one material change from
the prior version.*
