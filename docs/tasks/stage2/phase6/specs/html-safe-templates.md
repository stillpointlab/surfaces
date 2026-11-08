---
column: done
pr: 54
completed: 2026-11-08
created: 2026-11-08T00:43:23-07:00
tags: [common, components, security, code]
---

# Spec: markup that escapes by default

_Lands first in phase 6. The inventory elements are written with it
([inventory-elements-in-cm](inventory-elements-in-cm.md)), and it closes the stage 2 WAL entry on
`<spl-icon>`'s attributes. Jamie, on the phase 6 plan: make the components HTML-safe, and fix
`<spl-icon>` at the same time._

## High-level goal

Elements in this repository build markup with one tagged template from `common` that escapes every
value unless it is markup built by the same template. Building HTML from data needs no call to
remember. `<spl-icon>` stops interpolating its attributes into `innerHTML`. A shared test helper fills
a state with hostile strings and checks that none of them turns into markup.

## Related context

- Stage 2 WAL, 2026-11-07: `<spl-icon>` interpolates `icon-name`, `aria-label`, `data-size` and
  `data-padding` into `innerHTML`. Context Manager's `conversation-indicator` passes a label built from
  admin-configured provider and model names. `<modal-dialog>`'s title was fixed in phase 4 by setting
  `textContent`.
- The task board escapes with a private `escape()` (`packages/apps/tasks/src/element/task-board.ts`),
  and Context Manager's inventory page with `escapeHtml`/`escapeAttribute` from its
  `shared/utils/sanitize.ts`. Both use string templates, so every value has to be wrapped by hand.
- The inventory page misses at least one: the legacy money fallback,
  `` `${amount.toLocaleString()} ${currency}` `` when the manifest's currency is not a three-letter
  code, goes into the markup unescaped. The currency comes from the repository's `inventory.yaml`.
- The phase 4 lesson: anything on every page imports a light entry.

## Technical requirement

1. **A new `./html` entry in `common`** (`@stillpointlab/common-format/html`). It is DOM-free apart from
   `render`, which only touches the target it is given. It exports:
   - `html`, a tagged template that returns a `SafeHtml`. Each interpolated value is handled by type:
     - a `SafeHtml` goes in as it is;
     - an array is handled item by item, by these same rules, and joined;
     - `null`, `undefined` and `false` add nothing;
     - anything else is converted with `String()` and escaped (`&`, `<`, `>`, `"` and `'`), which
       makes it safe as text and inside a quoted attribute value.
   - `render(target: Element | ShadowRoot, content: SafeHtml)`: sets the target's markup. Setting markup
     goes through this one call.
   - `escapeHtml(text)`: the same escaping as a plain string, for code that sets a `title` or builds
     a string outside a template. It works in Node.
   - `isSafeHtml(value)`.

   There is no way to mark a string as safe. Markup that must not be escaped is written in the
   template's literal parts.

