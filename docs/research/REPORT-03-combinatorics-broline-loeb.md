# Report: The Pure Mathematics of the Oware Endgame (Broline & Loeb, 1995)

A close reading of **Broline & Loeb (1995),** *The Combinatorics of Mancala-Type
Games: Ayo, Tchoukaillon, and 1/π* (`papers/Broline-Loeb-1995-Combinatorics-of-Mancala-Ayo-Tchoukaillon.pdf`, arXiv:math/9502225).

This is the outlier in the collection: it is **number theory, not search**. Where
REPORT-01/02 ask "how do we make a computer play perfectly," this paper asks "what is
the hidden *structure* of the winning positions themselves." Its relevance to
`oware-web` is mostly to the **pure-math learning component**, not the engine — so this
report is written with that audience in mind.

---

## 1. The setup: "Ayo" is our game, generalised

Ayo (Ayoyayo) is the Yoruba name for the same 6×2, 4-seed game we call Oware/Awari. The
authors generalise to a board with **2n pits** (standard Ayo: n = 6) and number the pits
`−n+2, …, −1, 0, 1, …, n, n+1` (Figure 1). South plays from pits `n+1` down to `2`,
North from `1` down to `−n+2`. Their capture and sowing rules match `index.html`'s
exactly: counter-clockwise sowing, an *Odu* (a pit with ≥ 2n seeds) skips its origin on a
lap, and a capture occurs when the last sown seed lands in an enemy pit holding 2 or 3,
cascading backwards.

> **Note for oware-web:** the paper uses the **2-or-3 capture rule** — the same as the
> project's `learnDemoRules()` (`capture:'23'`). So its results apply directly to the
> learning track's default ruleset, not the `'34'` variant.

## 2. The key abstraction: "determined positions"

The paper does **not** analyse the whole game. It isolates a special, highly-structured
class of endgame — the *determined position* (Definition 1): an arrangement where South
can move so that

- South captures on **every** turn,
- there is never a move from an Odu,
- after every turn North has exactly **one** seed on his side,
- South captures *everything* except a single seed awarded to North.

This is the endgame as a **forced one-sided harvest** — one player methodically strips the
board while the other is reduced to a single shuffling seed. Lemma 2 pins that lone North
seed precisely: it sits in pit 1 when North is to move, pit 0 when South is to move.

`★ Insight ─────────────────────────────────────`
Why study only these positions? Because they are the ones with *no choices left* — play
is forced, so they're a clean combinatorial object. This is a recurring move in solving
games: find the sub-class where the branching collapses, characterise it completely, and
let it anchor everything above it. R-02's endgame database does the computational version
of the same idea; Broline-Loeb do the closed-form version.
`─────────────────────────────────────────────────`

## 3. The bridge: Ayo endgames ≅ a solitaire game (Tchoukaillon)

The paper's pivotal trick (Theorem 3) is a **bijection** between determined Ayo positions
and *winnable* positions of a one-player game called **Tchoukaillon** — a no-wraparound
mancala solitaire where you harvest seeds toward a store (the *Roumba*), and the last seed
of every harvest must land in the Roumba. The rule that makes it tractable:

> In Tchoukaillon, **pit i may be harvested if and only if it contains exactly i seeds.**

Two clean consequences follow:

- **Proposition 4 (the unique winning move):** if a Tchoukaillon position is winnable, the
  *only* winning move is to harvest the **smallest** harvestable pit. There is never a real
  decision — the winning line is unique.
- **Theorem 5 (counting):** for every total `s ≥ 0`, there is **exactly one** winning
  position with `s` seeds. The proof is a constructive bijection between the winning
  position with `s` seeds and the one with `s+1` — you can walk the winning strategy
  *backwards* to enumerate them all.

The authors enumerate the winning positions up to `s = 24` by hand (Figure 4) and up to
`s = 21,286,434` with a short SML program. A concrete fact that lands back in our game:

> **At most 21 seeds can appear in a determined position on a standard 12-pit Ayo board.**

## 4. Periodicity: the surprising regularity (Proposition 6)

Let `p_{i,s}` be the number of seeds in pit `i` of the unique winning position with `s`
seeds. Reading down the columns of the winning-position table reveals a striking pattern:
the content of the first pit depends only on `s mod 2`; the first two pits on `s mod 6`;
the first three on `s mod 12`. In general:

