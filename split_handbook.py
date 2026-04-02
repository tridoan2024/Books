#!/usr/bin/env python3
"""Split the Claude Code Handbook into individual chapter pages for mobile compatibility."""

import re
import os
from pathlib import Path

SRC = Path("/tmp/books-ref/claude-code-handbook/index.html")
OUT = Path("/tmp/books-ref/claude-code-handbook")

html = SRC.read_text(encoding="utf-8")
lines = html.split("\n")

# --- Extract structure ---

# Find CSS block (lines 8-381 approx)
style_start = html.index("<style>")
style_end = html.index("</style>") + len("</style>")
css_block = html[style_start:style_end]

# Find JS block
js_start = html.index("<script>")
js_end = html.index("</script>") + len("</script>")
js_block = html[js_start:js_end]

# Find main content boundaries
main_start = html.index('<main class="main">')
main_end = html.index("</main>")
main_content = html[main_start + len('<main class="main">'):main_end]

# Find header HTML
header_start = html.index('<header class="site-header"')
header_end = html.index('</header>') + len('</header>')
header_html = html[header_start:header_end]

# Find scroll indicator
scroll_start = html.index('<div class="scroll-indicator"')
scroll_end = html.index('</div>', scroll_start) + len('</div>')
# Need the inner div too
scroll_end = html.index('</div>', scroll_end) + len('</div>')
scroll_html = html[scroll_start:scroll_end]

# --- Parse chapters with their Part headings ---

# Find only actual chapter/part H1 boundaries (not example H1s in content)
h1_pattern = re.compile(r'<h1\s+id="((?:chapter|part)-[^"]+)"[^>]*>(.*?)</h1>', re.DOTALL)
matches = list(h1_pattern.finditer(main_content))

chapters = []  # list of {id, title, short_title, is_part, content, part_title}
current_part = ""

for i, m in enumerate(matches):
    h1_id = m.group(1)
    raw_title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
    raw_title = re.sub(r'[¶].*', '', raw_title).strip()
    raw_title = re.sub(r'~\d+ min read', '', raw_title).strip()
    
    is_part = "part-" in h1_id and "chapter" not in h1_id
    
    # Content from this H1 to the next H1 (or end)
    start = m.start()
    end = matches[i + 1].start() if i + 1 < len(matches) else len(main_content)
    content = main_content[start:end].strip()
    
    if is_part:
        current_part = raw_title
        # Don't create standalone pages for part dividers — prepend to next chapter
        continue
    
    chapters.append({
        "id": h1_id,
        "title": raw_title,
        "short_title": raw_title.split(":", 1)[-1].strip() if ":" in raw_title else raw_title,
        "content": content,
        "part_title": current_part,
        "part_prepend": "",
    })

# Prepend part headings to the first chapter of each part
current_part_seen = set()
for i, m in enumerate(matches):
    h1_id = m.group(1)
    is_part = "part-" in h1_id and "chapter" not in h1_id
    if is_part:
        raw_title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        raw_title = re.sub(r'[¶].*', '', raw_title).strip()
        start = m.start()
        end = m.end()
        part_html = main_content[start:end]
        # Find the next chapter and prepend
        for ch in chapters:
            if ch["part_title"] == raw_title and raw_title not in current_part_seen:
                ch["part_prepend"] = part_html + "\n"
                current_part_seen.add(raw_title)
                break

# --- Parse sidebar and rebuild for multi-page ---

sidebar_start = html.index('<nav class="sidebar"')
sidebar_end = html.index('</nav>', sidebar_start) + len('</nav>')
sidebar_html = html[sidebar_start:sidebar_end]

# Build chapter-to-file mapping
ch_file_map = {}
for i, ch in enumerate(chapters):
    filename = f"chapter-{i+1:02d}.html"
    ch_file_map[ch["id"]] = filename
    # Also map part IDs to the first chapter of that part
    if ch["part_prepend"]:
        part_id_match = re.search(r'id="([^"]+)"', ch["part_prepend"])
        if part_id_match:
            ch_file_map[part_id_match.group(1)] = filename


