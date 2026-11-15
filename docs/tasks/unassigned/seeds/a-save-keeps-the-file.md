---
created: 2026-11-14T19:40:00-07:00
tags: [formats, code, polish]
---

# A save keeps the rest of the file

An editor's save should change the file by the edit and nothing else. In Context Manager a save
made a draft, and a difference showed in a check-in at most. The local host writes the file on
disk, and git shows every changed line.

The md editor was the worst case (stage 4 follow-ups, git-in-the-host): one edit reflowed the
whole file. [#111](https://github.com/stillpointlab/surfaces/pull/111) fixed that on 2026-11-14:
a save rewrites the top-level blocks that changed and writes every other block back as the text
it was set with.

What is left:

- **The sheet editor** adds `format: csv` to a `.sheet` document and drops its final newline
  (stage 4 follow-ups, host-page).
- **Inside a list or a table.** The md editor's unit is the top-level block, so an edit to one
  list item rewrites the whole list: `*` bullets become `-`, a loose list goes tight. Keeping
  each item, or each table row, is the next step down.
- **A changed paragraph is written on one line.** A paragraph wrapped by hand loses its wrapping
  when it is edited. Keeping the lines an edit did not touch, or wrapping to the width the
  paragraph had, would close it.
- **One test for every editor:** open, save without an edit, compare the bytes; then one edit,
  and compare what else changed.
