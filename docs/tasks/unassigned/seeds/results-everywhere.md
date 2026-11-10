---
created: 2026-11-10T12:47:26-07:00
tags: [apps, code, host-contract]
---

# One result shape across the cores

Only the functions that threw answer a `Result` (stage 2 phase 5). The cores' older results keep
shapes of their own: the manifest parses (`{ ok: false, errors }`), the zone writer (`reason`,
`notFound`) and the lifecycles' `validateAndScope` (`errors`, on purpose: a manifest can be wrong
in several ways at once, so a list may need its own `Result` variant). Converging them changes their
callers in Context Manager. From the stage 2 follow-ups (2026-11-07).
