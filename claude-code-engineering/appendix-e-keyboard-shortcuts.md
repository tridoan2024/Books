# Appendix E: Keyboard Shortcuts Reference

## 50+ Keyboard Shortcuts by Context

Claude Code's input handling is built on a layered keybinding system. Each context -- global navigation, prompt editing, vim mode, output scrolling, task management, and file picking -- maintains its own keymap. When contexts overlap, the most specific context wins: a `j` keystroke in vim normal mode triggers cursor-down, not the global "scroll output" behavior.

This appendix documents every keybinding across all six contexts. The **Rebindable** column indicates whether users can override the binding in `settings.json` under the `keybindings` key. Core navigation bindings are locked to prevent users from breaking fundamental UI interactions.

---

### Global

These bindings work regardless of which UI panel has focus. They control session-level actions, context switching, and application lifecycle.

| Key | Action | Rebindable |
|-----|--------|------------|
| `Ctrl+C` | Interrupt current generation or cancel input | No |
| `Ctrl+D` | Exit session (when prompt is empty) | No |
| `Ctrl+L` | Clear terminal screen (preserves conversation state) | Yes |
| `Ctrl+Z` | Suspend to shell (resume with `fg`) | No |
| `Escape` | Cancel current generation; exit current mode | No |
| `Escape, Escape` | Double-escape: force-stop generation even during tool execution | No |
| `Tab` | Autocomplete file paths after `@` mention, or commands after `/` | No |
| `Shift+Tab` | Reverse cycle through autocomplete suggestions | No |
| `Ctrl+R` | Reverse search through prompt history | Yes |
| `Up Arrow` | Recall previous prompt from history (when prompt is empty) | No |
| `Down Arrow` | Recall next prompt from history (when navigating history) | No |
| `Ctrl+\` | Toggle sidebar panel (context visualizer, task list) | Yes |
| `Ctrl+T` | Toggle between light and dark theme | Yes |
| `F1` | Show keyboard shortcut help overlay | Yes |
| `Ctrl+Shift+P` | Open command palette (slash command search) | Yes |

### Prompt Input

These bindings are active when the cursor is in the main prompt input area, operating in the default (non-vim) editing mode.

| Key | Action | Rebindable |
|-----|--------|------------|
| `Enter` | Submit prompt to the agent | No |
| `Shift+Enter` | Insert newline (multiline editing) | No |
| `Ctrl+A` | Move cursor to beginning of line | No |
| `Ctrl+E` | Move cursor to end of line | No |
| `Ctrl+U` | Delete from cursor to beginning of line | No |
| `Ctrl+K` | Delete from cursor to end of line | No |
| `Ctrl+W` | Delete word before cursor | No |
| `Alt+Backspace` | Delete word before cursor (macOS alt behavior) | No |
| `Ctrl+B` | Move cursor back one character | No |
| `Ctrl+F` | Move cursor forward one character | No |
| `Alt+B` | Move cursor back one word | No |
| `Alt+F` | Move cursor forward one word | No |
| `Alt+D` | Delete word after cursor | No |
| `Ctrl+Y` | Yank (paste) last deleted text | No |
| `Ctrl+P` | Previous line (in multiline input) | No |
| `Ctrl+N` | Next line (in multiline input) | No |
| `@` | Begin file path autocomplete | No |
| `/` | Begin slash command autocomplete (at line start) | No |
| `Ctrl+Space` | Manually trigger autocomplete | Yes |

### Vim Mode

When vim mode is enabled (via `settings.json` or `/vim` toggle), the prompt input supports vi-style modal editing. These bindings are active only in vim mode.

#### Normal Mode

| Key | Action | Rebindable |
|-----|--------|------------|
| `i` | Enter insert mode at cursor | No |
| `I` | Enter insert mode at beginning of line | No |
| `a` | Enter insert mode after cursor | No |
| `A` | Enter insert mode at end of line | No |
| `o` | Open new line below, enter insert mode | No |
| `O` | Open new line above, enter insert mode | No |
| `h` | Move cursor left | No |
| `j` | Move cursor down (multiline) | No |
| `k` | Move cursor up (multiline) | No |
| `l` | Move cursor right | No |
| `w` | Move forward one word | No |
| `b` | Move backward one word | No |
| `e` | Move to end of word | No |
| `0` | Move to beginning of line | No |
| `$` | Move to end of line | No |
| `^` | Move to first non-whitespace character | No |
| `x` | Delete character under cursor | No |
| `dd` | Delete entire line | No |
| `dw` | Delete from cursor to next word | No |
| `d$` | Delete from cursor to end of line | No |
| `yy` | Yank (copy) entire line | No |
| `yw` | Yank from cursor to next word | No |
| `p` | Paste after cursor | No |
| `P` | Paste before cursor | No |
| `u` | Undo last edit | No |
| `Ctrl+R` | Redo last undone edit | No |
| `cc` | Change entire line (delete and enter insert mode) | No |
| `cw` | Change word (delete word and enter insert mode) | No |
| `/` | Begin search forward in input | No |
| `n` | Next search match | No |
| `N` | Previous search match | No |
| `gg` | Move to first line of input | No |
| `G` | Move to last line of input | No |
| `.` | Repeat last edit command | No |

#### Insert Mode

| Key | Action | Rebindable |
|-----|--------|------------|
| `Escape` | Return to normal mode | No |
| `Ctrl+[` | Return to normal mode (alternative) | No |
| `Ctrl+C` | Return to normal mode and interrupt | No |

### Output View

These bindings are active when focus is on the conversation output (scrolling through agent responses, tool results, and rendered markdown).

| Key | Action | Rebindable |
|-----|--------|------------|
| `j` / `Down` | Scroll output down one line | Yes |
| `k` / `Up` | Scroll output up one line | Yes |
| `d` / `Page Down` | Scroll output down half page | Yes |
| `u` / `Page Up` | Scroll output up half page | Yes |
| `g` | Scroll to top of conversation | Yes |
| `G` | Scroll to bottom of conversation (follow mode) | Yes |
| `f` | Toggle follow mode (auto-scroll on new output) | Yes |
| `/` | Open search within output | Yes |
| `n` | Next search match in output | Yes |
| `N` | Previous search match in output | Yes |
| `y` | Copy current selection or last code block to clipboard | Yes |
| `Enter` | Return focus to prompt input | Yes |
| `Escape` | Return focus to prompt input | No |
| `c` | Collapse/expand current tool result block | Yes |
| `C` | Collapse/expand all tool result blocks | Yes |

### Task List

These bindings are active when the task list panel (from `TodoWrite` tool or `/plan` mode) has focus.

| Key | Action | Rebindable |
|-----|--------|------------|
| `j` / `Down` | Move selection to next task | Yes |
| `k` / `Up` | Move selection to previous task | Yes |
| `Space` | Toggle task completion (check/uncheck) | Yes |
| `Enter` | Open task details or jump to referenced file | Yes |
| `d` | Delete selected task (with confirmation) | Yes |
| `e` | Edit selected task description inline | Yes |
| `n` | Create new task at end of list | Yes |
| `N` | Create new task above current selection | Yes |
| `Tab` | Indent task (create subtask) | Yes |
| `Shift+Tab` | Outdent task (promote subtask) | Yes |
| `Escape` | Return focus to prompt input | No |

### File Picker

These bindings are active when the interactive file picker is open (triggered by `@` autocomplete or file selection prompts).

| Key | Action | Rebindable |
|-----|--------|------------|
| `Up` / `Ctrl+P` | Move selection up | No |
| `Down` / `Ctrl+N` | Move selection down | No |
| `Enter` | Select highlighted file | No |
| `Tab` | Select and continue (for multi-file selection) | No |
| `Escape` | Close file picker without selecting | No |
| `Ctrl+U` | Clear search input | No |
| `/` | Toggle between filename and path search | Yes |
| `Ctrl+D` | Toggle showing hidden files (dotfiles) | Yes |
| `Ctrl+O` | Open selected file in external editor | Yes |

---

## Customizing Keybindings

Override bindings in `settings.json` or `settings.local.json`:

```json
{
  "keybindings": {
    "global": {
      "Ctrl+T": "disabled",
      "Ctrl+Shift+T": "toggleTheme"
    },
    "output": {
      "j": "scrollDown",
      "J": "scrollDownFast"
    }
  }
}
```

Only bindings marked **Rebindable: Yes** can be overridden. Attempting to rebind a locked binding produces a warning at session start but does not prevent the session from loading.

### Discovering active bindings

Run `/shortcuts` or press `F1` to display a context-aware overlay showing all active bindings for the current focus state. Customized bindings display with a marker indicating they differ from defaults.
