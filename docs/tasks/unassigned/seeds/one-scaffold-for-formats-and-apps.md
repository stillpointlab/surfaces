---
column: todo
created: 2026-11-01T15:32:34-07:00
tags: [scaffold, common, host-contract, major-feature]
---

# One scaffold for formats and apps

Formats and apps are the same kind of citizen to the host: stateless clients of `get` / `list` /
`put`, where `put` is a proposal. So one scaffold should produce either. The best case, in Jamie's
words on 2026-11-01: "a single scaffold for apps that gives all of the features needed for the
editor/previews". Grows from the `common` package (log, element contracts, tokens) that the
migration's convention spec creates in Context Manager's stage 5 phase 11.
