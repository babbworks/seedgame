# Owaré — Knowledge Rail & Resource Overlays Design

**Date:** 2026-06-28
**Status:** Approved design, pending spec review → implementation plan
**Scope:** A right-side "knowledge rail" for the Owaré (Oware) browser game
(`index.html`) giving subtle, in-place access to the project's growing learning
materials in `docs/` — a rotating **Lesson-of-the-turn** card plus four resource
overlays (research papers, reports, architecture overview, bibliography).

Builds on the existing learning component (the `LEARN` array, progressive unlock,
overlay + full-screen reader, engine-driven demo board) and mirrors the existing
left-side board-hue picker. **No engine changes.**

---

## 1. Goals & constraints

- Surface the `docs/` materials (markdown + PDF) from inside the game **without
  changing the game's feel** — the default view gains only a quiet icon rail,
  twin to the existing hue picker.
- One organizing metaphor: **left rail = colour** (how the board looks),
  **right rail = knowledge** (what the board means).
- Reuse the existing `LEARN` system for the rotating lesson; do not duplicate it.
- **Live embed** of real files (decision): PDFs in an embedded viewer; markdown
  fetched and rendered live. Zero content duplication; always current.
- **Single-file** `index.html`: no build step, no runtime dependencies. The game
  core stays fully offline; the doc overlays require the page be *served* (the
  project deploys to GitHub Pages) and degrade to "open in new tab" on `file://`.
- Reuse existing design tokens (`--brass*`, `--recess`, `--wood`, `--ink`,
  `--seed`) and the Fraunces / Spline Sans / Spline Sans Mono type system. No new
  palette, no new fonts.
- Accessibility floor: `:focus-visible` rings, keyboard operation, Esc closes,
  `prefers-reduced-motion` honored, every glyph labeled.

### Decisions captured (from brainstorming)

| Question | Decision |
|---|---|
| Docs rendering | **Live embed** — PDFs via embedded viewer, markdown via fetch + tiny inline renderer |
| Rotating lesson surface | **Compact "dealt-in" card**, advances one block **per completed turn**, cycling **unlocked** blocks only; distinct from the full-screen reader |
| Rail composition | **By role, 5 studs:** Lesson · Papers · Reports · Overview · Bibliography |
| Rail iconography | **Inline-SVG brass-stroke glyphs** (not emoji), icon-only with hover/focus labels |
| Rail placement | **Right** of the board, mirroring the hue picker; hidden in focus mode |
| Mobile layout | Below ~520px the rail **reflows to a horizontal strip beneath the board** |
| Paper list source | **Auto-sensed** — see Amendment §3a (manifest generated from `BIBLIOGRAPHY.md` + reports) |

Out of scope (parked in `docs/game-evolution-notes.md`): profiles/IndexedDB,
saving/collecting lesson cards, context-triggered lessons, gain-points economy,
relationship ledgers, alternate numeral/representation modes, swappable
backgrounds, the row-sum side game. The Lesson card leaves a footer slot where a
future "save" action can fit, but it is **not** built now.

---

## 2. Architecture

One new delimited module inside `index.html` — call it the **resource module** —
sitting alongside the existing learning module. Components, each with one purpose:

1. **`RESOURCES` data** — metadata for the rail and overlays: ordered studs, and
   for each, its glyph id, label, and (for docs) the file list with clean titles.
2. **Knowledge rail (`resRail*`)** — renders the five studs into a right-side
   container mirroring `#huePicker`; wires clicks; manages the Lesson fresh-badge.
3. **Lesson card (`lessonCard*`)** — the compact rotating card; reads the existing
   `LEARN` array and a new `lessonCursor`; reuses `learnRenderDemo`.
4. **PDF viewer overlay (`pdfView*`)** — index list + embedded `<iframe>` viewer,
   used by Papers.
5. **Markdown reader overlay (`mdView*`)** — one component reused by Reports,
   Overview, Bibliography; `fetch()` + `mdRender()`; optional sidebar index.
6. **`mdRender(text)`** — a small, dependency-free markdown→HTML converter.
7. **SVG glyph set** — inline `<svg>` defs/strings for the five rail icons.

**Only hooks into existing code:**
- In `doMove`, after the existing learn-hook, advance the lesson rotation
  (`lessonAdvance()`).
- At startup, render the rail next to `hueRenderPicker()`.
- Reuse the existing `.learn-screen` overlay shell, `learnAnyOpen()` Esc handling,
  `fillCup`, `learnRenderDemo`, and design tokens.

No changes to `simulate`, `applyMove`, `negamax`, `legalMoves`, records, or the
hue picker.

---

## 3. Data model

