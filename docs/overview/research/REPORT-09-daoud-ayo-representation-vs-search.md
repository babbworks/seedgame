# Report: More Features Beat Deeper Search (Daoud et al., 2004 — "Ayo")

A close reading of **Daoud, Kharma, Haidar & Popoola (2004),** *Ayo, the Awari Player, or How
Better Representation Trumps Deeper Search* (`papers/Daoud-et-al-2004-Ayo-the-Awari-Player-Representation-Trumps-Search.pdf`,
IEEE CEC 2004, Concordia University).

This is the most **directly affirming** paper for `oware-web`'s current architecture. Its whole
thesis is: **a richer evaluation function with a shallower search beats a poorer evaluation with
a deeper search.** Their player *Ayo* at minimax depth 5 outperforms a prior player at depth 7.
For our engine — which already pairs a feature-based `evalState` with modest-depth α-β — this is
a green light to **add features and tune weights** rather than chase search depth.

---

## 1. The claim and the experiment

Ayo uses a plain **minimax** search with a **12-feature linear evaluation**
`f = Σᵢ wᵢ·aᵢ` whose weights `wᵢ ∈ [0,1]` are **evolved by a Genetic Algorithm**. The benchmark
is the earlier Davis & Kendall co-evolution player, which used the *same first six features* but
a **depth-7** search. Result: **Ayo at depth 5 (and even depth 3) matches or beats Davis at
depth 7.**

### 1.1 The 12 features (note which our engine already has)
| # | Feature | In `index.html` `evalState`? |
|---|---|---|
| a1/a2 | # opponent pits that can capture 2 / 3 from us (our **vulnerability**) | ✅ (`±8` "one-short" term) |
| a3/a4 | # our pits that can capture 2 / 3 (our **attack**) | ✅ (`±8` term) |
| a5/a6 | # opponent / our pits with **enough seeds to reach** the other side | ❌ |
| a7/a8 | # pits with **> 12 seeds** (the *kroo* / lapping move) opponent / us | ⚠ partial (`hoarding` = max pile) |
| a9/a10 | current **score** opponent / us | ✅ (material `×100`) |
| a11/a12 | # **empty pits** opponent / us | ❌ |

> **For oware-web:** Ayo's features a5/a6 (**reach**), a7/a8 (explicit **kroo / >12**), and
> a11/a12 (**empty-pit counts**) are ones our `evalState` *lacks* or only approximates. The GA
> found the **# empty pits on the opponent's side** to be the **highest-weighted feature of all
> (1.0)** — "the starting point for executing many seed-capturing maneuvers." That's a cheap,
> high-value term we could add immediately.

### 1.2 The GA (for reference)
Binary chromosomes (48 bits, 4 per weight), population 50, **tournament selection** (each
chromosome plays 20 games vs a random 20% "fitness set", 2/1/0 for win/draw/loss), 10% elitism,
single-point crossover `p=0.5`, bit-flip mutation `0.001`, 100 generations. Weights are evolved,
*not* derived — "there is no mathematical method of calculating them."

## 2. Results (Sections III)

- **Depth-3 Ayo ≈ depth-7 Davis.** The most telling cell: at **grandmaster** level both lose
  0:5, but Ayo captures an average **16.4 seeds** vs Davis's **4.40** — far closer to parity
  with the same shallow-vs-deep disadvantage *reversed*.
- **Depth-5 Ayo:** wins all games at initiation and beginner; **amateur 7-1-2** (10% better than
  Davis's depth-7); grandmaster still 0:5 but with a higher score.
- **Interpretable weights** (depth-3): empty-opponent-pits **1.0**; our capture-2/3 and kroo
  **0.93**; reach **0.87**; own score **0.6** > opponent score **0.13** → a learned **attack
  bias**.

`★ Insight ─────────────────────────────────────`
"Representation trumps search" is the same lesson as `REPORT-08` (van Rijswijck) from the other
direction. van Rijswijck *fits* a good evaluator to perfect data; Daoud *evolves* one by play —
but both conclude the **evaluation function is where strength lives**, and deeper search has
diminishing returns once the features are good. For a browser game on a phone, where deep search
is expensive, this is doubly welcome: shallow search + rich, well-tuned features = strong play at
low CPU. Their own line: "the best chess players in the world have very limited search compared
to even the humble PC."
`─────────────────────────────────────────────────`

## 3. Two side-notes worth filing

- **A rules variation (for the optionality backlog):** Daoud state the capture rule as "last
  seed in an opponent's pit with **one or two** seeds … if the previous pit has two or three"
  — which is *not* the standard 2-3 Awari rule and reads as garbled or a variant. Either way it's
  another data point that **capture rules vary across the literature**, reinforcing the
  rules-menu optionality item (see `game-evolution-notes.md`). Treat their exact numbers with
  caution.
- **A tidy history (Related Work):** Lithidion (van der Meulen, α-β + 13-seed DB, Olympiad gold
  1990–92) → Marvin (Lincke, drop-out expansion → `REPORT-06`) → Softwari (van der Goot,
  52 B positions = 4.5% of state space → `REPORT-07`). Marvin beat Softwari in the 2000 Olympiad
  *despite making 13 errors in the final game* — a nice illustration that even champion programs
  weren't yet perfect, two years before the full solve.

## 4. What this changes for oware-web

1. **Validates the architecture.** Our `evalState` + modest-depth α-β is the *right* shape; the
   lever is **features and weights**, not depth. Don't over-invest in search depth for the AI.
2. **Concrete features to add to `evalState`:** **empty-pit counts** (highest-value per Ayo),
   **reach** (pits with enough seeds to cross to the opponent), and an explicit **kroo / >12**
   term (we only have a crude max-pile proxy).
3. **Tune the weights, don't guess them.** `index.html`'s weights (`×100`, `±8`, `×3`, `×2`) are
   hand-set. Ayo evolves them by self-play; `REPORT-08` fits them to the endgame DB. Either is an
   upgrade — and the DB route (R-08) is cheaper and noise-free.
4. **Feeds the difficulty slider** (`game-evolution-notes.md`): search depth and feature richness
   are *both* dials; this paper shows feature richness is the more efficient one.

### Forward links
- Complementary "fit the evaluator to the DB" method → `REPORT-08` (van Rijswijck).
- The endgame-DB-is-decisive context → `REPORT-05`; the DB itself → `REPORT-02`.
- Capture-rule variation → rules-optionality backlog in `docs/game-evolution-notes.md`.
