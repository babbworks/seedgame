# Oware — Mathematical Architecture & Pure-Game Mathematics

**Repository:** `oware-web` (single-file `index.html`).
**Purpose of this document:** A precise account of (I) the mathematics actually realized in our program, (II) the broader pure mathematics of Oware as a game, and (III) the gaps, compromises, and divergences between the two. It is written as a **substrate for ingesting further research reports** on Oware: Part IV lists the open questions and citation hooks those reports should resolve or extend.

> Convention: "house" = one of the 12 playing cups; "store" = a player's capture pot; "seed" = a counter (pebble). Houses are indexed `0–5` (player 0, "you", bottom) and `6–11` (player 1, opponent/top). Code identifiers refer to functions/constants in `index.html`.

---

## Part I — The program's mathematical architecture

### 1. State representation
The entire game state is the tuple

```
state = { h:[12 ints], score:[2 ints], turn:0|1, ncp:int }
```

- `h[i]` = seeds in house `i`; `HOUSES = 12`, `SIDE = 6`.
- `score[p]` = seeds in player `p`'s store.
- `turn` = side to move; `ncp` = consecutive plies without a capture (the cycle guard).
- **Ownership** is positional: `belongs(i,p) ≡ (i < SIDE) === (p === 0)`. Houses `0–5` are player 0's; `6–11` are player 1's.

The invariant `Σ h[i] + score[0] + score[1] = 48` holds by construction (see §3).

### 2. Sowing as modular arithmetic
`simulate(s, house, rules)` lifts all seeds from `house` and sows them one per house, counterclockwise, **skipping the origin**:

```
i = house
while seeds > 0:
    i = (i + 1) mod 12
    if i == house: continue      # skip the emptied origin
    h[i] += 1; seeds -= 1
landing = i
```

