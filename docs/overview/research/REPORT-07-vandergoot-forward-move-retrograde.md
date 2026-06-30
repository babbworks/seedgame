# Report: van der Goot's Forward-Move Retrograde Algorithm — Our Builder, Validated

A close reading of **Roel van der Goot (2000/2001),** *Awari Retrograde Analysis*
(in `papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf`, pp. 87–95, CG 2000,
University of Alberta).

This is the most **implementation-relevant** paper in the whole collection. Its central
algorithm is, essentially, the algorithm `REPORT-02` §4 specified — independently derived,
with clean pseudocode and a crucial practical argument we should adopt wholesale: **compute
the database with *forward* moves, not reverse moves.** For `oware-web` that means we can
reuse `index.html`'s existing `applyMove`/`simulate` directly instead of writing an
error-prone reverse-move generator.

---

## 1. The setup (same game, same convergence)

van der Goot frames Oware exactly as `REPORT-01` did: board games split into *piece-adding*
(Go, Hex, Othello — endgames too vast to enumerate) and *piece-removing* (Chess, Checkers,
**Awari** — few positions near the end, enumerable into a database). Awari stones only leave
the board, so you solve by stone count and store **stone-difference values** (`−n … +n`),
"excluding the mancalas from the positions" — i.e. the same **store-independent encoding** as
`REPORT-02` §2.1 and Lincke (`REPORT-06` §1.1).

His rules statement matches Lincke's (and so carries the same *academic* endgame conventions
flagged in `REPORT-06` §3: no-move → opponent takes all; **repetition → split, board value 0**).

---

## 2. The headline: retrograde analysis with *forward* moves (Section 4.2)

Traditional retrograde analysis (Ströhlein → Allis) propagates *fixed* values backwards using
**reverse moves**. van der Goot's alternative propagates **evolving** values using **forward
moves** and a fixed-point iteration. Three phases:

1. **Capture database** — for every configuration, look only at *capture* moves (which jump to
   already-solved smaller databases) and record the best value reachable. This is a *lower
   bound* / seed for the configuration's value.
2. **Initialise** every configuration's endgame value to **0**.
3. **Iterate** — repeatedly sweep all configurations; for each, take the max of its
   capture-DB value and, over every *non-capture* move, `−value(child)` (negamax in
   stone-difference coordinates). Repeat until a full sweep changes nothing (convergence).

His Figure 3 pseudocode, lightly paraphrased:

```
create_capture_db(n):                 # phase 1: capture edges → smaller solved DBs
  for each position with n pebbles:
    v = -INFINITY
    for each capture move: do; v = max(v, -endgame_value(child)); undo
    capture_db[position] = v

create_endgame_db(n):
  create_capture_db(n)
  for each position with n pebbles: endgame_db[position] = 0   # phase 2
  repeat:                                                      # phase 3: fixed point
    changed = false
    for each position with n pebbles:
      v = capture_db[position]
      for each non-capture move: do; v = max(v, -endgame_value(child)); undo
      if v != endgame_db[position]: endgame_db[position] = v; changed = true
  until not changed
```

`★ Insight ─────────────────────────────────────`
This is `REPORT-02` §4 with the signs flipped into stone-difference coordinates. Our spec's
`V(h,turn) = S − min_m V(child)` and his `value = max_m(−value(child))` are the **same
recurrence** under `d = 2V − S`. The two structural features `REPORT-02` called out are both
here: **capture moves cross into a smaller, already-solved layer** (his phase 1), and
**non-capture moves stay in-layer and need a fixed-point iteration** (his phase 3). Seeing an
independent, *published, world-class* implementation match our derived algorithm is the
strongest possible validation that the spec is correct before we write a line of it.
`─────────────────────────────────────────────────`

### 2.1 Why forward moves — the argument we should adopt
van der Goot lists the advantages of forward over reverse moves:

- **Correctness & simplicity:** "Awari's reverse moves are unnatural and contain many
  exceptions, and are a source for programming errors." Forward moves are natural.
- **Speed:** forward moves are easier to optimise, so faster to execute than reverse moves.
- **Less memory:** a position needn't store its state or a "children remaining" counter
  (which the reverse-move algorithm needs), so larger databases fit.
- **No need to hold smaller DBs in memory** during the non-capture iteration (only the capture
  pre-pass touches them).

