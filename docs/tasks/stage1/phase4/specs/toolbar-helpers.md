---
column: done
pr: 17
completed: 2026-11-02
created: 2026-11-02T19:05:48-07:00
tags: [formats, common, polish]
---

# Spec: toolbar helpers and the shared switch

_Landed 2026-11-02 in [#17](https://github.com/stillpointlab/surfaces/pull/17). Two deviations:
`_toolbar.scss` carries only the shared states (focus ring, disabled), since unifying geometry would
be a redesign; and disabled opacity is unified at 0.5. `dismissOnOutside` takes an element or a
function returning several, which sheet (menu plus trigger) needs. code-editor leaves
`aria-readonly` to CodeMirror, which already manages it. md's switch now announces "Raw, checked"
in rich mode, the existing inverted sense; the raw-mode brief settles it._

_From the phase 4 spike [shared-element-patterns](../spikes/shared-element-patterns.md), findings 3
and 5. Jamie, 2026-11-02: helper functions and interfaces, not a toolbar component._

## High-level goal

Every editor's toolbar behaves the same way for keyboard and assistive-technology users, honours
`readonly` the same way, and looks the same, while each format still builds its own toolbar and
owns its own commands. The behaviour comes from a few small functions and one style partial in
`common`, applied to toolbars the formats build.

## Related context

- Depends on: [design-tokens](design-tokens.md), since the style partial is written on the tokens.
  Independent of the lazy-engine helper.
- The four toolbars today:
  - **md**: `ProseMirrorToolbar` (`prosemirror-toolbar.ts`) builds HTML strings, a command registry,
    popovers, and overflow with `ResizeObserver`. It has one ARIA attribute (`aria-hidden` on icons),
    no `role="toolbar"`, icon-only buttons labelled only by `title`, and popover triggers without
    `aria-haspopup` or `aria-expanded`.
  - **sheet**: the reference. `role="toolbar"` with a label, labelled groups, roving `tabindex`
    with arrow keys, Home and End (`handleToolbarKeyDown`), `aria-pressed`, `aria-haspopup="menu"`
    and `aria-expanded`, and outside-pointer dismissal (`handleDocumentPointerDown`).
  - **code**: one keymap toggle group with `aria-pressed`; the toolbar `div` has an `aria-label`
    but no role.
  - **xmdl**: buttons from a `button()` helper, `role="toolbar"` without a label, and a mode switch
    built as a button with a knob (`role="switch"`).
- Two switch implementations: md's registered `<md-toggle>` element (not exported, not used by
  Context Manager) and xmdl's mode switch.
- Readonly: phase 3 wrote "disable the toolbar while readonly" twice (PR 11). Four editors read the
  attribute under two spellings (`isReadonly`, `isReadOnly`); only sheet and xmdl reflect
  `aria-readonly`.

## Technical requirement

1. **Keyboard helpers** in `common`, stateless, so each format calls them from its own handlers:
   - `moveToolbarFocus(event, items)`: for ArrowLeft and ArrowRight (wrapping), Home and End over
     the given enabled items, it prevents the default, moves the single tab stop (`tabIndex` 0 on
     the target, -1 on the rest), focuses the target and returns it. Other keys return `null`
     untouched.
   - `setToolbarTabStop(items, preferred)`: gives `preferred` the tab stop, or the first enabled
     item when `preferred` is disabled or missing. Called after a re-render or a readonly change.
2. **Dismissal helper.** `dismissOnOutside(host, { isOpen, close })` listens for `pointerdown`
   (capture, using `composedPath()` so it works across shadow roots) and Escape on the document,
   calls `close(reason)` when the event lands outside `host` while `isOpen()`, and returns a
   dispose function the element calls on disconnect.
3. **Readonly helpers.** `isReadonly(el)` (the contract's `readonly="true"`) and
   `reflectReadonly(el, target)`, which sets `aria-readonly` on the element's editing root. All four
   editors use them in place of their private getters; md gains `aria-readonly`.
4. **The shared switch.** `createSwitch({ label, checked, disabled, onToggle })` returns
   `{ element, setChecked, setDisabled }`, where `element` is
   `<button type="button" role="switch" aria-checked aria-label class="spl-switch">` with its knob.
   md's raw toggle and xmdl's mode switch use it, and `<md-toggle>` is removed. Labels and which
   state counts as "on" stay exactly as they are today; the raw-mode brief decides those.
5. **One style partial.** `common/src/styles/_toolbar.scss` provides mixins, written on the tokens,
   for the toolbar row, a toolbar button (size, hover, `[aria-pressed='true']`, `:disabled`,
   `:focus-visible`), a separator, a popover panel and the switch. Formats include the mixins in
   their own class names, so markup and class names do not churn.
6. **ARIA on every toolbar.**
   - md: `role="toolbar"` with `aria-label="Formatting"`; every icon-only button gets an
     `aria-label` (its current `title`); popover triggers get `aria-haspopup` and an `aria-expanded`
     kept in sync; arrow keys move between buttons through `moveToolbarFocus`; its document
     listeners move to `dismissOnOutside`.
   - code: the toolbar gets `role="toolbar"`; the keymap group keeps `role="group"` and its label.
   - xmdl: both toolbars get an `aria-label`; arrow keys through `moveToolbarFocus`.
   - sheet: replace its arrow-key block and its outside-pointer handler with the helpers if they
     fit without bending. If they do not, sheet keeps its code and the PR says why. Sheet is the
     behaviour the helpers are tested against either way.
7. **Tests.** Unit tests in `common` for each helper (jsdom keyboard and pointer events, including
   a click inside a shadow root). Per editor: arrow keys move focus and the tab stop; the ARIA
   attributes above are present; readonly disables every toolbar control and sets
   `aria-readonly`. The conformance suites stay green.

## Non-goals

- A toolbar element, a command schema or registry in `common`, or any helper that renders a
  toolbar from configuration. Commands, grouping, icons and layout stay in each format.
- Changing what any toolbar offers or how it is laid out, beyond the styling the partial unifies.
- The raw switch's label and sense (raw-mode brief).
- Popover positioning or overflow logic; md's overflow stays md's.

## Acceptance / completion checklist

- [x] The helpers, the switch and `_toolbar.scss` are in `common`, unit-tested, and listed in the
      README.
- [x] md, code and xmdl toolbars have `role="toolbar"` and a label; every icon-only button has an
      accessible name; md's popover triggers expose `aria-haspopup` and `aria-expanded`.
- [x] Arrow keys, Home and End move focus in all four toolbars; each toolbar is one tab stop.
- [x] All four editors read `readonly` through `isReadonly` and reflect `aria-readonly`.
- [x] `<md-toggle>` is gone; md and xmdl use `createSwitch` with unchanged labels and behaviour.
- [x] Every format's toolbar stylesheet uses the partial; the harness shows no unintended visual
      change in light or dark.
- [x] `npm run check` is green.

## Implementation plan

One PR after the token spec lands. Add the helpers, the switch and the partial with their tests.
Convert xmdl first (the smallest toolbar), then code, then md (the largest change: ARIA, focus,
popover state, dismissal, the switch), then try sheet against the helpers. Finish with keyboard and
screen-reader-name checks in the harness for each format.