> The sequence of `i`-tuples `(p_{1,s}, …, p_{i,s})` is **periodic with period
> lcm(1, 2, …, i+1)**.

| first `i` pits | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| period | 2 | 6 | 12 | 60 | 60 | 420 | 840 | 2520 | 2520 | 27720 | 27720 |

(Note the ties — pits 4&5, 8&9, 10&11 share a period, because `lcm(1..i+1)` doesn't grow
when `i+2` adds no new prime power.) The proof is an induction using two bookkeeping
identities relating `m_{i,s}` (times pit `i` is harvested) and `b_{i,s}` (times a seed is
added to pit `i`).

## 5. The headline: seeds in a winning position grow like n²/π (Theorem 9)

With `s(n)` = the smallest number of seeds that *forces* an `n`-th pit to be used, the
paper derives:

> **s(n) ~ n²/π + O(n).**

The derivation runs through a hypergeometric identity — the average term sums to
`(n²/4π) · ₂F₁(½,½;2;1)`, and Gauss's summation formula gives `₂F₁(½,½;2;1) = 4`, leaving
`n²/π`. The constant `π` enters via `Γ(½) = √π`. This **proves a conjecture of Erdős and
Jabotinsky** (who had shown `O(n^{4/3})` and conjectured `O(n)` numerically). A companion
fact: the winning positions have an asymptotic **occupancy rate of 2/π ≈ 63.66%**.

`★ Insight ─────────────────────────────────────`
The appearance of `π` in a problem about counting seeds in pits is the paper's own stated
"surprise and satisfaction." This is the kind of result that makes a great learning-app
lesson: a child shuffling seeds is, without knowing it, generating a sequence whose density
is governed by the same `π` that measures circles. The mechanism (a sieve, see below) is
elementary enough to demonstrate interactively.
`─────────────────────────────────────────────────`

## 6. The sieve connection (Section 6)

The numbers `s(n)` can be generated by a **generalised Sieve of Eratosthenes** (Figure 8):
list the integers; repeatedly take the first un-struck number `h`, then strike the 1st and
every `(h+1)`-th remaining number. The ordinary Sieve of Eratosthenes strikes every `p`-th
(not `(p+1)`-th) number and yields the primes, whose `n`-th term grows like `n log n`. That
*one-character difference* in the rule changes the asymptotic from `n log n` to `n²/π` —
a beautiful, demonstrable illustration of how sensitive these processes are to their rules.

---

## 7. What this means for oware-web

Honestly: **little for the engine, a lot for the learning component.**

1. **Engine relevance is narrow.** Determined positions are a *measure-zero slice* of the
   game (forced one-sided harvests). The retrograde database in REPORT-02 already solves
   them — and far more — as a matter of course. There is no shortcut here that beats the
   DB for live play. The one transferable engineering nugget: the **uniqueness of the
   winning move** (Prop 4) and the **≤ 21-seed bound** on determined positions are useful
   sanity checks when validating the DB on forced-capture lines.

2. **Learning component is the real fit.** The project already plans "pure-math lessons
   unlocked by play." This paper is a ready-made curriculum:
   - *Lesson — the unique harvest:* Tchoukaillon's "harvest pit `i` iff it holds `i`
     seeds," and why the smallest pit is always the move. Playable as a solitaire mini-game.
   - *Lesson — hidden periodicity:* show the winning-position table and let the user
     discover the `mod 2`, `mod 6`, `mod 12` patterns themselves.
   - *Lesson — π from seeds:* the `n²/π` density and the 63.66% occupancy — a genuine
     "whoa" moment connecting a board game to a famous constant.
   - *Lesson — two sieves:* the Eratosthenes contrast (`n log n` vs `n²/π`) as a lesson in
     how small rule changes produce wildly different mathematics.

3. **Cultural framing.** Broline learned Ayo while teaching in Ibadan, Nigeria (1975–78);
   the paper treats the game as a serious mathematical object with deep roots. That framing
   suits a teaching tool that wants to present Oware as more than a toy.

### Where this sits relative to the other reports
- The *forced-capture* structure it formalises is exactly the "captures-delayed / hoarding"
  difficulty flagged in `REPORT-01` §2 — but seen from the winning side.
- It shares the **2-3 capture rule** with `REPORT-02`'s default build target.
- It is the only collection item that is *not* about a solving procedure, so it has no
  counterpart in `REPORT-04`'s taxonomy — it is the game's underlying mathematics, not a
  method for solving it.
