# Report: Data-Mining the Endgame DB for a Better Evaluator (van Rijswijck, 2000)

A close reading of **Jack van Rijswijck (2000),** *Learning from Perfection: A Data Mining
Approach to Evaluation Function Learning in Awari* (in
`papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf`, pp. 115–132, CG 2000,
University of Alberta — the **Bambam** team).

This is the paper `REPORT-05` pointed to as the answer to "*can we get a strong AI without
shipping a 178 GB tablebase?*" The answer is yes, and the method is the most directly
actionable AI result in the collection: **build a small endgame database, then mine it to
learn an evaluation function that beats the hand-tuned one.** For `oware-web` this means our
truncated N = 15 database (REPORT-02) does *double duty* — perfect endgame play **and**
training data for a better midgame `evalState`.

---

## 1. The core idea: perfect feedback instead of noisy self-play

Most evaluation-function learning uses self-play + reinforcement learning, whose feedback is
noisy and slow. Awari offers something almost no game does: a **perfect oracle** — the
endgame database. So you can measure *any* evaluation function's quality **directly** against
perfect values, with:

- **no need to gather representative training data** (the DB *is* the entire position space
  at a given seed count, not a sample), and
- **no overfitting** (you're fitting to ground truth, not a sample).

> **For oware-web:** this reframes what the endgame DB is *for*. `REPORT-02` treats it as a
> lookup table for perfect endgame play. van Rijswijck shows it's *also* a labelled training
> set for learning a midgame heuristic. One artefact, two uses.

The value being learned is the familiar **store-independent stone difference** `v(p)` (= the
capture difference under perfect play, ignoring already-captured seeds — same encoding as
`REPORT-02` §2.1, Lincke `REPORT-06`, van der Goot `REPORT-07`). South wins iff `m + v(p) > 0`
where `m` is the material already banked. And again the **color symmetry**: "the database
values are all computed from the viewpoint of South to move" (confirms `REPORT-04`/`REPORT-06`).

## 2. The method (Sections 4–5)

### 2.1 Features, atomic → high-level
- **Atomic features** are Booleans on single pits: `pit = j` (e.g. `C=3`) and `pit > j`
  (e.g. `d>3`). A `p`-pebble database is fully described by `2·12·p` atomic features.
- **High-level features** are Boolean trees combining them. He keeps **5 operators**
  (`∧, ∨, ⊕, ⇒, ⇐`) so any 2-variable Boolean function is one step away (avoiding the
  inference blow-up of a minimal `{∧,¬,∨}` set).
- **Feature fitness = `r²`**, the squared statistical correlation between the feature's
  Boolean value and the database value, over *all* positions.

### 2.2 From features to an evaluation: partition + z-score
Partition the positions of an `i`-pebble DB into classes; each class `S` has a mean `μ_S` and
deviation `σ_S` of true values (Gaussian in practice). For an unseen `p ∈ S`, the win
probability is `Φ((μ_S + m)/σ_S)`, and since `Φ` is monotincreasing the evaluation simplifies
to a **z-score**:

```
eval(p) = (μ_S(p) + m) / σ_S(p)
```

`σ_S = 0` means the value is *known* (a proved win/loss → ±∞). **Partition fitness** is the
size-weighted `σ`; **relative fitness** `σ_rel = σ(H)/σ(M)`, where the material-only evaluator
scores `1` and **lower is better**.

### 2.3 Building the evaluator = growing a decision tree
Start with one class (all positions) and repeatedly **split the highest-potential class by
its best-correlating feature** → a **decision tree** whose leaves hold `(μ, σ)` lookups. (Taken
to the limit this reproduces the DB exactly, but a few leaves already do well.)

`★ Insight ─────────────────────────────────────`
This is a clean, principled replacement for `index.html`'s hand-weighted linear `evalState`.
Instead of summing hand-set terms, you classify the position into a learned bucket and read a
`(μ, σ)` z-score. The "features" can even be the *same* human concepts the engine already uses
— but with **weights/structure fitted to perfect data** rather than guessed.
`─────────────────────────────────────────────────`

## 3. Results that matter for us (Section 6)

- **Hand-crafted features** (the Bambam humans' best): **mobility** (# moves), **safety** (#
  pits with ≥ 3 seeds), **attack** (# enemy pits under attack), **balance**. Best combo:
  *safety-difference + mobility-difference*.
- **Atomic features are weak** (`r² ≈ 0.04–0.09`); the best involve the **leftmost pits** and
  the thresholds **`>2` (≈ safety)** and **`=0` (≈ mobility)**.
- **Evolved high-level features correlate ~2× better** than atoms — but are *opaque to humans*
  ("computer semantics"), yet cheap to compute and **incrementally updatable during α-β**.
- **The learned decision tree beats humans:** a **9-leaf** tree beats the best human feature
  `Esaf`; a **3-leaf** tree already beats the hand-*tuned* evaluator (`σ_rel ≈ 0.95`).
- **Generalisation (the key practical finding):** features and trees mined on the **15-pebble**
  DB stay stable up to **35 pebbles**. So you can **mine a small DB and extrapolate** to
  positions far outside it.
- **Playing strength:** in a round-robin of four evaluators (material `EP`, mobility-tiebreak
  `ET`, mobility `EM`, data-mined `ED`), **`ED` won every match**, including vs `EM`.
  Overall ~15–20% noise reduction vs material-only.

His discussion adds a striking point: Awari has unusually high "randomness" / little strategic
clustering — which is *why* humans have no special edge and automatic learning competes with
them.

## 4. What this changes for oware-web

`index.html`'s current `evalState` (line ~630) is *exactly* a hand-weighted linear sum of the
human features van Rijswijck baselines: **material** (`×100`), **attack/vulnerability**
(capturable-next, `±8`), **hoarding** (max pile, `×3`), **mobility** (`×2`). So our engine sits
at the **"hand-tuned"** level — the one a 3-leaf learned tree already beats.

1. **The recipe is feasible at our scale.** Build the **N = 15** DB (REPORT-02), then mine it
   for either (a) a small decision tree (`μ, σ` leaves) or (b) tuned weights for the existing
   features. Generalisation from 15 pebbles means our truncated DB is *enough* to learn a
   midgame evaluator — we don't need the giant tablebase.
2. **Concrete upgrade path for `evalState`:** replace the hand-set weights with values fitted to
   the DB, or replace the whole linear sum with the `(μ_S + m)/σ_S` z-score lookup. Either is a
   measurable strength gain for free (the training labels are the DB we're already building).
3. **It closes the loop with REPORT-05.** R-05's empirical finding ("only methods using the
   endgame DB beat the grandmaster") + this paper's method = *use the small DB both to play the
   endgame perfectly and to teach the midgame heuristic.*

### Forward links
- The DB to mine → `REPORT-02`; store-independent encoding & color symmetry → `REPORT-06`/`-07`.
- The "DB is decisive for strength" evidence this operationalises → `REPORT-05`.
- The complementary "more features beat deeper search" result → `REPORT-09` (Ayo): together they
  say *spend effort on the evaluator, tuned against the DB, not on search depth.*
