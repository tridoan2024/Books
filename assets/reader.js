
/* DBooks Reader v2 runtime — offline, zero dependencies. */
(function () {
  'use strict';

  /* ---------------- storage ---------------- */
  var NS = 'dbooks:';
  function get(k, d) {
    try { var v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------------- toast ---------------- */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1500);
  }

  /* =======================================================================
     Reading preferences — theme, font size, measure, line height, family
     Applied to <html> so they cascade before first paint where possible.
     ======================================================================= */
  var PREFS = {
    theme:  { key: 'theme',  def: 'dark' },
    size:   { key: 'size',   def: 19,   unit: 'px',  css: '--reader-font-size' },
    measure:{ key: 'measure',def: 72,   unit: 'ch',  css: '--reader-measure' },
    leading:{ key: 'leading',def: 1.75, unit: '',    css: '--reader-line-height' },
    family: { key: 'family', def: 'serif' }
  };
  var FAMILIES = {
    serif: '"Iowan Old Style","Charter","Palatino","Georgia",serif',
    sans:  '-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",sans-serif',
    mono:  '"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace'
  };

  function applyPrefs() {
    var h = document.documentElement;
    h.setAttribute('data-theme', get('theme', 'dark'));
    h.style.setProperty('--reader-font-size',   get('size', 19) + 'px');
    h.style.setProperty('--reader-measure',     get('measure', 72) + 'ch');
    h.style.setProperty('--reader-line-height', get('leading', 1.75));
    h.style.setProperty('--reader-font-family', FAMILIES[get('family', 'serif')] || FAMILIES.serif);
  }
  applyPrefs();

  function bump(key, delta, min, max, label, unit) {
    var v = Math.round((get(key, PREFS[key].def) + delta) * 100) / 100;
    v = Math.max(min, Math.min(max, v));
    set(key, v);
    applyPrefs();
    syncSettingsUI();
    toast(label + ' ' + v + (unit || ''));
  }

  /* =======================================================================
     Syntax highlighting — small hand-rolled tokeniser.
     Every rule uses non-capturing groups so alternation indices stay stable.
     ======================================================================= */
  var G = {};
  G.python = [
    [/#[^\n]*/, 'tok-com'],
    [/(?:'{3}|"{3})[\s\S]*?(?:'{3}|"{3})/, 'tok-str'],
    [/(?:[rbfu]{0,2})(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/, 'tok-str'],
    [/\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|match|case|self|cls)\b/, 'tok-kw'],
    [/@[A-Za-z_]\w*/, 'tok-typ'],
    [/\b[A-Za-z_]\w*(?=\s*\()/, 'tok-fn'],
    [/\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?)\b/, 'tok-num']
  ];
  G.javascript = [
    [/\/\/[^\n]*/, 'tok-com'],
    [/\/\*[\s\S]*?\*\//, 'tok-com'],
    [/`(?:\\.|[^`\\])*`/, 'tok-str'],
    [/(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/, 'tok-str'],
    [/\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|return|set|static|super|switch|this|throw|try|type|typeof|var|void|while|yield|null|undefined|true|false)\b/, 'tok-kw'],
    [/\b[A-Za-z_$][\w$]*(?=\s*\()/, 'tok-fn'],
    [/\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?)\b/, 'tok-num']
  ];
  G.typescript = G.javascript;
  G.json = [
    [/"(?:\\.|[^"\\])*"(?=\s*:)/, 'tok-typ'],
    [/"(?:\\.|[^"\\])*"/, 'tok-str'],
    [/\b(?:true|false|null)\b/, 'tok-kw'],
    [/-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/, 'tok-num']
  ];
  G.bash = [
    [/#[^\n]*/, 'tok-com'],
    [/(?:"(?:\\.|[^"\\])*"|'[^']*')/, 'tok-str'],
    [/\$(?:\{[^}]*\}|[A-Za-z_]\w*|[@*#?$!0-9])/, 'tok-var'],
    [/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|readonly|export|source|set|trap|exit|in)\b/, 'tok-kw'],
    [/(?:^|\n)\s*(?:cd|ls|cat|echo|grep|sed|awk|curl|git|python3?|pip3?|npm|node|cargo|docker|make|mkdir|rm|cp|mv|chmod|find|jq)\b/, 'tok-fn'],
    [/[|&><]{1,2}/, 'tok-op']
  ];
  G.shell = G.bash; G.sh = G.bash; G.zsh = G.bash; G.console = G.bash;
  G.rust = [
    [/\/\/[^\n]*/, 'tok-com'],
    [/\/\*[\s\S]*?\*\//, 'tok-com'],
    [/(?:r#*)?"(?:\\.|[^"\\])*"/, 'tok-str'],
    [/\b(?:as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while)\b/, 'tok-kw'],
    [/\b(?:i8|i16|i32|i64|u8|u16|u32|u64|usize|isize|f32|f64|bool|char|str|String|Vec|Option|Result|Box|Arc|Rc|HashMap)\b/, 'tok-typ'],
    [/#!?\[[^\]]*\]/, 'tok-typ'],
    [/\b[a-z_]\w*(?=\s*(?:::<[^>]*>)?\()/, 'tok-fn'],
    [/\b\d[\d_]*(?:\.\d+)?(?:[iuf](?:8|16|32|64|size))?\b/, 'tok-num']
  ];
  G.go = [
    [/\/\/[^\n]*/, 'tok-com'], [/\/\*[\s\S]*?\*\//, 'tok-com'],
    [/(?:`[^`]*`|"(?:\\.|[^"\\\n])*")/, 'tok-str'],
    [/\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var|nil|true|false)\b/, 'tok-kw'],
    [/\b(?:string|int|int8|int16|int32|int64|uint|byte|rune|float32|float64|bool|error)\b/, 'tok-typ'],
    [/\b[A-Za-z_]\w*(?=\()/, 'tok-fn'],
    [/\b\d[\d_]*\.?\d*\b/, 'tok-num']
  ];
  G.yaml = [
    [/#[^\n]*/, 'tok-com'],
    [/(?:^|\n)\s*-?\s*[A-Za-z_][\w.-]*(?=\s*:)/, 'tok-typ'],
    [/(?:"(?:\\.|[^"\\])*"|'[^']*')/, 'tok-str'],
    [/\b(?:true|false|null|yes|no|on|off)\b/, 'tok-kw'],
    [/\b\d+\.?\d*\b/, 'tok-num']
  ];
  G.yml = G.yaml; G.toml = G.yaml;
  G.sql = [
    [/--[^\n]*/, 'tok-com'],
    [/'(?:''|[^'])*'/, 'tok-str'],
    [/\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AND|OR|NOT|NULL|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|UNION|ALL|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|WITH)\b/i, 'tok-kw'],
    [/\b\d+\.?\d*\b/, 'tok-num']
  ];
  G.html = [
    [/<!--[\s\S]*?-->/, 'tok-com'],
    [/<\/?[A-Za-z][\w-]*/, 'tok-kw'],
    [/(?:"(?:\\.|[^"\\])*"|'[^']*')/, 'tok-str'],
    [/\b[a-z-]+(?==)/, 'tok-typ']
  ];
  G.xml = G.html;
  G.css = [
    [/\/\*[\s\S]*?\*\//, 'tok-com'],
    [/(?:"(?:\\.|[^"\\])*"|'[^']*')/, 'tok-str'],
    [/--[\w-]+/, 'tok-var'],
    [/[.#][\w-]+/, 'tok-typ'],
    [/\b[a-z-]+(?=\s*:)/, 'tok-kw'],
    [/-?\b\d+\.?\d*(?:px|em|rem|%|vh|vw|ch|s|ms|deg)?\b/, 'tok-num']
  ];
  G.diff = [
    [/(?:^|\n)\+[^\n]*/, 'tok-str'],
    [/(?:^|\n)-[^\n]*/, 'tok-op'],
    [/(?:^|\n)@@[^\n]*/, 'tok-fn']
  ];
  G.mermaid = [
    [/%%[^\n]*/, 'tok-com'],
    [/\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|subgraph|end|participant|loop|alt|opt|note)\b/, 'tok-kw'],
    [/(?:"[^"]*"|\[[^\]]*\]|\([^)]*\))/, 'tok-str'],
    [/(?:-->|---|-\.->|==>|\|)/, 'tok-op']
  ];

  var ALIAS = { js: 'javascript', ts: 'typescript', py: 'python', rs: 'rust',
                jsonc: 'json', text: null, txt: null, plain: null, plaintext: null, '': null };

  var reCache = {};
  function grammarRe(lang) {
    if (reCache[lang] !== undefined) return reCache[lang];
    var rules = G[lang];
    if (!rules) return (reCache[lang] = null);
    var src = rules.map(function (r) { return '(' + r[0].source + ')'; }).join('|');
    var flags = 'gm';
    if (rules.some(function (r) { return r[0].flags.indexOf('i') >= 0; })) flags += 'i';
    return (reCache[lang] = new RegExp(src, flags));
  }

  function highlight(code, lang) {
    lang = String(lang || '').toLowerCase();
    if (lang in ALIAS) lang = ALIAS[lang];
    var rules = lang && G[lang];
    var re = lang && grammarRe(lang);
    if (!rules || !re) return esc(code);
    var out = '', last = 0, m, guard = 0;
    re.lastIndex = 0;
    while ((m = re.exec(code)) !== null && guard++ < 40000) {
      if (m[0] === '') { re.lastIndex++; continue; }
      if (m.index < last) continue;
      out += esc(code.slice(last, m.index));
      var cls = '';
      for (var i = 1; i < m.length; i++) { if (m[i] !== undefined) { cls = rules[i - 1][1]; break; } }
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(code.slice(last));
    return out;
  }

  /* =======================================================================
     Code blocks — language chip, copy button, highlighting
     ======================================================================= */
  function enhanceCode(root) {
    $$('pre', root).forEach(function (pre) {
      if (pre.closest('.code-wrap')) return;
      if (pre.hasAttribute('data-mermaid')) return;   // rendered as a diagram instead
      var code = pre.querySelector('code') || pre;
      var lang = '';
      var cls = (code.className || '') + ' ' + (pre.className || '');
      var m = cls.match(/language-([\w+#-]+)/);
      if (m) lang = m[1];
      if (!lang && code.dataset && code.dataset.lang) lang = code.dataset.lang;

      var raw = code.textContent;
      var wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      pre.parentNode.insertBefore(wrap, pre);

      var head = document.createElement('div');
      head.className = 'code-head';
      head.innerHTML = '<span class="code-lang">' + esc(lang || 'text') + '</span>';
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');
      btn.addEventListener('click', function () {
        var done = function () {
          btn.textContent = 'Copied';
          btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(raw).then(done, function () { legacyCopy(raw); done(); });
        } else { legacyCopy(raw); done(); }
      });
      head.appendChild(btn);
      wrap.appendChild(head);
      wrap.appendChild(pre);

      code.innerHTML = highlight(raw, lang);
    });
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* =======================================================================
     Reader page
     ======================================================================= */
  function initReader() {
    var meta = window.DBOOK;
    if (!meta || !meta.chapterFile) return;

    var content = $('#chapter-content');
    var progressFill = $('#progress-fill');
    var body = document.body;
    var pkey = 'pos:' + meta.bookId + ':' + meta.chapterFile;

    initMermaid(content);
    enhanceCode(content);
    buildMiniToc(content);

    /* ---- sidebar state ---- */
    var narrow = window.matchMedia('(max-width: 1000px)').matches;
    if (get('sidebar', true) === false || narrow) body.classList.add('sidebar-collapsed');
    if (get('toc', true) === false || narrow) body.classList.add('toc-hidden');
    if (get('focus', false)) body.classList.add('focus-mode');

    function syncNavigationButtons() {
      [['#btn-sidebar', 'sidebar-collapsed'], ['#btn-toc', 'toc-hidden']].forEach(function (item) {
        var button = $(item[0]);
        if (!button) return;
        var visible = !body.classList.contains(item[1]);
        button.setAttribute('aria-pressed', String(visible));
        button.setAttribute('aria-expanded', String(visible));
      });
    }
    function toggleSidebar() {
      var on = body.classList.toggle('sidebar-collapsed');
      if (!body.classList.contains('reading-fullscreen')) set('sidebar', !on);
      if (!on && window.innerWidth <= 1000) body.classList.add('toc-hidden');
      syncNavigationButtons();
    }
    function toggleToc() {
      var on = body.classList.toggle('toc-hidden');
      if (!body.classList.contains('reading-fullscreen')) set('toc', !on);
      if (!on && window.innerWidth <= 1000) body.classList.add('sidebar-collapsed');
      syncNavigationButtons();
    }
    function toggleFocus() {
      var on = body.classList.toggle('focus-mode');
      set('focus', on);
      var b = $('#btn-focus');
      if (b) b.setAttribute('aria-pressed', String(on));
      toast(on ? 'Focus mode on' : 'Focus mode off');
      if (on) markInView();
    }
    var bs = $('#btn-sidebar'); if (bs) bs.addEventListener('click', toggleSidebar);
    var bt = $('#btn-toc');     if (bt) bt.addEventListener('click', toggleToc);
    syncNavigationButtons();
    var outline = $('.toc');
    if (outline) outline.addEventListener('click', function (event) {
      if (window.innerWidth <= 1000 && event.target.closest('a')) {
        body.classList.add('toc-hidden');
        syncNavigationButtons();
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || window.innerWidth > 1000) return;
      var teacher = document.querySelector('.teacher-panel:not([hidden])');
      if (!teacher) return;
      var button = !body.classList.contains('sidebar-collapsed') ? bs : !body.classList.contains('toc-hidden') ? bt : null;
      body.classList.add('sidebar-collapsed', 'toc-hidden');
      syncNavigationButtons();
      if (button) button.focus();
    });
    var bf = $('#btn-focus');   if (bf) bf.addEventListener('click', toggleFocus);
    initTeacherWidth();
    initReaderFullscreen(syncNavigationButtons);

    /* ---- scroll: progress, position save, chrome auto-hide, scrollspy ---- */
    var lastY = window.scrollY, saveTimer = null, ticking = false;

    function docHeight() {
      return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        var pct = Math.min(100, Math.max(0, (y / docHeight()) * 100));
        if (progressFill) progressFill.style.width = pct.toFixed(2) + '%';

        var top = $('#to-top');
        if (top) top.classList.toggle('show', y > 700);

        /* Header hides while reading downward, returns on any upward move. */
        if (y > 200 && y > lastY + 6) body.classList.add('chrome-hidden');
        else if (y < lastY - 6 || y < 200) body.classList.remove('chrome-hidden');
        lastY = y;

        spy();
        if (body.classList.contains('focus-mode')) markInView();

        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { savePosition(pct, y); }, 320);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    function savePosition(pct, y) {
      set(pkey, { y: y, pct: Math.round(pct) });
      /* The full-book page is a view of the same chapters, not a chapter itself.
         Recording it would corrupt the per-chapter completion count. */
      if (meta.chapterFile === 'full-book.html') return;
      var done = pct >= 92;
      var prog = get('progress:' + meta.bookId, {});
      prog[meta.chapterFile] = { pct: Math.round(pct), done: done, ts: Date.now() };
      set('progress:' + meta.bookId, prog);
      set('last:' + meta.bookId, {
        file: meta.chapterFile, title: meta.chapterTitle,
        number: meta.chapterNumber, pct: Math.round(pct), ts: Date.now()
      });
      var recent = get('recent', []).filter(function (r) { return r.bookId !== meta.bookId; });
      recent.unshift({
        bookId: meta.bookId, bookTitle: meta.bookTitle, href: meta.bookHref,
        file: meta.chapterFile, chapterTitle: meta.chapterTitle,
        number: meta.chapterNumber, pct: Math.round(pct), ts: Date.now()
      });
      set('recent', recent.slice(0, 8));
    }

    /* ---- restore scroll position ---- */
    var saved = get(pkey, null);
    if (saved && saved.y > 60 && !location.hash) {
      window.scrollTo(0, saved.y);
      if (saved.pct > 2 && saved.pct < 95) toast('Resumed at ' + saved.pct + '%');
    }
    onScroll();

    /* ---- mark read chapters in the sidebar ---- */
    var prog = get('progress:' + meta.bookId, {});
    $$('.sidebar a[data-file]').forEach(function (a) {
      var p = prog[a.dataset.file];
      if (p && p.done) a.classList.add('is-read');
    });
    var totalCh = meta.chapterCount || 1;
    var readCh = Object.keys(prog).filter(function (k) { return prog[k].done; }).length;
    var bp = $('#book-progress-fill'), bl = $('#book-progress-label');
    if (bp) bp.style.width = Math.round((readCh / totalCh) * 100) + '%';
    if (bl) bl.textContent = readCh + ' of ' + totalCh + ' chapters read';

    var active = $('.sidebar a.active');
    if (active) active.scrollIntoView({ block: 'center' });

    /* ---- scrollspy for the mini-TOC ---- */
    var heads = $$('h2[id], h3[id]', content);
    var links = $$('.toc a');
    function spy() {
      if (!heads.length) return;
      var y = window.scrollY + 130, cur = heads[0];
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].offsetTop <= y) cur = heads[i]; else break;
      }
      links.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + cur.id);
      });
    }

    /* ---- focus mode: highlight the block nearest the reading line ---- */
    var blocks = $$('#chapter-content > *');
    function markInView() {
      var line = window.scrollY + window.innerHeight * 0.34;
      var best = null, bestD = Infinity;
      blocks.forEach(function (el) {
        el.classList.remove('in-view');
        var d = Math.abs(el.offsetTop + el.offsetHeight / 2 - line);
        if (d < bestD) { bestD = d; best = el; }
      });
      if (best) {
        best.classList.add('in-view');
        var p = best.previousElementSibling, n = best.nextElementSibling;
        if (p) p.classList.add('in-view');
        if (n) n.classList.add('in-view');
      }
    }

    /* ---- keyboard ---- */
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      var mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); return; }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (mod) return;

      switch (e.key) {
        case 'ArrowLeft':  if (meta.prevHref) { e.preventDefault(); go(meta.prevHref); } break;
        case 'ArrowRight': if (meta.nextHref) { e.preventDefault(); go(meta.nextHref); } break;
        case 'j': e.preventDefault(); window.scrollBy({ top: window.innerHeight * 0.22, behavior: 'smooth' }); break;
        case 'k': e.preventDefault(); window.scrollBy({ top: -window.innerHeight * 0.22, behavior: 'smooth' }); break;
        case ' ': if (!e.shiftKey) { e.preventDefault(); window.scrollBy({ top: window.innerHeight * 0.86, behavior: 'smooth' }); } break;
        case 't': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'G': window.scrollTo({ top: docHeight(), behavior: 'smooth' }); break;
        case '/': e.preventDefault(); openPalette(); break;
        case 'f': toggleFocus(); break;
        case 'n': toggleToc(); break;
        case ',': e.preventDefault(); toggleSettings(); break;
        case '=': case '+': bump('size', 1, 15, 26, 'Font size', 'px'); break;
        case '-': bump('size', -1, 15, 26, 'Font size', 'px'); break;
        case '[': bump('measure', -4, 52, 108, 'Line width', 'ch'); break;
        case ']': bump('measure', 4, 52, 108, 'Line width', 'ch'); break;
        case '?': e.preventDefault(); toggleShortcuts(); break;
        case 'Escape': closeAll(); break;
      }
    });

    function go(href) {
      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity 130ms ease';
      setTimeout(function () { location.href = href; }, 110);
    }
    $$('a[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault(); go(a.getAttribute('href'));
      });
    });

    var tt = $('#to-top');
    if (tt) tt.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* ---- full-screen reading, with reversible navigation state ---- */
  function initReaderFullscreen(syncNavigation) {
    var toolbar = $('.header-left'), content = $('.chapter-content');
    if (!toolbar || !content || new URLSearchParams(location.search).get('teacherDetached') === '1') return;
    var body = document.body, active = false, previous = null, ownsFullscreen = false;
    var button = document.createElement('button');
    button.id = 'btn-reader-fullscreen';
    button.type = 'button';
    button.className = 'icon-btn';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg>';
    toolbar.appendChild(button);
    function sync() {
      button.title = active ? 'Exit full-screen reading (Esc)' : 'Full-screen reading';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(active));
      syncNavigation();
    }
    function readingPosition() {
      var elements = $$('h1, h2, h3, p, li, pre, table', content);
      var element = elements.find(function (node) { return node.getBoundingClientRect().bottom > 60; }) || content;
      return { element: element, top: element.getBoundingClientRect().top };
    }
    function restorePosition(position) {
      requestAnimationFrame(function () {
        if (document.contains(position.element)) window.scrollBy({ top: position.element.getBoundingClientRect().top - position.top, behavior: 'instant' });
      });
    }
    async function leave(browserExited) {
      if (!active) return;
      var position = readingPosition();
      active = false;
      body.classList.remove('reading-fullscreen', 'chrome-hidden');
      body.classList.toggle('sidebar-collapsed', previous.sidebar);
      body.classList.toggle('toc-hidden', previous.toc);
      sync();
      var exitBrowser = !browserExited && ownsFullscreen && document.fullscreenElement === document.documentElement;
      ownsFullscreen = false;
      if (exitBrowser) {
        try { await document.exitFullscreen(); } catch (_) {}
      }
      restorePosition(position);
      button.focus({ preventScroll: true });
    }
    button.addEventListener('click', async function () {
      if (active) { leave(false); return; }
      var position = readingPosition();
      previous = { sidebar: body.classList.contains('sidebar-collapsed'), toc: body.classList.contains('toc-hidden') };
      active = true;
      body.classList.add('reading-fullscreen', 'sidebar-collapsed', 'toc-hidden');
      body.classList.remove('chrome-hidden');
      sync();
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          ownsFullscreen = true;
          if (!active) { ownsFullscreen = false; await document.exitFullscreen(); }
        }
        catch (_) { if (active) toast('Reading expanded in this window.'); }
      }
      if (active) restorePosition(position);
    });
    document.addEventListener('fullscreenchange', function () {
      if (active && !document.fullscreenElement) leave(true);
    });
    document.addEventListener('keydown', function (event) {
      if (active && event.key === 'Escape') { event.preventDefault(); leave(false); }
    });
    ['#btn-teacher', '#btn-codex'].forEach(function (selector) {
      var control = $(selector);
      if (control) control.addEventListener('click', function () { if (active) leave(false); }, true);
    });
    sync();
  }


  /* ---- adjustable Teacher / reader divider ---- */
  function initTeacherWidth() {
    if (!$('#btn-teacher') || new URLSearchParams(location.search).get('teacherDetached') === '1') return;
    var body = document.body, panel = null, divider = null, frame = 0;
    var minimum = 360, maximum = minimum, preferred = null, pointer = null;
    var storageKey = 'dbooks:teacher-panel-width';
    try {
      var saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= minimum) preferred = saved;
    } catch (_) {}

    function schedule() {
      if (!frame) frame = requestAnimationFrame(function () { frame = 0; update(); });
    }
    function save() {
      try {
        if (preferred === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, String(preferred));
      } catch (_) {}
    }
    function setWidth(width) {
      preferred = Math.round(Math.max(minimum, Math.min(maximum, width)));
      update();
    }
    function finish(event) {
      if (pointer === null || (event && event.pointerId !== pointer)) return;
      var id = pointer; pointer = null;
      if (divider.hasPointerCapture(id)) divider.releasePointerCapture(id);
      body.classList.remove('teacher-resizing');
      save();
    }
    function install() {
      panel = $('#teacher-panel');
      if (!panel) return;
      divider = document.createElement('div');
      divider.className = 'teacher-width-divider';
      divider.hidden = true;
      divider.tabIndex = 0;
      divider.setAttribute('role', 'separator');
      divider.setAttribute('aria-label', 'Resize Teacher Mode width');
      divider.setAttribute('aria-orientation', 'vertical');
      divider.setAttribute('aria-controls', 'teacher-panel');
      divider.title = 'Drag to resize Teacher Mode. Left/Right arrows adjust; double-click resets.';
      body.appendChild(divider);
      new MutationObserver(schedule).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
      divider.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || event.isPrimary === false || pointer !== null || divider.hidden) return;
        event.preventDefault();
        divider.focus({ preventScroll: true });
        pointer = event.pointerId;
        divider.setPointerCapture(pointer);
        body.classList.add('teacher-resizing');
      });
      divider.addEventListener('pointermove', function (event) {
        if (event.pointerId !== pointer) return;
        setWidth(panel.getBoundingClientRect().right - event.clientX);
      });
      divider.addEventListener('pointerup', finish);
      divider.addEventListener('pointercancel', finish);
      divider.addEventListener('lostpointercapture', finish);
      divider.addEventListener('keydown', function (event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        var width = panel.getBoundingClientRect().width;
        setWidth(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : width + (event.key === 'ArrowLeft' ? 24 : -24));
        save();
      });
      divider.addEventListener('dblclick', function () { preferred = null; save(); update(); });
    }
    function update() {
      if (!panel) install();
      if (!panel) return;
      var available = !panel.hidden && window.innerWidth > 1000 &&
        !body.classList.contains('teacher-detached-window') &&
        !body.classList.contains('teacher-expanded-mode') && !body.classList.contains('codex-terminal-open');
      if (available) {
        var style = getComputedStyle(body), reader = getComputedStyle($('.reader-main'));
        var navigation = (parseFloat(style.getPropertyValue('--teacher-chapters-width')) || 0) +
          (parseFloat(style.getPropertyValue('--teacher-outline-width')) || 0);
        maximum = Math.floor(Math.min(980, document.documentElement.clientWidth - navigation - 400 - parseFloat(reader.paddingLeft) - parseFloat(reader.paddingRight)));
        available = maximum >= minimum;
      }
      body.classList.toggle('teacher-width-split', available);
      divider.hidden = !available;
      if (!available) { finish(); return; }
      var width = Math.round(Math.max(minimum, Math.min(maximum, preferred === null ? Math.min(640, window.innerWidth * 0.4) : preferred)));
      body.style.setProperty('--teacher-panel-width', width + 'px');
      var box = panel.getBoundingClientRect();
      divider.style.left = (box.left - 6) + 'px';
      divider.style.top = Math.max(0, box.top) + 'px';
      divider.style.height = Math.max(0, Math.min(window.innerHeight, box.bottom) - Math.max(0, box.top)) + 'px';
      divider.setAttribute('aria-valuemin', String(minimum));
      divider.setAttribute('aria-valuemax', String(maximum));
      divider.setAttribute('aria-valuenow', String(width));
      divider.setAttribute('aria-valuetext', width + ' pixels');
    }
    new MutationObserver(schedule).observe(body, { childList: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { passive: true });
    update();
  }

  /* ---- mini-TOC ---- */
  function buildMiniToc(content) {
    var host = $('#toc-list');
    if (!host || !content) return;
    var heads = $$('h2, h3', content);
    if (!heads.length) { var t = $('.toc'); if (t) t.style.display = 'none'; return; }
    var frag = document.createDocumentFragment();
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'sec-' + i + '-' + h.textContent.trim().toLowerCase()
        .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.className = h.tagName === 'H3' ? 'h3' : 'h2';
      a.textContent = h.textContent.replace(/^\s*#+\s*/, '');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        document.getElementById(h.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + h.id);
      });
      frag.appendChild(a);
    });
    host.appendChild(frag);
  }

  /* =======================================================================
     Mermaid diagrams — rendered from a locally vendored bundle (no CDN).
     The library is only fetched on pages that actually contain a diagram.
     ======================================================================= */
  var mermaidSources = [];

  function collectMermaid(root) {
    var nodes = $$('pre > code', root).filter(function (c) {
      return /language-mermaid/.test(c.className || '');
    });
    nodes.forEach(function (code) {
      var pre = code.parentNode;
      pre.setAttribute('data-mermaid', '1');
      mermaidSources.push({ pre: pre, text: code.textContent });
    });
    return nodes.length > 0;
  }

  function mermaidTheme() {
    var t = get('theme', 'dark');
    return t === 'sepia' ? 'neutral' : 'dark';
  }

  function renderMermaid() {
    if (!window.mermaid || !mermaidSources.length) return;
    var accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#58a6ff';
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme(),
        securityLevel: 'loose',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        themeVariables: { primaryColor: accent, lineColor: accent, fontSize: '16px' },
        flowchart: { curve: 'basis', useMaxWidth: true },
        sequence: { useMaxWidth: true },
        gantt: { useMaxWidth: true }
      });
    } catch (e) { return; }

    /* Render only what is near the viewport. The full-book page carries a
       hundred-plus diagrams; rendering them all up front costs tens of seconds. */
    if ('IntersectionObserver' in window && !mermaidObserver) {
      mermaidObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var item = en.target.__mmd;
          mermaidObserver.unobserve(en.target);
          if (item) renderOne(item, mermaidSources.indexOf(item));
        });
      }, { rootMargin: '900px 0px' });
    }

    mermaidSources.forEach(function (item, i) {
      var node = item.rendered || item.pre;
      if (!node) return;
      if (mermaidObserver && !item.rendered) {
        node.__mmd = item;
        mermaidObserver.observe(node);
      } else {
        renderOne(item, i);
      }
    });
  }

  var mermaidObserver = null;

  function renderOne(item, i) {
    {
      var id = 'mmd-' + Date.now().toString(36) + '-' + i + '-' + Math.floor(Math.random() * 1e6);
      var done = function (svg) {
        var fig = document.createElement('figure');
        fig.className = 'mermaid-figure';
        fig.innerHTML = svg;

        var bar = document.createElement('figcaption');
        bar.className = 'mermaid-bar';
        var btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.textContent = 'Source';
        var src = document.createElement('pre');
        src.className = 'mermaid-source';
        src.style.display = 'none';
        src.textContent = item.text;
        btn.addEventListener('click', function () {
          var open = src.style.display === 'none';
          src.style.display = open ? 'block' : 'none';
          btn.textContent = open ? 'Hide source' : 'Source';
        });
        bar.appendChild(btn);
        fig.appendChild(bar);
        fig.appendChild(src);

        var target = item.rendered || item.pre;
        if (target && target.parentNode) target.parentNode.replaceChild(fig, target);
        item.rendered = fig;
      };
      try {
        var out = window.mermaid.render(id, item.text);
        if (out && typeof out.then === 'function') {
          out.then(function (r) { done(r.svg); }, function () {});
        } else if (out) {
          done(typeof out === 'string' ? out : out.svg);
        }
      } catch (e) { /* leave the source block in place */ }
    }
  }

  function initMermaid(root) {
    if (!collectMermaid(root)) return;
    var prefix = window.DBOOK_ASSETS || 'assets/';
    var s = document.createElement('script');
    s.src = prefix + 'mermaid.min.js';
    s.async = true;
    s.onload = renderMermaid;
    document.head.appendChild(s);
  }

  /* =======================================================================
     Settings drawer / shortcuts sheet / command palette
     ======================================================================= */
  function syncSettingsUI() {
    var theme = get('theme', 'dark');
    $$('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
    });
    var fam = get('family', 'serif');
    $$('[data-family-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.familySet === fam));
    });
    var s = $('#set-size'), me = $('#set-measure'), le = $('#set-leading');
    if (s) { s.value = get('size', 19); var sl = $('#val-size'); if (sl) sl.textContent = s.value + 'px'; }
    if (me) { me.value = get('measure', 72); var ml = $('#val-measure'); if (ml) ml.textContent = me.value + 'ch'; }
    if (le) { le.value = get('leading', 1.75); var ll = $('#val-leading'); if (ll) ll.textContent = le.value; }
  }

  function toggleSettings(force) {
    var p = $('#settings-panel');
    if (!p) return;
    var open = force !== undefined ? force : !p.classList.contains('open');
    p.classList.toggle('open', open);
    var b = $('#btn-settings');
    if (b) b.setAttribute('aria-pressed', String(open));
    if (open) syncSettingsUI();
  }
  function toggleShortcuts(force) {
    var o = $('#shortcuts-overlay');
    if (!o) return;
    o.classList.toggle('open', force !== undefined ? force : !o.classList.contains('open'));
  }
  function closeAll() {
    toggleSettings(false); toggleShortcuts(false); closePalette();
  }

  function initSettings() {
    var p = $('#settings-panel');
    if (!p) return;
    var b = $('#btn-settings');
    if (b) b.addEventListener('click', function () { toggleSettings(); });
    var bh = $('#btn-help');
    if (bh) bh.addEventListener('click', function () { toggleShortcuts(); });

    $$('[data-theme-set]').forEach(function (el) {
      el.addEventListener('click', function () {
        set('theme', el.dataset.themeSet); applyPrefs(); syncSettingsUI();
        renderMermaid();   /* diagram colours follow the theme */
      });
    });
    $$('[data-family-set]').forEach(function (el) {
      el.addEventListener('click', function () {
        set('family', el.dataset.familySet); applyPrefs(); syncSettingsUI();
      });
    });
    [['#set-size', 'size', 'px', '#val-size'],
     ['#set-measure', 'measure', 'ch', '#val-measure'],
     ['#set-leading', 'leading', '', '#val-leading']].forEach(function (cfg) {
      var el = $(cfg[0]);
      if (!el) return;
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        set(cfg[1], v); applyPrefs();
        var lab = $(cfg[3]); if (lab) lab.textContent = v + cfg[2];
      });
    });
    var rst = $('#btn-reset');
    if (rst) rst.addEventListener('click', function () {
      ['theme', 'size', 'measure', 'leading', 'family'].forEach(function (k) {
        try { localStorage.removeItem(NS + k); } catch (e) {}
      });
      applyPrefs(); syncSettingsUI(); toast('Reading settings reset');
    });
    $$('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { closeAll(); });
    });
    $$('.overlay').forEach(function (o) {
      o.addEventListener('click', function (e) { if (e.target === o) closeAll(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });
    syncSettingsUI();
  }

  /* ---- command palette: jump to any chapter in this book, or any book ---- */
  var palIdx = 0, palItems = [];
  function openPalette() {
    var o = $('#palette-overlay');
    if (!o) return;
    o.classList.add('open');
    var inp = $('#palette-input');
    if (inp) { inp.value = ''; inp.focus(); renderPalette(''); }
  }
  function closePalette() {
    var o = $('#palette-overlay');
    if (!o) return;
    o.classList.remove('open');
    /* Focus must leave the (now hidden) input, otherwise every subsequent
       keystroke is treated as typing and all shortcuts stop responding. */
    var inp = $('#palette-input');
    if (inp) inp.blur();
  }
  function fuzzy(hay, needle) {
    hay = hay.toLowerCase(); needle = needle.toLowerCase().trim();
    if (!needle) return { hit: true, score: 0 };
    if (hay.indexOf(needle) >= 0) return { hit: true, score: 100 - hay.indexOf(needle) };
    var i = 0, score = 0;
    for (var c = 0; c < hay.length && i < needle.length; c++) {
      if (hay[c] === needle[i]) { i++; score += 1; }
    }
    return { hit: i === needle.length, score: score };
  }
  function renderPalette(q) {
    var host = $('#palette-results');
    if (!host) return;
    var src = (window.DBOOK_INDEX || []);
    var rows = [];
    src.forEach(function (it) {
      var f = fuzzy(it.title + ' ' + (it.book || ''), q);
      if (f.hit) rows.push({ it: it, score: f.score });
    });
    rows.sort(function (a, b) { return b.score - a.score; });
    rows = rows.slice(0, 60);
    palItems = rows.map(function (r) { return r.it; });
    palIdx = 0;
    if (!rows.length) { host.innerHTML = '<div class="palette-empty">No matches</div>'; return; }
    host.innerHTML = rows.map(function (r, i) {
      return '<a class="palette-item' + (i === 0 ? ' sel' : '') + '" href="' + esc(r.it.href) + '" data-i="' + i + '">' +
             '<span>' + esc(r.it.title) + '</span>' +
             '<span class="hint">' + esc(r.it.hint || '') + '</span></a>';
    }).join('');
    $$('.palette-item', host).forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        $$('.palette-item', host).forEach(function (x) { x.classList.remove('sel'); });
        el.classList.add('sel'); palIdx = parseInt(el.dataset.i, 10);
      });
    });
  }
  function initPalette() {
    var inp = $('#palette-input');
    if (!inp) return;
    inp.addEventListener('input', function () { renderPalette(inp.value); });
    inp.addEventListener('keydown', function (e) {
      var host = $('#palette-results');
      var els = $$('.palette-item', host);
      if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
        e.preventDefault(); palIdx = Math.min(palIdx + 1, els.length - 1);
      } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
        e.preventDefault(); palIdx = Math.max(palIdx - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (palItems[palIdx]) location.href = palItems[palIdx].href;
        return;
      } else if (e.key === 'Escape') { closePalette(); return; }
      else return;
      els.forEach(function (x, i) { x.classList.toggle('sel', i === palIdx); });
      if (els[palIdx]) els[palIdx].scrollIntoView({ block: 'nearest' });
    });
    var bp = $('#btn-palette');
    if (bp) bp.addEventListener('click', openPalette);
  }

  /* =======================================================================
     Library page
     ======================================================================= */
  function initLibrary() {
    var grid = $('#book-grid');
    if (!grid) return;
    var books = window.DBOOKS || [];
    var cards = $$('.book-card', grid);
    var q = '', cat = 'All', sort = get('librarySort', 'title');

    /* progress badges */
    cards.forEach(function (c) {
      var id = c.dataset.id;
      var total = parseInt(c.dataset.chapters, 10) || 1;
      var prog = get('progress:' + id, {});
      var read = Object.keys(prog).filter(function (k) { return prog[k].done; }).length;
      var pct = Math.round((read / total) * 100);
      c.dataset.progress = pct;
      var fill = $('.card-progress-bar > i', c);
      var lab = $('.card-progress-label', c);
      if (fill) fill.style.width = pct + '%';
      if (lab) lab.textContent = pct > 0 ? pct + '% · ' + read + '/' + total + ' chapters' : 'Not started';
      var last = get('last:' + id, null);
      c.dataset.lastread = last ? last.ts : 0;
    });

    function apply() {
      var shown = 0;
      cards.forEach(function (c) {
        var okCat = cat === 'All' || c.dataset.category === cat;
        var hay = (c.dataset.search || '').toLowerCase();
        var okQ = !q || hay.indexOf(q.toLowerCase()) >= 0;
        var vis = okCat && okQ;
        c.style.display = vis ? '' : 'none';
        if (vis) shown++;
      });
      var empty = $('#empty-state');
      if (empty) empty.style.display = shown ? 'none' : '';
      var sorted = cards.slice().sort(function (a, b) {
        switch (sort) {
          case 'time':     return (+b.dataset.minutes) - (+a.dataset.minutes);
          case 'chapters': return (+b.dataset.chapters) - (+a.dataset.chapters);
          case 'progress': return (+b.dataset.progress) - (+a.dataset.progress);
          case 'lastread': return (+b.dataset.lastread) - (+a.dataset.lastread);
          case 'category': return (a.dataset.category || '').localeCompare(b.dataset.category || '');
          default:         return (a.dataset.title || '').localeCompare(b.dataset.title || '');
        }
      });
      sorted.forEach(function (c) { grid.appendChild(c); });
    }

    var search = $('#library-search');
    if (search) {
      search.addEventListener('input', function () { q = search.value; apply(); });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { search.value = ''; q = ''; apply(); search.blur(); }
      });
    }
    $$('.chip').forEach(function (ch) {
      ch.addEventListener('click', function () {
        cat = ch.dataset.cat;
        $$('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === ch)); });
        apply();
      });
    });
    var sel = $('#library-sort');
    if (sel) {
      sel.value = sort;
      sel.addEventListener('change', function () { sort = sel.value; set('librarySort', sort); apply(); });
    }
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (search) search.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      if (e.key === '?') { e.preventDefault(); toggleShortcuts(); }
      if (e.key === ',') { e.preventDefault(); toggleSettings(); }
    });

    renderContinue();
    apply();
  }

  function renderContinue() {
    var host = $('#continue-grid');
    var sect = $('#continue-section');
    if (!host) return;
    var recent = get('recent', []).slice(0, 3);
    if (!recent.length) { if (sect) sect.style.display = 'none'; return; }
    var meta = {};
    (window.DBOOKS || []).forEach(function (b) { meta[b.id] = b; });
    host.innerHTML = recent.map(function (r) {
      var b = meta[r.bookId] || {};
      var prog = get('progress:' + r.bookId, {});
      var total = b.chapterCount || 1;
      var read = Object.keys(prog).filter(function (k) { return prog[k].done; }).length;
      var pct = Math.round((read / total) * 100);
      return '<a class="book-card resume" style="--card-accent:' + esc(b.coverColor || '#58a6ff') + '"' +
             ' href="' + esc(r.bookId) + '/' + esc(r.file) + '">' +
             '<div class="card-top"><div class="card-icon">' + (b.icon || '📖') + '</div>' +
             '<div><div class="card-title">' + esc(r.bookTitle || b.title || '') + '</div>' +
             '<div class="card-subtitle">Continue where you left off</div></div></div>' +
             '<div class="resume-line">Chapter <b>' + (r.number || '?') + '</b> · ' +
             esc((r.chapterTitle || '').slice(0, 62)) + ' · <b>' + (r.pct || 0) + '%</b> through</div>' +
             '<div class="card-progress"><div class="card-progress-bar"><i style="width:' + pct + '%"></i></div>' +
             '<div class="card-progress-label">' + read + ' of ' + total + ' chapters read</div></div></a>';
    }).join('');
  }

  /* =======================================================================
     Book landing page — progress rings + resume
     ======================================================================= */
  function initBookPage() {
    var list = $('#chapter-list');
    if (!list) return;
    var meta = window.DBOOK_META || {};
    var prog = get('progress:' + meta.id, {});
    var total = 0, read = 0, remaining = 0;

    $$('.chapter-row', list).forEach(function (row) {
      total++;
      var p = prog[row.dataset.file];
      var pct = p ? p.pct : 0;
      var mins = parseInt(row.dataset.minutes, 10) || 0;
      if (p && p.done) { read++; row.classList.add('done'); }
      else remaining += Math.round(mins * (1 - pct / 100));
      var fg = $('.ring .fg', row);
      if (fg) {
        var C = 2 * Math.PI * 6;
        fg.setAttribute('stroke-dasharray', C.toFixed(2));
        fg.setAttribute('stroke-dashoffset', (C * (1 - pct / 100)).toFixed(2));
      }
    });

    var pct = total ? Math.round((read / total) * 100) : 0;
    var f = $('#book-progress-fill'); if (f) f.style.width = pct + '%';
    var l = $('#book-progress-label');
    if (l) l.textContent = pct + '% complete · ' + read + ' of ' + total + ' chapters';
    var rem = $('#remaining-time');
    if (rem) rem.textContent = remaining > 60
      ? '≈' + Math.round(remaining / 60) + 'h ' + (remaining % 60) + 'm remaining'
      : '≈' + remaining + 'm remaining';

    var last = get('last:' + meta.id, null);
    var bar = $('#resume-bar');
    var btn = $('#resume-btn');
    if (last && bar && btn) {
      bar.style.display = '';
      var rm = $('#resume-meta');
      if (rm) rm.innerHTML = 'Last read: <b>Chapter ' + (last.number || '?') + '</b> — ' +
                             esc(last.title || '') + ' · <b>' + (last.pct || 0) + '%</b> through';
      btn.href = last.file;
      btn.textContent = 'Continue reading →';
    } else if (bar && btn) {
      var first = $('.chapter-row', list);
      if (first) { btn.href = first.getAttribute('href'); btn.textContent = 'Start reading →'; }
      var rm2 = $('#resume-meta');
      if (rm2) rm2.textContent = 'You have not opened this book yet.';
    }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initSettings();
    initPalette();
    initReader();
    initLibrary();
    initBookPage();
    document.body.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
