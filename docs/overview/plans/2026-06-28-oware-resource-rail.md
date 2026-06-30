# Owaré Knowledge Rail & Resource Overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side "knowledge rail" to `index.html` giving subtle in-place access to the `docs/` learning materials — a rotating Lesson-of-the-turn card plus Papers / Reports / Overview / Bibliography overlays.

**Architecture:** One delimited "resource module" inside the single-file `index.html`, alongside the existing learning module. It adds a `RESOURCES` data map, a rail UI mirroring the hue picker, a compact lesson card that reuses the existing `LEARN` array and `learnRenderDemo`, a PDF viewer overlay, and a reusable markdown reader overlay backed by a tiny dependency-free `mdRender`. A `location.hash` router deep-links each surface (real feature + test hook). The only hooks into existing code: one line in `doMove`, one render call at startup, and extending the Esc handler.

**Tech Stack:** Vanilla HTML/CSS/JS, `localStorage`, `fetch`, inline SVG. No dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-06-28-oware-resource-rail-design.md`

## Global Constraints

- Single-file `index.html`; no dependencies; no build step. Game core stays offline; doc overlays need the page *served* and degrade to "open in new tab" on `file://`.
- Reuse existing tokens only: `--brass`, `--brass-bright`, `--brass-dim`, `--recess`, `--recess-lo`, `--wood`, `--wood-hi`, `--wood-lo`, `--ink`, `--ink-dim`, `--ink-faint`, `--seed`, `--loam`, `--loam-2`. No new palette, no new fonts (Fraunces / Spline Sans / Spline Sans Mono only).
- No engine changes: `simulate`, `applyMove`, `legalMoves`, `negamax`, `chooseMove`, records, hue picker untouched.
- Records key `zako-oware-web` and learn key `zako-oware-learn` unchanged (the latter gains two fields via merge-over-defaults).
- `prefers-reduced-motion` honored; `:focus-visible` rings; Esc closes the topmost open surface; every glyph carries `aria-label`.
- New globals are prefixed `res*`, `lesson*`, `md*`, `RESOURCES` to avoid collisions with existing `learn*` / `hue*` code.

## Verification harness (used by every task)

All headless checks run against a served copy (fetch + PDF embedding require an origin):

```bash
# from repo root, in one terminal:
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 &
SRV=$!
# DOM dump of a surface (deep-linked via hash), wait for async render:
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=4000 --dump-dom "http://localhost:8011/index.html#papers" \
  > /tmp/dom.html 2>/dev/null
# Screenshot at a given width:
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox \
  --window-size=1100,900 --virtual-time-budget=4000 \
  --screenshot=/tmp/shot.png "http://localhost:8011/index.html" >/dev/null 2>&1
# stop server when done:
kill $SRV
```

Assertions are `grep` over `/tmp/dom.html`; visuals are eyeballed from the PNG. A gated self-test (`?selftest=1`) writes PASS/FAIL lines into a `<pre id="selftest">` for pure-logic checks.

---

### Task R: Auto-sensed resource manifest (amendment, 2026-06-29)

Supersedes Task 1's hand-typed `docs` arrays (see spec §3a). Implemented mid-flight.

**Files:** Create `tools/build-resources.py`, `docs/RESOURCE-CONVENTIONS.md`,
`docs/resources-manifest.json` (generated); modify `index.html` (`RESOURCES`
docs → `[]` + `resLoadManifest()` called at startup).

**Deliverable:** `build-resources.py` parses `BIBLIOGRAPHY.md` for papers
(`### ` entry + `` `papers/X.pdf` `` reference + description paragraph) and globs
`REPORT-*.md` (H1 + first paragraph) plus overview/bibliography, emitting
`resources-manifest.json` (`{papers[], reports[], overview[],
bibliography[]}`, each doc `{file,title,summary}`; deterministic output). The page fetches it at
startup and fills `RESOURCES[*].docs`; graceful empty state on failure.
Tasks 5–6 consume `doc.summary` (not `doc.meta`).

**Verify:** `python3 tools/build-resources.py` reports papers/reports counts and
warns on orphan PDFs; served page loads with no JS errors, 5 studs, manifest
HTTP 200 with expected counts. Commit.

---

### Task 1: RESOURCES data, SVG glyphs, and the knowledge rail

> **Amended:** the `docs` arrays in this task are superseded by Task R
> (manifest-driven). Task 1's CSS/HTML/glyphs/render remain as-is.

**Files:**
- Modify `index.html`: add CSS (after the `/* ---- board colour (hue) picker ---- */` block, ~line 346), HTML (`#resRail` inside `.board-area`, ~line 449), and JS (new resource module before the final `$('newgame').onclick=…` wiring, ~line 1192).

**Interfaces:**
- Produces: `const RESOURCES` (keys `papers`, `reports`, `overview`, `bibliography`, each `{glyph, label, docs:[{file,title,meta?}]}`); `RES_GLYPHS` (map glyph-id → SVG string, incl. `spark`); `resRailRender()`; `resStudEl(key)` returns the stud button for `key` or `'lesson'`.

- [ ] **Step 1: Add the RESOURCES data and glyph map (JS).** Insert at the start of a new module block just before the event-wiring near line 1192:

