# Report: Endgame-DB Methods from a Sister Game (Fang, Hsu & Hsu, 2000)

A close reading of **Fang, Hsu & Hsu (2000),** *Construction of Chinese Chess Endgame
Databases by Retrograde Analysis* (in
`papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf`, pp. 96–114, CG 2000).

This is the **one non-Awari report** in the collection. It is included as a *methods*
reference: it is the only other hands-on, end-to-end account of building endgame databases by
retrograde analysis in our pile, on a different *convergent* game (captures remove pieces). It
neither changes Oware theory nor adds an Awari result — but it sharpens **four** REPORT-02
decisions and flags **one genuine correctness trap** the Awari papers never spell out. Read it
as a checklist for the builder, not as Oware content.

> **Scope note:** Chinese chess (Xiangqi) is *not* convergent the way Oware is — pieces are
> only removed by capture (convergent in that direction) but there is no monotone "stone count"
> to layer on. Fang et al. layer instead by **piece set** (a hierarchy of "supporting
> databases"), and restrict to endgames where **only one side has attacking pieces**. Keep that
> structural difference in mind: the *techniques* transfer; the *game* does not.

---

## 1. The value-type choice — a framing REPORT-02 should adopt language from

They lay out the three standard endgame-DB value encodings cleanly (§2.4):

| Encoding | Size | Property |
|---|---|---|
| **win-draw-loss (WDL)** | most compact (≈ 2 bits) | *not infallible alone* — a player can "wander among win states endlessly" and draw |
| **distance-to-conversion (DTC)** | medium | **infallible** but imperfect (may detour before converting) |
| **distance-to-mate (DTM)** | largest (1 byte; DTC fallback on overflow) | **perfect** — fastest win, slowest loss |

> **For oware-web:** `REPORT-02` stores a **stone-difference value** — essentially "WDL with a
> magnitude" (how many seeds the mover nets). That is correct for *evaluating* a position and
> for "never lose," which is Oware's goal (the game is a draw; Lincke `REPORT-06` notes Awari
> usually has a *unique* optimal move, so a distance metric is rarely needed). But this paper
> gives us the vocabulary for a *future* refinement: if we ever want the engine to play the
> **snappiest** winning/drawing line (capture fastest, prolong losses), we'd add a DTC/DTM-style
> tiebreak on top of the value. Worth a one-line note in R-02; not needed for v1.

