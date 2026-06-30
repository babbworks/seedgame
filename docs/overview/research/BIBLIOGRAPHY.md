# Oware / Awari — Mathematics & Game-Theory Bibliography

Research collection for the `oware-web` project. Downloaded PDFs live in `./papers/`.
Gated items list a stable link instead.

Oware is the canonical variant of **Awari** (the academic name for the 6×2, 4-seeds
mancala game). Almost all rigorous mathematical work uses "Awari" or "Ayo", so search
on those terms. The headline result: **Awari is a draw under perfect play** (Romein &
Bal, 2002), making it one of the larger games ever *strongly solved*.

---

## Tier 1 — The core results (downloaded ✅)

### Allis (1994) — *Searching for Solutions in Games and Artificial Intelligence* ✅
`papers/Allis-1994-Searching-for-Solutions-in-Games-and-AI.pdf` · 223 pp · PhD thesis, U. Limburg
The foundational text on *solving* games. Defines the three solution strengths —
**ultra-weak, weak, strong** — that frame every result below, and introduces
proof-number search. Chapter on Awari estimates the search space and argues it is
"close to solvable." Read this first for the conceptual vocabulary.

### Herik, Uiterwijk & van Rijswijck (2002) — *Games Solved: Now and in the Future* ✅
`papers/Herik-Uiterwijk-Rijswijck-2002-Games-Solved-Now-and-in-the-Future.pdf` · 35 pp · *Artificial Intelligence* 134
The standard survey. Tabulates state-space and game-tree complexities for ~25 games
(Awari among them) and the techniques used to solve each. Best single overview of
*where Awari sits* in the landscape of solved games.

### Broline & Loeb (1995) — *The Combinatorics of Mancala-Type Games: Ayo, Tchoukaillon, and 1/π* ✅
`papers/Broline-Loeb-1995-Combinatorics-of-Mancala-Ayo-Tchoukaillon.pdf` · 15 pp · arXiv:math/9502225
The most *purely mathematical* item here. Analyses sowing/capture endgames as a
solitaire (Tchoukaillon), derives the periodicity of winning pit-occupancy patterns,
and proves the seed count in a winning position grows asymptotically like **n²/π**.
This is combinatorics/number theory, not search — complements the AI papers.

---

## Tier 2 — Solving methods & endgame databases

### Heule & Rothkrantz — *Solving Games: Dependence of Applicable Solving Procedures* ✅
`papers/Heule-Rothkrantz-Solving-Games-Dependence-of-Applicable-Procedures.pdf` · 28 pp
Maps which solving techniques (retrograde analysis, αβ, proof-number, databases) apply
to which game properties (convergent vs. divergent, etc.). Awari is *convergent* (seed
count never increases until a capture), which is exactly why retrograde analysis works.

### *Set-Based Retrograde Analysis* (2024) ✅
`papers/Set-Based-Retrograde-Analysis-2024.pdf` · 10 pp · arXiv:2411.09089
Modern (symbolic/BDD-style) take on the retrograde-analysis algorithm that solved Awari.
Useful if you ever want to compute or compress your own endgame tablebases.

### van der Goot (2000) — *Awari Retrograde Analysis* ✅
`papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf` (chapter) · CG 2000, LNCS 2063
A focused account of building an Awari endgame database by retrograde analysis — closer to
our scale than the full Romein & Bal solve, and a direct how-to companion to `REPORT-02`.
*(Bonus paper obtained inside the CG 2000 proceedings.)* → reviewed in `REPORT-07`.

### Fang, Hsu & Hsu (2000) — *Construction of Chinese Chess Endgame Databases by Retrograde Analysis* ✅
`papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf` (p. 96) · CG 2000, LNCS 2063
*Not* Awari, but the only other hands-on retrograde-DB construction paper in the pile — indexing,
symmetry, and decomposition techniques for a convergent game. → reviewed in `REPORT-11` (cross-game
methods reference: the one-level symmetry-folding caveat + an independent verification pass for
`REPORT-02`).

### Romein & Bal (2002) — *Awari Is Solved* — ICGA Journal 25(3):162–165 🔒
Link: <https://research.vu.nl/en/publications/awari-is-solved>
The 4-page announcement: Awari is a **draw**; the unique optimal opening is the
rightmost pit (pit 6). *(Open PDF not reachable — CiteSeerX is down, ResearchGate gated.
Request via the VU repository or the authors.)*

### Romein & Bal (2003) — *Solving the Game of Awari using Parallel Retrograde Analysis* — IEEE *Computer* 38(10):26–33 🔒
Link: <https://research.vu.nl/en/publications/solving-the-game-of-awari-using-parallel-retrograde-analysis>
DOI: 10.1109/MC.2003.1236468
The full method paper. Computed all **889 billion** reachable positions; the master
database is 204 billion entries / 178 GB. The definitive engineering account of the solve.

