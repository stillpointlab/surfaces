---
created: 2026-11-10T12:47:26-07:00
tags: [polish, code]
---

# Icons that are not buttons

`<spl-icon>` always renders `role="button"` and `tabindex="0"`, so a decorative icon is a keyboard
stop announced as a button. Context Manager has about 36 call sites. An icon should be a button only when it is one: perhaps a `decorative` attribute, or
no role unless the host asks for it. A spec, since every call site needs a look. From the stage 2
follow-ups (shared components, 2026-11-07).
