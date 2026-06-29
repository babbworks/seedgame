# Report: Can We Get a Strong AI Without a Giant Tablebase? (Randle et al., 2013)

A close reading of **Randle, Ogunduyile, Zuva & Fashola (2013),** *A Comparison of the
Performance of Supervised and Unsupervised Machine Learning Techniques in evolving
Awale/Mancala/Ayo Game Player*, IJGTT 1(1)
(`papers/Supervised-vs-Unsupervised-ML-Awale-Mancala-Ayo-Player.pdf`).

This is the **practical-AI** paper. REPORT-02 commits us to an exact endgame database;
this survey asks the complementary question every web-game builder eventually faces: *how
strong can a learned/heuristic player get, and is the database really necessary?* The
answer, bluntly, is that the endgame database is what separates grandmaster strength from
the rest — which both justifies REPORT-02 and warns us about its size.

---

## 1. The game, as the paper states it

The rules match `index.html`'s `'23'` learning ruleset: 12 pits, 4 seeds each, the
**2-3 capture rule**, the **golden rule** (you must leave the opponent a legal move —
`legalMoves`' feeding obligation), and three endings: a player passing **24** captured
seeds, **both** reaching 24 (a draw), or seeds circulating endlessly — in which case "each
player is awarded the seeds on his row." That last clause is exactly `collectSides` /
`terminalValue` from REPORT-02 §6 — independent confirmation of the own-side division
convention.

## 2. Two families of learning technique

The paper splits machine learning into **supervised (SMLT)** and **unsupervised (UMLT)**
and asks which produces the stronger Awale player.

### 2.1 Supervised: Case-Based Reasoning wins
Among supervised methods (decision trees, perceptrons, Bayesian nets, SVMs, and the
evolved players CBR, LDA, RAM, GA, Co-evolution), the standout is **Case-Based Reasoning
(CBR)** refined by a procedure called **"casing"** (case-based reasoning + perceptron move
classification). The evolved player **OPON** defeated the "Awale grandmaster" shareware **by
25.17 points**, the strongest supervised result reported:

| Stage | Seeds — evolved player | Seeds — Awale |
|---|---|---|
| Amateur | 25.17 (σ 0.41) | 14.17 (σ 1.60) |
| **Grandmaster** | **25.50 (σ 0.55)** | **15.00 (σ 1.00)** |

The paper also studies **minimax + CBR**: plain minimax *loses* to the grandmaster
(16.00 vs 26.50), but minimax-CBR *wins* (25.50 vs 15.00). The formal apparatus is the
standard minimax/Stockman solution-tree equality — i.e. the same α-β machinery our engine's
`negamax` already uses, augmented with a case library.

`★ Insight ─────────────────────────────────────`
The minimax-alone-loses / minimax-plus-knowledge-wins result is the paper's quiet
confirmation of REPORT-01's "Lithidion stack." Bare search with a weak evaluator is
*sub-grandmaster* — which is roughly where `oware-web`'s current `evalState` α-β sits. The
strength comes from bolting *stored knowledge* (a case base, or — better — an exact
endgame database) onto the search.
`─────────────────────────────────────────────────`

### 2.2 Unsupervised: only retrograde analysis reaches grandmaster
Among unsupervised methods (Probabilistic Distance Clustering, Aggregate Mahalanobis
Distance, and **Retrograde Analysis**), the paper is emphatic:

> "Retrograde analysis is the **only** known unsupervised learning technique that has
> defeated Awale grandmaster conveniently."

Its description of retrograde analysis is the same algorithm as REPORT-02: enumerate the
fully-stored state space, mark terminal positions, work **backwards** determining each
position's game-theoretic value, index positions by **Gödel numbers** (their perfect-hash;
our `rank`/`unrank`), modified to skip unreachable positions, storing scores in **−48..+48
using 7 bits per entry**. It credits the Romein & Bal database used at the 2002 Computer
Olympiad, with the now-familiar engineering numbers:

- **889,063,398,406** positions enumerated (all reachable states),
- **51 hours** on a **144-processor 1 GHz Pentium III cluster** with **72 GB** RAM,
- stored scores rather than best moves (so multiple equally-good moves are not distinguished).

## 3. The decisive variable: the endgame database

The paper's cross-cutting table (Table 3) tags each method by whether it uses an **endgame
database** and how far up the skill ladder it reaches. The pattern is stark and is the
paper's real conclusion:

> "There was **no evolved player able to defeat the Awale grandmaster conveniently without
> using the endgame databases** to improve its performance."

Both winners — supervised CBR/casing and unsupervised retrograde analysis — rely on stored
endgame knowledge. Methods without it plateau below grandmaster.

> **For oware-web:** this is direct empirical backing for REPORT-02. If the goal is a
> genuinely strong opponent (not just "plays legally"), the **endgame database is the
> non-negotiable component**, exactly as REPORT-01/04 argued from theory. Heuristic search
> alone (today's engine) tops out around amateur/mid strength.

## 4. The catch — and why our truncated DB is the right call

The paper is equally clear about retrograde analysis's **cost**, listing two disadvantages:

1. it is "**too expensive to implement** since Awari/Awale positions occur in Billions and
   therefore such methods **cannot be easily implemented on a small memory device like a
   wireless handset**," and
2. it "requires a huge amount of CPU time and internal memory."

`★ Insight ─────────────────────────────────────`
Disadvantage (1) is, almost verbatim, the design constraint for `oware-web`: a browser on a
phone *is* the "small memory device" that cannot hold the full tablebase. REPORT-02's
answer — solve only the ≤ N-seed layers (N = 15 → ~35 MB instead of 178 GB) — is precisely
the engineering compromise this limitation forces. We get *perfect* play for the last third
of the game (where it matters most and where pure search is weakest) at 0.02% of the full
storage. The paper frames the problem; R-02 supplies the laptop-scale solution.
`─────────────────────────────────────────────────`

## 5. Synthesis — what this report tells us to do

1. **Strong play ⇒ stored endgame knowledge.** Empirically, every grandmaster-beating
   Awale player used an endgame database. Bare α-β (the current engine) is amateur-grade.
   → Build the database (REPORT-02). This is now backed by *theory* (R-01, R-04) **and**
   *experiment* (this paper).

2. **A full tablebase is infeasible in a browser** — the paper says so directly for
   handsets. → REPORT-02's truncation to ≤ N seeds is the correct architecture, not a
   compromise to apologise for.

3. **If we ever want strength *above* the truncation frontier without more storage**, the
   paper points to a real alternative: **CBR/casing** (a learned case library guiding
   minimax) reached grandmaster strength *supervised*. This is the closest thing to "a
   strong heuristic AI without shipping a giant tablebase," and dovetails with the
   `van Rijswijck "Learning from Perfection"` item still on the gated list — mining the
   *small* DB we do build to learn a midgame evaluator better than the hand-tuned
   `evalState`.

4. **Independent rule confirmation.** The paper's cycle-ending rule ("each player is
   awarded the seeds on his row") matches REPORT-02 §6's `terminalValue` / `collectSides`,
   giving us a second source for the own-side division convention.

### Forward links
- Endgame database mechanics, indexing, truncation budget → `REPORT-02`.
- "Only retrograde analysis beats the grandmaster" corroborates `REPORT-04`'s Table 2
  ("retrograde analysis is Oware's only essential procedure").
- The CBR/"learn from the database" idea → the gated `van Rijswijck, Learning from
  Perfection` (Bambam) in `BIBLIOGRAPHY.md`, a natural next acquisition.
