# Awaré — Learning Component Design

**Date:** 2026-06-28
**Status:** Approved design, pending spec review → implementation plan
**Scope:** A learning/educational feature for the Awaré (Oware) browser game (`index.html`), teaching the **pure mathematics of Oware**. The AI/computation track (negamax, search, evaluation) is explicitly deferred to a future second track.

---

## 1. Goals & constraints

- Teach the pure-game mathematics of Oware (game theory, combinatorics, modular arithmetic of sowing, invariants, termination, solved-game results, complexity).
- **Layered content:** each block opens with a plain-language **hook** anyone can enjoy, plus an optional **"go deeper"** expansion with real notation/formulas/derivation.
- **Progressive unlock by play:** blocks unlock as the player accumulates moves. Cumulative across all games, persisted, with a reset.
- **Two pacings:** Quick (~20 moves) and Extended (~90 moves), selectable; **default Extended**.
- **Not visually dominant:** the default game view changes only by a small badged icon. No popups over the board.
- **Single-file:** preserve the project's defining property — one self-contained `index.html`, offline, no dependencies, runs from `file://` and GitHub Pages.

### Decisions captured (from brainstorming)

| Question | Decision |
|---|---|
| Content depth | Layered (hook + "go deeper") |
| Progress model | Cumulative & persistent, **resettable** |
| New-block surfacing | **Subtle badge only** on the learning icon |
| Pacing | Both Quick & Extended selectable; **default Extended**; switching re-thresholds against current move total |
| Full-screen demo board | **Guided demos per block** (animation where it applies; static/diagram for conceptual blocks) |
| Full-screen gating | **Tease hooks, earn depth** — hooks always readable; demo + "go deeper" unlock through play |
| Demo implementation | **Engine-driven demos + static fallback** (reuse verified `simulate`/`sowPath` + sowing animation) |
| Surfaces | Two: a quick **overlay** (peek) and a **full-screen learning mode** |
| File structure | Stay **single-file**, learning feature as a delimited module |

---

## 2. Content map (the 12 blocks)

Ordered foundational → advanced; this order is the unlock sequence. Each entry: **hook** (final-ish copy) · **go deeper** (outline of the formal content) · **demo** (board behaviour).

**Optional Block 0 — "The oldest arithmetic"** · hook: Oware is one of humanity's oldest games; sowing and capturing *are* counting — arithmetic you play with your hands. · go deeper: mancala family, ethnomathematics, sowing as proto-computation. · demo: static board, gentle ambient sow. *(Include? — yes by default; non-technical opener.)*

**Mechanics & arithmetic**
1. **The board is a ring** · hook: Play moves counterclockwise around the 12 houses — it's a cycle, not a line. · go deeper: the cyclic structure ℤ/12; orientation. · demo: animate one seed traveling the full ring.
2. **Sowing is clock arithmetic** · hook: You drop seeds into the next houses like counting on a clock that skips the cup you emptied. · go deeper: landing house as a function of origin + seeds on the 11-reachable-house ring; the skip-origin rule. · demo: sow a 5-seed house, highlight the landing cup.
3. **Forty-eight seeds, always** · hook: The total never changes — 48 seeds, on the board plus the two stores, forever. Seeds only ever flow into stores. · go deeper: conserved quantity / invariant; capture as the monotonic sink. · demo: static board with a running "= 48" tally across houses + stores.
4. **Why 2 and 3 capture** · hook: A seed captures only when it makes a house exactly 2 or 3 — and the capture chains backward along the opponent's row. · go deeper: the number condition; consecutive-house capture chain; the 1-or-2-before-sowing framing. · demo: sow into an opponent row to trigger a 2/3 capture chain.
5. **Big houses lap the board** · hook: A house with 12 or more seeds sows all the way around and overlaps itself — the "fills twice" your move-preview already shows. · go deeper: s ≥ 12 ⇒ overlap; the kroo/granary tactic. · demo: sow a 14-seed house; reuse the overlap (pv2) highlight.