2. **What the template does not cover**, written in its doc comment and the `common` README:
   - attribute names and unquoted attribute values;
   - the inside of `<script>` and `<style>`;
   - a URL's scheme: escaping does not stop `javascript:`. An `href` built from data must come from
     code that builds the URL itself (the host's link builder, an `encodeURIComponent`ed slug), never
     from a data string as it is.

3. **`<spl-icon>`.** It builds its shadow DOM once, in the constructor: a `<style>` whose `textContent`
   is the module's stylesheet, and the button `div` with its glyph `span`. Attribute changes set
   attributes on those nodes (`setAttribute`, `removeAttribute`) and never write markup. Its rendering
   is otherwise unchanged: same nodes, the same attributes, and `role="button"` and `tabindex="0"` as
   today (the decorative-icon WAL entry is separate).

4. **The task board** swaps its private `escape()` for `escapeHtml` from `common-format/html`. Its
   markup stays as string templates for now (see Non-goals).

5. **Hostile-state testing in `common-format/testing`:**
   - `hostile(state)` returns a deep copy of the state with every string replaced by the original
     followed by a payload: `<img data-hostile src=x onerror="window.__hostile=1">"' data-hostile-attr=x` .
     Object keys stay as they are, since keys are field ids and paths an element looks up.
   - `expectNoHostileMarkup(root)` fails when `root` (and every open shadow root inside it) contains an
     element with `data-hostile` or any attribute named `data-hostile-attr`, or when `window.__hostile` is set.
   - Both are documented in the `common` README's testing section, with an example.

6. **A lint guard.** `no-restricted-syntax` (or `no-restricted-properties`) in the root ESLint config
   forbids assigning `innerHTML` or `outerHTML` and calling `insertAdjacentHTML` in
   `packages/components/**` and `packages/apps/*/src/element/**`, outside `common`'s `render`. The task
   board gets one file-level exception, with a comment pointing at the WAL entry. The formats are not
   covered (see Non-goals).

7. **Tests.**
   - `html`: each value type; nested templates and arrays; the five characters in text and attribute
     positions; a `SafeHtml` passed as an array item; `false`/`null`/`undefined`; numbers and `0`.
   - `render` against jsdom: a hostile string interpolated as text and inside an attribute creates no
     element and comes back intact through `textContent` and `getAttribute`.
   - `<spl-icon>`: each of its four attributes set to a hostile string leaves `expectNoHostileMarkup`
     passing, and the value round-trips. An attribute change keeps the same `div` node.
   - The `hostile` helper: strings at every depth change, keys do not, and the input is not mutated.

## Clarifications

- **A template, not a library.** Lit or a DOM builder would also escape, but every element here renders
  with string templates. A tagged template keeps the code as it reads today, with escaping moved
  into one place. Jamie's rule from phase 4 holds: helpers and interfaces, not component frameworks.
- **No escape hatch.** A `trusted()` or `unsafeHTML()` wrapper is where these bugs come back. The one
  case that needed it, `<spl-icon>`'s stylesheet, is set as `textContent`.

## Non-goals

- Rewriting the task board on `html`. It escapes every value it interpolates today. The rewrite is
  mechanical but touches most of its 1,400 lines, so it is a WAL entry, with the lint exception as
  the reminder.
- The formats' elements. They render mostly through their engines (CodeMirror, the md editor, the
  sheet grid), and a pass over their remaining `innerHTML` calls is its own step, recorded in the WAL.
- `<spl-icon>`'s role and tab stop for decorative icons, and the missing `spinner` glyph (both still
  in the WAL).

## Acceptance / completion checklist

- [x] `@stillpointlab/common-format/html` exports `html`, `render`, `escapeHtml` and `isSafeHtml`,
      builds as its own entry, and pulls in none of `common`'s runtime.
- [x] `<spl-icon>` writes no markup from its attributes, and its hostile tests pass.
- [x] The task board uses `escapeHtml` from `common`, and its 60 tests pass unchanged.
- [x] `hostile` and `expectNoHostileMarkup` are in `common-format/testing`, with tests.
- [x] The lint guard is on for components and app elements, with the board's one exception.
- [x] `npm run check` green.
- [x] Stage 2 WAL: the `<spl-icon>` attributes entry closed, with board-on-`html` and formats-pass
      entries added.

## Implementation plan

1. One surfaces PR: the entry with its tests, `<spl-icon>`, the board's escape, the testing helpers,
   the lint rule, the READMEs, and the WAL.
2. Context Manager picks up the `<spl-icon>` fix with the pin moved for
   [inventory-elements-in-cm](inventory-elements-in-cm.md), which needs `common-format/html` too.

## Implementation notes

- Landed in #54, merged 2026-11-08 as `61bb9a1`. The `./html` entry builds to 1.4 KB with no
  imports. `html` has no escape hatch: only `html` can build a `SafeHtml`, through a key private to
  the module, and `render` throws on anything else.
- `<modal-dialog>` moved onto `html` too, though the spec didn't name it: the lint guard covers
  components, and it wrote its shadow markup with `innerHTML`. Its stylesheet is a persistent
  `<style>` set as text and put back first on each render.
- `<spl-icon>` builds its shadow DOM once and sets its attributes through the DOM. Five of its 11 new
  hostile tests failed on the old element.
- Beyond the spec: Prettier formatted the inside of `html` templates as HTML (whitespace between
  tags, quote style, `<br />`), which changes what renders. `.prettierrc` sets
  `embeddedLanguageFormatting: "off"` for `*.ts` here and in Context Manager.
- A test that read the built entry with `node:fs` was dropped, since `common` has no Node types;
  `html-entry.test.ts` checks what the entry exports.
- Tests went from 1,451 to 1,496. Context Manager picked up `<spl-icon>` and `<modal-dialog>` with the
  pin moved in context-manager#1056.