`★ Insight ─────────────────────────────────────`
The WDL pitfall — "you can win-state-wander into a draw" — is the *same* phenomenon as Oware's
no-capture cycles (`REPORT-02` §6, `REPORT-06` §3). In WDL chess they solve it with the
distance metric (always step toward a *closer* mate). In Oware our value carries magnitude, so
a greedy "increase my netted seeds" already avoids aimless wandering — but the underlying issue
(a correct *value* doesn't imply *progress*) is identical, and the distance-metric trick is the
general cure if we ever see the engine stall in a won/drawn endgame.
`─────────────────────────────────────────────────`

## 2. ⚠ The indexing caveat that protects our symmetry halving

Their indexing scheme (§2.5) is exactly REPORT-02's `rank` in spirit: partition the pieces into
subsets, **locally index each subset** (a per-subset bijection), then combine with **mixed-radix
weights** (the product of preceding subsets' sizes) — a sum of `local_index × weight`. This is
the multi-component generalisation of our stars-and-bars `rank()`.

The transferable warning concerns **symmetry**. Chinese chess has a left-right mirror
("conjugate" positions across the central file) that, like Oware's 180° color symmetry, halves
the space. But:

> "**At most one** of its subsets can be further compactly indexed to remove conjugate
> redundancy; otherwise, the endgame databases are unreliable because two positions with
> different assignment of pieces may have the same index number but different position values."

Table 2 shows the payoff (index space drops to ~50–56% per subset) — but the **"only one level"
rule is the safety condition.**

> **For oware-web — directly validates and bounds the R-04/R-06 optimization:** our plan folds
> the 180° color symmetry by **canonicalising the whole `(h, turn)` to its South-to-move
> representative once, before ranking.** That is exactly "fold at one level." Fang et al. prove
> *why you must not get greedy*: fold a mirror at two independent points in the index and you
> create collisions — two genuinely different positions landing on the same slot with different
> values, silently corrupting the DB. So: **one global canonicalisation, never per-pit.** Add
> this as a guardrail comment in `REPORT-02` §3.

## 3. The retrograde algorithm — counter+propagate, and a verification pass to steal

Their construction (§3) is the **reverse-move / counter style** (Allis-lineage), the alternative
to van der Goot's forward style (`REPORT-07`):

- Each state carries `UnknownChildren` (count of children whose value isn't final) and
  `BestValue`. Edges are **not stored** — recomputed on demand.
- **Three phases:** *initialization* (end states get values; non-end get `Unknown` + child
  count), *propagation* (iterate, each finalized state pushes `value+1` to parents, until a full
  sweep changes nothing — a **fixed point**), *final* (every still-unpropagated state → **draw**,
  since it has a non-loss child it can cycle into).
- **Bottom-up hierarchy:** build each database only after its *supporting* (smaller-piece-set)
  databases are done; a capture is a "conversion" edge into a supporting DB. This is the
  piece-set analogue of REPORT-02's **layer-by-seed-count** ordering, and the **un-propagated →
  draw** final phase is their cycle convention (clean here because values are WDL-class, not
  magnitudes).

The piece worth copying outright is **§3.4, independent verification:**

> "Our verification algorithm traverses the databases once and performs the following
> verification step for each state … verify if its position value is the best value of those
> propagated from its children. This process guarantees the correctness of the databases."

> **For oware-web — add to `REPORT-02` §7:** after building each layer, run **one extra sweep**
> that re-derives every entry's value from its successors (`V(h,turn) == S − min_m V(child)`) and
> asserts equality. It's O(states) and is the single most effective catch for a subtle bug in
> `rank`/`unrank` or the fixed-point — independent of the random-spot-check and "start-evaluates-
> to-draw" checks already listed. Large DBs *do* get silently corrupted by hardware/software
> faults (they cite this); a full verification pass is the standard answer.

## 4. Special rules corrupt the DB — the same lesson as R-06 §3

Chinese chess has "special rules" (indefinite **checking** / **chasing** are forbidden) with no
Western counterpart (§4). The basic algorithm **ignores them**, so some positions it records as
*draw* are really *losses*. Fang et al.'s escape is that in their restricted setting (one armless
side) the special rules can't corrupt the result — the attacking side can always make purposeless
King/defender moves to secure the draw rather than violate a rule.

> **For oware-web:** this is a clean parallel to `REPORT-06` §3's finding that **an endgame DB is
> only correct for a fully-specified ruleset** — model every edge rule (there: checking/chasing;
> in Oware: the repetition and no-move *division* conventions) or the DB's draw/terminal values
> are wrong. It independently reinforces the **per-ruleset-DB** requirement (`REPORT-02` §6.3) and
> the rules-optionality backlog: the "boring" edge rules are exactly the ones that silently
> poison a database.

A smaller rule-changes-value note: Chinese chess **stalemate = loss**, whereas Western chess
stalemate = draw — yet another instance of "a single terminal rule flips outcomes," echoing
`REPORT-10` (Kalah).

## 5. Mining the DB for studies — a learning-component idea

Appendix B trims the state graph to **optimal-move edges only**, yielding the perfect-play
strategy graph; positions with no parent in that trimmed graph are **"sources,"** and the sources
with the *maximum* distance-to-mate are "most interesting to the human" — they use these to
resolve a literature dispute (proving KNP(9)KGM is *Red-to-win*, not the *Black-to-draw* some
human studies claimed).

> **For oware-web:** two reuses. (1) The "trim to optimal edges → find max-value sources" recipe
> is a ready-made **puzzle generator** for the learning component — surface the hardest-won
> endgame positions from our DB as studies. (2) It's a second instance of *mining a perfect DB*
> for human-facing value, complementing van Rijswijck's evaluator mining (`REPORT-08`).

---

## 6. Synthesis — what this cross-game report contributes

It changes no Oware conclusion, but hands the REPORT-02 builder four concrete improvements and
one guardrail:

1. **Guardrail (§2):** fold the 180° symmetry at **exactly one level** (global `(h,turn)`
   canonicalisation) — never per-pit, or the index collides. → `REPORT-02` §3.
2. **Add an independent verification sweep** per layer. → `REPORT-02` §7.
3. **Value-type vocabulary** (WDL / DTC / DTM): note that our magnitude-value is "WDL+magnitude,"
   and a DTC/DTM tiebreak is the route to *fastest* endgame play if ever wanted. → `REPORT-02` §2.
4. **Edge rules poison DBs** — model the repetition/no-move division exactly; reinforces
   per-ruleset DBs. → `REPORT-02` §6.3, `game-evolution-notes.md`.
5. **DB-mining as puzzle generator** for the learning component. → pairs with `REPORT-08`.

### Forward links
- Symmetry halving it guards → `REPORT-04` §2.2, `REPORT-06` §1.2.
- Forward-vs-reverse retrograde (this is the reverse/counter style) → `REPORT-07` (forward style).
- Edge-rules-corrupt-DBs parallel → `REPORT-06` §3; rule-changes-value → `REPORT-10` (Kalah).
- DB mining for human value → `REPORT-08` (van Rijswijck).
