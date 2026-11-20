---
created: 2026-11-20T15:30:00-07:00
tags: [formats, code, polish]
---

# A changed block comes back with its brackets escaped

The md editor's serializer escapes every square bracket in text. A block that goes through it
after an edit is written with `\[` and `\]` where the file had `[` and `]`:

```text
- [x] done            →   - \[x\] done
- [ ] todo            →   - \[ \] todo
A line with [brackets] in it.   →   A line with \[brackets\] in it.
```

Reproduced on `main` at #138 (2026-11-20): parse that text with `getMarkdownParser()` and write
it with `getMarkdownSerializer().serialize(doc)`. Jamie hit it in Context Manager on a task list
(context-manager #1201).

Since [#111](https://github.com/stillpointlab/surfaces/pull/111) a save writes only the blocks
that changed, so an untouched task list keeps its text. Edit any item, though, and the whole list
is rewritten with every checkbox escaped. The text still reads the same once rendered, since an
escaped bracket is a bracket. But a renderer that draws task checkboxes (GitHub's) no longer draws
one for `\[x\]`: it shows the literal `[x]`. And the file's source and its diffs carry backslashes
nobody typed.

What to decide:

- **Task list items.** The schema has no task item: `[x]` is text in a list item's paragraph.
  Either the serializer leaves `[ ]` and `[x]` alone at the start of a list item, or the editor
  learns task items as nodes of their own (a checkbox to click is the reason to).
- **Brackets in prose.** An escape is needed only where a bracket would otherwise start a link or
  an image. Escape those and leave the rest, or keep the text the block had wherever the edit did not touch it (see below).

Related: [a save keeps the rest of the file](a-save-keeps-the-file.md), whose "inside a list or a
table" point is the same rewrite seen from the other side: keeping each list item's text would
hide this for every item the edit did not touch.
