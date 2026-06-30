# Report: Lincke's Awari Endgame Engineering (and the Rules That Differ from Ours)

A close reading of **Thomas Lincke (2002),** *Exploring the Computational Limits of Large
Exhaustive Search Problems* (`papers/Lincke-2002-Computational-Limits-Exhaustive-Search.pdf`,
ETH Zürich PhD thesis, 118 pp).

Lincke built **Marvin**, the Awari world-champion program of its era, and this thesis is the
single most directly relevant gated item we recovered. Three things it gives `oware-web`:
(1) authoritative confirmation of two design decisions in `REPORT-02`, (2) a memory-scaling
hierarchy of retrograde-analysis algorithms, and (3) — most importantly — the **canonical
Awari rules**, which reveal that our engine's endgame/cycle conventions *differ from the
academic game*. That last point changes how we should read every "Awari is a draw" claim.

The thesis has three contributions (its abstract): an **improved retrograde-analysis
algorithm** (dual-indexing) that improves Awari endgame-DB caching "by several orders of
magnitude"; an **improved opening-book expansion** strategy; and an **improved
position-value representation** (at-least-draw / at-most-draw / cycle-draw). We care most
about the first and third.

---

## 1. Retrograde analysis for Awari (Chapter 2)

### 1.1 Confirms REPORT-02's store-independent encoding
Lincke stores, per **configuration** (the distribution of stones in the 12 pits, *ignoring
stones already captured*), a **stone-difference value**: the number of stones the player to
move will capture minus the number the opponent will capture, in the range `−N … N` for an
`N`-stone configuration.

> This is exactly `REPORT-02` §2.1's "store-independent value." Our `V` (= stones the mover
> ultimately captures, `0 … S`) and Lincke's stone-difference `d` are the **same quantity in
> different coordinates**: `d = 2V − S`. He gives the efficiency argument we asserted: a
> stone-difference needs `⌈log₂(2N+1)⌉ ≤ 7` bits, whereas storing win/loss/draw *per score
> split* would need `(48−N+1)·2` bits — generally larger. Independent confirmation that
> collapsing the `score` dimension is the right first move.

He uses 8 bits (one byte) per configuration "to simplify index calculations" — the same
one-byte-per-entry budget `REPORT-02` §2.2 assumed.

### 1.2 The numbers, and the symmetry that halves the database
- Total configurations with ≤ 48 stones ≈ **1.4 × 10¹²**; excluding unreachable ones (you
  always capture ≥ 2 stones, so 47-stone configs can't occur; configs with every opponent
  pit occupied are unreachable except the start) gives ≈ **889,063,398,406** reachable
  states — the familiar Romein-Bal figure.
- **No board-mirror symmetry:** "we cannot mirror the board by a vertical or horizontal
  axis, because the pits form a directed cycle" (sowing has a direction).
- **But there is a color symmetry:** "for every configuration with South-to-move there is an
  equivalent configuration with the same value and North-to-move. Thus it is sufficient to
  calculate the configuration values for South-to-move and to rotate the board 180° whenever
  it is North's move."

> **For oware-web:** this is the authoritative statement of the optimization flagged in
> `REPORT-04` §2.2. It is **not** a left-right mirror (that's invalid in Oware) — it is the
> *turn/color* symmetry realised as a 180° rotation. Canonicalise every `(h, turn)` to its
> South-to-move representative before ranking and the database **halves** for free. Fold into
> `REPORT-02` §3.

### 1.3 A memory hierarchy of algorithms (mostly overkill for us, but instructive)
Lincke's core engineering problem is that full Awari databases (10–48 GB) dwarf main memory,
and Awari's indexing function has *poor locality* (the 180° rotation between moves scatters
successor indices), so naive caching is "two or three orders of magnitude" too slow. His
escalating answers:

| Memory available | Algorithm | Bits/config |
|---|---|---|
| DB fits in RAM | one-byte | 8 |
| ≥ ¼ of DB | **WLD(k) decomposition** — split one `−N…N` DB into `N` win/loss/draw DBs at threshold `k` | 2 |
| ≥ ⅛ of DB | **1-bit-in-memory** — 2 bits on disk + 1 bit in memory, sequential disk access | 3 total |
| ≥ 1/80 of DB | **dual-indexing** — index memory values for North-to-move, disk values for South, so no rotation between moves → locality restored, cache misses cut 1000× | — |

> **For oware-web:** our truncated **N = 15 database is ~17 M configurations (~17–35 MB)** —
> it fits in RAM with room to spare. So we use the **simplest one-byte algorithm**; Lincke's
> WLD/1-bit/dual-indexing machinery exists for the 10–47 GB regime we deliberately avoid
> (`REPORT-05`'s "can't fit on a handset" constraint). The takeaway isn't to implement his
> tricks — it's that *our scale makes them unnecessary*, which is the whole point of
> truncation. The one idea worth keeping in reserve: if we ever push N higher and the asset
> stops fitting in a browser's memory, **dual-indexing** (decouple the memory- and disk-side
> index to kill the rotation-induced cache misses) is the lever.

---

## 2. Position-value representation: at-least-draw, at-most-draw, cycle-draw (Chapter 4)

This chapter is about **opening books and mixed heuristic/exact search**, not the endgame
database — so it's a *future* concern for us (the opening-book layer of the Lithidion stack),
but it contains the most sophisticated treatment of Oware's draw structure in the collection.

