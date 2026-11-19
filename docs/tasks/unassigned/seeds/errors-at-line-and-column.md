---
created: 2026-11-18T19:41:00-07:00
tags: [formats, feature, code]
---

# Errors at their line and column, in the preview and the editor

Jamie, 2026-11-18, trying stage 5 in the local host: a file with an error should show it where
it is, in the preview and in the editor. The case in hand was a zone file's
"YAML parse error … at line 3, column 1".

Where it stands:

- The position exists only as words in a message. Inventory's zone parser and the tasks
  manifest's hand the YAML library's message on as text.
- `<code-preview>` and `<code-editor>` take text and a language. Neither takes a problem to
  show, and the code format does not load CodeMirror's lint.
- The local host's pane opens a locked or unlocked app file through the code format like any
  other file, and says nothing of what the app thinks of it.

What a spec would have to settle (the claude agent's list, not Jamie's):

- the shape of a problem: a message, a severity, and a range (line and column, perhaps an end),
  kept as data from the parser on, with the message's words as the fallback;
- the format contract: an optional member on a preview and an editor that take problems
  (something like `setProblems(problems)`), which a format without lines (sheet's grid, an
  image) leaves out. Raw views are the code editor, so they get it with the code format;
- how each shows one: the editor as a mark under the text and in the gutter, with the message on
  hover and for a screen reader; the preview as a marked line with the message beside it;
- who finds the problems. Two sources, which a spec may split: the format itself (a YAML or
  JSON file that does not parse, with no app involved), and the app that owns the file (a zone
  that parses as YAML and is not a zone). The second arrives through the host, with
  [an app's errors in the explorer](app-errors-in-the-explorer.md);
- an editor's problems go stale as the text is typed: checked again on a pause, or cleared at
  the first edit.