def build_sidebar_for_chapter(current_idx: int) -> str:
    """Rebuild sidebar with links pointing to chapter files."""
    s = sidebar_html
    
    # Replace all href="#xxx" with href="chapter-NN.html" or "chapter-NN.html#xxx"
    def replace_href(m):
        anchor = m.group(1)
        # Check if it's a chapter or part ID
        if anchor in ch_file_map:
            target_file = ch_file_map[anchor]
            return f'href="{target_file}"'
        # It's a section within a chapter — find which chapter it belongs to
        # Search backwards through chapters to find the containing one
        for j in range(len(chapters) - 1, -1, -1):
            if f'id="{anchor}"' in chapters[j]["content"] or f"id='{anchor}'" in chapters[j]["content"]:
                target_file = f"chapter-{j+1:02d}.html"
                return f'href="{target_file}#{anchor}"'
        return m.group(0)  # leave unchanged if not found
    
    s = re.sub(r'href="#([^"]+)"', replace_href, s)
    
    # Highlight current chapter's sidebar link
    current_id = chapters[current_idx]["id"]
    current_file = f"chapter-{current_idx+1:02d}.html"
    s = s.replace(f'href="{current_file}"', f'href="{current_file}" class="active"')
    
    return s


def build_chapter_nav(idx: int) -> str:
    """Build prev/next navigation at bottom of chapter."""
    nav = '<div class="chapter-nav-bottom" style="display:flex;justify-content:space-between;padding:2rem 0;margin-top:3rem;border-top:1px solid var(--border);">'
    if idx > 0:
        prev_file = f"chapter-{idx:02d}.html"
        prev_title = chapters[idx - 1]["short_title"]
        if len(prev_title) > 50:
            prev_title = prev_title[:47] + "…"
        nav += f'<a href="{prev_file}" style="text-decoration:none;color:var(--accent-blue);">← {prev_title}</a>'
    else:
        nav += '<span></span>'
    
    if idx < len(chapters) - 1:
        next_file = f"chapter-{idx+2:02d}.html"
        next_title = chapters[idx + 1]["short_title"]
        if len(next_title) > 50:
            next_title = next_title[:47] + "…"
        nav += f'<a href="{next_file}" style="text-decoration:none;color:var(--accent-blue);text-align:right;">{next_title} →</a>'
    else:
        nav += '<span></span>'
    
    nav += '</div>'
    return nav


def build_header_for_chapter(idx: int) -> str:
    """Rebuild header with correct prev/next for this chapter."""
    h = header_html
    # Update prev/next button onclick to navigate to files
    if idx > 0:
        prev_file = f"chapter-{idx:02d}.html"
        h = h.replace("navChapter(-1)", f"location.href='{prev_file}'")
    if idx < len(chapters) - 1:
        next_file = f"chapter-{idx+2:02d}.html"
        h = h.replace("navChapter(1)", f"location.href='{next_file}'")
    return h


# --- Additional CSS for mobile optimization ---
mobile_css = """
<style>
  /* Override for split pages - reduce memory usage */
  img { max-width: 100%; height: auto; }
  .main { min-height: 80vh; }
</style>
"""

# --- Generate chapter pages ---

