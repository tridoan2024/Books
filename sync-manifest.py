#!/usr/bin/env python3
"""Auto-sync manifest.json AND index.html with book folders in the repo.

Scans all directories for chapter-*.html files, extracts titles,
updates manifest.json, and regenerates the root index.html.

Usage: python3 sync-manifest.py [--push]
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent
MANIFEST = REPO_ROOT / "manifest.json"
INDEX_HTML = REPO_ROOT / "index.html"
PAGES_BASE = "https://tridoan2024.github.io/Books"

# Default cover colors — cycles through these for new books
COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#f85149", "#d29922", "#39d2c0"]
ICONS = ["📘", "📗", "📙", "📕", "📒", "📓"]


def extract_title(html_path: Path) -> str:
    """Extract chapter title from HTML file."""
    content = html_path.read_text(errors="ignore")
    m = re.search(r"<title>(.*?)</title>", content)
    if m:
        raw = m.group(1).split("—")[0].strip().split("|")[0].strip()
        raw = re.sub(r"^Chapter \d+:\s*", "", raw)
        raw = re.sub(r"^Appendix [A-G]:\s*", "", raw)
        if raw:
            return raw
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
    return book_dir.name.replace("-", " ").title()


def extract_book_description(book_dir: Path) -> str:
    """Extract description from book's index.html meta or first paragraph."""
    index = book_dir / "index.html"
    if not index.exists():
        return ""
    content = index.read_text(errors="ignore")
    # Try meta description
    m = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', content)
    if m and m.group(1).strip():
        return m.group(1).strip()
    # Try subtitle/description paragraph
    m2 = re.search(r'class="subtitle"[^>]*>(.*?)</p>', content, re.DOTALL)
    if m2:
        text = re.sub(r"<[^>]+>", "", m2.group(1)).strip()
        if text:
            return text
    return ""


