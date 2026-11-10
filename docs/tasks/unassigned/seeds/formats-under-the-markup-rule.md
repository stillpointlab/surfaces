---
column: todo
created: 2026-11-10T12:47:26-07:00
tags: [formats, code]
---

# The formats under the markup rule

The `innerHTML` lint rule covers components and app elements, not the formats. Eleven of their
element modules set markup directly (md's editor, toolbar, icon and preview; code's editor, preview
and diff; xmdl's editor and preview; sheet's editor; image's preview), mostly static scaffolding
around an engine. A pass moves them onto `html` and `render` and widens the rule to
`packages/formats`. From the stage 2 follow-ups (2026-11-08).
