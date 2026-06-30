# Overview Folder — Agent Guide

This folder is a curated mirror of key project files, organized for transparent browsing in the game's "Overview" section. Files here are **copies** — the originals live in their source locations listed below.

## When to update

Re-copy files into this folder whenever:
- A source file is modified
- New files are added to any source location
- A new version is created (bump the `-v1` suffix to `-v2`, etc.)

## Source locations to scan

| Overview subfolder | Source path(s) | What to copy |
|----|----|----|
| `arch/` | `docs/architecture-decisions-v1.md`, `docs/oware-mathematical-architecture.md`, `docs/game-evolution-notes.md` | Architecture and design decision docs. Add `-v1` suffix if not already present. |
| `specs/` | `.kiro/specs/engine-v1-full-build/` | `requirements.md`, `design-v1.md`, `tasks.md` — rename to include `-v1` suffix. |
| `research/` | `docs/research/REPORT-*.md`, `docs/research/BIBLIOGRAPHY.md` | All report markdown files. No suffix needed (reports are numbered). |
| `research/papers/` | `docs/research/papers/*.pdf`, `docs/research/*.pdf` | Academic PDFs. Copy as-is. |
| `engine/` | `tools/oware-rules.mjs`, `tools/build-edb.mjs`, `tools/build-resources.py`, `tools/oware-rules.test.mjs` | Engine source and build tools. Add `-v1` suffix before extension. |
| `tests/helpers/` | `tests/helpers/*.mjs` | Test helper modules. Copy as-is. |
| `tests/properties/` | `tests/properties/*.mjs` | Property-based test files. Copy as-is. |
| `tests/unit/` | `tests/unit/*.mjs` | Unit test files. Copy as-is. |
| `plans/` | `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md` | Agentic implementation plans and design specs. Copy as-is. |
| `config/` | `package.json`, `docs/RESOURCE-CONVENTIONS.md`, `docs/resources-manifest.json` | Project config. Add `-v1` suffix to `package.json` and `resources-manifest.json`. |

## What to skip

- `node_modules/`, `.git/`, `.obsidian/`, `.vscode/` — IDE/tooling internals
- `.github/workflows/` — CI config (not user-facing documentation)
- `index.html` — the game itself (too large, users play it directly)
- `package-lock.json` — dependency lockfile noise

## Version tracking

Files with a `-v1` suffix represent the current version. When a major revision happens:
1. Keep the old version file (rename if archiving)
2. Copy the new version with an incremented suffix (`-v2`, etc.)
3. Update the `RESOURCES.overview.docs` array in `index.html` to point to the new paths

## How the overview UI works

The overview section in `index.html` uses `RESOURCES.overview` to define sections. Each section has:
- `section`: subfolder key matching this folder structure
- `icon`: SVG glyph identifier
- `label`: display name
- `docs[]`: array of `{file, title, summary}` entries

To add a new file to the UI, append an entry to the correct section's `docs` array in the `RESOURCES.overview` object in `index.html`.