```js
const RESOURCES = {
  // ordered rail studs after the Lesson stud
  papers: {
    glyph: 'sheets', label: 'Research papers',
    docs: [   // filename in docs/research/papers/ → display title
      { file:'Allis-1994-Searching-for-Solutions-in-Games-and-AI.pdf',
        title:'Searching for Solutions in Games & AI', meta:'Allis · 1994' },
      // …one entry per PDF currently in docs/research/papers/ (excludes
      //   eth_bundles.json). Data-driven so new papers are one-line adds.
    ]
  },
  reports: {
    glyph: 'report', label: 'Reports',
    docs: [   // docs/research/*.md deep-dives
      { file:'REPORT-01-foundations.md',            title:'Foundational papers' },
      { file:'REPORT-02-endgame-database-spec.md',  title:'Endgame database' },
      { file:'REPORT-03-combinatorics-broline-loeb.md', title:'Combinatorics' },
    ]
  },
  overview: {
    glyph: 'nodes', label: 'Overview',
    docs: [ { file:'docs/oware-mathematical-architecture.md',
              title:'Mathematical architecture' } ]
  },
  bibliography: {
    glyph: 'book', label: 'Bibliography',
    docs: [ { file:'docs/research/BIBLIOGRAPHY.md', title:'Bibliography' } ]
  }
};
```

Each `file` is the **path from the served site root** (the directory holding
`index.html`) — e.g. `docs/research/papers/…pdf`, `docs/research/REPORT-…md`,
`docs/…md` — so `fetch()` and `iframe src` resolve uniformly regardless of which
overlay uses it. (For brevity the `papers`/`reports` examples above show bare
filenames; in the real data each carries its full `docs/…` path like the two
shown here.) The titles above are illustrative; final clean titles are set during
implementation from the actual file set.

**Lesson rotation state** — extend the existing `learnState`
(`localStorage['zako-oware-learn']`) with:

```js
lessonCursor: 0,    // index into the *unlocked* LEARN blocks; advances per turn
lessonFresh: false  // a new lesson is waiting → rail badge shown
```

Defaults merge over the existing loader so older saved state upgrades cleanly.

---

## 3a. Amendment (2026-06-29) — auto-sensed resource manifest

Supersedes the hardcoded `docs` arrays in §3. The rail's resource lists are
**auto-sensed at build time** so adding a paper or report needs no code edit.

- **`tools/build-resources.py`** scans the repo and writes
  **`docs/resources-manifest.json`**:
  - **papers** — parsed from `docs/research/BIBLIOGRAPHY.md` (the registry):
    every `### …` entry that references an existing `` `papers/<file>.pdf` ``
    becomes `{file, title, summary}` (heading → title, description paragraph →
    summary). Gated (link-only) entries are skipped. A proceedings PDF
    referenced twice yields two entries pointing at the same file (intentional).
  - **reports** — every `docs/research/REPORT-*.md`, self-describing: `# H1` →
    title (leading `Report:` stripped), first paragraph → summary.
  - **overview** — `docs/oware-mathematical-architecture.md`; **bibliography** —
    `BIBLIOGRAPHY.md` itself.
  - The script warns on any downloaded PDF the bibliography never references and
    any reference whose PDF is missing.
- **`RESOURCES`** in `index.html` keeps only each category's `glyph` + `label`;
  `docs` is `[]` and filled at startup by `resLoadManifest()` (fetches the
  manifest). On fetch failure (`file://`) docs stay empty and overlays show a
  graceful empty state.
- Doc objects are `{file, title, summary}` (not `meta`).
- **`docs/RESOURCE-CONVENTIONS.md`** documents the authoring rules for future
  contributors; the manifest is generated — never hand-edited.

This eliminates the fabricated-path / missing-file class of bug: paths come from
real files on disk and the bibliography, not hand-typed lists.

## 4. The knowledge rail

- Container `#resRail` rendered into `.board-area` to the **right** of `.board`,
  mirroring `#huePicker`'s flex-column geometry, clamp sizing, and stud shape.
- Five studs, in order: **Lesson** (glyph `spark`), **Papers** (`sheets`),
  **Reports** (`report`), **Overview** (`nodes`), **Bibliography** (`book`).
- Each stud: a circular brass-rimmed button echoing the hue chips, containing a
  20px inline-SVG glyph stroked in `currentColor` (brass). `title` + `aria-label`
  for the screen-reader/tooltip; a label that slides out on hover/`:focus-visible`
  for sighted discoverability. Icon-only at rest, like the hue picker.
- **Lesson stud badge:** reuse the existing `.badge` / `.badge-dot` style; shown
  when `learnState.lessonFresh` is true; cleared when the card opens.
- **Focus mode:** `#resRail` hidden, exactly as `#huePicker` is
  (`body.focus #resRail{ display:none }`).

### Responsive

- Default (wide): `.board-area` is `[#huePicker] [.board] [#resRail]`.
- **≤520px:** `#resRail` reflows to a horizontal strip directly **beneath** the
  board (order/flex change), studs in a centered row; the hue picker keeps its
  existing small clamp size. Board prominence preserved.

