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

Jamie, later the same day: the zone's page, where the full error shows, should also link to
that edit page, so the way from the error to the place it is fixed is one click.

- The inventory element already has that link for two other cases: "Open in editor" beside a
  zone that is read-only, and "Open inventory.yaml in editor" under the manifest's errors
  (`editorRecoveryHtml` in `packages/apps/inventory/src/element/render.ts`, a link when the host
  gives one and otherwise the `link-editor` op). The notice for a zone that could not be parsed
  (`inventory-zone.ts`) has none.
- In the local host a followed editor link to a locked file opens its preview, with "Show the
  app's files to edit it here".

What a spec would have to settle (the claude agent's list, not Jamie's):

- the link from the zone's parse error to the file's editor, and whether it carries the position
  (the editor opening at line 3, column 1). In the local host, whether following it from an
  error offers to show the app's files, since the editor is the point;

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