```js
/* ===========================================================================
   Resource module — knowledge rail + lesson card + doc overlays.
   Reuses LEARN, learnRenderDemo, fillCup, the .learn-screen shell, and tokens.
   =========================================================================== */
const RES_GLYPHS = {
  spark:'<path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" stroke-width="1.4"/>',
  sheets:'<rect x="4" y="3" width="12" height="15" rx="1.5"/><rect x="8" y="6" width="12" height="15" rx="1.5"/><path d="M11 11h6M11 14h6"/>',
  report:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 10h8"/><path d="M8 17v-3M11 17v-5M14 17v-2"/>',
  nodes:'<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7.8 8.4 10.6 16M16.4 7.6 13.4 16M8 7.4h7.8"/>',
  book:'<path d="M12 6c-2-1.4-5-1.4-7-0.6v12c2-0.8 5-0.8 7 0.6 2-1.4 5-1.4 7-0.6v-12c-2-0.8-5-0.8-7 0.6Z"/><path d="M12 6v13"/>'
};
const RESOURCES = {
  papers:{ glyph:'sheets', label:'Research papers', docs:[
    /* one entry per PDF in docs/research/papers/ (exclude eth_bundles.json).
       Titles/meta are clean display labels set from the real file set. */
    {file:'docs/research/papers/Allis-1994-Searching-for-Solutions-in-Games-and-AI.pdf', title:'Searching for Solutions in Games & AI', meta:'Allis · 1994'},
    {file:'docs/research/papers/Herik-Uiterwijk-Rijswijck-2002-Games-Solved-Now-and-in-the-Future.pdf', title:'Games Solved: Now and in the Future', meta:'van den Herik et al. · 2002'},
    {file:'docs/research/papers/Broline-Loeb-1995-Combinatorics-of-Mancala-Ayo-Tchoukaillon.pdf', title:'Combinatorics of Mancala-type Games', meta:'Broline & Loeb · 1995'},
    {file:'docs/research/papers/Heule-Rothkrantz-Solving-Games-Dependence-of-Applicable-Procedures.pdf', title:'Solving Games: Dependence of Applicable Procedures', meta:'Heule & Rothkrantz'},
    {file:'docs/research/papers/Irving-Donkers-Uiterwijk-2000-Solving-Kalah.pdf', title:'Solving Kalah', meta:'Irving et al. · 2000'},
    {file:'docs/research/papers/Lincke-2002-Computational-Limits-Exhaustive-Search.pdf', title:'Computational Limits of Exhaustive Search', meta:'Lincke · 2002'},
    {file:'docs/research/papers/vanRijswijck-2000-Learning-from-Perfection.pdf', title:'Learning from Perfection', meta:'van Rijswijck · 2000'},
    {file:'docs/research/papers/Set-Based-Retrograde-Analysis-2024.pdf', title:'Set-Based Retrograde Analysis', meta:'2024'},
    {file:'docs/research/papers/Supervised-vs-Unsupervised-ML-Awale-Mancala-Ayo-Player.pdf', title:'Supervised vs Unsupervised ML for an Awale Player', meta:'ML study'}
  ]},
  reports:{ glyph:'report', label:'Reports', docs:[
    {file:'docs/research/REPORT-01-foundations.md', title:'Foundational papers'},
    {file:'docs/research/REPORT-02-endgame-database-spec.md', title:'Endgame database'},
    {file:'docs/research/REPORT-03-combinatorics-broline-loeb.md', title:'Combinatorics'}
  ]},
  overview:{ glyph:'nodes', label:'Overview', docs:[
    {file:'docs/oware-mathematical-architecture.md', title:'Mathematical architecture'}
  ]},
  bibliography:{ glyph:'book', label:'Bibliography', docs:[
    {file:'docs/research/BIBLIOGRAPHY.md', title:'Bibliography'}
  ]}
};
const RES_ORDER = ['papers','reports','overview','bibliography'];
function resGlyphSvg(id){ return '<svg class="res-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" aria-hidden="true">'+(RES_GLYPHS[id]||'')+'</svg>'; }
```

- [ ] **Step 2: Add the rail CSS.** Insert after the hue-picker CSS block (before `/* ---- learning feature ---- */`, ~line 348):

```css
  /* ---- knowledge rail (mirrors the hue picker, on the right) ---- */
  .board-area{ position:relative }
  .res-rail{ display:flex;flex-direction:column;justify-content:center;gap:clamp(8px,1.8vw,13px);
    flex:0 0 auto;padding:2px }
  .res-stud{ width:clamp(30px,7vw,38px);height:clamp(30px,7vw,38px);border-radius:50%;
    padding:0;cursor:pointer;position:relative;flex:0 0 auto;color:var(--brass);
    background:radial-gradient(80% 80% at 38% 30%, var(--recess) 0%, var(--recess-lo) 78%);
    box-shadow:inset 0 4px 9px -4px #000000d0, inset 0 0 0 1px var(--brass-dim), 0 1px 2px #00000070;
    display:inline-flex;align-items:center;justify-content:center;
    transition:box-shadow .14s, transform .08s, color .12s }
  .res-stud:hover{ transform:translateY(-1px);color:var(--brass-bright);
    box-shadow:inset 0 4px 9px -4px #000000d0, inset 0 0 0 1px var(--brass), 0 0 14px -3px var(--brass) }
  .res-stud:focus-visible{ outline:none;color:var(--brass-bright);
    box-shadow:inset 0 0 0 2px var(--brass-bright), 0 0 16px -3px var(--brass-bright) }
  .res-ico{ width:54%;height:54% }
  .res-stud .res-label{ position:absolute;right:calc(100% + 8px);white-space:nowrap;
    font-size:11px;letter-spacing:.04em;color:var(--ink-dim);
    background:#241710e8;padding:4px 8px;border-radius:7px;border:1px solid #00000050;
    opacity:0;transform:translateX(4px);pointer-events:none;transition:opacity .12s, transform .12s }
  .res-stud:hover .res-label, .res-stud:focus-visible .res-label{ opacity:1;transform:translateX(0) }
  .res-stud .badge-dot{ top:-4px;right:-4px }
  body.focus .res-rail{ display:none }
  @media (max-width:520px){
    .board-area{ flex-wrap:wrap }
    .res-rail{ order:3;flex-direction:row;justify-content:center;width:100%;margin-top:10px;flex-basis:100% }
    .res-stud .res-label{ right:auto;top:calc(100% + 6px);transform:translateY(-4px) }
    .res-stud:hover .res-label,.res-stud:focus-visible .res-label{ transform:translateY(0) }
  }
```

- [ ] **Step 3: Add the `#resRail` HTML.** In `.board-area` (currently `#huePicker` then `.board`), add the rail immediately after the closing `</div>` of `.board`, still inside `.board-area` (~line 448):

```html
    <div class="res-rail" id="resRail" role="group" aria-label="Learning resources"></div>
```