---

## 5. The Lesson-of-the-turn card

A compact, brass-edged card over the board (not the full-screen reader).

**Contents (top→bottom):** eyebrow `LESSON OF THE TURN · n / N` + ✕ close;
title (Fraunces); hook (always); mini demo board (reuse `learnRenderDemo`);
`▸ go deeper` (the block's `deeper`); footer row with manual step dots/arrows
(`◂ ◦◦●◦ ▸`) and a quiet `Open library →` link to the existing full-screen
reader (`learnOpenFull`). A reserved, currently-inert footer slot for a future
"save" action (per evolution notes) — rendered as empty space now.

**Rotation logic:**
- `unlockedList()` = `LEARN` blocks with `order < learnState.unlockedCount`,
  in order.
- `lessonAdvance()` (called from `doMove` after the existing learn-hook): set
  `lessonCursor = (lessonCursor + 1) % unlockedList().length`, set
  `lessonFresh = true`, save, update rail badge. Guard against empty/`length` 1.
- Opening the card shows `unlockedList()[lessonCursor]`; sets `lessonFresh=false`,
  saves, clears badge. Manual `◂ ▸` move the cursor without setting fresh.
- When a brand-new block unlocks (existing `learnCheckUnlocks`), the next
  `lessonAdvance` naturally includes it; no extra coupling.

**Motion (signature):** on open, the card "deals in" with a brief seed-drop /
slide from the rail; `prefers-reduced-motion` → no transform, instant show.

---

## 6. Resource overlays

Both reuse the existing `.learn-screen` full-bleed shell (loam/brass, `✕ Close`,
Esc via `learnAnyOpen`, `document.body.style.overflow` lock).

### 6.1 PDF viewer (Papers)
- Left: index list of `RESOURCES.papers.docs` (title + meta), selectable.
- Right: generously-sized embedded viewer — `<iframe src=path>` (or `<object>`
  with `<iframe>` fallback) — plus an always-present `open in new tab ↗` link
  (the graceful path for `file://`, where embedding may be blocked).
- First paper selected by default.

### 6.2 Markdown reader (Reports · Overview · Bibliography)
- One component `mdView(setKey)` fed `RESOURCES[setKey].docs`.
- Multiple docs → sidebar index + reading pane; single doc → reading pane with a
  contents strip derived from its `##` headings.
- `fetch(path)` → `mdRender(text)` → inject into the reading pane. Loading and
  error states are explicit and in-voice (e.g. *"Couldn't load this document.
  Open it directly ↗"* with a link) — never a blank pane.

### 6.3 `mdRender(text)` — minimal markdown
Dependency-free (~60–90 lines). Escapes HTML first, then handles: ATX headings
(`#`–`####`), `**bold**` / `*italic*`, `` `inline code` ``, fenced code blocks,
unordered/ordered lists, links `[t](u)`, horizontal rules, blockquotes, and
GFM-style pipe **tables** (the reports rely on them). Output is styled with the
existing type tokens (Fraunces headings, Spline body, Spline Mono code). Not a
full CommonMark engine — scoped to what these docs actually use.

---

## 7. Tokens, integration & accessibility

- **Tokens/fonts:** only existing ones. Rail glyphs use `currentColor` so they
  inherit brass and any future theming.
- **Integration:** `doMove` gains one line (`lessonAdvance()`), startup gains one
  render call beside `hueRenderPicker()`. Esc already routed through
  `learnAnyOpen`; extend it to also close the lesson card and resource overlays.
- **A11y:** studs are real `<button>`s, keyboard-reachable, `:focus-visible`
  rings; overlays are `role="dialog" aria-modal`; Esc closes the topmost surface;
  reduced-motion disables the deal-in and demo autoplay (existing demo code
  already respects it); glyphs carry `aria-label`.
- **Non-dominance:** default game view changes only by the quiet rail. No motion
  over the board except the opt-in card deal-in. Hidden entirely in focus mode.

---

## 8. Verification approach

Single-file, no test runner; verify with headless Chromium
(`--dump-dom` for assertions, `--screenshot` for visuals), matching the existing
learning plan's method. Key checks: rail renders 5 studs; lesson card shows the
cursor block and advances after a simulated move; PDF overlay embeds a paper and
exposes the new-tab link; markdown overlay fetches + renders a report (headings,
a table) and shows an explicit error state on a bad path; reduced-motion path;
focus-mode hides the rail; mobile width reflows the rail beneath the board.

---

## 9. Open items

- Final clean titles/meta for each paper from the current `docs/research/papers/`
  set (≈9 PDFs; excludes `eth_bundles.json`).
- Exact glyph artwork for the five icons (drawn during implementation).
- Whether Overview's single doc gets a heading contents strip or renders plain
  (default: contents strip).
