---
created: 2026-11-26T00:10:00-07:00
tags: [formats, host-contract, code]
---

# A format's root entry registers nothing

The format convention gives each part of a format its own entry: `./preview`, `./editor`,
`./format`, and now `./worker`. A package made with the scaffold has a root entry that defines no
element. The five formats that came before the convention do not follow it, and the root README
carries a sentence for the exception: "For the formats that predate the convention, `.` still
registers the editor and exports everything."

What each root does today, read at `7152eff`:

| Format | Importing `.` also                             |
| ------ | ---------------------------------------------- |
| md     | registers the editor, which loads ProseMirror  |
| code   | registers the editor                           |
| sheet  | registers the editor, the grid and the preview |
| xmdl   | registers the editor                           |
| image  | registers the preview                          |

So a host that wants one function or one type from a root gets an element defined and an
editor's code with it.

Jamie, 2026-11-26, at the close of stage 6's phase 2, where image's root came up as a follow-up:
"presumably we want to convert to the convention eventually?"

## What it would take

- Each of the five roots exports its types and its DOM-free core and imports no element. What a
  host needs of an element comes from that element's entry.
- Context Manager's imports from a root move to the entry that holds them, in the same pin.
  Read at Context Manager `18141d40`: `@stillpointlab/md-format`'s root is imported for a type
  in the citation plugin and for the parser and serializer in one test. Its format table already
  imports `./format` alone. A full read of its imports is the first step.
- The local host and the harness are read the same way.
- The README's sentence for the exception goes.

## When

The agent's lean: as a step of Context Manager's adoption of the media formats (stage 6,
phase 5), since that is when its imports and its pin change anyway and the walks run at the new
pin. It is not needed for the adoption, so it can as well wait for a later stage.