- [ ] **Step 4: Add the rail render function (JS), still in the resource module.**

```js
function resStudEl(key){ return document.querySelector('.res-stud[data-key="'+key+'"]'); }
function resMakeStud(key, glyph, label, withBadge){
  const b=document.createElement('button'); b.type='button'; b.className='res-stud';
  b.dataset.key=key; b.title=label; b.setAttribute('aria-label', label);
  b.innerHTML=resGlyphSvg(glyph)+'<span class="res-label">'+label+'</span>'+
    (withBadge?'<span class="badge badge-dot" id="lessonBadge"></span>':'');
  return b;
}
function resRailRender(){
  const host=$('resRail'); if(!host) return; host.innerHTML='';
  host.appendChild(resMakeStud('lesson','spark','Lesson of the turn', true));
  for(const k of RES_ORDER){ host.appendChild(resMakeStud(k, RESOURCES[k].glyph, RESOURCES[k].label, false)); }
  resStudEl('lesson').onclick=lessonOpen;          /* defined in Task 3 */
  for(const k of RES_ORDER) resStudEl(k).onclick=()=>resOpen(k);   /* defined in Tasks 5–6 */
}
```

- [ ] **Step 5: Add temporary stubs so Task 1 runs standalone.** Immediately after `resRailRender`, add stubs (replaced in later tasks):

```js
function lessonOpen(){ /* Task 3 */ }
function resOpen(key){ /* Tasks 5–6 */ }
```

- [ ] **Step 6: Call `resRailRender()` at startup.** In the startup block near line 1209–1212, add a line after `hueApply(hueLoad()); hueRenderPicker();`:

```js
resRailRender();
```

- [ ] **Step 7: Verify the rail renders (5 studs, labels, focus-hidden).**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --dump-dom "http://localhost:8011/index.html" > /tmp/dom.html 2>/dev/null
grep -c 'class="res-stud"' /tmp/dom.html        # expect 5
grep -o 'aria-label="Research papers"' /tmp/dom.html   # expect a match
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1100,900 \
  --virtual-time-budget=3000 --screenshot=/tmp/rail.png "http://localhost:8011/index.html" >/dev/null 2>&1
kill $SRV
```
Expected: `5`; the aria-label match prints; `/tmp/rail.png` shows five brass studs in a column to the right of the board, twin to the hue column on the left.

- [ ] **Step 8: Commit.**
```bash
git add index.html
git commit -m "feat(rail): add knowledge rail with RESOURCES data and SVG glyph studs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Lesson rotation state and the per-turn advance hook

**Files:**
- Modify `index.html`: the `learnLoad` defaults (~line 1022) and `doMove` (~line 884); add functions to the resource module.

**Interfaces:**
- Consumes: existing `learnState`, `learnSave`, `learnIsUnlocked`, `LEARN`, `learnUpdateBadge`.
- Produces: `lessonUnlockedList()` → array of unlocked `LEARN` blocks in order; `lessonCurrent()` → the block at the cursor (or `null`); `lessonAdvance()` (called per turn); `lessonBadgeUpdate()`; `lessonMarkSeen()`.

- [ ] **Step 1: Extend `learnLoad` defaults.** Change the defaults object (~line 1022) from
```js
  const d={totalMoves:0, pace:'extended', unlockedCount:2, seenIds:[]};
```
to
```js
  const d={totalMoves:0, pace:'extended', unlockedCount:2, seenIds:[], lessonCursor:0, lessonFresh:false};
```
(Object.assign already merges saved state over these, so old saves upgrade cleanly.)

- [ ] **Step 2: Add the rotation logic (JS, resource module).**

```js
function lessonUnlockedList(){ return LEARN.filter(learnIsUnlocked); }
function lessonCurrent(){ const u=lessonUnlockedList(); if(!u.length) return null;
  let i=learnState.lessonCursor; if(i<0||i>=u.length){ i=0; learnState.lessonCursor=0; } return u[i]; }
function lessonAdvance(){
  const u=lessonUnlockedList(); if(u.length<=1){ learnState.lessonFresh=true; lessonBadgeUpdate(); return; }
  learnState.lessonCursor=(learnState.lessonCursor+1)%u.length;
  learnState.lessonFresh=true; learnSave(); lessonBadgeUpdate();
}
function lessonStep(dir){ const u=lessonUnlockedList(); if(!u.length) return;
  learnState.lessonCursor=((learnState.lessonCursor+dir)%u.length+u.length)%u.length; learnSave(); }
function lessonBadgeUpdate(){ const el=$('lessonBadge'); if(!el) return;
  const on=!!learnState.lessonFresh; el.style.display=on?'inline-flex':'none'; el.textContent=on?'':''; }
function lessonMarkSeen(){ if(learnState.lessonFresh){ learnState.lessonFresh=false; learnSave(); } lessonBadgeUpdate(); }
```

- [ ] **Step 3: Hook `lessonAdvance` into `doMove`.** In `doMove` (~line 884), the existing line is:
```js
  learnState.totalMoves++; learnCheckUnlocks(); learnSave();
```
Append `lessonAdvance();` so it reads:
```js
  learnState.totalMoves++; learnCheckUnlocks(); learnSave(); lessonAdvance();
```

- [ ] **Step 4: Show the badge at startup.** In the startup block, after `resRailRender();` add:
```js
  lessonBadgeUpdate();
```

- [ ] **Step 5: Add a gated self-test for the rotation math.** Just before the startup calls (after all resource-module functions), add:
```js
if(location.search.indexOf('selftest')>=0){
  const log=[]; const ok=(n,c)=>log.push((c?'PASS':'FAIL')+' '+n);
  learnState.unlockedCount=4; learnState.lessonCursor=0; learnState.lessonFresh=false;
  const n0=lessonUnlockedList().length; ok('unlocked=4', n0===4);
  const first=lessonCurrent().id; lessonAdvance(); const second=lessonCurrent().id;
  ok('advance changes block', first!==second);
  ok('fresh set', learnState.lessonFresh===true);
  for(let i=0;i<10;i++) lessonAdvance(); ok('cursor in range', learnState.lessonCursor<lessonUnlockedList().length);
  window.__mdSelfTest && window.__mdSelfTest(ok);   /* Task 4 appends md checks here */
  const pre=document.createElement('pre'); pre.id='selftest'; pre.textContent=log.join('\n'); document.body.appendChild(pre);
}
```

