---
column: todo
created: 2026-11-10T12:47:26-07:00
tags: [apps, code, polish]
---

# The task board on `html`

The task board builds its markup as string templates, escaping each value with `escapeHtml`. The
inventory elements, the tab strip and the board's own dialogs render through `html` and `render`
from `common-format/html`. Moving the board's ~1,400 lines across is mechanical, and lets its
file-level exception to the `innerHTML` lint rule go. From the stage 2 follow-ups (2026-11-08).
