# Report: Which Solving Procedures Oware Actually Needs (Heule & Rothkrantz)

A close reading of **Heule & Rothkrantz,** *Solving Games: Dependence of Applicable
Solving Procedures* (`papers/Heule-Rothkrantz-Solving-Games-Dependence-of-Applicable-Procedures.pdf`).

Where `REPORT-01` (van den Herik et al.) classifies games by *complexity*, this paper
argues that complexity is the **wrong lens** and replaces it with one centred on *which
solving techniques apply*. For us the payoff is sharp: it tells us, by name, the **only**
technique Oware essentially needs — and the secondary one worth keeping — so we can stop
worrying about the rest.

---

## 1. The central argument: complexity doesn't explain what got solved

REPORT-01's framework ranks games by **state-space** and **game-tree complexity**, and
suggests low-complexity games are easier to solve. Heule & Rothkrantz puncture this with a
single comparison (their Table 1):

| Game | Year solved | State-space | Game-tree | Solution size |
|---|---|---|---|---|
| **qubic** (first solved) | 1980 | 10³⁰ | 10³⁴ | **2.929** |
| **awari** (last solved) | 2003 | 10¹² | 10³² | **8.89 × 10¹¹** |

Qubic has *higher* complexity on **both** axes than Awari, yet was solved **23 years
earlier**. If complexity drove solvability, this is backwards. Their resolution: introduce
**solution size** — the number of positions whose optimal move must be stored in a
*certificate* that proves the game's value. Qubic's winning strategy compresses to ~3
stored decisions; Awari's "solution" is a **178 GB database of ~10¹² positions**. Same
game value (a known result either way), wildly different solution sizes.

> **For oware-web:** internalise *why Oware's solution is huge*. Awari has the **largest
> solution size of any solved game** — because its proof of value essentially *is* a
> tablebase. There is no clever compact certificate; the knowledge lives in the database.
> This is the deepest justification for REPORT-02's whole approach: for Oware, "playing
> perfectly" and "having the endgame database" are nearly the same statement.

`★ Insight ─────────────────────────────────────`
"Solution size" is a more honest metric than complexity for an *engineering* decision.
State-space complexity tells you how big the problem *is*; solution size tells you how big
the *answer you must ship* is. For a 35 MB browser asset, solution size is exactly the
budget that matters — and it's why R-02 truncates to ≤15 seeds rather than chasing the
full 178 GB.
`─────────────────────────────────────────────────`

## 2. The five solving procedures, and Oware's verdict on each

The paper distils the literature into **five categories** of solving procedure, then (in
§4) pairs each with a **game characteristic** that makes it applicable. Here is each, with
the paper's explicit verdict for Awari:

| Procedure | Enabling characteristic | Applies to Oware? |
|---|---|---|
| **Retrograde analysis** | *convergent endgames* (state space shrinks) | **Yes — essential.** Oware is strongly convergent. |
| **Transposition tables** | *equivalent positions* (many paths → one position) | **Yes — secondary.** |
| **Game-tree search** (αβ, PN, DF-PN) | (general) | Used to *play*, but not *essential* to the solution. |
| **Winning threat-sequence** (threat-space, λ-search) | *sudden-death threats* | **No.** Oware has no sudden-death threat. |
| **Winning pattern** | *local endgames* (win decided in a board region) | **No.** Oware's winning strategies are global. |

The paper's **Table 2 (essential procedures)** is unambiguous: for **awari**, the *only*
essential solving procedure is **retrograde analysis**. Its **Table 3 (degree of
application)** scores Awari as retrograde ●●● (maximal), transposition ●, threat-sequence —,
pattern —. And Appendix A's Table 4 details *how* Romein & Bal applied it: retrograde
analysis with **D**ecomposition, **C**ompression, and an **A**synchronous algorithm, plus
**SY**mmetry for the transposition layer.

### 2.1 Why retrograde analysis (convergent endgames)
"Only nine men's morris, awari, checkers, and chess have convergent endgames, so this
technique is only applicable to them." And of those, only **nine men's morris and awari**
have a state space small enough to store the *complete* solution — chess and checkers
endgames must be partial. This is the same convergence argument as REPORT-01, but stated as
a *procedure-selection* rule: convergence is the precondition that *licenses* retrograde
analysis, and Oware satisfies it maximally (seeds only ever leave the board).