Consequences encoded here:
- The reachable ring has **11 houses**, not 12 (the origin is skipped on every lap).
- For `s ≥ 12` seeds the sow **laps** and some houses receive ≥ 2 seeds (the "kroo"/granary; surfaced in the UI as the "fills twice" preview).
- `landing` (the final seed's house) is the sole trigger for captures.

### 3. Capture logic
From `landing`, walk **backward** along consecutive opponent houses, capturing each that holds a "capturable" count:

```
capturable(c) = (c == 2 || c == 3)         # rules.capture == '23' (default)
              | (c == 3 || c == 4)         # rules.capture == '34'
```

Walk stops at the first own house or first non-capturable count; at most `SIDE` houses chain. Captured seeds move to the mover's store (`score[p]`), which is the **only** sink — making total captured a monotonic quantity (the basis of termination, §5).

**Grand slam** (a move that would capture *all* the opponent's remaining seeds) is detected (`grandSlam = capTotal === sideSeeds(opp)`) and handled by a selectable rule:
- `nocap` (default): seeds are sown but nothing is captured.
- `forbid`: such moves are filtered from the legal set.
- `oppkeeps`: capture proceeds, then the opponent collects their side.
- `leavelast`: capture all but the furthest-back house of the chain.

### 4. Legality and the feeding obligation
`legalMoves(s, rules)` returns playable houses for the side to move, applying:
- A house must belong to the mover and be non-empty.
- `forbid` grand-slam moves are excluded.
- **Feeding obligation:** if the opponent's side is empty, only moves that deliver seeds across (leaving the opponent non-empty) are legal. If none exist, the position is terminal (§5).

### 5. Termination and cycle handling
`isOver(s, rules)` ends the game when any of:
1. **Target reached** (`endMode == 'firstto'` and either score ≥ `target`, default 25 — a majority of 48).
2. **Board empty** (`boardSeeds == 0`).
3. **Cycle limit** (`ncp ≥ cycleLimit`, default **100**): remaining seeds are collected to their owners (`collectSides`).
4. **No legal move**: remaining seeds collected.

`ncp` resets to 0 on any capture and increments otherwise (`applyMove`). Outcome is decided by final store comparison (win/loss/draw).

### 6. The opponent (search + evaluation)
`chooseMove(s, rules, diff)`:
- **Easy:** 20 % uniform-random legal move; otherwise greedy on a 1-ply `evalState`, random among ties.
- **Medium/Hard:** `negamax` (minimax + alpha-beta) to fixed depth **6 / 8**.

`evalState(s, rules, me)` (heuristic, from the mover's view):
```
v  = 100 * (score[me] - score[opp])              # material — dominant term
v += ±8 per house one seed short of capturable   # +attack on opp side, −vulnerability on own
v += 3 * (largest house on my side)              # hoarding / kroo incentive
v += 2 * (number of legal moves)                 # mobility
```
Terminal nodes return `±(100000 + depth)`, preferring faster wins.

**Variety (the "C + B" change).** To stop the deterministic engine from being a memorizable script:
- The root searches **every move with a full window** `(-∞, +∞)` so scores are directly comparable (root alpha-beta would otherwise return bounds).
- The chosen move is **random among moves within `margin` eval points of the best**.
- `margin` widens in the opening (`movesPlayed < 8`) and is larger on Medium than Hard:
  `hard → 30 (opening) / 0 (after); medium → 80 / 30`. Hard therefore tie-breaks only after the opening and stays near-optimal-by-heuristic.

### 7. The learning-unlock model (secondary)
Cumulative `totalMoves` drives a monotonic high-water `unlockedCount` against per-pace thresholds `t_i = round((i−1)·M/(N−1))` with `M ∈ {quick:20, extended:90}`, `N = 13`. Persisted in `localStorage`; mathematically a step function clamped to never decrease.

---

## Part II — The pure mathematics of Oware

This part is **independent of our implementation** — it is the mathematics of the game itself, against which Part III measures us.

### 1. Game-theoretic classification
Oware is **finite, deterministic, two-player, perfect-information, zero-sum, sequential, and partisan** (each player owns a fixed side). It is a **scoring/"economic" game** (the objective is to accumulate seeds), *not* a last-move ("normal/misère play") combinatorial game. Consequently the **Sprague–Grundy / Nim-value theory of impartial games does not apply**; analysis is by minimax value, not nimber.

### 2. Sowing & modular arithmetic
Sowing is iterated succession on a cyclic structure (`ℤ/12`) with the emptied origin excluded, giving an effective 11-house lap. The landing house is a function of `(origin, seed count)` under this skip-lap rule; capture eligibility is a predicate on the landing (and backward-chain) counts.

### 3. Conservation invariant
Total seed count is conserved at **48**; capturing is a one-way transfer from houses to a store. This invariant + the monotonicity of captured seeds underlies termination.

### 4. Capture as a number condition
The capture predicate (a house reaching exactly 2 or 3, standard Awari/Oware) is a small number-theoretic threshold; the **backward chain** generalizes it to a maximal run of consecutive capturable opponent houses. Variant rules shift the threshold (e.g. {3,4}) and change tactical structure.

### 5. State-space combinatorics
Distributing `n` identical seeds into `k` bins is **stars-and-bars**: `C(n+k−1, k−1)`. With `n = 48` seeds and `k = 14` bins (12 houses + 2 stores) the raw count is astronomical; the **legally reachable** state space is far smaller — about **8.9 × 10¹¹** positions (literature value).

### 6. Branching factor & game-tree complexity
The branching factor is ≤ 6 (one per non-empty own house). Lookahead of depth `d` faces ~`6ᵈ` lines; this modest fan-out is what makes both human planning and exhaustive solution feasible.

### 7. Termination theory
Captured-seed count is a **monovariant** (non-decreasing, bounded by 48). Positions can otherwise repeat indefinitely, so a **repetition/no-progress rule** is required for a guaranteed end; the standard resolution collects remaining seeds when play cycles without capture.

### 8. The solved game
Oware is **(strongly) solved**: by **retrograde analysis** with endgame databases (Romein & Bal, 2002–2003), the game-theoretic value of all reachable positions was computed; with perfect play the game is a **draw, 24–24**. Optimal play is therefore known everywhere — a benchmark our heuristic engine does not meet.

### 9. Computational complexity (generalized)
The fixed 2×6 game is finite and solvable. **Generalized mancala-type games** (unbounded board/seed parameters) host decision problems that are computationally hard (results in the `NP`/`PSPACE` landscape). Tractability here is a property of the small fixed instance, not the family.

### 10. Rule-variant space
The "pure math" is rule-relative. Axes that change the mathematics: capture threshold ({2,3} vs {3,4}), grand-slam handling, starvation/feeding resolution, target (majority 25 vs capture-all), and cycle/repetition rules. A faithful model must state which variant it solves.

---

## Part III — Gaps, compromises, and divergences in our implementation

Honest ledger of where the program departs from, or under-specifies relative to, Part II.

| # | Area | Compromise / gap | Impact |
|---|------|------------------|--------|
| 1 | Evaluation | `evalState` is a hand-tuned heuristic (material + four ad-hoc positional terms), **not** the solved-game value. | Medium/Hard are strong but **not perfect play**; weights are unvalidated. |
| 2 | Search depth | Fixed depth 6/8, no iterative deepening, quiescence, or transposition table. | Horizon effects possible near captures; no proof of move quality. |
| 3 | Cycle rule | `cycleLimit = 100` plies-without-capture is an **arbitrary cap**, not the canonical repetition rule. | Some games may end (and be scored) differently than under official rules. |
| 4 | Grand slam | Four variants implemented; default `nocap`. `leavelast`/`oppkeeps` correctness is **not formally verified** against an authoritative rules source. | Possible edge-case divergence from canonical play. |
| 5 | Capture variant | Hard-codes {2,3} (option {3,4}); other regional capture rules absent. | Models standard Awari/Oware only. |
| 6 | Randomization semantics | "Near-best" margin is in **heuristic eval units**, so "soundness" means *near-best by our heuristic*, not game-theoretic optimality. | Variety is sound only to the strength of the eval. |
| 7 | Openings | No opening **book**; openings are randomized among near-best heuristic moves. | Not backed by Oware opening theory. |
| 8 | Endgame | No endgame **database**; no perfect endgame play. | Suboptimal in solved-draw or won/lost endgames. |
| 9 | C-engine parity | The web engine is claimed to mirror the native C engine (`oware_engine.c`/`oware_ai.c`) but is **not cross-validated move-for-move** in this repo. | Parity is asserted, not proven. |
| 10 | Dead code | Mobility term multiplies by `(s.turn===me?1:1)` — a vestigial `×1`. | Cosmetic; no effect. |
| 11 | Cited constants | 8.9×10¹¹ reachable states, 889-billion figure, 24–24 draw are **from literature, not recomputed** here. | Must be sourced when ingesting research. |
| 12 | Demo board | Learning demos use a store-less mini board; captures render as houses emptying, not store transfer. | Pedagogical simplification. |
| 13 | Pacing thresholds | Extended last block unlocks at ~83 (rounding of `round(11·90/12)`), not exactly 90. | Negligible. |
| 14 | Hue theming | Board recolour uses CSS `hue-rotate` (luminance-preserving matrix), an approximation, not a perceptual palette remap. | Near-neutral seeds barely shift (intended); extreme hues may slightly alter perceived brightness. |
| 15 | Repetition detection | Uses a no-capture counter, **not** true position-repetition (e.g. threefold) detection. | Cannot detect short cycles that include captures. |

---

## Part IV — Open questions & hooks for ingesting research

When folding in external Oware research reports, target these:

1. **Canonical rules reconciliation.** Replace `cycleLimit` with the authoritative repetition/ending rule; validate the four grand-slam variants and the feeding/starvation resolution against a primary rules source.
2. **Solved-game integration.** Cross-check our outcomes and (ideally) endgame play against the **retrograde-analysis databases** (Romein & Bal). Recompute or cite the reachable-state count and the 24–24 draw value with provenance.
3. **Evaluation vs. truth.** Compare `evalState`'s rankings to solved values on sampled positions; quantify how often Hard's near-best pool contains a game-theoretically optimal move.
4. **Opening theory.** Source an Oware opening book to replace heuristic opening randomization; characterize the symmetric-start tree.
5. **Complexity literature.** Pin down the precise complexity results for generalized mancala/Oware variants and cite them.
6. **Variant taxonomy.** Catalogue regional rule variants (capture thresholds, grand slam, kroo handling, target conditions) and map which our engine supports.
7. **C/JS parity.** Establish a shared test vector set proving the web engine reproduces the native C engine move-for-move.

### Citation slots (to be filled from the incoming reports)
- Romein, J. W., & Bal, H. E. — *Solving Awari* (retrograde analysis / parallel solution), 2002–2003.
- Computational-complexity results for generalized mancala.
- Authoritative Oware/Awari rules (capture, grand slam, feeding, repetition).
- State-space and game-tree complexity surveys (e.g. Allis-style game classifications).

---

*This document reflects the code as of the 2026-06-28 build (carved-board UI, move preview, focus mode, AI opening/near-best randomization, learning component, hue selector). Update Part III as the engine evolves; treat Part II as fixed mathematics and Part IV as the research backlog.*
