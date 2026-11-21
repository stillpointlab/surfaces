---
created: 2026-11-21T12:20:00-07:00
tags: [formats, host-contract, polish]
---

# The diff's whitespace handling lives in one place

Two hosts mount `<code-diff>`, and each has written its own handling of whitespace around it.
Jamie asked on 2026-11-21 whether the local host's is shareable, so that Context Manager could
move to it. As it stands it is not: it lives in the local host's page. This seed is the move.

What each host has today:

- **Context Manager** (`src/client/utils/diffView.ts`, the diff page and claim review): three
  whitespace modes, `ignore`, `normal` and `visual`; two more preferences, wrap and collapse; all
  kept in `localStorage` under `spl.diffPrefs`; and `applyDiffPrefs`, which sets the element's
  four attributes.
- **The local host** (`packages/hosts/local/src/client/diff-whitespace.ts`, from
  [#152](https://github.com/stillpointlab/surfaces/pull/152)): the same three modes under other
  names, `compare`, `ignore` and `show`; the two attributes for each; the choice kept under
  `surfaces.diff-whitespace`; and `whitespaceNote`, which Context Manager has no like of. It
  says when the two sides differ in line endings, in line endings alone, or in whitespace alone.

The note matters because `<code-diff>` compares lines and not their endings: a file that is CRLF
where the other side is LF shows no line as changed for that, and git may count every one.
Context Manager's diff says nothing of it either.

What would move beside `<code-diff>`, into `@stillpointlab/code-format/diff`: the modes, the
attributes for a mode, and the note. Each host keeps its own control, its own storage and its
own words.

What a spec would have to settle (the claude agent's list, not Jamie's):

- **The modes' names.** Context Manager stores `normal` and `visual`; the local host stores
  `compare` and `show`. One pair wins, and the other host reads its old stored value once.
- **The note's words.** They are in the local host's `words.ts`. Shared code returns what
  differs (`{ endings: { file, head }, whitespaceOnly }`) and each host words it, or the package
  carries default words a host may replace.
- **Wrap and collapse.** Context Manager offers them and the local host does not. They could
  come along as the element's preferences, or stay behind.
- **Two counts.** Jamie's other idea on 2026-11-21: lines changed in whitespace alone against
  lines changed otherwise. It needs the diff's chunks, so `<code-diff>` would report them (an
  event or a method), which is a change to that element's contract. It fits here.
- **Context Manager's side** is its own pull request after a pin: `diffView.ts` keeps its
  storage and toolbar and takes the modes and the note from the package.
