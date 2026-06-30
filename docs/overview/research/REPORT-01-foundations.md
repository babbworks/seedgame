# Report: Foundational Papers for an Oware/Awari Engine

A close reading of the first two papers in `docs/research/papers/`, focused on what
they mean for building **oware-web**. Both are by the Maastricht school that defined
how the field talks about "solving" a game.

1. Allis (1994), *Searching for Solutions in Games and Artificial Intelligence* (PhD thesis)
2. van den Herik, Uiterwijk & van Rijswijck (2002), *Games Solved: Now and in the Future*
   (*Artificial Intelligence* 134:277–311)

---

## 1. Allis (1994) — *Searching for Solutions in Games and AI*

### What the thesis is
A 223-page PhD thesis whose research question is: *which games can be solved, and with
what techniques?* It contributes two now-standard search algorithms — **proof-number
(pn) search** and **dependency-based (db) search** — and, crucially for us, the
**vocabulary** the whole field uses to describe a solution. Awari is the thesis's main
experimental testbed for pn-search (§2.4).

### The three solution strengths (the part everyone cites)
Allis fixes three precise meanings of "solved" (his §1.5). This is the single most
important idea to internalise before building an engine, because it tells you *what you
are even trying to achieve*:

| Strength | What is guaranteed | Awari example |
|---|---|---|
| **Ultra-weakly solved** | The game-theoretic *value* of the start position is known — but not necessarily how to achieve it. | "Awari is a draw" (the bare fact). |
| **Weakly solved** | A *strategy* from the start position achieves that value against any defence. | A program that, from move 1, never loses. |
| **Strongly solved** | A strategy achieves the optimal value from *every legal position*. | A full tablebase: perfect play even from a lost/won middlegame. |