The core problem: a proven **draw** and a **heuristic value** are *incomparable* — you can't
say a draw is better or worse than "+0.4" without knowing the match context (do you need a
win, or is a draw enough?). So game values form a **partially ordered set**, not a line.
Lincke's value types progressively recover information that a naive "treat draw as 0" throws
away:

- **at-least-draw `≥|h`** — the side to move can force a draw but *also* has the option of a
  position with heuristic `h`. ("draw exclusive-or h.")
- **at-most-draw `≤|h`** — the *opponent* can force the draw, with an option `h`.
- **cycle-draw `0|+h₁|−h₂`** — a *repetition* draw, annotated with the smallest penalty each
  side pays to *leave* the cycle (`+h₁` for the opponent, `−h₂` for the mover). It
  **generalises** the other two (`0|+|−h ≡ ≥|−h`, `0|+h|− ≡ ≤|+h`, `0|+|− ≡ draw`).

`★ Insight ─────────────────────────────────────`
The cycle-draw value is the rigorous version of the hand-wave in `REPORT-02` §6: "what is a
no-capture cycle worth?" Lincke's answer for *opening books* is to not collapse it to 0 but
to carry *how close it is to a real draw* — the cheapest cycle-leaving move on each side.
For our **endgame database** we don't need this (the DB stores exact values, and our cycle
convention is fixed by the engine), but if `oware-web` ever grows an opening book, this is
the proven way to represent Oware's repetition draws without losing information.
`─────────────────────────────────────────────────`

His **cycle-handling table (4.4)** lists Awari as cyclic, cycle value = **draw**, with
cycle-breaking moves = **captures** — and crucially notes the *board division* rule, which
brings us to the headline finding.

---

## 3. ⚠ The rules finding: academic Awari ≠ `index.html` Awari (Appendix A)

Lincke's Appendix A states the **canonical Computer-Olympiad Awari rules**. Two endgame
clauses differ from our engine:

| Situation | Lincke / academic Awari | `index.html` (`collectSides`, lines 607–620) |
|---|---|---|
| **Player has no move** | "the opponent captures **all** the remaining stones" | each player keeps the stones on their **own** row |
| **Position repeats** | "the remaining stones are **divided between** the players (incl. an odd stone)" → board value **0** | each player keeps their **own** row |

van der Goot (`REPORT-07`) agrees with Lincke: on repetition "the remaining stones [are]
split between the players, thus the configuration has value 0."

> **Why this matters for oware-web — read carefully:**
> 1. `REPORT-02` §6 locked `terminalValue = sideSeeds(h, turn)` (own-side) because that is
>    what `index.html` does. That remains **correct for matching our engine**.
> 2. **But the literature's "Awari is a draw" is proven under the academic rules above**, not
>    our engine's. A database built to match `index.html` will therefore **not necessarily
>    reproduce the solved-game value** in repetition/no-move lines — our §7 "the start
>    position evaluates to a draw" validation check is only valid if `index.html`'s rules
>    coincide with the academic ones for the reachable game, which on these two clauses they
>    do **not**.
> 3. **Decision to surface to the user:** either (a) accept that `oware-web` plays a *slightly
>    different game* than solved Awari (fine for a teaching app — just don't claim "perfect
>    solved-Awari play"), or (b) change `index.html`'s `isOver`/`collectSides` to the academic
>    convention (opponent-takes-all on no-move; split on repetition) so the DB *and* the
>    headline draw result both apply. This is a genuine product choice, not a bug.

`★ Insight ─────────────────────────────────────`
This is the kind of discrepancy that only surfaces by reading the *primary* rules statement,
not a summary. The capture and sowing rules are identical across every source we have; the
divergence is entirely in the **terminal/repetition division** — which is precisely the one
place `REPORT-02` §6 identified as a *modelling choice*. The literature made one choice; our
engine made another. Both are "Oware"; they are not the *same* Oware.
`─────────────────────────────────────────────────`

---

## 4. Synthesis — what Lincke changes about our plan

1. **Confirms two REPORT-02 decisions authoritatively:** store-independent stone-difference
   encoding (§2.1) and the one-byte budget; and the **180° color symmetry** halving
   (REPORT-04 §2.2 → fold into REPORT-02 §3).
2. **Validates our truncation by contrast:** his entire algorithmic arsenal (WLD, 1-bit,
   dual-indexing) exists to fight a memory wall we sidestep by capping at N = 15. Keep
   **dual-indexing** noted as the escape hatch if we ever raise N.
3. **Raises a real rules question (§3):** decide whether `oware-web` should match the *engine*
   (own-side division — current) or *solved Awari* (split/opponent-takes-all). This determines
   whether REPORT-02 §7's "draws to a draw" check is even meaningful.
4. **Stocks the opening-book shelf (Chapter 4):** if we ever add the book layer, `cycle-draw`
   is the value representation to use for Oware's repetition draws.

### Forward links
- Store-independent encoding, symmetry, build algorithm → `REPORT-02` §2–§4.
- The cycle/terminal convention divergence → `REPORT-02` §6 (this *sharpens* §6.2's caveat).
- The forward-move retrograde algorithm Lincke's contemporary rival used → `REPORT-07`
  (van der Goot), which is the implementation `REPORT-02` should actually follow.