### 2.2 Why transposition tables matter, but only secondarily
A position in Oware can be reached by **many** move orders. The paper notes Awari has only
**one symmetry — 180° rotation** (swap the two sides) — and a single piece type, but the
sheer number of transpositions still makes a transposition table worthwhile during search.

> **For oware-web — a concrete optimisation R-02 missed:** that single 180° symmetry is
> exploitable in the *database*, not just in search. A position `(h, turn)` has the same
> game value as its side-swapped mirror with the other player to move. Store only one
> representative of each `{(h,turn), (rotate180(h), turn^1)}` pair and the endgame database
> roughly **halves** — a free ~2× saving on the 35 MB budget. (Fold this into REPORT-02
> §3's rank/unrank: canonicalise to the lexicographically smaller of the two before
> ranking.)

### 2.3 Why threat-sequence and pattern procedures are irrelevant to us
- **Sudden-death threats** (§4.3): the technique that solved qubic and go-moku relies on
  forcing an instant win by an un-blockable threat sequence. Oware has *no* sudden-death
  mechanic — you win by slow material accumulation, not a single killer move. So
  threat-space / λ-search buy nothing here.
- **Local endgames** (§4.4): pattern procedures work when a win is decided in a *region* of
  the board (hex, domineering). In Oware "material progress could sometimes be made locally
  but winning strategies generally have a global nature," so patterns don't apply.

> **For oware-web:** this is a *negative* result you can act on — **don't** invest in
> threat-detection heuristics or pattern libraries for the AI. They are the wrong tools for
> this game's structure. The engine's effort belongs in (1) the endgame database and (2)
> α-β search with a transposition table — precisely the Lithidion stack of REPORT-01.

## 3. The broader taxonomy (context, not directly actionable)

The paper's §5 stress-tests its framework on the modern Gipf-series games (zèrtz, dvonn,
yinsh), arguing they'll resist solution because they break the enabling characteristics —
e.g. dvonn/yinsh have a *placement phase* yielding ~10¹⁷ / ~10¹⁴ starting positions, so
even a per-position solver can't easily reach the true initial value. This is a useful
contrast class but not relevant to Oware, which has a **single fixed start** (the standard
4-per-pit board) — itself a quiet advantage the paper highlights: a fixed start is "very
useful for computer players as they can use an opening book."

The conclusion for the field: chess and go will *not* be strongly solved in the coming
decades because **no existing procedure** can determine their value — new techniques are
required. Oware sits at the opposite extreme: it had exactly the right characteristic
(convergence) for an existing procedure (retrograde analysis), which is why it fell.

---

## 4. Synthesis — what this report changes about our plan

1. **It validates REPORT-02's focus with authority.** Independent of van den Herik, this
   paper concludes the *only* essential procedure for Oware is retrograde analysis. The
   endgame database isn't *a* good idea — it is *the* idea.

2. **It hands us a free ~2× database shrink** (§2.2): exploit the 180° side-swap symmetry
   in the rank/unrank canonicalisation. Action item for REPORT-02 §3.

3. **It scopes the AI's effort by exclusion** (§2.3): transposition table — yes; threat and
   pattern machinery — no. This narrows what `evalState`/search should grow toward.

4. **It reframes "perfect Oware" correctly** (§1): because Oware's *solution size* is the
   largest of any solved game, perfection is inseparable from storage. Our laptop-scale
   N = 15 truncation is the honest middle: a partial certificate that is exact wherever it
   reaches.

### Forward links
- The convergence precondition → `REPORT-01` §"convergent/divergent" and `REPORT-02` §1.
- The symmetry optimisation → fold into `REPORT-02` §3 (rank/unrank).
- The "retrograde analysis is the only technique that matters" verdict is corroborated
  *empirically* in `REPORT-05`: among all learning methods, only retrograde analysis beat
  the Awale grandmaster.
