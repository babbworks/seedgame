#!/usr/bin/env python3
"""Build docs/resources-manifest.json for the Owaré knowledge rail.

Auto-senses the project's learning materials so new papers and reports appear
in the in-game resource overlays with no code edit:

  * papers       — parsed from docs/research/BIBLIOGRAPHY.md (the registry).
                   Each "### Title" entry that references an existing
                   `papers/<file>.pdf` becomes a paper, with the entry's
                   description paragraph as its summary.
  * reports      — every docs/research/REPORT-*.md, title + summary pulled
                   from its own "# H1" heading and first paragraph.
  * overview     — docs/oware-mathematical-architecture.md (H1 + purpose).
  * bibliography — docs/research/BIBLIOGRAPHY.md itself (H1 + intro).

Run from the repo root:  python3 tools/build-resources.py
Then commit the regenerated docs/resources-manifest.json.

See docs/RESOURCE-CONVENTIONS.md for the authoring rules this script relies on.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAPERS_DIR = os.path.join(ROOT, "docs", "research", "papers")
BIB = os.path.join(ROOT, "docs", "research", "BIBLIOGRAPHY.md")
OUT = os.path.join(ROOT, "docs", "resources-manifest.json")

_EMPH = re.compile(r"\*{1,2}([^*]+)\*{1,2}")          # *i* / **b**
_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")           # [t](u) -> t


def clean(text):
    """Flatten inline markdown to plain text and collapse whitespace."""
    text = _LINK.sub(r"\1", text)
    text = _CODE.sub(r"\1", text)
    text = _EMPH.sub(r"\1", text)
    text = text.replace("✅", "").replace("🔒", "")
    return re.sub(r"\s+", " ", text).strip()


def first_paragraph(lines, start):
    """Join consecutive non-blank lines starting at `start` into one summary."""
    buf = []
    for ln in lines[start:]:
        if ln.strip() == "":
            if buf:
                break
            continue
        if ln.startswith("#") or ln.strip() == "---":
            break
        buf.append(re.sub(r"^[-*+]\s+", "", ln.strip()))   # drop list-item markers
    return clean(" ".join(buf))


def parse_papers():
    """Papers come from the bibliography: any ### entry whose `papers/X.pdf`
    reference exists on disk. Returns list + set of referenced filenames."""
    if not os.path.exists(BIB):
        return [], set()
    lines = open(BIB, encoding="utf-8").read().splitlines()
    # locate entry headings (### ...)
    heads = [i for i, ln in enumerate(lines) if ln.startswith("### ")]
    out, referenced = [], set()
    for n, i in enumerate(heads):
        end = heads[n + 1] if n + 1 < len(heads) else len(lines)
        block = lines[i:end]
        title = clean(lines[i][4:])
        # find a local PDF reference: `papers/<file>.pdf`
        m = None
        meta_idx = i
        for j, ln in enumerate(block):
            mm = re.search(r"`papers/([^`]+\.pdf)`", ln)
            if mm:
                m = mm.group(1)
                meta_idx = i + j
                break
        if not m:
            continue  # gated / link-only entry, no embeddable PDF
        referenced.add(m)
        if not os.path.exists(os.path.join(PAPERS_DIR, m)):
            print("WARN: bibliography references missing PDF: %s" % m, file=sys.stderr)
            continue
        out.append({
            "file": "docs/research/papers/" + m,
            "title": title,
            "summary": first_paragraph(lines, meta_idx + 1),
        })
    return out, referenced


def parse_md_doc(path, strip_prefix=None):
    """Title = first '# ' heading; summary = its first paragraph (or the
    'Purpose of this document:' line if present)."""
    lines = open(path, encoding="utf-8").read().splitlines()
    title, h1_idx = os.path.basename(path), -1
    for i, ln in enumerate(lines):
        if ln.startswith("# "):
            title = clean(ln[2:])
            h1_idx = i
            break
    if strip_prefix:
        title = re.sub(strip_prefix, "", title).strip()
    summary = ""
    for i, ln in enumerate(lines):
        if "Purpose of this document" in ln:
            summary = clean(re.sub(r".*Purpose of this document:?\**", "", ln))
            break
    if not summary and h1_idx >= 0:
        summary = first_paragraph(lines, h1_idx + 1)
    return {"file": os.path.relpath(path, ROOT).replace(os.sep, "/"),
            "title": title, "summary": summary}


def main():
    papers, referenced = parse_papers()

    reports = []
    for p in sorted(glob.glob(os.path.join(ROOT, "docs", "research", "REPORT-*.md"))):
        reports.append(parse_md_doc(p, strip_prefix=r"^Report:?\s*"))

    overview = []
    arch = os.path.join(ROOT, "docs", "oware-mathematical-architecture.md")
    if os.path.exists(arch):
        overview.append(parse_md_doc(arch))

    bibliography = []
    if os.path.exists(BIB):
        bibliography.append(parse_md_doc(BIB))

    manifest = {
        "papers": papers,
        "reports": reports,
        "overview": overview,
        "bibliography": bibliography,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # surface any downloaded PDF that the bibliography never references
    on_disk = {os.path.basename(p) for p in glob.glob(os.path.join(PAPERS_DIR, "*.pdf"))}
    orphans = sorted(on_disk - referenced)
    for o in orphans:
        print("WARN: PDF on disk has no bibliography entry (won't appear): %s" % o,
              file=sys.stderr)

    print("wrote %s — %d papers, %d reports, %d overview, %d bibliography"
          % (os.path.relpath(OUT, ROOT), len(papers), len(reports),
             len(overview), len(bibliography)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
