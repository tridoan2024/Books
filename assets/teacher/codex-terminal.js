(function () {
  "use strict";

  var launch = document.getElementById("btn-codex");
  if (!launch || !window.Terminal) return;

  var panel = document.createElement("section");
  panel.className = "codex-terminal-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Codex study terminal");
  panel.innerHTML =
    '<div class="codex-terminal-resizer" role="separator" aria-label="Resize Codex terminal" aria-orientation="vertical" tabindex="0"></div>' +
    '<header><div><span>CODEX STUDY TERMINAL</span><strong>Ask while you read or listen</strong></div>' +
    '<div class="codex-terminal-actions"><i>Connecting…</i><button type="button" data-codex-action="pause">Pause lesson</button><button type="button" data-codex-action="context">Ask about this</button><button type="button" data-codex-action="hide">Hide</button></div></header>' +
    '<div class="codex-live-context" aria-live="polite"></div>' +
    '<form class="codex-question"><input aria-label="Question for Codex" placeholder="Ask about this chapter…"><button type="submit">Ask</button></form>' +
    '<div class="codex-terminal-hint">Chapter context is added automatically. Latest/current questions may use web search. The session stays active when hidden.</div>' +
    '<div class="codex-terminal-screen"></div>';
  var readerShell = document.querySelector(".reader-shell");
  (readerShell || document.body).appendChild(panel);

  var screen = panel.querySelector(".codex-terminal-screen");
  var status = panel.querySelector("header i");
  var terminal = null;
  var socket = null;
  var socketSeq = 0;
  var isReady = false;
  var initialized = false;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECTS = 5;
  var connectedLabel = "Connected";
  var questionForm = panel.querySelector(".codex-question");
  var questionInput = questionForm.querySelector("input");
  var contextStatus = panel.querySelector(".codex-live-context");
  var resizer = panel.querySelector(".codex-terminal-resizer");
  var pauseButton = panel.querySelector('[data-codex-action="pause"]');
  pauseButton.hidden = !document.getElementById("btn-teacher");
  var contextTimer = null;
  var remoteLectureContext = null;
  var remoteLectureSeenAt = 0;
  if (window.BroadcastChannel && window.DBOOK && window.DBOOK.bookId) {
    var lectureChapter = (window.DBOOK.chapterFile || "").replace(/\.html$/, "");
    var lectureContextChannel = new BroadcastChannel("dbooks-lecture:" + window.DBOOK.bookId + "-" + lectureChapter);
    lectureContextChannel.onmessage = function (event) {
      if (!event.data) return;
      if (event.data.type === "lecture-detached-closed") {
        remoteLectureContext = null; remoteLectureSeenAt = 0;
      } else if (event.data.type === "lecture-state" && event.data.detached) {
        remoteLectureContext = event.data.context; remoteLectureSeenAt = Date.now();
      }
      updateContextStatus();
    };
  }

  try {
    var savedWidth = Number(localStorage.getItem("dbooks:codex-terminal-width"));
    if (savedWidth) document.documentElement.style.setProperty("--codex-terminal-width", savedWidth + "px");
  } catch (_) {}

  function dimensions() {
    return {
      cols: Math.max(40, Math.floor(screen.clientWidth / 8.1)),
      rows: Math.max(12, Math.floor(screen.clientHeight / 17))
    };
  }

  function resize() {
    if (!terminal || panel.hidden) return;
    var size = dimensions();
    if (size.cols === terminal.cols && size.rows === terminal.rows) return;
    terminal.resize(size.cols, size.rows);
    if (isReady && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
    }
  }

  function localServerUrl() {
    var httpPort = window.DBOOKS_TEACHER_PORT || 8765;
    var meta = window.DBOOK || {};
    var bookPath = "";
    if (meta.bookId) {
      var chapterName = (meta.chapterFile || "").replace(/[^a-zA-Z0-9._-]/g, "") || "index.html";
      bookPath = encodeURIComponent(meta.bookId) + "/" + chapterName;
    } else {
      var match = location.pathname.match(/\/writtenbooks\/(.+)$/);
      if (match) {
        bookPath = match[1].split("/").filter(Boolean).map(encodeURIComponent).join("/");
      } else {
        var parts = location.pathname.split("/").filter(Boolean);
        bookPath = parts.slice(-2).map(encodeURIComponent).join("/");
      }
    }
    var url = new URL("http://127.0.0.1:" + httpPort + "/" + bookPath);
    url.search = location.search;
    url.searchParams.set("codex", "1");
    url.hash = location.hash;
    return url.href;
  }

  function connect() {
    clearTimeout(reconnectTimer);

    if (location.protocol === "file:") {
      var httpUrl = localServerUrl();
      status.textContent = "Local HTTP required";
      status.className = "disconnected";

      var httpLink = panel.querySelector(".codex-file-http-link");
      if (!httpLink) {
        httpLink = document.createElement("a");
        httpLink.className = "codex-file-http-link";
        httpLink.target = "_blank";
        httpLink.style.cssText = "display:block;padding:6px 14px;background:#161b22;border-bottom:1px solid #30363d;color:#58a6ff;font-size:12px;text-decoration:underline;";
        panel.insertBefore(httpLink, questionForm);
      }
      httpLink.href = httpUrl;
      httpLink.textContent = "Open on local server: " + httpUrl;

      if (terminal) {
        terminal.writeln("\r\n\x1b[33mCodex study terminal requires the local HTTP server.\x1b[0m");
        terminal.writeln("This app rejects file:// origins; use its trusted local HTTP page.\r\n");
        terminal.writeln("Open this chapter on the local server instead:");
        terminal.writeln("\x1b[36m" + httpUrl + "\x1b[0m\r\n");
      }
      return;
    }

    var existingLink = panel.querySelector(".codex-file-http-link");
    if (existingLink) existingLink.remove();

    var host = location.hostname || "127.0.0.1";
    var terminalPort = window.DBOOKS_CODEX_PORT || 8766;
    var socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    var socketUrl = socketProtocol + "//" + host + ":" + terminalPort;

    var currentSeq = ++socketSeq;
    var currentSocket = null;
    var hasTimedOut = false;
    var hasFailed = false;
    var hasClosed = false;
    isReady = false;

    try {
      currentSocket = new WebSocket(socketUrl);
    } catch (err) {
      status.textContent = "Connection failed";
      status.className = "disconnected";
      if (terminal) {
        terminal.writeln("\r\n\x1b[31mFailed to construct WebSocket: " + (err && err.message ? err.message : String(err)) + "\x1b[0m");
      }
      return;
    }

    socket = currentSocket;
    currentSocket.binaryType = "arraybuffer";
    status.textContent = "Connecting…";
    status.className = "";

    var connectionTimeout = setTimeout(function () {
      if (socketSeq !== currentSeq) return;
      if (!isReady) {
        hasTimedOut = true;
        status.textContent = "Terminal unavailable — restart BookReader";
        status.className = "disconnected";
        if (terminal) {
          terminal.writeln("\r\n\x1b[31mTerminal unavailable — restart BookReader\x1b[0m");
        }
        try { currentSocket.close(1000, "Terminal connection ended"); } catch (_) {}
      }
    }, 4000);

    currentSocket.onopen = function () {
      if (socketSeq !== currentSeq) return;
      var size = dimensions();
      currentSocket.send(JSON.stringify({ cols: size.cols, rows: size.rows }));
    };

    currentSocket.onmessage = function (event) {
      if (socketSeq !== currentSeq || hasTimedOut || hasFailed || hasClosed) return;
      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data));
        return;
      }
      try {
        var message = JSON.parse(event.data);
        if (message.type === "ready") {
          if (hasTimedOut) return;
          clearTimeout(connectionTimeout);
          isReady = true;
          reconnectAttempts = 0;
          connectedLabel = "Connected · " + (message.model || "Codex") + (message.reasoning_effort ? " · " + message.reasoning_effort : "");
          status.textContent = connectedLabel;
          status.className = "connected";
          terminal.focus();
        } else if (message.type === "error") {
          clearTimeout(connectionTimeout);
          hasFailed = true;
          isReady = false;
          terminal.writeln("\r\n\x1b[31m" + message.message + "\x1b[0m");
          status.textContent = "Error: " + (message.message || "Server error");
          status.className = "disconnected";
          try { currentSocket.close(1000, "Terminal connection ended"); } catch (_) {}
        }
      } catch (_) {
        terminal.write(event.data);
      }
    };

    currentSocket.onclose = function () {
      if (socketSeq !== currentSeq) return;
      clearTimeout(connectionTimeout);
      hasClosed = true;
      isReady = false;
      if (!hasTimedOut && !hasFailed) {
        status.textContent = "Disconnected";
        status.className = "disconnected";
      }
      clearTimeout(reconnectTimer);
      if (!hasTimedOut && !hasFailed && reconnectAttempts < MAX_RECONNECTS) {
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, 1800);
      } else if (!hasTimedOut && !hasFailed) {
        status.textContent = "Disconnected — click Codex to reconnect";
        if (terminal) {
          terminal.writeln("\r\n\x1b[33mConnection lost. Click Codex to reconnect.\x1b[0m");
        }
      }
    };

    currentSocket.onerror = function () {
      if (socketSeq !== currentSeq) return;
      try { currentSocket.close(1000, "Terminal connection ended"); } catch (_) {}
    };
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    terminal = new window.Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 6000,
      theme: {
        background: "#0d1117", foreground: "#e6edf3", cursor: "#a371f7",
        selectionBackground: "#3b2766", blue: "#58a6ff", green: "#3fb950",
        red: "#f85149", yellow: "#d29922", magenta: "#bc8cff", cyan: "#39c5cf"
      }
    });
    terminal.open(screen);
    terminal.onData(function (data) {
      if (isReady && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data: data }));
      }
    });
    new ResizeObserver(resize).observe(screen);
    connect();
  }

  function show() {
    if (location.protocol === "file:") {
      location.assign(localServerUrl());
      return;
    }
    initialize();
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      if (location.protocol !== "file:") {
        reconnectAttempts = 0;
        connect();
      }
    }
    panel.hidden = false;
    document.body.classList.add("codex-terminal-open");
    if (window.innerWidth > 700) {
      var defaultWidth = Math.min(576, window.innerWidth * (window.innerWidth <= 1100 ? 0.46 : window.innerWidth <= 1700 ? 0.38 : 0.32));
      setTerminalWidth(savedWidth || defaultWidth);
    }
    launch.setAttribute("aria-pressed", "true");
    updateContextStatus();
    clearInterval(contextTimer);
    contextTimer = setInterval(updateContextStatus, 1000);
    requestAnimationFrame(function () { resize(); terminal.focus(); });
  }

  function hide() {
    panel.hidden = true;
    document.body.classList.remove("codex-terminal-open");
    clearInterval(contextTimer);
    launch.setAttribute("aria-pressed", "false");
    launch.focus();
  }

  function cleanText(element) {
    return element ? element.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function learningContext() {
    if (remoteLectureContext && Date.now() - remoteLectureSeenAt < 60000) return remoteLectureContext;
    var teacher = document.querySelector(".teacher-panel");
    var audio = teacher && teacher.querySelector("audio");
    var boardItems = teacher ? Array.prototype.map.call(
      teacher.querySelectorAll(".teacher-board-element, .teacher-board-boundary"), cleanText
    ).filter(Boolean) : [];
    return {
      position: cleanText(teacher && teacher.querySelector(".teacher-status")),
      role: cleanText(teacher && teacher.querySelector(".teacher-map span")),
      beat: cleanText(teacher && teacher.querySelector(".teacher-map strong")),
      objective: cleanText(teacher && teacher.querySelector(".teacher-map small")),
      phrase: cleanText(teacher && teacher.querySelector(".teacher-phrase.active, .teacher-sentence.active")),
      boardQuestion: cleanText(teacher && teacher.querySelector(".teacher-board h3")),
      boardItems: boardItems.slice(0, 12),
      audioSeconds: audio && isFinite(audio.currentTime) ? Math.round(audio.currentTime) : null
    };
  }

  function updateContextStatus() {
    var context = learningContext();
    var meta = window.DBOOK || {};
    if (context.beat) {
      contextStatus.textContent = "Following lecture · " + context.position + " · " + context.role + ": " + context.beat;
      contextStatus.classList.add("live");
    } else {
      contextStatus.textContent = "Reading context · " + (meta.chapterTitle || "Current chapter");
      contextStatus.classList.remove("live");
    }
  }

  function setTerminalWidth(width) {
    var minimum = window.innerWidth > 1100 ? 390 : 340;
    var maximum = Math.max(minimum, Math.min(760, window.innerWidth - 560));
    var next = Math.round(Math.max(minimum, Math.min(maximum, width)));
    savedWidth = next;
    document.documentElement.style.setProperty("--codex-terminal-width", next + "px");
    try { localStorage.setItem("dbooks:codex-terminal-width", String(next)); } catch (_) {}
    requestAnimationFrame(resize);
  }

  resizer.addEventListener("pointerdown", function (event) {
    if (window.innerWidth <= 700) return;
    event.preventDefault();
    resizer.classList.add("dragging");
    function move(pointerEvent) { setTerminalWidth(window.innerWidth - pointerEvent.clientX); }
    function finish() {
      resizer.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  });
  resizer.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    setTerminalWidth((savedWidth || panel.getBoundingClientRect().width) + (event.key === "ArrowLeft" ? 32 : -32));
  });

  var tocCollapse = document.querySelector(".toc-collapse");
  if (tocCollapse) tocCollapse.addEventListener("click", function () {
    var headerToggle = document.getElementById("btn-toc");
    if (headerToggle) headerToggle.click();
  });

  function contextualPrompt(question) {
    var meta = window.DBOOK || {};
    var chapterFile = String(meta.chapterFile || "").replace(/[^a-zA-Z0-9._-]/g, "");
    var chapterTitle = String(meta.chapterTitle || "this chapter");
    var source = chapterFile ? "chapters/" + chapterFile.replace(/\.html$/, ".md") : "the current chapter";
    var context = learningContext();
    var lectureContext = context.beat ? " Live lecture context: position=" + context.position +
      "; role=" + context.role + "; beat=" + context.beat + "; objective=" + context.objective +
      (context.audioSeconds === null ? "" : "; audioTime=" + context.audioSeconds + "s") +
      "; activePhrase=" + context.phrase + "; whiteboardQuestion=" + context.boardQuestion +
      "; currentBoard=" + context.boardItems.join(" -> ") + "." : "";
    return "Book context: " + String(meta.bookTitle || "AI Technical Prep") + ". Current chapter: " + chapterTitle +
      "; source: " + source + ". Read that exact file first; do not scan the repository." + lectureContext +
      " Follow AGENTS.md: give a technically detailed staff-level answer, use internal knowledge, and search/cite the web only for current information. Question: " + question;
  }

  function submitPrompt(prompt) {
    var offset = 0;
    var targetSocket = socket;
    var targetSeq = socketSeq;
    status.textContent = "Sending chapter context…";
    function sendChunk() {
      if (!isReady || socketSeq !== targetSeq || !targetSocket || targetSocket.readyState !== WebSocket.OPEN) return;
      if (offset < prompt.length) {
        targetSocket.send(JSON.stringify({ type: "input", data: prompt.slice(offset, offset + 8) }));
        offset += 8;
        setTimeout(sendChunk, 8);
        return;
      }
      setTimeout(function () {
        if (isReady && socketSeq === targetSeq && targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.send(JSON.stringify({ type: "input", data: "\r" }));
          status.textContent = connectedLabel;
        }
      }, 180);
    }
    sendChunk();
  }

  questionForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var question = questionInput.value.trim();
    if (!question || !isReady || !socket || socket.readyState !== WebSocket.OPEN) return;
    submitPrompt(contextualPrompt(question));
    questionInput.value = "";
    terminal.focus();
  });

  launch.addEventListener("click", function () { panel.hidden ? show() : hide(); });
  pauseButton.addEventListener("click", function () {
    var audio = document.querySelector(".teacher-panel audio");
    var playButton = document.querySelector('.teacher-panel [data-action="play"]');
    if (audio && !audio.paused && playButton) playButton.click();
    if (terminal) terminal.focus();
  });
  panel.querySelector('[data-codex-action="context"]').addEventListener("click", function () {
    var selected = String(window.getSelection ? window.getSelection() : "").trim();
    var context = learningContext();
    var subject = selected || context.phrase || context.beat || (window.DBOOK && window.DBOOK.chapterTitle) || "this chapter";
    questionInput.value = 'Explain this more deeply: "' + subject.replace(/\s+/g, " ").slice(0, 900) + '"';
    questionInput.focus();
  });
  panel.querySelector('[data-codex-action="hide"]').addEventListener("click", hide);
  if (location.protocol !== "file:" && new URLSearchParams(location.search).get("codex") === "1") {
    show();
  }
}());
