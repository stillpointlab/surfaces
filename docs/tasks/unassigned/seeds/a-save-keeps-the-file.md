---
created: 2026-11-14T19:40:00-07:00
tags: [formats, code, polish]
---

# A save keeps the rest of the file

Two editors change more of a file than the person edited (stage 4 follow-ups, host-page and
git-in-the-host):

- **The md editor reflows the file.** In stage 4's by-hand pass three lines became one and the
  final newline went. The Changes view makes it plain.
- **The sheet editor** adds `format: csv` to a `.sheet` document and drops its final newline.

In Context Manager a save made a draft, and the difference showed in a check-in at most. The
local host writes the file on disk, and git shows every changed line. Stage 5 lets an app's
files be unlocked and edited: a card opened in the md editor is rewritten by its first save.

What a spec would have to settle (the claude agent's list, not Jamie's):

- what "keeps" means for markdown, where the editor parses to a document and writes it back:
  the same bytes for a save with no edit, and the smallest change for one with an edit, or only
  the first;
- line endings and the final newline, which the code format already keeps as set;
- a test both editors and any later one run: open, save without an edit, compare the bytes;
- whether the fix goes in before stage 5's phase 3, which is decision 4 of the
  [stage 5 review](../../stage5/phase1/reviews/specs-against-stage-4.md).