Ordering: strong ⊃ weak ⊃ ultra-weak. Allis declares a game "solved" once it is **at
least weakly solved**, and stresses a practical test: a solver should be able to *play
a match and not lose it*. (His cautionary example: Hex is ultra-weakly solved — known
first-player win by a strategy-stealing argument — yet no constructive winning strategy
is known, so it's useless at the board.)

> **For oware-web:** decide your target. An *unbeatable* opponent only needs the **weak**
> solution from the opening (or strong play in the regions you can tablebase). A *teaching*
> tool that grades any position the user reaches wants **strong** play — i.e. an endgame
> database (see paper 2 and the retrograde-analysis papers in this folder).

### Awari as Allis describes it (§2.4.2)
- Two players (North/South), zero-sum, perfect information; one of ~1200 mancala variants.
- Two rows of six pits, four stones each (48 total). Sowing skips the origin pit on a
  full lap. Capture when the last sown stone makes an *enemy* pit hold 2 or 3, cascading
  backwards. Goal: capture the majority of 48.

### Why he used Awari to test pn-search — and the result
Allis chose Awari because its search trees are **non-uniform** (some lines force captures
and collapse quickly; others run long), and because top programs used α-β, giving a fair
baseline. His finding (§2.4.7–2.4.8):

- **For *proving* the game-theoretic value of a position, pn-search beats α-β by a wide
  margin, and the gain factor grows with problem size.** Non-uniform trees reward
  searching toward the "narrowest" proof rather than uniformly deep.
- Domain-specific node initialisation roughly doubled performance; freeing solved
  subtrees roughly halved memory.

He also documents **Lithidion**, the engine he and van der Meulen built: α-β + an
endgame database (first 13 stones, later 17) + an opening book — a gold-medal program
at the 1st Computer Olympiad. That layered architecture (search on top, database
underneath, book in front) is the template every strong mancala engine has followed.

> **For oware-web:** two transferable lessons. (1) **α-β is the right default** for live
> move selection; pn-search is a specialist tool for *proving exact values*, not for
> playing fast. (2) The **Lithidion stack** — opening book → α-β search → endgame DB —
> is the proven architecture. Even a small DB (say ≤15 stones) sharply improves endgame play.

---

## 2. van den Herik, Uiterwijk & van Rijswijck (2002) — *Games Solved*

### What the paper is
The field's standard **survey** of solved two-player perfect-information games. It
catalogues ~25 games by complexity, asks *which characteristics make a game solvable*,
and predicts the near future. (Written just before Awari fell — it predicts Awari "within
a few years," which Romein & Bal confirmed that same year, 2002.)

### The convergent/divergent split — why Awari is "easy"
The paper's organising idea: a game is **convergent** if its state space *shrinks* as
play proceeds, **divergent** if it *grows*.

- **Convergent** (Awari, Kalah, Checkers, Chess endgames): pieces/stones leave the board.
  This is exactly the precondition for **endgame databases via retrograde analysis** —
  you enumerate terminal positions and work *backwards*. Awari is strongly convergent:
  stones only ever leave the board (via capture), never appear.
- **Divergent** (Go, Othello, Hex): pieces are added; you cannot easily build backwards.

> **For oware-web:** this is *the* reason a perfect/near-perfect Oware AI is feasible on
> a laptop while perfect Go is not. Because Oware is convergent, every position with ≤ N
> stones can be exhaustively solved by retrograde analysis and stored. Pick an N your
> storage budget allows; positions at or below it become instant perfect lookups.

### Complexity of Awari (the numbers to know)
From the paper's complexity table:

| Game | State-space complexity | Game-tree complexity |
|---|---|---|
| **Awari** | **≈ 10¹²** | **≈ 10³²** |
| Connect-Four | 10¹⁴ | 10²¹ |
| Checkers | 10²¹ | 10³¹ |
| Chess | 10⁴⁶ | 10¹²³ |

Awari's state space (~10¹²) is *tiny* — the threshold for brute-force enumeration was
~10¹¹ and rising with Moore's law, which is why the full game became enumerable. The
larger game-tree number (~10³²) is why naive forward search alone won't solve it; the
small state space is what makes the **backward** (retrograde + transposition) approach win.

### What the paper reports about Awari specifically (§2.2.1)
- A clean restatement of the rules, including the termination conditions: a player
  with no move, **or** a player reaching **25+ captured stones** (majority of 48), and the
  rule that you must leave the opponent a move if you can ("feeding").
- The historical database arms race: 13-stone (Lithidion) → 35-stone (Marvin, Softwari
  at the 2000 Olympiad) → 36 → 38, with Alberta's 39-stone DB under construction.
- The **36-stone database already proved that the 3-stones-per-pit variant is a draw**,
  and the consensus that the standard 4-per-pit game "tends to be drawn" — correctly
  anticipating the full solve.
- The key difficulty it flags: stones can be **hoarded** and captures *delayed* for many
  moves, so some lines stay far from the database frontier — the hard part of weakly
  solving Awari is bounding how long captures can be postponed.

### Headline conclusions of the paper (its abstract)
1. **Decision (game-tree) complexity matters more than state-space complexity** in
   determining how hard a game is to solve.
2. **Knowledge-based vs. brute-force is a trade-off**: knowledge-based methods suit
   low-decision-complexity games; brute force suits low-state-space games (Awari — low
   state space — is a brute-force/database target, and indeed fell to retrograde analysis).
3. **First-player initiative correlates with solving effort**; e.g. in Kalah 66% of
   configurations are first-player wins. (Awari, by contrast, is a draw — initiative is
   neutralised by the feeding/return rules.)

---

## Synthesis — what these two papers tell us to build

1. **Set the target deliberately** (Allis): unbeatable-from-opening = *weak*; perfect-from-
   anywhere / teaching grader = *strong*. oware-web's learning angle leans toward strong
   play in the endgame.
2. **Architecture = the Lithidion stack** (Allis): opening book → α-β search (iterative
   deepening + transposition table) → endgame database.
3. **The endgame database is the high-leverage component** (both papers): Oware is
   *convergent* with a *~10¹² state space*, so retrograde analysis over ≤ N stones is
   tractable and turns endgames into perfect O(1) lookups. Choose N by storage budget.
4. **Don't expect to "win"** (both): perfect Oware is a **draw**. A perfect engine's job
   is to never lose and to punish every opponent mistake — frame the UX accordingly.
5. **Captures-delayed is the subtle case** (paper 2): hoarding lines stay far from the DB
   frontier; pure forward search struggles there. This is where search depth + good move
   ordering, or a deeper DB, earns its keep.

### Where to go next in this collection
- *How* to build the database → `papers/Set-Based-Retrograde-Analysis-2024.pdf` and the
  Lincke/Romein–Bal items in `BIBLIOGRAPHY.md`.
- *Heuristic eval without a giant DB* → van Rijswijck, *Learning from Perfection*, and
  `papers/Supervised-vs-Unsupervised-ML-Awale-Mancala-Ayo-Player.pdf`.
- *Pure math of the endgame periodicity* → `papers/Broline-Loeb-1995-...pdf`.
