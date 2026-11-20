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

## Fixed, 2026-11-20

The narrow fix, in stage 5's phase 7 (Jamie's ruling, the same day): the serializer writes a
block its own way, and when that put a backslash before a bracket it writes the block again with
the brackets as typed. The second writing is used when it reads back as the first does, with
the document's link definitions present. So:

- `- [x] done` and `[brackets]` in prose are written as they were typed;
- a pair that `(`, `[` or `:` follows keeps its backslashes, since bare it would read as a link,
  a reference or a definition (`\[text\](target)`, a footnote's `\[^1\]:`);
- a `\[name\]` that a definition elsewhere in the file would turn into a link keeps them too.

Over the 933 Markdown files of this repository and of Context Manager's, the serializer wrote
6,617 escaped brackets before and 12 after. No file read back differently from before, and no
output differed in anything but those backslashes.

## What is left

**Task list items as nodes of their own.** The schema still has no task item: `[x]` is text in a
list item's paragraph. A checkbox to click is the reason to give it a node, and that is a
feature, not this defect.

Related: [a save keeps the rest of the file](a-save-keeps-the-file.md), whose "inside a list or a
table" point is the same rewrite seen from the other side: an edit to one item still rewrites the
whole list, now without touching its boxes.
