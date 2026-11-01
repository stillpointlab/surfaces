# Apps

An app owns a **scope**: it is mounted by a manifest onto a folder of goods and is the sole executor
inside it, running import → transform → flush over many goods (Context Manager ADR-0028). Tasks and
inventory are the first two, and they move here from Context Manager's `src/` in the apps breakout.

A format, by contrast, edits **one good** and is selected by its content type. See
[`../formats/`](../formats/).

## Placement test

- Does the user work on one good's bytes, chosen by content type? → a **format**, however rich its
  editor (sheet is the stress test: one `.sheet` good with an app-like interior).
- Does the user work on a tree of goods under a manifest, with a model of its own? → an **app**.
- Grey case? Prefer a container format (the `.sheet` envelope precedent) and keep it a format. Apps
  are for when the unit of work is a folder, not a file.

Both are the same kind of citizen to the host: a stateless client of the `get` / `list` / `put`
contract (`put` is a proposal), so both share `packages/common` and the scaffold.