- [ ] **Step 6: Verify rotation logic via self-test.**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --dump-dom "http://localhost:8011/index.html?selftest=1" > /tmp/dom.html 2>/dev/null
sed -n 's/.*<pre id="selftest">\(.*\)<\/pre>.*/\1/p' /tmp/dom.html
grep -c 'FAIL' /tmp/dom.html      # expect 0
kill $SRV
```
Expected: the four `PASS …` rotation lines; `0` FAILs.

- [ ] **Step 7: Commit.**
```bash
git add index.html
git commit -m "feat(lesson): add per-turn lesson rotation state and doMove hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Lesson-of-the-turn card UI

**Files:**
- Modify `index.html`: add CSS (after the learning-feature CSS, ~line 409), an HTML container (after the existing `#learnFull`, ~line 422), and JS replacing the `lessonOpen` stub.

**Interfaces:**
- Consumes: `lessonCurrent`, `lessonStep`, `lessonMarkSeen`, `learnRenderDemo`, `learnOpenFull`, `learnSelId`.
- Produces: `lessonOpen()`, `lessonClose()`, `lessonIsOpen()`, `lessonRender()`.

- [ ] **Step 1: Add the card CSS** (after `.learn-close{…}`, ~line 409):

```css
  /* ---- lesson-of-the-turn card ---- */
  .lesson-card{ position:fixed;z-index:38;left:50%;top:50%;transform:translate(-50%,-50%);
    width:min(92vw,440px);max-height:88vh;overflow:auto;
    background:linear-gradient(160deg,#2a1b10,#1f140b);
    border:1px solid #00000060;border-radius:18px;padding:18px 18px 14px;
    box-shadow:inset 0 1px 0 #ffffff12, 0 0 0 1px var(--brass-dim), 0 26px 60px -22px #000d;
    animation:lessonIn .26s cubic-bezier(.2,.9,.3,1.2) both }
  @keyframes lessonIn{ 0%{ opacity:0; transform:translate(-50%,-42%) scale(.96) } 100%{ opacity:1; transform:translate(-50%,-50%) scale(1) } }
  .lesson-card[hidden]{ display:none }
  .lesson-eyebrow{ font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--brass-dim);font-weight:600 }
  .lesson-card h3{ font-family:"Fraunces",serif;font-weight:600;font-size:clamp(19px,4.4vw,24px);margin:4px 0 8px;color:var(--ink) }
  .lesson-card .learn-hook{ margin:0 0 12px }
  .lesson-card .learn-demo{ margin:0 0 10px }
  .lesson-foot{ display:flex;align-items:center;gap:10px;margin-top:10px;border-top:1px solid #ffffff12;padding-top:10px }
  .lesson-steps{ display:flex;align-items:center;gap:6px }
  .lesson-steps button{ background:none;border:0;color:var(--brass);cursor:pointer;font-size:15px;padding:2px 4px }
  .lesson-steps .pos{ font-family:"Spline Sans Mono",monospace;font-size:11px;color:var(--ink-faint) }
  .lesson-foot .save-slot{ flex:1 1 auto }   /* reserved for a future "save" action */
  .lesson-foot a.lesson-lib{ color:var(--brass);font-size:12px;text-decoration:none;letter-spacing:.03em }
  .lesson-foot a.lesson-lib:hover{ color:var(--brass-bright) }
  .lesson-x{ position:absolute;top:10px;right:12px;background:none;border:0;color:var(--ink-dim);font-size:16px;cursor:pointer }
  .lesson-x:hover{ color:var(--brass-bright) }
  .lesson-card:focus-visible{ outline:2px solid var(--brass-bright);outline-offset:3px }
  @media (prefers-reduced-motion: reduce){ .lesson-card{ animation:none } }
```

- [ ] **Step 2: Add the card container HTML** (after `#learnFull`, ~line 422):

```html
<div class="lesson-card" id="lessonCard" role="dialog" aria-modal="true" aria-label="Lesson of the turn" tabindex="-1" hidden></div>
```

- [ ] **Step 3: Replace the `lessonOpen` stub** with the real card (JS):

```js
function lessonIsOpen(){ return !$('lessonCard').hidden; }
function lessonRender(){
  const host=$('lessonCard'); const b=lessonCurrent();
  host.innerHTML='';
  if(!b){ host.innerHTML='<button class="lesson-x" aria-label="Close">✕</button>'+
    '<p class="learn-hook">No lessons unlocked yet — play a few moves and one will appear here.</p>';
    host.querySelector('.lesson-x').onclick=lessonClose; return; }
  const u=lessonUnlockedList(); const pos=(learnState.lessonCursor%u.length)+1;
  const x=document.createElement('button'); x.className='lesson-x'; x.setAttribute('aria-label','Close'); x.textContent='✕'; x.onclick=lessonClose;
  const eb=document.createElement('div'); eb.className='lesson-eyebrow'; eb.textContent='Lesson of the turn · '+pos+' / '+u.length;
  const h=document.createElement('h3'); h.textContent=b.title;
  const demoHost=document.createElement('div');
  const hook=document.createElement('p'); hook.className='learn-hook'; hook.innerHTML=b.hook;
  host.appendChild(x); host.appendChild(eb); host.appendChild(h); host.appendChild(demoHost); host.appendChild(hook);
  learnRenderDemo(demoHost, b);
  if(b.deeper){ const d=document.createElement('details'); d.className='learn-deeper';
    d.innerHTML='<summary>go deeper</summary><div class="body">'+b.deeper+'</div>'; host.appendChild(d); }
  const foot=document.createElement('div'); foot.className='lesson-foot';
  const steps=document.createElement('div'); steps.className='lesson-steps';
  const prev=document.createElement('button'); prev.setAttribute('aria-label','Previous lesson'); prev.textContent='◂';
  prev.onclick=()=>{ lessonStep(-1); lessonRender(); };
  const next=document.createElement('button'); next.setAttribute('aria-label','Next lesson'); next.textContent='▸';
  next.onclick=()=>{ lessonStep(1); lessonRender(); };
  const posEl=document.createElement('span'); posEl.className='pos'; posEl.textContent=pos+'/'+u.length;
  steps.appendChild(prev); steps.appendChild(posEl); steps.appendChild(next);
  const slot=document.createElement('span'); slot.className='save-slot';   /* future "save" action */
  const lib=document.createElement('a'); lib.className='lesson-lib'; lib.href='#'; lib.textContent='Open library →';
  lib.onclick=(e)=>{ e.preventDefault(); lessonClose(); learnSelId=b.id; learnOpenFull(); };
  foot.appendChild(steps); foot.appendChild(slot); foot.appendChild(lib);
  host.appendChild(foot);
}
function lessonOpen(){ lessonMarkSeen(); $('lessonCard').hidden=false; lessonRender(); $('lessonCard').focus(); }
function lessonClose(){ learnDemoGen++; const c=$('lessonCard'); c.hidden=true; c.innerHTML=''; }
```

