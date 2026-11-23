---
created: 2026-11-23T13:59:00-07:00
tags: [dev-tooling, docs]
---

# A format step for published pull requests

A file edited in Context Manager and published from there arrives here as a pull request on a
`context-manager/…` branch. CI runs `prettier --check` over every markdown file, and nothing
formats what the md editor wrote on the way. On 2026-11-23 both of Jamie's pull requests from
his stage 5 validation failed that check
([#173](https://github.com/stillpointlab/surfaces/pull/173),
[#174](https://github.com/stillpointlab/surfaces/pull/174)), and each needed a commit by hand.

Two of the three causes were the editor's own and are fixed: a rewritten list had no blank line
after an item ending in a code block, and a line break at the end of a list item's text left a
line of spaces. The third is not the editor's to fix: a tick typed `[X]` is kept as typed, and
Prettier writes `[x]`. Anything else a person types that Prettier would write another way
(a `*` bullet, an `_` for emphasis, a table's column widths) will fail the same way.

## What it is

A step that formats a published pull request, so that a person who edits in Context Manager
never has to know this repository's formatter.

## To settle

- **Where it runs.**
  - Here, as a workflow on pull requests whose branch starts `context-manager/`: run Prettier
    on the changed files and push the result to the branch. It needs a token that may push,
    and a push by a workflow does not start CI again unless that token is an app's or a
    person's.
  - In Context Manager, at publish: it would have to read this repository's Prettier settings
    and run that version of Prettier, for every repository it publishes to.
  - In the md editor: write what Prettier writes. It cannot be exact, and it is the editor
    taking a formatter's opinions as its own.
- **What Context Manager sees after.** The published branch gains a commit Context Manager did
  not make, as it did on #173 and #174 by hand. Once merged, its copy differs from main and it
  takes the latest; whether a card open at the time shows as changed upstream is to check.
- **Only the files the pull request changed,** so a formatter's upgrade never rides in on a
  person's edit.
- **Or loosen the check** for `docs/`: a format check on prose buys little, and a person's
  `[X]` is not a defect. The cost is that agents' docs are no longer held to one style.

## Not in it

What a save keeps of a file it edits, which is
[a save keeps the file](a-save-keeps-the-file.md), and a published draft that writes over what
main gained since the draft began, which is Context Manager's.