### Lincke (2002) — *Exploring the Computational Limits of Large Exhaustive Search Problems* ✅
`papers/Lincke-2002-Computational-Limits-Exhaustive-Search.pdf` · 118 pp · ETH Zürich PhD thesis
Author of **Marvin** (Computer Olympiad 2000 gold). Deep treatment of retrograde analysis
with limited memory and the at-least-draw / at-most-draw / cycle-draw value representation —
the single most relevant gated item now in hand, and a primary source for `REPORT-02`'s
database design. *(Retrieved from the ETH Research Collection DSpace API.)* → reviewed in `REPORT-06`.

### Lincke & Marzetta (2000) — *Large Endgame Databases with Limited Memory Space* — ICGA Journal 23(3):131–138 🔒
DOI: 10.3233/ICG-2000-23302. The disk-I/O-efficient, one-bit-per-position DB algorithm
that powered Awari engines before the full solve.

---

## Tier 3 — Evaluation functions, learning & AI players

### van Rijswijck (2000) — *Learning from Perfection: A Data Mining Approach to Evaluation Function Learning in Awari* ✅
`papers/CG2000-Proceedings-LNCS2063-Computers-and-Games.pdf` (Chapter 8) · CG 2000, LNCS 2063
Mines the *perfect* endgame databases to learn a human-free evaluation function (engine
**Bambam**, U. Alberta). Directly relevant if you want a strong heuristic AI without
shipping a 178 GB tablebase. *(Obtained inside the full CG 2000 proceedings, downloaded
unrestricted from the Internet Archive.)* → reviewed in `REPORT-08`.

### Supervised vs. Unsupervised ML for an Awale/Mancala/Ayo Player ✅
`papers/Supervised-vs-Unsupervised-ML-Awale-Mancala-Ayo-Player.pdf` · 10 pp · arXiv:1309.1543
Compares learning techniques for evolving an Awari-playing agent. A practical, modern
reference for a web-game-sized AI opponent. → reviewed in `REPORT-05`.

### Daoud, Kharma, Haidar & Popoola (2004) — *Ayo, the Awari Player, or How Better Representation Trumps Deeper Search* ✅
`papers/Daoud-et-al-2004-Ayo-the-Awari-Player-Representation-Trumps-Search.pdf` · 6 pp · IEEE CEC 2004
Argues a richer *board representation* beats raw search depth for an Awari player — directly
relevant to whether `oware-web`'s `evalState` features matter more than ply count.
→ reviewed in `REPORT-09`.

### Donkers, Uiterwijk & de Voogt — *Mancala Games: Topics in Mathematics and Artificial Intelligence* 🔒
Maastricht University survey of the whole mancala family (rules taxonomy, complexity,
solving status). Link: <https://www.researchgate.net/publication/239523032>

### Irving, Donkers & Uiterwijk (2000) — *Solving Kalah* — ICGA Journal 23(3):139–146 ✅
`papers/Irving-Donkers-Uiterwijk-2000-Solving-Kalah.pdf` · 9 pp
Sister result on the Kalah variant (Kalah(6,6): first player wins by 2). Good contrast
for *how the variant's rules change the game value*. Uses iterative-deepening MTD(f) with
move ordering, transposition tables, futility pruning, enhanced transposition cut-off, and
endgame databases. *(Retrieved from the first author's site, naml.us.)* → reviewed in
`REPORT-10` (the canonical "how rule changes flip a game's value" case).

---

## Reference / starting points
- Awari — Chessprogramming Wiki: <https://www.chessprogramming.org/Awari> (best link hub)
- Solved game — Wikipedia: <https://en.wikipedia.org/wiki/Solved_game>
- Mancala World wiki (Oware / Awari Oracle): <https://mancala.fandom.com/wiki/Oware>

## Notes on access
`🔒` = no open PDF found via automated download (paywall, ResearchGate login, or a
JavaScript-only repository). Links point at the most stable landing page; most are
retrievable through an institutional login or by emailing the authors.

### Acquisition round — 2026-06-28
Pulled four previously-gated items into `papers/`:
- **Lincke (2002)** thesis — via the ETH Research Collection DSpace REST API.
- **Irving et al. (2000)** *Solving Kalah* — from the first author's site (naml.us).
- **van Rijswijck (2000)** *Learning from Perfection* **and** **van der Goot (2000)**
  *Awari Retrograde Analysis* — both inside the **CG 2000 proceedings** (LNCS 2063),
  downloaded unrestricted from the Internet Archive.

**Still gated 🔒 (no open PDF located):** Romein & Bal (2002) *Awari Is Solved* and (2003)
*Parallel Retrograde Analysis* — ICGA/IEEE, confirmed no open-access PDF via Semantic
Scholar; Lincke & Marzetta (2000) — ICGA; Donkers, Uiterwijk & de Voogt — *Mancala Games*
survey (ResearchGate). Their key results are nonetheless covered secondhand by the Lincke
thesis, the ML survey (`REPORT-05`), and Heule & Rothkrantz (`REPORT-04`).
