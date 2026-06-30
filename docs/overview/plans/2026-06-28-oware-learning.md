# Oware Learning Component — Implementation Plan

> Single-file `index.html`. No test runner; verification is headless Chromium
> (`/usr/bin/chromium --headless ... --dump-dom` for assertions via `document.title`,
> and `--screenshot` for visuals). Commit after each task. Spec:
> `docs/superpowers/specs/2026-06-28-oware-learning-design.md`.

**Goal:** Add a non-dominant learning feature teaching Oware's pure mathematics, unlocked progressively by play, with a peek overlay and a full-screen mode with engine-driven guided demos.

**Architecture:** One delimited module inside `index.html` — a `LEARN` data array, `learn*` logic/render functions, and a dedicated CSS block reusing existing tokens. The only hooks into existing code: increment a cumulative counter in `doMove`, call `learnCheckUnlocks()` after each move, and add an icon/badge + "Learn" button.

**Tech stack:** Vanilla HTML/CSS/JS, localStorage. No dependencies.

## Global Constraints

- Stay single-file; offline; no dependencies; works from `file://` and Pages.
- Reuse existing CSS tokens (`--brass`, `--seed`, `--recess`, etc.) and cup/pip classes.
- No engine changes (`simulate`, `applyMove`, `negamax` untouched).
- Records key `zako-oware-web` unchanged; learning uses new key `zako-oware-learn`.
- `prefers-reduced-motion` honored; `:focus-visible` rings; Esc closes overlays.
- Default Extended pacing; cumulative/persistent/resettable progress.

---

### Task 1: LEARN data array (12 blocks + block 0)

**Files:** Modify `index.html` (new `<script>`-level `const LEARN`).
**Deliverable:** `LEARN` array; each item `{id, group:'pure', order, title, hook, deeper, demo:{type,setup,script}}`. Block 0 history + blocks 1–12 from the spec content map. Demo `setup` = 12-int arrays; `script` = `{from}` for sow/capture/lap/feed; `static`/`diagram` types carry a `setup` snapshot and optional `svg` key.
**Verify:** headless dump-dom asserts `LEARN.length===13`, every block has non-empty `hook`, `order` unique 0..12. Commit.

### Task 2: Progress state + unlock logic

**Files:** Modify `index.html` JS.
**Deliverable:**
- `learnState` loaded from `localStorage['zako-oware-learn']` with defaults `{totalMoves:0, pace:'extended', unlockedCount:1, seenIds:[]}` (block 0 & 1 unlocked at move 0 → unlockedCount starts at 2 counting block 0+1; define N=13 incl. block 0).
- `learnSpan = {quick:20, extended:90}`. `learnThreshold(order)` → 0 for order≤1 else `round((order-1)*span/(N-1))`.
- `learnComputeUnlocked()` → count of blocks with threshold ≤ totalMoves; `learnCheckUnlocks()` sets `unlockedCount=max(unlockedCount, computed)`, saves, updates badge.
- `learnBadgeCount()` → unlocked blocks whose id ∉ seenIds.
- Hook: in `doMove`, `learnState.totalMoves++; learnSave(); learnCheckUnlocks();`.
- `learnSetPace(p)`, `learnReset()`, `learnSave()`, `learnLoad()`.
**Verify:** headless: simulate totalMoves=10 extended → unlocked≈2–3; totalMoves=90 → 13; switch to quick at totalMoves=10 → ≥7 and never decreases. Commit.

### Task 3: CSS + HTML scaffold (icon, badge, buttons, overlay, full-screen)

**Files:** Modify `index.html` (HTML + CSS).
**Deliverable:**
- Controls row: `<button id="learnBtn" class="btn">Learn <span class="badge" id="learnBadge"></span></button>`.
- Focus toolbar: `<button class="btn iconbtn" id="fLearn" title="Learn">✦</button>` (with badge dot).
- Overlay container `#learnOverlay` (modal) and full-screen container `#learnFull` (both `display:none`).
- CSS: `.badge` (small brass pill, hidden when empty), `.learn-overlay`/`.learn-full` layouts, block-list item states `.lb-unlocked`/`.lb-locked`, demo board container, reusing tokens. Not-dominant: badge only; no board popups.
**Verify:** screenshot normal view shows "Learn" button with badge; elements exist (dump-dom). Commit.