for i, ch in enumerate(chapters):
    filename = f"chapter-{i+1:02d}.html"
    filepath = OUT / filename
    
    sidebar = build_sidebar_for_chapter(i)
    chapter_nav = build_chapter_nav(i)
    header = build_header_for_chapter(i)
    
    # Simplified JS for single-chapter page
    page_js = """<script>
(function(){
  // Scroll indicator
  var bar=document.querySelector('.scroll-indicator .bar');
  function updateBar(){
    var s=window.scrollY,h=document.documentElement.scrollHeight-window.innerHeight;
    bar.style.width=h>0?(s/h*100)+'%':'0%';
  }
  
  // Back to top
  var btt=document.getElementById('back-to-top');
  function updateBtt(){if(btt)btt.style.display=window.scrollY>400?'flex':'none';}
  
  // Sidebar toggle
  window.toggleSidebar=function(){
    var s=document.getElementById('sidebar'),o=document.querySelector('.sidebar-overlay');
    if(s){s.classList.toggle('open');if(o)o.classList.toggle('active');}
  };
  
  // Copy code
  window.copyCode=function(b){
    var c=b.parentElement.querySelector('code');if(!c)return;
    navigator.clipboard.writeText(c.textContent).then(function(){
      var o=b.textContent;b.textContent='✓ Copied';b.style.color='var(--accent-green)';
      setTimeout(function(){b.textContent=o;b.style.color='';},2000);
    });
  };
  
  // Close sidebar on link click (mobile)
  document.querySelectorAll('.sidebar a').forEach(function(a){
    a.addEventListener('click',function(){
      if(window.innerWidth<=1024){
        var s=document.getElementById('sidebar'),o=document.querySelector('.sidebar-overlay');
        if(s)s.classList.remove('open');if(o)o.classList.remove('active');
      }
    });
  });
  
  // Highlight active sidebar section on scroll
  var sections=document.querySelectorAll('h1[id],h2[id],h3[id]');
  var sidebarLinks=document.querySelectorAll('.sidebar a');
  var linkMap={};
  sidebarLinks.forEach(function(l){
    var h=l.getAttribute('href');
    if(h){var id=h.split('#').pop();if(id)linkMap[id]=l;}
  });
  
  function highlightSection(){
    var current='';
    sections.forEach(function(s){
      if(window.scrollY>=s.offsetTop-100)current=s.id;
    });
    sidebarLinks.forEach(function(l){l.classList.remove('active');});
    if(current&&linkMap[current])linkMap[current].classList.add('active');
  }
  
  var tk=false;
  window.addEventListener('scroll',function(){
    if(!tk){requestAnimationFrame(function(){updateBar();updateBtt();highlightSection();tk=false;});tk=true;}
  });
  updateBar();
})();
</script>"""
    
    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{ch['title']} — Claude Code Handbook</title>
<meta name="author" content="Tri Doan">
{css_block}
{mobile_css}
</head>
<body>
{scroll_html}
{header}
<div class="sidebar-overlay" onclick="toggleSidebar()"></div>
{sidebar}
<main class="main">
{ch['part_prepend']}{ch['content']}
{chapter_nav}
</main>
<footer class="doc-footer">
  <p>© 2026 Tri Doan. <a href="index.html">Back to Table of Contents</a></p>