> **For oware-web — the decisive practical point:** `index.html` already has a correct,
> tested **forward** move generator (`simulate`/`applyMove`, lines 540–605). van der Goot's
> algorithm uses *exactly that* — `do_move`/`undo_move` — so our offline builder can call the
> engine's own move code and **never needs a reverse-move generator**. This removes the single
> most bug-prone piece `REPORT-02` §5 worried about. Adopt this structure verbatim.

### 2.2 The capture-database pre-pass is worth adding to REPORT-02
`REPORT-02` §4 folded captures into the main loop. van der Goot separates them into a **phase-1
capture database** computed once, which (a) seeds the fixed point with good lower bounds so it
converges in fewer iterations, and (b) means the smaller solved databases are touched only
once (during phase 1), not on every sweep. Both are real wins.

> **Action for REPORT-02:** add an explicit phase-1 capture-DB pass before the in-layer
> iteration. It's a small change that cuts iterations and avoids repeated random access to the
> smaller layers.

---

## 3. How long does the fixed point take? (Section 4.4, Table 1)

His Table 1 reports, per pebble count, the number of iterations to stabilise — which "is an
indication of how many moves it takes before a capture occurs." Representative values:

| Pebbles | Configurations | Iterations to stabilise |
|---|---|---|
| 10 | 352,716 | 37 |
| 15 | 7,726,160 | 45 |
| 17 | 21,474,180 | 46 |
| 25 | 600,805,296 | 63 |
| 35 | 13,340,783,196 | 71 |

> **For oware-web:** convergence is **fast and bounded** — even huge layers stabilise in
> ~40–70 sweeps. For our **N = 15** truncation, the largest layer is ~7.7 M configs needing
> ~45 iterations: a few hundred million move evaluations total, trivially a few seconds to
> minutes in Node. This confirms `REPORT-02`'s offline build is *cheap* at our scale.

The parallel version solved all configurations up to **35 pebbles** on a 16 GB shared-memory,
64-processor machine — the largest that fit without swapping. (We need none of this: N = 15 is
four orders of magnitude smaller.)

---

## 4. Endgame statistics and the draw conjecture (Section 5)

- **Odd/even effect:** game-value frequencies oscillate by parity, because (i) a capture
  usually removes *two* stones, and (ii) "optimal play only results in repeating positions in
  the endgame."
- **Initial-position estimate:** the raw mean over a database is positive (+1.83 for 35
  pebbles, suggesting the mover's edge), but restricting to **symmetric, near-initial
  positions with no immediate capture** gives a mean of **−0.43** (34-pebble DB) — a *small
  North edge that shrinks as the database grows*, leading van der Goot to predict the initial
  position "is a draw. This is according to me the most likely scenario." Romein & Bal
  confirmed this two years later.

> **For oware-web:** the odd/even and "repetitions only in the endgame" observations are a
> useful *sanity check* for our DB — and a nice teaching visualisation (a histogram of
> endgame values showing the parity comb). The shrinking-edge-toward-draw argument is also a
> clean lesson for the learning component on *how* one infers a game's value before fully
> solving it.

van der Goot wrote this while **racing Lincke** (`REPORT-06`) to solve Awari, and mused about a
one-bit algorithm to reach a 44-pebble database — the contest that, via Romein & Bal's parallel
solve, ended in the 2002 result.

---

## 5. Synthesis — what van der Goot changes about our plan

1. **It is the reference implementation for REPORT-02 §4.** Independently published, it
   matches our derived recurrence exactly — adopt its three-phase structure as-is.
2. **Build with forward moves → reuse the engine's `simulate`/`applyMove`.** No reverse-move
   generator. This is the biggest de-risking of the whole builder.
3. **Add the phase-1 capture database** to REPORT-02 §4 (faster convergence; smaller layers
   touched once).
4. **Convergence is cheap at our scale** (≤ ~45 sweeps over ≤ 7.7 M configs for N = 15) —
   reaffirms the offline build is a minutes-not-hours job.
5. **Free validation assets:** the odd/even parity comb and the shrinking-edge-to-draw curve
   double as correctness checks and learning-component visualisations.

### Forward links
- The algorithm it implements → `REPORT-02` §4 (now to be revised: add the capture-DB phase,
  switch language to forward `applyMove`).
- Store-independent stone-difference encoding & the academic rules → `REPORT-06` (Lincke),
  including the §3 rules-divergence warning that applies equally here.
- The competitive context (the race to solve Awari) → `BIBLIOGRAPHY.md` Romein & Bal entries
  (still gated).
