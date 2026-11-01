---
column: in-progress
created: 2026-11-01T16:32:57-07:00
tags: [common, scaffold, formats, host-contract]
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

# Brief: the format package convention

_Moved from Context Manager's stage 5 phase 11 on 2026-11-01, once the migration that created this
repository was complete. Drafted by the claude agent from Jamie's words; the spec beside it carries
the detail._

## High-level goal

Every format package has the same shape, the few things formats genuinely share live in one place,
and a new format starts from a template instead of a copy, shaped so the same scaffold can later
produce an app.

## Background

The five formats arrived here from five repositories that had each copied the other's scaffolding:
the same `log.ts` in four places, the same structural element contract pinned only in the host,
and SCSS variables duplicated per package. The repository init collapsed their _tooling_ into one
root; this brief collapses what little _code_ they share, and gives the next format (and later the
next app) a template.

Jamie, 2026-11-01: "the app and formats can share a common interface to CM and therefore a common
scaffold (e.g. in best case I can build a single scaffold for apps that gives all of the features
needed for the editor/previews)."

The host side of this is Context Manager's
[ADR-0009](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0009-pluggable-editor-types.md)
(content type selects the editor through the `EditorElement` contract; previews reuse the editor
package) and
[ADR-0035](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0035-surfaces-monorepo.md)
(this repository as one submodule). The originating brief is Context Manager's
`docs/tasks/stage5/phase11/briefs/formats_monorepo.md` (private).

## Desired outcome

- Each format exports the same three entry points: `.`, `./preview`, and `./editor` where it has
  one.
- A `packages/common` package holds the shared log, the element contracts, and the SCSS tokens.
- A new format created from the template builds, tests and lints with no edits beyond its name.

## Constraints

- No element behaviour or public API changes beyond the new subpath aliases.
- Editor selection by content type stays in the host.
- Moving the element contracts out of the host is a Context Manager change too; sequence it so the
  host imports them from `common` in one PR after this lands.

## Open questions

- Is `image` a format (default) or a preview shim that belongs in `common`?