def scan_book(book_dir: Path) -> dict | None:
    """Scan a book directory and return a manifest entry."""
    chapter_htmls = sorted(book_dir.glob("chapter-*.html"))
    if not chapter_htmls:
        return None

    appendix_htmls = sorted(book_dir.glob("appendix-*.html"))
    chapters = []

    for i, html_file in enumerate(chapter_htmls, 1):
        size_kb = html_file.stat().st_size // 1024
        title = extract_title(html_file) or f"Chapter {i}"
        chapters.append({
            "id": html_file.stem,
            "number": i,
            "title": title,
            "fileName": html_file.name,
            "readingTimeMinutes": max(5, size_kb // 3),
            "sizeKB": size_kb,
        })

    for j, html_file in enumerate(appendix_htmls):
        size_kb = html_file.stat().st_size // 1024
        title = extract_title(html_file) or f"Appendix {html_file.stem.replace('appendix-', '').upper()}"
        chapters.append({
            "id": html_file.stem,
            "number": len(chapter_htmls) + j + 1,
            "title": title,
            "fileName": html_file.name,
            "readingTimeMinutes": max(3, size_kb // 3),
            "sizeKB": size_kb,
        })

    total_size = sum(c["sizeKB"] for c in chapters)
    total_time = sum(c["readingTimeMinutes"] for c in chapters)
    book_title = extract_book_title(book_dir)
    description = extract_book_description(book_dir)

    num_chapters = len(chapter_htmls)
    num_appendices = len(appendix_htmls)

    return {
        "id": book_dir.name,
        "title": book_title,
        "subtitle": "",
        "description": description,
        "badge": "",
        "icon": "📘",
        "author": "Tri Doan",
        "chapterCount": len(chapters),
        "numChapters": num_chapters,
        "numAppendices": num_appendices,
        "totalReadingTimeMinutes": total_time,
        "totalSizeKB": total_size,
        "coverColor": "#58a6ff",
        "baseURL": f"{PAGES_BASE}/{book_dir.name}",
        "hasFullBook": (book_dir / "full-book.html").exists(),
        "lastUpdated": "",
        "status": "published",
        "chapters": chapters,
    }


def format_reading_time(minutes: int) -> str:
    """Convert minutes to human-friendly reading time."""
    if minutes < 60:
        return f"~{minutes}m read"
    hours = minutes / 60
    if hours == int(hours):
        return f"~{int(hours)}h read"
    return f"~{hours:.0f}h read"


def format_chapter_meta(book: dict) -> str:
    """Format chapter count string like '22 Chapters + 3 Appendices'."""
    nc = book.get("numChapters", book["chapterCount"])
    na = book.get("numAppendices", 0)
    if nc <= 1 and na == 0:
        # Single-page books (playbooks, briefs)
        badge = book.get("badge", "")
        if any(kw in badge.lower() for kw in ["playbook", "brief", "guide", "plan", "reference"]):
            return badge
        return f"{book['chapterCount']} Chapters"
    parts = f"{nc} Chapters"
    if na > 0:
        parts += f" + {na} Appendices"
    return parts


def generate_index_html(manifest: dict) -> str:
    """Generate the root index.html from manifest data."""
    cards = []
    for book in manifest["books"]:
        book_id = book["id"]
        icon = book.get("icon", "📘")
        title = book["title"]
        desc = book.get("description", "")
        badge = book.get("badge", "")
        chapter_meta = format_chapter_meta(book)
        reading_time = format_reading_time(book["totalReadingTimeMinutes"])

        # Escape HTML entities in description
        desc_escaped = html.escape(desc)
        title_escaped = html.escape(title)
        badge_escaped = html.escape(badge)

        card = f"""    <a href="{book_id}/" class="book-card">
      <h2>{icon} {title_escaped}</h2>
      <p class="desc">{desc_escaped}</p>
      <div class="meta">
        <span>📖 {chapter_meta}</span>
        <span>⏱️ {reading_time}</span>
        <span>📅 2026</span>
        <span class="badge">{badge_escaped}</span>
      </div>
    </a>"""
        cards.append(card)

    cards_html = "\n".join(cards)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tri Doan — Books</title>
<style>
  :root {{ --bg: #0d1117; --card: #161b22; --border: #30363d; --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950; }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; min-height:100vh; }}
  .container {{ max-width:900px; margin:0 auto; padding:60px 24px; }}
  h1 {{ font-size:2.5rem; margin-bottom:8px; }}
  h1 span {{ color:var(--green); }}
  .subtitle {{ color:var(--muted); font-size:1.1rem; margin-bottom:48px; }}
  .books-grid {{ display:grid; gap:24px; }}
  .book-card {{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:32px; transition:border-color 0.2s, transform 0.2s; text-decoration:none; color:inherit; display:block; }}
  .book-card:hover {{ border-color:var(--accent); transform:translateY(-2px); }}
  .book-card h2 {{ font-size:1.4rem; margin-bottom:8px; color:var(--accent); }}
  .book-card .desc {{ color:var(--muted); line-height:1.6; margin-bottom:16px; }}
  .book-card .meta {{ display:flex; gap:16px; color:var(--muted); font-size:0.85rem; flex-wrap:wrap; }}
  .book-card .meta span {{ display:flex; align-items:center; gap:4px; }}
  .badge {{ background:#1f6feb33; color:var(--accent); padding:2px 8px; border-radius:12px; font-size:0.8rem; }}
  footer {{ margin-top:64px; text-align:center; color:var(--muted); font-size:0.85rem; }}
  footer a {{ color:var(--accent); text-decoration:none; }}
</style>
</head>
<body>
<div class="container">
  <h1>📚 Tri Doan — <span>Books</span></h1>
  <p class="subtitle">AI Security, Agent Architecture &amp; Professional Development</p>
  <div class="books-grid">
{cards_html}
  </div>
  <footer>
    <p>&copy; 2026 Tri Doan &middot; <a href="https://x.com/JayDoan39">@JayDoan39</a></p>
  </footer>
</div>
</body>
</html>
"""


def main() -> None:
    push = "--push" in sys.argv

    with open(MANIFEST) as f:
        manifest = json.load(f)

    existing_ids = {b["id"] for b in manifest["books"]}
    color_idx = len(manifest["books"]) % len(COLORS)

    added: list[str] = []
    updated: list[str] = []

    for entry in sorted(REPO_ROOT.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        book = scan_book(entry)
        if not book:
            continue

        if book["id"] in existing_ids:
            for existing in manifest["books"]:
                if existing["id"] == book["id"]:
                    old_count = existing["chapterCount"]
                    existing["chapters"] = book["chapters"]
                    existing["chapterCount"] = book["chapterCount"]
                    existing["numChapters"] = book["numChapters"]
                    existing["numAppendices"] = book["numAppendices"]
                    existing["totalReadingTimeMinutes"] = book["totalReadingTimeMinutes"]
                    existing["totalSizeKB"] = book["totalSizeKB"]
                    existing["hasFullBook"] = book["hasFullBook"]
                    # Backfill description/badge if empty
                    if not existing.get("description") and book["description"]:
                        existing["description"] = book["description"]
                    if old_count != book["chapterCount"]:
                        updated.append(f"{book['id']} ({old_count} → {book['chapterCount']} chapters)")
                    break
        else:
            book["coverColor"] = COLORS[color_idx % len(COLORS)]
            book["icon"] = ICONS[color_idx % len(ICONS)]
            color_idx += 1
            manifest["books"].append(book)
            added.append(f"{book['id']} ({book['chapterCount']} chapters)")

    # Always regenerate index.html from manifest
    index_content = generate_index_html(manifest)
    old_index = INDEX_HTML.read_text(errors="ignore") if INDEX_HTML.exists() else ""
    index_changed = index_content != old_index

    if index_changed:
        INDEX_HTML.write_text(index_content)
        print("Regenerated index.html from manifest.")

    # Write manifest (always, to pick up description/badge/order changes)
    new_manifest = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    old_manifest = MANIFEST.read_text(errors="ignore") if MANIFEST.exists() else ""
    manifest_changed = new_manifest != old_manifest

    if manifest_changed:
        MANIFEST.write_text(new_manifest)

    if not added and not updated and not index_changed and not manifest_changed:
        print("Everything is up to date — no changes needed.")
        return

    if added:
        print(f"Added {len(added)} new book(s):")
        for a in added:
            print(f"  + {a}")
    if updated:
        print(f"Updated {len(updated)} book(s):")
        for u in updated:
            print(f"  ~ {u}")

    if push:
        subprocess.run(["git", "add", "manifest.json", "index.html"], check=True)
        msg = "Auto-sync manifest.json + index.html\n\n"
        if added:
            msg += "Added: " + ", ".join(added) + "\n"
        if updated:
            msg += "Updated: " + ", ".join(updated) + "\n"
        if index_changed:
            msg += "Regenerated index.html\n"
        msg += "\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
        subprocess.run(["git", "commit", "-m", msg], check=True)
        subprocess.run(["git", "push", "origin", "main"], check=True)
        print("\nPushed to GitHub.")
    else:
        print("\nRun with --push to commit and push automatically.")


if __name__ == "__main__":
    main()
