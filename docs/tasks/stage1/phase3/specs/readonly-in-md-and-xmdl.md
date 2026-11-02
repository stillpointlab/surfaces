---
column: todo
created: 2026-11-02T15:05:00-07:00
tags: [formats, host-contract, polish, quick-win]
---

# Spec: `readonly` in `<md-editor>` and `<xmdl-editor>`

_Straight to a spec (Jamie, 2026-11-02): the gap is known, the fix is small, and the acceptance is
already written as the two opted-out cases in the contract suites._

## High-level goal

Every editor honours `readonly="true"` the same way: no user action inside the element changes its
content or emits `content-change`. The two contract tests that opt out today run for real.

## Related context

- The contract: `packages/common/src/contracts.ts` (`EditorElement`: "a `readonly="true"`
  attribute disables editing") and the `blocks user edits while readonly="true"` case in
  `packages/common/src/testing/editor.ts`.
- Found by: stage 1 phase 2, [shared-test-harness](../../phase2/specs/shared-test-harness.md)
  (surfaces PR 6), recorded in Context Manager's stage 5 WAL (CM PR 993).
- Why the host sets it: a dormant repo-origin good renders read-only behind a banner (Context
  Manager [ADR-0024](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0024-repository-origin-goods.md));
  `applyEditorReadOnlyState` sets `readonly="true"` on whatever editor the good selected, and every
  save is refused server-side. The element is the user-facing half of that contract: code and
  sheet already hold it; md holds half; xmdl none.
- Main files: `packages/formats/md/src/editor/prosemirror-editor.ts` and `prosemirror-toolbar.ts`;
  `packages/formats/xmdl/src/editor/xmdl-editor.ts`; the two `src/contract.test.ts` files.

## Technical requirement

1. **`<xmdl-editor>` observes `readonly`.** Add `readonly` to `observedAttributes` and re-render on
   change. While readonly: slot controls (`.xmdl-editor__slot-control` textarea, input, select)
   are disabled; Previous / Next may stay (navigation is not an edit) but Apply, Skip and Apply
   Template are disabled; the mode switch is disabled, and if the element is already in raw mode
   the raw editor goes read-only too: the embedded `<code-editor>` gets `readonly="true"` forwarded
   (it honours it), the fallback `<textarea>` gets `readOnly`. `getContent()` is unaffected. The
   `aria-readonly` on the editor's root section reflects the state.
2. **`<md-editor>` disables the toolbar while readonly.** `updateReadOnlyState` already sets
   `editable: false` on the view; it also disables every toolbar command button and the raw
   toggle (`ProseMirrorToolbar` gains a `setReadOnly(readonly)` that the editor calls, alongside the
   existing per-command `isEnabled` refresh), and leaves raw mode if it is active (the raw textarea
   gets `readOnly` as a second guard). Removing the attribute restores everything. Keyboard shortcuts
   that reach commands through ProseMirror's keymap are already blocked by `editable: false`.
3. **The contract tests run for real.** Remove `readonly: false` from
   `packages/formats/md/src/contract.test.ts` and `packages/formats/xmdl/src/contract.test.ts`.
   The suite's readonly case drives the same `edit` hook under `readonly="true"` and expects no
   `content-change` and unchanged content; both edit hooks (md's toolbar blockquote, xmdl's raw
   textarea) must therefore be inert while readonly. Add one element test each for the
   readonly-then-restored path (attribute removed → the same edit works again).
4. **Harness.** Nothing new: the Read-only toggle already sets the attribute. Check both formats by
   hand in the harness after the change.

## Non-goals

- Changing what the host does with `readonly` (it stays the dormant-good signal) or adding a
  read-only mode to the preview elements.
- Styling a disabled toolbar beyond what the existing `disabled` states already draw.

## Acceptance / completion checklist

- [ ] `readonly: false` is gone from both contract tests and `npm run check` is green.
- [ ] `<xmdl-editor readonly="true">`: no control changes the content in apply or raw mode; the
      embedded `<code-editor>` is readonly; removing the attribute re-enables everything.
- [ ] `<md-editor readonly="true">`: typing, every toolbar command and the raw toggle are inert;
      removing the attribute restores them.
- [ ] One element test per format for the restore path.
- [ ] Context Manager: no change needed (it already sets the attribute); note in the WAL entry that
      the gaps are closed, with the surfaces PR, when the pin next moves.

## Implementation plan

One PR. xmdl first (it is the cleaner change: one attribute, one render pass), then md's toolbar,
then drop the two opt-outs and run the suites; finish in the harness with the Read-only toggle on
each format.