### Task 4: Demo board engine (read-only, reuses cup/pip + sowing)

**Files:** Modify `index.html` JS + CSS.
**Deliverable:** `learnRenderDemo(container, block)`:
- builds a scaled read-only board (reuse `fillCup`, cup markup) from `block.demo.setup`;
- `sow|lap|capture|feed`: auto-play `block.demo.script.from` via `sowPath`/`simulate`, reuse pip-drop + capture-flash + overlap visuals, gentle replay loop (play→pause 1.2s→replay);
- `static`: snapshot only; `diagram`: inject `block.demo.svg`;
- `prefers-reduced-motion`: no autoplay, show a ▸ replay control.
**Verify:** screenshot a `sow` demo mid-animation and a `diagram` block. Commit.

### Task 5: Overlay (peek) render + open/close

**Files:** Modify `index.html` JS.
**Deliverable:** `learnOpenOverlay()` builds: block list (✓ unlocked / 🔒 locked-with-hook), selected block hook + (if unlocked) go-deeper + small static demo thumb, pacing radio (Quick/Extended), reset-learning button, "Open full-screen" button. Opening marks unlocked blocks seen (clears badge). Esc/✕ closes. Wire `learnBtn`, `fLearn`.
**Verify:** screenshot overlay (some unlocked, some locked); dump-dom asserts badge clears after open. Commit.

### Task 6: Full-screen learning mode

**Files:** Modify `index.html` JS + CSS.
**Deliverable:** `learnOpenFull()` / `learnCloseFull()`: demo board prominent (top on narrow, side on wide), block list, selected block title+hook+demo+go-deeper (gated). Locked blocks: hook + "play N more moves". Pacing + reset controls. Esc closes. "Open full-screen" in overlay calls it.
**Verify:** screenshots desktop + mobile widths; locked block shows hook + countdown. Commit.

### Task 7: Integration polish + regression

**Files:** Modify `index.html`.
**Deliverable:** badge updates live after moves; reduced-motion; focus rings; ensure no interference with existing preview/focus/records. Run a full game headless to confirm no errors and totalMoves increments.
**Verify:** headless full game OK; screenshots of normal view unchanged except Learn button. Commit.

### Task 8 (deferred #8): Board colour/hue selector (normal view)

**Files:** Modify `index.html` (left-side control + CSS variable theming + persistence).
**Deliverable:**
- Left-of-board control (vertical swatch strip / hue slider) in normal default view only (hidden in focus & learning full-screen).
- Re-derive board element colours from a chosen base **hue** by driving the existing palette through `hsl()`-based CSS variables, preserving each token's lightness/saturation relationship so seeds, brass rings, last-move/preview markers, numerals stay clearly visible. Implement by parameterizing `--wood/--brass/--recess/--seed/...` from a `--board-hue` (rotate hue, keep L/S), applied via a `body[data-hue]` or inline `style="--board-hue:…"`.
- Persist choice in `localStorage['zako-oware-hue']`; default = current warm hue.
**Verify:** screenshots at 2–3 hues confirming all elements remain legible (seeds/rings/markers visible); preview indicators still distinguishable. Commit.

### Task 9: Deploy

Push `master`; confirm Pages rebuild (HTTP 200, title present).

## Self-Review

- **Spec coverage:** content map → T1; data model/unlock → T2; surfaces (icon/badge/overlay/full-screen) → T3/T5/T6; demos → T4; not-dominant/a11y → T3/T7; out-of-scope colour selector → T8 (separate, post-feature). Covered.
- **Placeholders:** none — each task names files, deliverable, and a concrete headless verification.
- **Naming consistency:** `learnState`, `learnSave/Load`, `learnCheckUnlocks`, `learnBadgeCount`, `learnRenderDemo`, `learnOpenOverlay`, `learnOpenFull` used consistently across tasks.