**Counting & structure**
6. **Counting every position** · hook: How many ways can 48 seeds sit in 14 bins? An astronomical number — yet only ~890 billion are reachable. · go deeper: stars-and-bars, compositions C(n+k−1, k−1); reachable vs. total; pigeonhole note. · demo: static board + small inline figure of the counting idea.
7. **At most six choices** · hook: On your turn you have at most six moves — that small branching is what makes the game tree (barely) tractable. · go deeper: branching factor ≤ 6; game-tree complexity. · demo: static board highlighting the ≤6 legal cups + a tiny branch diagram.

**Dynamics & termination**
8. **Why the game must end** · hook: Captures only ever go up and stop at 48, and a no-capture limit kills endless loops — so the game can't run forever. · go deeper: monovariant / progress measure; cycle (repetition) rule; well-foundedness. · demo: static/diagram of the captured-count rising toward 48.
9. **Feeding the opponent** · hook: If your opponent has no seeds, you must give them some when you can — otherwise the remainder is swept up. · go deeper: starvation rule as a legal-move constraint; endgame collection. · demo: opponent-empty position; show which moves are forced (feeding).
10. **What kind of game is this?** · hook: Oware is finite, deterministic, perfect-information, zero-sum, and *partisan* — and notably **not** a Nim-type game. · go deeper: the taxonomy; why Sprague–Grundy theory doesn't apply (scoring, not impartial); start-position symmetry note. · demo: static board (symmetric start) + small taxonomy figure.
11. **Oware is solved** · hook: With perfect play, Oware is a draw — and the value of *every* position is known, computed by working backward from the end. · go deeper: retrograde analysis / endgame databases (2002); weakly vs. strongly solved. · demo: static/diagram of working backward from terminal positions.
12. **When the math gets hard** · hook: This 2×6 game is solvable, but the general mancala family becomes computationally intractable as the board grows. · go deeper: complexity classes; generalized-mancala hardness results. · demo: static/diagram of state-space growth with board size.

---

## 3. Architecture

Single-file `index.html`, learning feature as a **delimited module** with three parts:

- **Data:** a `LEARN` array of block objects (Section 4).
- **Logic + render:** `learn*`-prefixed functions for unlock computation, badge, overlay, full-screen, and the demo board (Section 6).
- **Styles:** a dedicated CSS section, reusing existing tokens (`--brass`, `--seed`, etc.) and cup/pip classes.

**Only hooks into existing code:**
1. A cumulative move counter (`learnState.totalMoves`) incremented wherever `movesPlayed` is already incremented (in `doMove`).
2. An `learnCheckUnlocks()` call after each committed move.
3. New icon/badge + "Learn" button in the controls and focus toolbar.

No changes to the engine (`simulate`, `applyMove`, `negamax`, etc.).

---

## 4. Data model

Block object:

```js
{
  id: 'sowing-clock',           // stable string id
  group: 'pure',                // 'pure' now; 'computation' reserved for future track
  order: 2,                     // unlock order (1..N); block 0 = 0
  title: 'Sowing is clock arithmetic',
  hook: '...',                  // one paragraph, always readable
  deeper: '...',                // HTML-ish string, gated
  demo: { type: 'sow', setup: [/*12 house counts*/], script: { from: 1 } }
  // demo.type ∈ 'sow' | 'capture' | 'lap' | 'feed' | 'static' | 'diagram'
}
```

Persisted progress — **new** localStorage key `zako-oware-learn` (records keep their own key `zako-oware-web`):

```js
{
  totalMoves: 0,               // cumulative across all games
  pace: 'extended',            // 'extended' | 'quick'
  unlockedCount: 0,            // monotonic high-water mark (never decreases)
  seenIds: []                  // block ids the user has opened/viewed
}
```

`unlockedCount` is stored as a high-water mark so switching pace (or any recompute) never re-locks an earned block.

---

## 5. Unlock logic

Let `N` = number of pure blocks (12; 13 with Block 0). Per-pace span:
- **Quick:** `M_quick ≈ 20` moves.
- **Extended:** `M_extended ≈ 90` moves.

