# Owaré — Game Evolution Notes

A running backlog of ideas for where the game/app could go beyond the current
work. Captured from brainstorming; not yet specced. Items marked **[touches: …]**
connect to a feature currently being designed, so keep them in mind when shaping
that feature even if they aren't built yet.

> Current in-flight work: the **right-side resource rail** (Lesson-of-the-turn
> card + Papers / Reports / Overview / Bibliography overlays). See
> `docs/superpowers/specs/` for its spec.

---

## Learning & lessons

- **Saving / collecting terms and blocks** — let the user bookmark or "collect"
  Lesson cards (and individual terms/definitions) into a personal set they can
  revisit. **[touches: Lesson-of-the-turn card]** — needs the profiles/IndexedDB
  layer below to persist per user; design the Lesson card so a future save action
  fits without rework.
- **Context-triggered lessons** — let the *kind of move just played* surface a
  special lesson, instead of (or alongside) plain sequential rotation. Example
  sketch (approximate): sowing a large house that laps the board (multi-pass)
  could surface a block about recursive / multi-pass algorithms. **[touches:
  Lesson-of-the-turn card]** — v1 rotates sequentially through unlocked blocks;
  this is a later rotation strategy keyed off move characteristics.
- **Gain-points economy for learning** — let the player spend captured-seed
  "Gain" points to buy or unlock learning options / lesson sets. Couples
  progression to play in a second way beyond move-count unlocks.

## Profiles & multi-user (infrastructure)

- **Multiple profiles in IndexedDB** for single-device, multi-user learning
  modes. A simple **player registration**: unique usernames pushed into a list,
  each becoming the ID used to launch any dedicated learning mode. Foundation for
  per-user saved lessons, stats, and the relationship state below.

## Social / relationship state

- **Per-pairing debt/gain ledger** — for any two specific players, maintain an
  ongoing running debt/gain count across all their games (the relationship's
  cumulative balance). Flagged by the user as an important feature.

## Representation modes (how seed counts / numbers are shown)

- **Alternate numeral systems** for the count shown in a cup: Arabic (current),
  Binary (e.g. `0000 0010`), Hex, Tally, Roman.
- **Groups-of-four Unicode glyphs** — represent seeds using partially-divided
  circle characters: e.g. "circle divided by horizontal bar and top half divided
  by vertical bar" for 3, "circled vertical bar" for 2, "circle with plus sign"
  for 4 — so groups of four read as a single glyph, with remainders shown by the
  partially-divided circles, a single whole circle, or a dot. A base-4 / quartal
  tally view native to mancala counting.
- **Formula mode on the board** — use the houses/cups themselves to display
  formulas related to the game's mathematics (math formula overlays positioned on
  the board). Turns the board into a live diagram of the underlying math.

## Board theming / atmosphere

- **Swappable backgrounds** from a pre-loaded set — e.g. street scenes from
  places where Oware is popular (Ghana, the Caribbean). Extends the existing
  board-hue picker into full scene/atmosphere theming.

## Rules & options (full optionality)

> **Guiding rule (user, strong):** *anywhere we observe rule variation — or anywhere
> there's a sensible choice in how to resolve a situation — expose it as a user option in
> the rules menu rather than hard-coding one answer.* Build toward full optionality:
> toggles/buttons for discrete variants, sliding scales for continuous behaviour.

- **Terminal & repetition resolution (highest priority — research-confirmed variation).**
  `REPORT-06` §3 (Lincke) and `REPORT-07` (van der Goot) document that **academic Awari
  resolves the endgame differently from our current engine**:
  - *No legal move:* academic = **opponent captures all** remaining seeds; `index.html` =
    **each player keeps their own row** (`collectSides`).
  - *Repetition/cycle:* academic = **seeds split** between players (board value 0);
    `index.html` = **each keeps own row**.
  Expose both as selectable conventions in the rules menu (e.g. *No-move → [Own row | Opponent
  takes all]*, *Repetition → [Own row | Split evenly | Last mover takes all]*). **[touches:
  rules menu, REPORT-02 endgame database]** — each convention is a *different game*, so the
  endgame DB must be built per-convention (one DB per ruleset; see `REPORT-02` §6.3). Picking
  the academic convention is also what makes the literature's "Awari is a draw" apply.
- **Existing engine flags to surface as buttons.** `readRules()` already carries variants that
  aren't all exposed in the UI yet: capture rule **2-3 vs 3-4** (`capturable`), **grand-slam**
  handling (`nocap` / `forbid` / `oppkeeps` / `leavelast`), end mode **first-to-25 vs
  all-capture** (`target` 25 vs 49). Promote each to a labelled control.
- **Sliding scales (continuous options).** Candidates: **cycle limit** (`cycleLimit`, plies
  before a repetition is force-resolved); **AI search depth / strength**; **AI randomness or
  "blunder rate"** (how often the computer plays a sub-optimal move, for teaching/handicap);
  later, a single **difficulty** slider that bundles depth + endgame-DB on/off + blunder rate.
  **[touches: REPORT-05 / REPORT-08]** — strength vs. endgame-DB use is exactly what the ML
  reports analyse; the slider is the user-facing version of "with/without database."
- **One DB per ruleset.** Because capture rule + grand-slam + terminal convention all change
  the game, any shipped endgame database is keyed to a specific combination. The rules menu
  and the DB builder must agree on the active ruleset (see `REPORT-02` §6.3).

## Metrics & ratings (combinatorial "distance travelled")

- **Game-complexity / combinatorics rating** — surface a single (or small multi-) number that
  shows the user *how far into the space of combinations and complexity* their current game has
  travelled — an alternative lens on "length" that isn't just move-count or turns. Derived from
  the combinatorics research; **scan the report docs to fix the exact formula before building.**
  Source material already in hand:
  - `REPORT-03` (Broline-Loeb) — per-layer configuration counts (`C(s+11, 11)` ways to place
    `s` seeds in 12 pits) and cumulative `C(N+12, 12)`; plus the `n²/π` occupancy mathematics.
    A natural basis for "states reachable at the current seed count / how rare this position is."
  - `REPORT-01` (Games Solved) — the headline complexity figures: Awari state-space ≈ **10¹²**,
    game-tree ≈ **10³²**. Good for normalising a 0–100 "complexity travelled" scale.
  - `REPORT-04` (Heule-Rothkrantz) — *solution size* / *decision complexity* framing, if we want
    the rating to express "how hard *this* position is" rather than raw count.
  Sketch (approximate, to be confirmed against the reports): as seeds leave the board the live
  layer size `C(boardSeeds+11,11)` *shrinks* — so a rating could read the *convergence* of the
  game (how far down the layer ladder we've descended) and/or the cumulative branching seen so
  far. **[touches: REPORT-01, REPORT-03, REPORT-04; Representation modes — Formula mode on the
  board]** — pairs naturally with the on-board formula overlay and the resource rail.

## Side games

- **Quick-glance row-sum guessing** — a side game: show a row, hide it after N
  seconds, player guesses the row's seed total; includes a randomize button to
  generate fresh rows. Trains subitizing / fast estimation. Candidate as a future
  "education tool" entry on the resource rail.