- [ ] **Step 4: Add the hash router** at the end of the resource module (before the self-test/startup):

```js
function resRoute(){ const h=(location.hash||'').replace('#',''); 
  if(h==='lesson') lessonOpen(); else if(RESOURCES[h]) resOpen(h); }
window.addEventListener('hashchange', resRoute);
```
And call `resRoute();` once in the startup block after `lessonBadgeUpdate();`.

- [ ] **Step 5: Extend Esc handling.** In the keydown handler (~line 949), the current line is:
```js
  if(e.key==='Escape'){ if(learnAnyOpen()){ learnCloseOverlay(); learnCloseFull(); } else document.body.classList.remove('focus'); return; }
```
Replace with:
```js
  if(e.key==='Escape'){
    if(lessonIsOpen()){ lessonClose(); return; }
    if(resIsOpen && resIsOpen()){ resClose(); return; }     /* defined in Task 5 */
    if(learnAnyOpen()){ learnCloseOverlay(); learnCloseFull(); return; }
    document.body.classList.remove('focus'); return;
  }
  if(lessonIsOpen()) return;
```
(Leave the existing `if(learnAnyOpen()) return;` line directly below.)

- [ ] **Step 6: Guard `resIsOpen`/`resClose` for this task.** Since Task 5 defines them, add temporary no-op stubs next to the `resOpen` stub so the page runs now:
```js
function resIsOpen(){ return false; }
function resClose(){}
```
(Task 5 replaces all three.)

- [ ] **Step 7: Verify the card via deep-link.**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1100,900 \
  --virtual-time-budget=3500 --screenshot=/tmp/lesson.png "http://localhost:8011/index.html#lesson" >/dev/null 2>&1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3500 \
  --dump-dom "http://localhost:8011/index.html#lesson" > /tmp/dom.html 2>/dev/null
grep -o 'Lesson of the turn ·' /tmp/dom.html   # expect a match
grep -o 'Open library →' /tmp/dom.html         # expect a match
kill $SRV
```
Expected: both grep matches print; `/tmp/lesson.png` shows the brass-edged card centered over the board with title, hook, a mini demo board, "go deeper", step arrows, and the library link.

- [ ] **Step 8: Commit.**
```bash
git add index.html
git commit -m "feat(lesson): add lesson-of-the-turn card with hash router

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `mdRender` — minimal markdown renderer

**Files:**
- Modify `index.html`: add `mdRender` and `mdEscape` to the resource module; append md checks to the self-test.

**Interfaces:**
- Produces: `mdRender(text)` → HTML string; `mdEscape(s)` → HTML-escaped string. Output uses existing token-styled classes (`.md-body` wrapper added in Task 5).

- [ ] **Step 1: Add the renderer (JS).**