Unlock thresholds:
- **Block 0 (history) and Block 1** unlock immediately (move 0), so a brand-new player has content from the start.
- **Blocks 2..N** unlock at `t_i = round((i − 1) * M / (N − 1))`, so the last block unlocks at ≈ `M` moves. Example (Extended, M=90, N=12): block 2 ≈ move 8, block 7 ≈ move 49, block 12 ≈ move 90. (Quick, M=20: block 2 ≈ move 2, block 12 ≈ move 20.)

After each move:
```
computed = count of blocks whose t_i <= totalMoves   (for current pace)
unlockedCount = max(unlockedCount, computed)          // monotonic
badgeCount = unlockedCount - (unlocked blocks already in seenIds)
```

- **Switching pace:** recompute `computed` for the new pace; `unlockedCount = max(unlockedCount, computed)`. Never re-locks.
- **Reset learning:** `totalMoves = 0; unlockedCount = 0; seenIds = []` (pace preference retained). Mirrors the existing records-reset.
- **Seen tracking:** opening the overlay/full-screen marks all currently-unlocked blocks as seen, clearing the badge.

---

## 6. Surfaces & UI

**Learning icon + badge.** A small icon (e.g. a scroll/◉ glyph) with a subtle brass **badge** showing `badgeCount` of newly-unlocked blocks. Appears in the normal controls row and in the focus-mode icon toolbar. No motion over the board.

**Quick overlay (peek).** Clicking the icon opens a modal reader over the game: the list of blocks (✓ unlocked / 🔒 hook-visible-locked), the selected block's hook + (if unlocked) "go deeper", a small static demo thumbnail, and an **"Open full-screen"** button. Esc closes.

**Full-screen learning mode ("Learn" button).** A distinct surface from the game's Focus board:
- **Demo board** prominent at top (narrow screens) or to the side (wide screens), rendered by the demo engine (Section 6.1).
- **Block list** down the side: ✓ unlocked, 🔒 locked. Locked blocks still show their **hook** (tease) and "play N more moves to unlock" for the demo + "go deeper".
- **Selected block:** title, hook, demo plays on the demo board, and "go deeper" (if unlocked).
- **Controls inside:** pacing setting (Quick/Extended), reset-learning button, exit (Esc).

**Pacing setting & reset** live inside the overlay/full-screen (and pacing may also be surfaced in the Rules panel). Default Extended.

### 6.1 Demo board (engine reuse)

A scaled, **read-only** board reusing the existing cup/pip rendering and the sowing animation, fed each block's `demo.setup` + `demo.script`:
- `sow` / `lap` / `capture` / `feed`: set the position, auto-play the scripted move using `sowPath`/`simulate`, reuse existing pip-drop + capture-flash + overlap (pv2) visuals; gentle replay loop (play → pause → replay).
- `static`: render the position snapshot, no animation.
- `diagram`: render a small inline SVG/figure (counting, branching, termination, taxonomy, solved, complexity).
- `prefers-reduced-motion` → no auto-play (static snapshot + a manual "play" control).

Demos are **correct by construction** because they use the same verified rules as the game.

---

## 7. Not-dominant integration & accessibility

- Default view changes only by a small badged icon; overlay/full-screen are opt-in.
- Esc closes overlay and full-screen (consistent with focus mode).
- Visible `:focus-visible` rings; keyboard-navigable block list; semantic headings.
- `prefers-reduced-motion` honored in all demos.
- All colours derive from existing tokens so the learning surfaces match the board.

---

## 8. Out of scope (this spec)

- **AI/computation learning track** (negamax, alpha-beta, fixed depth, evaluation, the C+B randomization). Reserved as a future `group: 'computation'` set; the data model already accommodates it. No content now.
- **Board colour/hue selector** (deferred task #8) — separate later work.

---

## 9. Open items / future work

- Final "go deeper" prose for each block (outlines above are sufficient to plan; copy finalized during implementation).
- Exact `t_i` thresholds and whether Block 0 (history) ships in v1 (default: yes).
- Whether the pacing setting also appears in the Rules panel or only inside the learning surfaces.
- The AI/computation track as a follow-up spec.
