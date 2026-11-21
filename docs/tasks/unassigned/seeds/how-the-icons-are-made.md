---
created: 2026-11-21T14:30:00-07:00
tags: [common, dev-tooling, code]
---

# How the icons are made

`<spl-icon>` (`packages/components/spl-icon`) draws each icon as a CSS mask: one rule per name
in `icon.scss`, holding the icon's SVG as a data URL, twice (`mask-image` and
`-webkit-mask-image`), coloured by `currentColor`. It was chosen for convenience. Jamie,
2026-11-21, on adding `undo` and `redo`: as the icons keep coming, review the method, and
consider another (a sprite sheet, a font, and so on).

Where it stands: 36 icons and about 23 kB of stylesheet, all of it shipped to every page that
loads the element, whichever icons the page uses. Each new icon adds about 600 bytes, and its
path is written out twice.

What a review would weigh (the claude agent's list, not Jamie's):

- **CSS masks, as now.** No request, no markup, colour by `currentColor`, one element for every
  host. Every icon ships to everyone, an icon cannot have two colours, and a path is edited
  inside a URL-encoded string.
- **An SVG sprite sheet** (`<use href="…#name">`). One cached file, real SVG a designer can
  open, more than one colour possible. An external sheet does not cross a shadow root's styles
  the same way and needs a URL every host can serve, which a package of plain files has not
  needed so far; an inline sheet has to be put on each page.
- **Inline SVG from a module per icon.** Only the icons a page imports are shipped, and the
  build can check a name exists. The element becomes a renderer of markup, and hosts that set
  `icon-name` from data lose the tree-shaking.
- **An icon font.** One file and text-like sizing. Poorer for accessibility and alignment, a
  build step to make the font, and the one most projects have moved away from.

Also worth settling in the same pass: where the paths come from and under what licence (they
are Material Design's), a check that the README's list, the harness's list and the stylesheet
name the same icons, and whether Context Manager's own icons outside this element join it.