</footer>
<a href="#" id="back-to-top" style="display:none;position:fixed;bottom:2rem;right:2rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border);border-radius:50%;width:44px;height:44px;align-items:center;justify-content:center;text-decoration:none;font-size:1.2rem;z-index:99;">↑</a>
{page_js}
</body>
</html>"""
    
    filepath.write_text(page, encoding="utf-8")
    size_kb = filepath.stat().st_size / 1024
    print(f"  ✓ {filename} ({size_kb:.0f} KB) — {ch['title']}")

# --- Build new index.html (table of contents) ---

toc_items = []
current_part = ""
for i, ch in enumerate(chapters):
    if ch["part_title"] != current_part:
        current_part = ch["part_title"]
        toc_items.append(f'    <div class="toc-part">{current_part}</div>')
    
    filename = f"chapter-{i+1:02d}.html"
    reading_time_match = re.search(r'~(\d+) min read', ch["content"][:500])
    reading_time = f'~{reading_time_match.group(1)} min' if reading_time_match else ""
    
    toc_items.append(f'    <a href="{filename}" class="toc-chapter">'
                     f'<span class="toc-num">Ch {i+1}</span>'
                     f'<span class="toc-title">{ch["short_title"]}</span>'
                     f'<span class="toc-time">{reading_time}</span></a>')

toc_html = "\n".join(toc_items)

index_page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Application Development Using Claude Code — The Professional Handbook</title>
<meta name="author" content="Tri Doan">
<style>
  :root {{
    --bg: #0d1117; --card: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950;
  }}
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; min-height:100vh; }}
  .container {{ max-width:800px; margin:0 auto; padding:48px 24px; }}
  h1 {{ font-size:2rem; margin-bottom:8px; line-height:1.3; }}
  h1 .icon {{ font-size:1.5rem; }}
  .subtitle {{ color:var(--muted); font-size:1rem; margin-bottom:12px; }}
  .meta-bar {{ display:flex; gap:16px; color:var(--muted); font-size:0.85rem; margin-bottom:40px; flex-wrap:wrap; }}
  .back-link {{ display:inline-block; margin-bottom:24px; color:var(--accent); text-decoration:none; font-size:0.9rem; }}
  .back-link:hover {{ text-decoration:underline; }}
  .toc {{ display:flex; flex-direction:column; gap:2px; }}
  .toc-part {{
    font-size:0.8rem; font-weight:700; color:var(--green); text-transform:uppercase;
    letter-spacing:1px; padding:20px 0 8px; margin-top:8px;
    border-top:1px solid var(--border);
  }}
  .toc-part:first-child {{ border-top:none; margin-top:0; }}
  .toc-chapter {{
    display:flex; align-items:center; gap:12px; padding:10px 16px;
    text-decoration:none; color:var(--text); border-radius:8px;
    transition:background 0.15s;
  }}
  .toc-chapter:hover {{ background:var(--card); }}
  .toc-chapter:active {{ background:var(--border); }}
  .toc-num {{ color:var(--muted); font-size:0.8rem; min-width:40px; font-weight:600; }}
  .toc-title {{ flex:1; font-size:0.95rem; }}
  .toc-time {{ color:var(--muted); font-size:0.75rem; white-space:nowrap; }}
  footer {{ margin-top:48px; text-align:center; color:var(--muted); font-size:0.8rem; padding:24px 0; border-top:1px solid var(--border); }}
  footer a {{ color:var(--accent); text-decoration:none; }}
</style>
</head>
<body>
<div class="container">
  <a href="../" class="back-link">← All Books</a>
  <h1><span class="icon">⚡</span> Application Development Using Claude Code</h1>
  <p class="subtitle">The Professional Handbook</p>
  <div class="meta-bar">
    <span>📖 30 Chapters</span>
    <span>⏱️ ~10h total read</span>
    <span>✍️ Tri Doan</span>
    <span>📅 2026</span>
  </div>
  <div class="toc">
{toc_html}
  </div>
</div>
<footer>
  <p>© 2026 Tri Doan · <a href="../">Back to Library</a></p>
</footer>
</body>
</html>"""

index_path = OUT / "index.html"
# Backup original
orig_backup = OUT / "full-book.html"
if not orig_backup.exists():
    import shutil
    shutil.copy2(index_path, orig_backup)
    print(f"\n  📦 Backed up original as full-book.html ({orig_backup.stat().st_size / 1024 / 1024:.1f} MB)")

index_path.write_text(index_page, encoding="utf-8")
print(f"  ✓ index.html (TOC) — {index_path.stat().st_size / 1024:.0f} KB")

print(f"\n✅ Split complete: {len(chapters)} chapter pages + 1 TOC")
print(f"   Largest single page vs original:")
sizes = [(f.name, f.stat().st_size) for f in OUT.glob("chapter-*.html")]
sizes.sort(key=lambda x: -x[1])
print(f"   Original: {orig_backup.stat().st_size / 1024:.0f} KB")
print(f"   Largest:  {sizes[0][0]} = {sizes[0][1] / 1024:.0f} KB")
print(f"   Smallest: {sizes[-1][0]} = {sizes[-1][1] / 1024:.0f} KB")
