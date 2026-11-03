---
column: todo
created: 2026-11-02T20:14:50-07:00
tags: [formats, host-contract]
---

# Spec: `<xmdl-editor>` adopts the raw view convention

_From the phase 5 brief [raw_mode](../briefs/raw_mode.md). Depends on
[raw-view-convention](raw-view-convention.md)._

## High-level goal

xmdl-editor's switch between the apply view (fill in the template's slots) and the template source
becomes the standard "Raw Text" switch, and invalid XMDL opens in raw with its parse errors, where
the user can fix it.

## Related context

- `packages/formats/xmdl/src/editor/xmdl-editor.ts`: `renderModeToggle` (the "Apply Mode" switch, on
  in apply mode), `renderRawEditor` and `syncReady` (the model for `createRawSource`),
  `renderParseErrors` (the "Invalid XMDL" list shown in apply mode), `reconcileApplyState` and
  `applyResetConfirmation` (the confirmation before discarding apply work).
- Parse errors come from `parseXmdl` as `{ message, path? }`.
- Switching already keeps the text: apply mode returns the stored source and raw edits replace it
  verbatim.

## Technical requirement

1. **The switch.** "Apply Mode" becomes the standard "Raw Text" switch, checked in raw (the sense
   flips), last in both toolbars, enabled while `readonly`. The visible "Apply Mode" label goes.
2. **The raw surface.** `createRawSource({ language: 'yaml', … })` replaces `renderRawEditor`, and
   readiness chains through it instead of `syncReady`'s own logic.
3. **The `view` capability.** `view` observed and reflected; `view-change` with reasons; the
   internal `mode` maps to it (`apply` is rich).
4. **Invalid XMDL opens in raw.** Content that does not parse (on `setContent` or connect) shows the
   raw view with a notice listing the parse errors (`path: message`) and reason `fallback`. The
   "Invalid XMDL" panel in the apply view goes; it can no longer be reached.
5. **Switching back with invalid text.** If the user edits raw text and switches to rich while it
   still does not parse, the element stays in raw, the notice lists the errors for the current
   text, and it is announced (`role="alert"`). No `view-change` fires, since the view did not
   change. Once the text parses, the switch works, including the existing confirmation when the
   change would discard apply decisions; declining keeps raw.
6. **Read-only.** `readonly="true"` keeps the current view, disables every apply control as now, and
   makes the raw text read-only; the switch stays enabled (PR 11 disabled it).
7. **Tests.** `describeRawViewContract('xmdl-editor', …)` in `src/contract.test.ts` with
   `invalidContent` (the harness's malformed fixture) and `invalidErrors`. Element tests: the
   failed switch back updates the notice; the confirmation still guards lossy switches; readonly
   keeps the view and the switch. Existing tests that click `.xmdl-editor__mode-toggle` move to the
   switch's new sense.

## Non-goals

- Changing the apply view or the `xmdl-apply` event.
- Validating the rendered output (the template's `validation` block).

## Acceptance / completion checklist

- [ ] The raw view suite passes for `xmdl-editor`, including the invalid-content cases.
- [ ] Invalid XMDL opens in raw with its errors; a failed switch back shows the current errors.
- [ ] "Raw Text" replaces "Apply Mode", on in raw, enabled while read-only.
- [ ] `npm run check` is green; the harness shows both raw surfaces.

## Implementation plan

One PR after the convention lands. The smallest of the editor specs; a good first adopter.