```js
function mdEscape(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mdInline(s){
  return mdEscape(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function mdRender(text){
  const lines=text.replace(/\r\n/g,'\n').split('\n'); const out=[]; let i=0;
  const flushPara=(buf)=>{ if(buf.length){ out.push('<p>'+mdInline(buf.join(' '))+'</p>'); buf.length=0; } };
  const para=[];
  while(i<lines.length){
    let ln=lines[i];
    if(/^```/.test(ln)){ flushPara(para); const code=[]; i++;
      while(i<lines.length && !/^```/.test(lines[i])){ code.push(mdEscape(lines[i])); i++; }
      i++; out.push('<pre class="md-code"><code>'+code.join('\n')+'</code></pre>'); continue; }
    if(/^\s*\|.*\|\s*$/.test(ln) && i+1<lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
      flushPara(para); const head=ln.split('|').slice(1,-1).map(c=>c.trim()); i+=2;
      let rows='';
      while(i<lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){
        const cells=lines[i].split('|').slice(1,-1).map(c=>'<td>'+mdInline(c.trim())+'</td>'); rows+='<tr>'+cells.join('')+'</tr>'; i++; }
      out.push('<table class="md-table"><thead><tr>'+head.map(h=>'<th>'+mdInline(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'); continue; }
    let m;
    if((m=/^(#{1,4})\s+(.*)$/.exec(ln))){ flushPara(para); const n=m[1].length; out.push('<h'+n+'>'+mdInline(m[2])+'</h'+n+'>'); i++; continue; }
    if(/^\s*([-*+])\s+/.test(ln)){ flushPara(para); const items=[];
      while(i<lines.length && /^\s*([-*+])\s+/.test(lines[i])){ items.push('<li>'+mdInline(lines[i].replace(/^\s*([-*+])\s+/,''))+'</li>'); i++; }
      out.push('<ul>'+items.join('')+'</ul>'); continue; }
    if(/^\s*\d+\.\s+/.test(ln)){ flushPara(para); const items=[];
      while(i<lines.length && /^\s*\d+\.\s+/.test(lines[i])){ items.push('<li>'+mdInline(lines[i].replace(/^\s*\d+\.\s+/,''))+'</li>'); i++; }
      out.push('<ol>'+items.join('')+'</ol>'); continue; }
    if(/^\s*>\s?/.test(ln)){ flushPara(para); const q=[];
      while(i<lines.length && /^\s*>\s?/.test(lines[i])){ q.push(mdInline(lines[i].replace(/^\s*>\s?/,''))); i++; }
      out.push('<blockquote>'+q.join('<br>')+'</blockquote>'); continue; }
    if(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)){ flushPara(para); out.push('<hr>'); i++; continue; }
    if(/^\s*$/.test(ln)){ flushPara(para); i++; continue; }
    para.push(ln); i++;
  }
  flushPara(para); return out.join('\n');
}
window.__mdSelfTest=function(ok){
  const h=mdRender('# Title\n\nA **bold** and `code` line.\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  ok('md heading', /<h1>Title<\/h1>/.test(h));
  ok('md bold', /<strong>bold<\/strong>/.test(h));
  ok('md code', /<code>code<\/code>/.test(h));
  ok('md list', /<ul><li>one<\/li>/.test(h));
  ok('md table', /<table class="md-table">[\s\S]*<td>1<\/td>/.test(h));
  ok('md escape', mdRender('<script>').indexOf('&lt;script&gt;')>=0);
};
```

- [ ] **Step 2: Verify `mdRender` via self-test.**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --dump-dom "http://localhost:8011/index.html?selftest=1" > /tmp/dom.html 2>/dev/null
sed -n 's/.*<pre id="selftest">\(.*\)<\/pre>.*/\1/p' /tmp/dom.html | tr ';' '\n'
grep -c 'FAIL' /tmp/dom.html      # expect 0
kill $SRV
```
Expected: the six `PASS md …` lines join the rotation lines; `0` FAILs.

- [ ] **Step 3: Commit.**
```bash
git add index.html
git commit -m "feat(md): add dependency-free markdown renderer with self-test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Markdown reader overlay (Reports · Overview · Bibliography)

**Files:**
- Modify `index.html`: add overlay CSS + `.md-body` typography (after lesson-card CSS), a `#resScreen` container (after `#lessonCard`), and JS replacing the `resOpen`/`resIsOpen`/`resClose` stubs.

**Interfaces:**
- Consumes: `RESOURCES`, `mdRender`, the `.learn-screen` shell styling.
- Produces: `resOpen(key)`, `resClose()`, `resIsOpen()`, `mdView(key)`, `resCurrentKey`. (Papers branch is wired here to call `pdfView`, defined in Task 6 — add a temporary `function pdfView(host,key){}` stub that Task 6 replaces.)

- [ ] **Step 1: Add overlay + markdown CSS** (after the lesson-card CSS):

```css
  /* ---- resource overlays (reuse .learn-screen shell) + markdown typography ---- */
  .res-body{ display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:clamp(14px,2.4vw,26px);margin-top:14px;align-items:start }
  .res-body.single{ grid-template-columns:1fr }
  @media (max-width:640px){ .res-body{ grid-template-columns:1fr } }
  .res-index{ display:flex;flex-direction:column;gap:4px }
  .res-index button{ text-align:left;border:1px solid transparent;background:transparent;color:var(--ink-dim);
    cursor:pointer;font:inherit;font-size:13px;padding:9px 11px;border-radius:9px }
  .res-index button:hover{ background:#ffffff08 }
  .res-index button.sel{ background:#ffffff0e;border-color:#00000050;color:var(--ink) }
  .res-index .meta{ display:block;font-size:11px;color:var(--ink-faint) }
  .res-pane{ min-width:0 }
  .res-status{ color:var(--ink-faint);font-size:14px;padding:18px 0 }
  .res-status a{ color:var(--brass) }
  .md-body{ max-width:72ch;color:var(--ink-dim);font-size:15px;line-height:1.65 }
  .md-body h1,.md-body h2,.md-body h3,.md-body h4{ font-family:"Fraunces",serif;color:var(--ink);line-height:1.2;margin:1.4em 0 .5em }
  .md-body h1{ font-size:clamp(22px,3.6vw,30px) } .md-body h2{ font-size:clamp(19px,3vw,24px) } .md-body h3{ font-size:17px }
  .md-body code{ font-family:"Spline Sans Mono",monospace;color:var(--brass-bright);font-size:.92em }
  .md-body pre.md-code{ background:#00000040;border:1px solid #00000050;border-radius:10px;padding:12px 14px;overflow:auto }
  .md-body pre.md-code code{ color:var(--ink) }
  .md-body a{ color:var(--brass) } .md-body a:hover{ color:var(--brass-bright) }
  .md-body ul,.md-body ol{ padding-left:1.3em } .md-body li{ margin:.25em 0 }
  .md-body blockquote{ border-left:2px solid var(--brass-dim);margin:1em 0;padding:.2em 0 .2em 1em;color:var(--ink-faint) }
  .md-body hr{ border:0;border-top:1px solid #ffffff14;margin:1.6em 0 }
  .md-body table.md-table{ width:auto;font-family:inherit;font-size:13px;margin:1em 0 }
  .md-body table.md-table th{ color:var(--brass-dim) } .md-body table.md-table td,.md-body table.md-table th{ text-align:left;padding:5px 12px 5px 0 }
  .res-pdf{ width:100%;height:78vh;border:1px solid #00000050;border-radius:12px;background:#0000003a }
  .res-newtab{ display:inline-block;margin-top:8px;color:var(--brass);font-size:13px;text-decoration:none }
  .res-newtab:hover{ color:var(--brass-bright) }
```

- [ ] **Step 2: Add the `#resScreen` container HTML** (after `#lessonCard`):

```html
<div class="learn-screen" id="resScreen" role="dialog" aria-modal="true" aria-label="Resources" hidden></div>
```

- [ ] **Step 3: Replace the `resOpen`/`resIsOpen`/`resClose` stubs** (from Tasks 1/3) with the real overlay (JS). Also remove the temporary `lessonOpen`/`resOpen` stubs left from Task 1 if still present:

```js
let resCurrentKey=null, resDocIdx=0;
function resIsOpen(){ return !$('resScreen').hidden; }
function resClose(){ learnDemoGen++; const o=$('resScreen'); o.hidden=true; o.innerHTML=''; document.body.style.overflow=''; resCurrentKey=null; }
function resOpen(key){ if(!RESOURCES[key]) return; resCurrentKey=key; resDocIdx=0;
  $('resScreen').hidden=false; document.body.style.overflow='hidden'; resRenderShell(); }
function resRenderShell(){
  const key=resCurrentKey, set=RESOURCES[key]; const host=$('resScreen'); host.innerHTML='';
  const wrap=document.createElement('div'); wrap.className='learn-wrap';
  const top=document.createElement('div'); top.className='learn-top';
  const h2=document.createElement('h2'); h2.innerHTML='Owar<em>é</em> · '+set.label;
  top.appendChild(h2); wrap.appendChild(top);
  const body=document.createElement('div'); body.className='res-body'+(set.docs.length<2?' single':'');
  let pane;
  if(set.docs.length>1){
    const idx=document.createElement('div'); idx.className='res-index';
    set.docs.forEach((d,n)=>{ const b=document.createElement('button'); if(n===resDocIdx) b.classList.add('sel');
      b.innerHTML='<span>'+d.title+'</span>'+(d.summary?'<span class="meta">'+d.summary+'</span>':'');
      b.onclick=()=>{ resDocIdx=n; resRenderShell(); }; idx.appendChild(b); });
    body.appendChild(idx);
  }
  pane=document.createElement('div'); pane.className='res-pane'; body.appendChild(pane);
  wrap.appendChild(body);
  const close=document.createElement('button'); close.className='btn learn-close'; close.textContent='✕ Close'; close.onclick=resClose;
  wrap.appendChild(close); host.appendChild(wrap);
  if(key==='papers') pdfView(pane, set.docs[resDocIdx]);   /* Task 6 */
  else mdView(pane, set.docs[resDocIdx]);
}
function mdView(pane, doc){
  pane.innerHTML='<div class="res-status">Loading '+doc.title+'…</div>';
  fetch(doc.file).then(r=>{ if(!r.ok) throw new Error(r.status); return r.text(); })
    .then(txt=>{ const div=document.createElement('div'); div.className='md-body'; div.innerHTML=mdRender(txt); pane.innerHTML=''; pane.appendChild(div); })
    .catch(()=>{ pane.innerHTML='<div class="res-status">Couldn’t load this document. '+
      '<a href="'+doc.file+'" target="_blank" rel="noopener">Open it directly ↗</a></div>'; });
}
function pdfView(pane, doc){ /* replaced in Task 6 */ }
```

- [ ] **Step 4: Verify the markdown reader against a real report (exercises `mdRender` end-to-end).**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=4000 \
  --dump-dom "http://localhost:8011/index.html#reports" > /tmp/dom.html 2>/dev/null
grep -o 'class="md-body"' /tmp/dom.html        # expect a match (rendered)
grep -oc '<h2>' /tmp/dom.html                  # expect ≥1 heading from REPORT-01
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1200,900 \
  --virtual-time-budget=4000 --screenshot=/tmp/reports.png "http://localhost:8011/index.html#reports" >/dev/null 2>&1
kill $SRV
```
Expected: `class="md-body"` matches; at least one `<h2>`; `/tmp/reports.png` shows the three-report index on the left and rendered prose (Fraunces headings, brass code) on the right.

- [ ] **Step 5: Verify the error state.** Temporarily append a bad doc, screenshot, then revert:
```bash
# point a throwaway hash at a missing file by testing the catch path directly in console-less headless:
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=4000 \
  --dump-dom "http://localhost:8011/docs/nope.md" >/dev/null 2>&1   # confirms 404 path exists
# Manual: edit RESOURCES.overview.docs[0].file to 'docs/missing.md', reload #overview,
# confirm the "Couldn’t load this document. Open it directly ↗" pane renders, then revert the edit.
kill $SRV
```
Expected: with a missing path the pane shows the in-voice error + working "Open it directly ↗" link (manual confirm), then the edit is reverted.

- [ ] **Step 6: Commit.**
```bash
git add index.html
git commit -m "feat(reader): add markdown reader overlay for reports/overview/bibliography

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: PDF viewer overlay (Papers)

**Files:**
- Modify `index.html`: replace the `pdfView` stub.

**Interfaces:**
- Consumes: `RESOURCES.papers`, the `res-pane`/`res-pdf`/`res-newtab` CSS from Task 5.
- Produces: `pdfView(pane, doc)` rendering an embedded viewer + new-tab fallback.

- [ ] **Step 1: Replace the `pdfView` stub** (JS):

```js
function pdfView(pane, doc){
  pane.innerHTML='';
  const frame=document.createElement('iframe'); frame.className='res-pdf';
  frame.title=doc.title; frame.src=doc.file+'#view=FitH';
  pane.appendChild(frame);
  const meta=document.createElement('div');
  meta.innerHTML='<a class="res-newtab" href="'+doc.file+'" target="_blank" rel="noopener">Open “'+doc.title+'” in a new tab ↗</a>';
  pane.appendChild(meta);
}
```

- [ ] **Step 2: Verify the Papers overlay embeds a PDF + exposes the fallback.**

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=4000 \
  --dump-dom "http://localhost:8011/index.html#papers" > /tmp/dom.html 2>/dev/null
grep -o 'class="res-pdf"' /tmp/dom.html               # expect a match (iframe)
grep -o 'in a new tab ↗' /tmp/dom.html                # expect a match
grep -c 'class="res-index"' /tmp/dom.html             # expect 1 (9-paper index)
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1200,900 \
  --virtual-time-budget=5000 --screenshot=/tmp/papers.png "http://localhost:8011/index.html#papers" >/dev/null 2>&1
kill $SRV
```
Expected: both grep matches; one index; `/tmp/papers.png` shows the paper list on the left and the first PDF rendered in the embedded viewer on the right with the new-tab link beneath.

- [ ] **Step 3: Commit.**
```bash
git add index.html
git commit -m "feat(papers): add embedded PDF viewer overlay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Integration polish, responsiveness, a11y, regression

**Files:**
- Modify `index.html` as needed for fixes found here.

**Interfaces:** none new — this task hardens existing surfaces.

- [ ] **Step 1: Reduced-motion + focus-rings audit.** Confirm `.lesson-card` animation is disabled under `prefers-reduced-motion` (already gated in Task 3 CSS) and that the demo autoplay inside the card respects it (it reuses `learnRenderDemo`, which already checks `reducedMotion()`). Confirm `.res-stud:focus-visible` and `.lesson-card:focus-visible` rings are visible. No code change unless a gap is found.

Run (reduced-motion screenshot):
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1100,900 \
  --force-prefers-reduced-motion --virtual-time-budget=3000 \
  --screenshot=/tmp/rm.png "http://localhost:8011/index.html#lesson" >/dev/null 2>&1
kill $SRV
```
Expected: card renders fully (no reliance on animation) in `/tmp/rm.png`.

- [ ] **Step 2: Mobile reflow check.** Confirm the rail moves beneath the board at ≤520px.

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=380,820 \
  --virtual-time-budget=3000 --screenshot=/tmp/mobile.png "http://localhost:8011/index.html" >/dev/null 2>&1
kill $SRV
```
Expected: `/tmp/mobile.png` shows the five studs as a horizontal strip directly below the board, board uncramped, hue picker still on the left edge.

- [ ] **Step 3: Focus-mode hides the rail.** Confirm `body.focus .res-rail{display:none}`.

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --window-size=1100,900 \
  --virtual-time-budget=3000 --screenshot=/tmp/focus.png \
  "http://localhost:8011/index.html" >/dev/null 2>&1   # then click Focus board in the PNG review is N/A headless
kill $SRV
```
Manual: with the page open in a real browser, click **Focus board** and confirm both the hue picker and the knowledge rail disappear; Esc exits focus.

- [ ] **Step 4: Regression — full headless game produces no console errors and lesson advances.** Confirm a normal game still works and `lessonFresh` flips after a move.

Run:
```bash
cd /home/morgen/oware-web && python3 -m http.server 8011 >/tmp/oware-serve.log 2>&1 & SRV=$!
sleep 1
/usr/bin/chromium --headless=new --disable-gpu --no-sandbox --virtual-time-budget=3000 \
  --enable-logging=stderr --dump-dom "http://localhost:8011/index.html" 2>/tmp/console.log >/tmp/dom.html
grep -iE 'Uncaught|SyntaxError|is not defined' /tmp/console.log    # expect no output
grep -c 'class="house' /tmp/dom.html    # expect 12 (board intact)
kill $SRV
```
Expected: no error lines; board still renders 12 houses. Manual: play one move and confirm the Lesson stud shows its badge dot; open the card and confirm the badge clears.

- [ ] **Step 5: Remove any leftover stubs.** Grep for dead stubs and delete if still present:
```bash
grep -nE 'function (lessonOpen|resOpen|resIsOpen|resClose|pdfView)\(\)\{ ?/\*' index.html || echo "no leftover stubs"
```
Expected: `no leftover stubs` (all replaced by real implementations).

- [ ] **Step 6: Commit.**
```bash
git add index.html
git commit -m "polish(rail): reduced-motion, mobile reflow, a11y, regression checks

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Deploy

- [ ] **Step 1: Push and confirm Pages.**
```bash
git push origin master
# wait ~60s for Pages rebuild, then confirm the deployed page serves and titles correctly:
curl -sI https://<pages-host>/ | head -1            # expect HTTP 200 (substitute the real Pages host)
```
Expected: HTTP 200. Manual: load the live page, confirm the rail, lesson card (#lesson), and a paper/report overlay all work over HTTPS.

- [ ] **Step 2: Final commit (if any deploy tweaks).** None expected; deploy is push-only.

## Self-Review

**1. Spec coverage:**
- §2 architecture (resource module, components) → Tasks 1–6.
- §3 data model (`RESOURCES`, lesson fields) → Task 1 (data) + Task 2 (state).
- §4 rail (geometry, glyphs, badge, focus-hide, responsive) → Task 1 + Task 7.
- §5 lesson card (contents, rotation, deal-in motion, reserved save slot) → Tasks 2–3.
- §6 overlays (PDF viewer, markdown reader, `mdRender`) → Tasks 4–6.
- §7 tokens/integration/a11y/non-dominance → Tasks 1–7 (tokens reused throughout; Esc routing Task 3; a11y Task 7).
- §8 verification approach → harness block + per-task headless checks.
- Deep-link router (spec §“real feature + test hook”) → Task 3.
Covered.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Temporary stubs are explicit, named, and each is explicitly replaced in a named later task (Task 1 stubs → Tasks 3/5/6; Task 3 stubs → Task 5; Task 5 `pdfView` stub → Task 6), with a Task 7 step to confirm none remain.

**3. Type consistency:** `resOpen(key)`, `resClose()`, `resIsOpen()`, `resRenderShell()`, `mdView(pane,doc)`, `pdfView(pane,doc)`, `mdRender(text)`, `mdEscape`, `mdInline`, `lessonOpen/Close/IsOpen/Render`, `lessonCurrent/UnlockedList/Advance/Step/MarkSeen/BadgeUpdate`, `resRailRender`, `resStudEl(key)`, `RESOURCES`, `RES_ORDER`, `RES_GLYPHS`, `resGlyphSvg` — names used identically across tasks. `learnState` field additions (`lessonCursor`, `lessonFresh`) match between Task 2 defaults and all consumers. Doc objects use `{file,title,meta?}` consistently in `mdView`/`pdfView`/index render.
