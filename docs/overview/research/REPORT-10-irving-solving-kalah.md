# Report: How Rule Changes Flip a Game's Value (Irving et al., 2000 — "Solving Kalah")

A close reading of **Irving, Donkers & Uiterwijk (2000),** *Solving Kalah*
(`papers/Irving-Donkers-Uiterwijk-2000-Solving-Kalah.pdf`, ICGA Journal 23(3):139–147).

Kalah is a Mancala cousin of Oware. This paper solves it (strongly for small instances via
full-game databases, weakly up to **Kalah(6,5)** via search) and — more valuable to us than the
result itself — is the collection's clearest demonstration of two things `oware-web` cares about:
(1) **how a few rule changes completely change a game's character and value** (Kalah is a
first-player **win**; Awari is a **draw**), the evidence base for our rules-optionality backlog;
and (2) a **third independent confirmation** of REPORT-02's core engineering choices.

---

## 1. Kalah vs Oware: the rules that differ (and what they do)

Kalah: two rows of six holes + **two stores** ("kalahah"). The rule deltas from Awari:

| Rule | Awari / Oware | Kalah | Effect |
|---|---|---|---|
| **Capture** | last seed in *opponent* pit holding 2–3 | last seed in an **empty hole on your own side** → take the opposite pit | different capture group ("African" vs "SE-Asian") |
| **Extra turn** | none | last seed in **your own store** → move again | adds tempo, shortens games |
| **Feeding obligation** | must leave opponent a move | none — you may take all the opponent's seeds | simpler endgame |
| **Cycles** | repetitions possible | **no repetition — game graph is acyclic** | far simpler to solve |

The consequences are dramatic and quantified:

- **Game value flips:** most Kalah instances are **first-player wins** (e.g. Kalah(6,4) = +10,
  Kalah(6,5) = +12), whereas Awari is a **draw**.
- **Complexity drops:** Kalah(6,4) has the *same* state-space as Awari (~10¹²) but a **far lower
  game-tree complexity** (~6×10¹⁸ vs Awari's ~10³⁵), because games are shorter (length ~30 vs
  ~60) and there's no feeding obligation. Kalah(6,4) ≈ Connect-Four; Kalah(6,6) ≈ Checkers.

`★ Insight ─────────────────────────────────────`
This is the empirical heart of your **rules-optionality** feature (`game-evolution-notes.md`).
Three small rule toggles — *capture-into-own-empty*, *extra-turn-on-store*, *no-feeding* — turn a
drawn, cyclic, hard-to-solve game (Oware) into a first-player-win, acyclic, much-easier game
(Kalah). It is the textbook proof that **each rule the menu exposes defines a genuinely different
game with a different value** — so a per-ruleset endgame DB (REPORT-02 §6.3) isn't pedantry, it's
necessary. The authors say it plainly: "a small change in the rules can render the process of
solving a game very difficult."
`─────────────────────────────────────────────────`

## 2. Third independent confirmation of REPORT-02's design

Kalah's endgame DB is built "analogous to the way … for Awari," and the paper independently
restates three of our spec's decisions:

1. **Store-independent ("active counters") encoding.** "Captured counters do not re-enter the
   game … the value of a position can be derived from the configuration of active counters only."
   Identical to `REPORT-02` §2.1 and the stone-difference encoding of `REPORT-06`/`-07`. They note
   "the game of Awari has this second property too."
2. **Forward-move retrograde, not reverse moves.** "The values of the positions were *not*
   calculated by performing reverse moves, but by performing a forward minimax search for every
   position. It is costly in mancala games to compute reverse moves." → **the same conclusion as
   van der Goot (`REPORT-07`)**, now from a second team. Strongly reaffirms that our builder should
   reuse `index.html`'s forward `applyMove`.
3. **Color symmetry + tight packing.** Positions are "indexed without regard to North and South by
   differentiating between the player to move and the waiting player" (our 180° color symmetry),
   and stored in just **4 bits/entry** (score of player to move; a lower bound if needed) loaded
   into RAM. Their indexing deliberately *includes* unreachable positions so that "no look-up is
   required to determine whether a position is in the database" — a tradeoff `REPORT-02` §3 also
   chose (we don't exclude unreachable configs, to keep `rank`/`unrank` simple).

Their exact size formula for `m` holes, `n` active counters:
`Size(m,n) = C(n+2m, 2m) − 2·C(n+m, m) + 1 = O(n^{2m})` — the Kalah analogue of our
stars-and-bars layer count.

## 3. Search machinery (optional upgrades for our α-β)

For the larger instances they use a strong search stack worth noting if `oware-web` ever wants
stronger *above-the-DB* play than `index.html`'s plain negamax:

- **MTD(f)** with iterative deepening (zero-window search).
- **Move ordering**: transposition-table hint → extra-turns → captures → right-to-left default.
- **Transposition tables** storing only **active counters** (store-independent again), with full
  collision checking; a **Jenkins hash** rather than Zobrist (incremental Zobrist loses its
  advantage because sowing changes the whole board).
- **Futility pruning** — and notably it is "**completely safe**" in mancala (a hard score bound is
  computable from seeds in play), unlike in chess.
- **Enhanced transposition cut-off** — cut tree size up to **8×** and runtime ~**3×** on
  Kalah(6,4).
- The **history heuristic did *not* help** — "probably due to the simplicity of Kalah compared to
  chess."

> **For oware-web:** if we ever push AI strength, *futility pruning* (safe here) and *enhanced
> transposition cut-off* are the cheap, high-yield additions; MTD(f) is a bigger rewrite of
> `negamax`. But per `REPORT-08`/`REPORT-09`, better **features** likely beat all of these for
> effort spent.

## 4. What this changes for oware-web

1. **It is the evidence base for the rules-optionality backlog.** Kalah quantifies how
   capture-rule / extra-turn / feeding / cycle toggles change *value, length, and solvability*.
   If we offer a "variant zoo" (Oware, Kalah, Dakon…), expect each to play and solve very
   differently — and the endgame DB must be rebuilt per variant.
2. **Cycles are Oware's special burden.** Kalah's acyclic graph solves with a single backward
   pass; Oware's repetitions are exactly why `REPORT-02` §4 needs a *fixed-point* iteration and why
   §6 has a cycle convention at all. A Kalah-like (no-feeding, capture-own-empty) variant would
   make our builder *simpler*.
3. **Third confirmation of the build plan:** active-counter encoding, forward-move retrograde,
   player-to-move symmetry, ultra-compact entries — all independently restated. Our spec is on
   very solid ground.
4. **Search upgrades on the shelf:** futility pruning (safe) and enhanced transposition cut-off,
   if/when we want stronger non-DB play.

### Forward links
- Forward-move retrograde & active-counter encoding → `REPORT-02` §2–§4, `REPORT-07` (van der Goot).
- The cycle handling that Kalah avoids and Oware needs → `REPORT-02` §6, `REPORT-06` §3.
- Rule variations change the game → `docs/game-evolution-notes.md` (rules-menu optionality).
- "Invest in features over search" caveat on §3's machinery → `REPORT-08`, `REPORT-09`.
