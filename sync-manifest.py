#!/usr/bin/env python3
"""Auto-sync manifest.json with book folders in the repo.

Scans all directories for chapter-*.html files, extracts titles,
and adds/updates entries in manifest.json. Run after pushing new books.

Usage: python3 sync-manifest.py [--push]
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent
MANIFEST = REPO_ROOT / "manifest.json"
PAGES_BASE = "https://tridoan2024.github.io/Books"

# Default cover colors — cycles through these for new books
COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#f85149", "#d29922", "#39d2c0"]
ICONS = ["📘", "📗", "📙", "📕", "📒", "📓"]


def extract_title(html_path: Path) -> str:
    """Extract chapter title from HTML file."""
    content = html_path.read_text(errors="ignore")
    # Try <title> tag first
    m = re.search(r"<title>(.*?)</title>", content)
    if m:
        raw = m.group(1).split("—")[0].strip().split("|")[0].strip()
        raw = re.sub(r"^Chapter \d+:\s*", "", raw)
        raw = re.sub(r"^Appendix [A-G]:\s*", "", raw)
        if raw:
            return raw
    # Fallback: <h1>
    m2 = re.search(r"<h1[^>]*>(.*?)</h1>", content, re.DOTALL)
    if m2:
        raw = re.sub(r"<[^>]+>", "", m2.group(1)).strip()
        raw = re.sub(r"^Chapter \d+:\s*", "", raw)
        raw = re.sub(r"^Appendix [A-G]:\s*", "", raw)
        if raw:
            return raw
    return ""


def extract_book_title(book_dir: Path) -> str:
    """Try to get book title from index.html or first chapter."""
    index = book_dir / "index.html"
    if index.exists():
        content = index.read_text(errors="ignore")
        m = re.search(r"<title>(.*?)</title>", content)
        if m:
            raw = m.group(1).split("—")[0].strip().split("|")[0].strip()
            if raw:
                return raw
    # Fallback: humanize folder name
    return book_dir.name.replace("-", " ").title()


def scan_book(book_dir: Path) -> dict | None:
    """Scan a book directory and return a manifest entry."""
    chapter_htmls = sorted(book_dir.glob("chapter-*.html"))
    if not chapter_htmls:
        return None

    appendix_htmls = sorted(book_dir.glob("appendix-*.html"))
    chapters = []

    for i, html in enumerate(chapter_htmls, 1):
        size_kb = html.stat().st_size // 1024
        title = extract_title(html) or f"Chapter {i}"
        chapters.append({
            "id": html.stem,
            "number": i,
            "title": title,
            "fileName": html.name,
            "readingTimeMinutes": max(5, size_kb // 3),
            "sizeKB": size_kb,
        })

    for j, html in enumerate(appendix_htmls):
        size_kb = html.stat().st_size // 1024
        title = extract_title(html) or f"Appendix {html.stem.replace('appendix-', '').upper()}"
        chapters.append({
            "id": html.stem,
            "number": len(chapter_htmls) + j + 1,
            "title": title,
            "fileName": html.name,
            "readingTimeMinutes": max(3, size_kb // 3),
            "sizeKB": size_kb,
        })

    total_size = sum(c["sizeKB"] for c in chapters)
    total_time = sum(c["readingTimeMinutes"] for c in chapters)
    book_title = extract_book_title(book_dir)

    return {
        "id": book_dir.name,
        "title": book_title,
        "subtitle": "",
        "icon": "📘",
        "author": "Tri Doan",
        "chapterCount": len(chapters),
        "totalReadingTimeMinutes": total_time,
        "totalSizeKB": total_size,
        "coverColor": "#58a6ff",
        "baseURL": f"{PAGES_BASE}/{book_dir.name}",
        "hasFullBook": (book_dir / "full-book.html").exists(),
        "lastUpdated": "",
        "status": "published",
        "chapters": chapters,
    }


def main() -> None:
    push = "--push" in sys.argv

    with open(MANIFEST) as f:
        manifest = json.load(f)

    existing_ids = {b["id"] for b in manifest["books"]}
    color_idx = len(manifest["books"]) % len(COLORS)

    added = []
    updated = []

    for entry in sorted(REPO_ROOT.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        book = scan_book(entry)
        if not book:
            continue

        if book["id"] in existing_ids:
            # Update chapter list and titles for existing books
            for existing in manifest["books"]:
                if existing["id"] == book["id"]:
                    old_count = existing["chapterCount"]
                    existing["chapters"] = book["chapters"]
                    existing["chapterCount"] = book["chapterCount"]
                    existing["totalReadingTimeMinutes"] = book["totalReadingTimeMinutes"]
                    existing["totalSizeKB"] = book["totalSizeKB"]
                    existing["hasFullBook"] = book["hasFullBook"]
                    if old_count != book["chapterCount"]:
                        updated.append(f"{book['id']} ({old_count} → {book['chapterCount']} chapters)")
                    break
        else:
            # New book — assign color and icon
            book["coverColor"] = COLORS[color_idx % len(COLORS)]
            book["icon"] = ICONS[color_idx % len(ICONS)]
            color_idx += 1
            manifest["books"].append(book)
            added.append(f"{book['id']} ({book['chapterCount']} chapters)")

    if not added and not updated:
        print("manifest.json is up to date — no changes needed.")
        return

    with open(MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    if added:
        print(f"Added {len(added)} new book(s):")
        for a in added:
            print(f"  + {a}")
    if updated:
        print(f"Updated {len(updated)} book(s):")
        for u in updated:
            print(f"  ~ {u}")

    if push:
        subprocess.run(["git", "add", "manifest.json"], check=True)
        msg = "Auto-sync manifest.json\n\n"
        if added:
            msg += "Added: " + ", ".join(added) + "\n"
        if updated:
            msg += "Updated: " + ", ".join(updated) + "\n"
        msg += "\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
        subprocess.run(["git", "commit", "-m", msg], check=True)
        subprocess.run(["git", "push", "origin", "main"], check=True)
        print("\nPushed to GitHub.")
    else:
        print("\nRun with --push to commit and push automatically.")


if __name__ == "__main__":
    main()
