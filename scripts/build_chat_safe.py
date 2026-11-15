#!/usr/bin/env python3
"""Deterministically package Markdown-only Ghost Busters Chat-Safe. No target code executes."""
import argparse
import json
import pathlib
import re
import stat
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "chat-safe"
MANIFEST = (
    "SKILL.md",
    "references/triage-protocol.md",
    "references/ghost-classes.md",
    "references/cross-layer-contracts.md",
    "references/idempotency.md",
    "references/evidence-and-output.md",
)
CLASS_RE = re.compile(r"^## ([1-9]|1[0-3])\. (.+)$", re.M)
INDEX_RE = re.compile(r"^([1-9]|1[0-3])\. \*\*(.+?)\*\*", re.M)

def validate():
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    skill = (SOURCE / "SKILL.md").read_text(encoding="utf-8")
    if "source-version: " + pkg["version"] not in skill:
        raise ValueError("Chat-Safe source version differs from canonical package")
    canonical = CLASS_RE.findall((ROOT / "references/ghost-classes.md").read_text(encoding="utf-8"))
    included = INDEX_RE.findall((SOURCE / "references/ghost-classes.md").read_text(encoding="utf-8"))
    if len(canonical) != 13 or canonical != included:
        raise ValueError("Chat-Safe class catalogue drifted from canonical 13 classes")
    actual = sorted(str(f.relative_to(SOURCE)).replace("\\", "/") for f in SOURCE.rglob("*") if f.is_file())
    if actual != sorted(MANIFEST):
        raise ValueError("Unapproved Chat-Safe file in source tree: " + repr(actual))
    for rel in MANIFEST:
        src = SOURCE / rel
        if src.is_symlink() or not src.is_file() or not stat.S_ISREG(src.stat().st_mode):
            raise ValueError("Only regular files may be packaged")
        if src.stat().st_size > 32768:
            raise ValueError("Excessively large Chat-Safe source")
        text = src.read_text(encoding="utf-8")
        if "\x00" in text or "~~~sh" in text or "```sh" in text:
            raise ValueError("Executable script formatting is not allowed in Chat-Safe")
    for link in re.findall(r"\]\((references/[^)]+)\)", skill):
        if link not in MANIFEST:
            raise ValueError("Missing referenced Chat-Safe document: " + link)
    return True

def build(out):
    validate()
    out = pathlib.Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for rel in MANIFEST:
            info = zipfile.ZipInfo(rel, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            zf.writestr(info, (SOURCE / rel).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        if tuple(names) != MANIFEST or any(not n.endswith(".md") for n in names):
            raise ValueError("Archive contains unexpected file")
        if zf.testzip() is not None:
            raise ValueError("Archive integrity check failed")
    print(f"Chat-Safe OK: {len(MANIFEST)} Markdown-only files -> {out}")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", default="dist/ghost-busters-chat-safe.zip")
    p.add_argument("--check", action="store_true")
    a = p.parse_args()
    if a.check:
        validate()
        print("Chat-Safe manifest, references, source version and taxonomy OK")
    else:
        build(a.output)

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, UnicodeError) as exc:
        print(f"Chat-Safe rejected: {exc}", file=sys.stderr)
        sys.exit(2)
