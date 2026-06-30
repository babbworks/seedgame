# Resource Conventions — how the in-game resource rail auto-senses docs

The game's knowledge rail (Papers / Reports / Overview / Bibliography overlays)
is driven by a **generated manifest**, `docs/resources-manifest.json`, built by
`tools/build-resources.py`. Nothing in `index.html` lists individual papers or
reports — the script discovers them from the files below. Follow these
conventions so new material appears automatically.

> **Do not hand-edit `docs/resources-manifest.json`.** It is generated. Run the
> script and commit its output instead.

## Regenerating the manifest

From the repo root:

```bash
python3 tools/build-resources.py
git add docs/resources-manifest.json
```

The script prints a summary and **warns** about any PDF in
`docs/research/papers/` that no bibliography entry references (it would not
appear in the game) and any bibliography reference whose PDF is missing.

## Adding a research paper (→ Papers overlay)

The **bibliography is the registry.** To add a paper:

1. Put the PDF in `docs/research/papers/`.
2. Add an entry to `docs/research/BIBLIOGRAPHY.md` using the existing format:
   - A heading line: `### <Author/year — Title>` (a trailing `✅` or `🔒` is
     fine; it is stripped from the display title).
   - On a line within the entry, reference the local file in backticks:
     `` `papers/<exact-filename>.pdf` `` — the filename must match the file on
     disk exactly. This backtick reference is what marks the paper as
     **downloaded/embeddable**; entries with only a `Link:` (gated `🔒`) are
     skipped.
   - Follow with a short **description paragraph** — its text becomes the
     paper's summary in the overlay.
3. Run the script. The new paper appears with the heading as its title and the
   paragraph as its summary.

A single proceedings PDF referenced by two entries (e.g. the CG 2000 volume)
correctly yields two papers that open the same file — that is intentional.

## Adding a report (→ Reports overlay)

Reports are **self-describing** — no registry needed:

1. Create `docs/research/REPORT-NN-slug.md` (NN keeps them ordered).
2. Start the file with an H1 title: `# <Title>`. A leading `Report:` prefix is
   stripped for display.
3. Make the **first paragraph** after the H1 a one-to-three-sentence summary —
   it becomes the report's summary in the overlay.
4. Run the script.

## Overview & Bibliography

- **Overview** is `docs/oware-mathematical-architecture.md`. Title comes from its
  H1; summary from a `**Purpose of this document:**` line if present, else the
  first paragraph.
- **Bibliography** is `docs/research/BIBLIOGRAPHY.md` itself (H1 + intro
  paragraph).

Both are single fixed documents; their paths live in `tools/build-resources.py`.

## What the manifest looks like

```json
{
  "papers":       [{ "file": "docs/research/papers/X.pdf", "title": "…", "summary": "…" }],
  "reports":      [{ "file": "docs/research/REPORT-01-….md", "title": "…", "summary": "…" }],
  "overview":     [{ "file": "docs/oware-mathematical-architecture.md", "title": "…", "summary": "…" }],
  "bibliography": [{ "file": "docs/research/BIBLIOGRAPHY.md", "title": "…", "summary": "…" }]
}
```

`file` is the path from the served site root, so the page can `fetch` markdown
and `iframe` PDFs directly. The page reads this at startup; if the fetch fails
(pure `file://` with no server) the overlays show a graceful empty state.
