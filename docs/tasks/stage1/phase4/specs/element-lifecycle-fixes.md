---
column: todo
created: 2026-11-02T19:05:48-07:00
tags: [formats, common, host-contract, quick-win]
---

# Spec: element lifecycle fixes

_From the phase 4 spike [shared-element-patterns](../spikes/shared-element-patterns.md). These are
the defects the sweep found. They go first because one of them hangs `whenReady()`, and the
lazy-engine helper builds on the fix._

## High-level goal

Every element settles its current ready cycle on every path, however it is connected, moved or
reconnected. No element leaks a timer across connections. Registering an element twice never
throws.

## Related context

- The ready gate: `packages/common/src/ready.ts`. The contract: `ReadyElement.whenReady()` in
  `packages/common/src/contracts.ts`, settled semantics in the README's "Ready" section.
- Found by the spike's throwaway test: mount an element, then append it to another parent in the
  same tick (a synchronous disconnect and reconnect). `whenReady()` never resolves for
  `code-editor`, `code-preview`, `code-diff` or `md-editor`. It resolves for `md-preview`, which
  guards with a render token.
- Why it hangs: connect begins cycle 1 and schedules `load(1)`; the move begins cycles 2 and 3 and
  schedules `load(3)`. `initialize(1)` builds the view and calls `settle(1)`, which the gate ignores
  because cycle 3 is current. `initialize(3)` finds a view already there and returns
  (`if (this.view || !this.modules) return`) without settling. The "mount node not found" branch
  returns without settling too.
- Host impact: Context Manager never moves these elements today, so it is latent there. Its keymap
  preference and hydrated-baseline adoption both wait on `whenReady()`, so a host that re-parents
  panes would lose both silently.
- Main files: `packages/formats/code/src/{editor/code-editor,preview/code-preview,diff/code-diff}.ts`,
  `packages/formats/md/src/editor/prosemirror-editor.ts`, `packages/common/src/ready.ts`,
  `packages/common/src/testing/{support,preview,image-preview,diff}.ts`.

## Technical requirement

1. **`ReadyGate.isCurrent(token): boolean`.** True when `token` is the latest cycle `begin()`
   returned. Additive; documented beside `begin` and `settle` in `ready.ts` and in the README's
   "Ready" section. It lets a continuation ask whether its connection is still the live one.
2. **Stale continuations stop.** In the four lazy elements, every continuation that runs after an
   `await` or a `setTimeout` (`load`, `initialize`, `code-diff`'s rebuild) returns early when
   `!this.ready.isCurrent(cycle)`. A stale continuation builds nothing and settles nothing. A
   load that finishes while the element is disconnected therefore no longer builds a view in a
   detached shadow root.
3. **The current cycle always settles.** Every exit path of the current cycle settles it: success,
   a failed import (already does), a missing mount node (report the error, then settle; the element
   is settled and empty, the same outcome as a failed import), and the "view already exists" guard
   (settle, since that view was built for the live connection).
4. **The conformance suites cover it.** `describePreviewContract`, `describeImagePreviewContract`
   and `describeDiffContract` (and through the preview suite, `describeEditorContract`) gain two
   cases:
   - _settles after a synchronous move right after mount_: create, set content, append to one
     parent, append to another in the same tick, `await whenReady()` with the suite's usual
     failure-on-timeout, then check the content rendered.
   - _settles again after disconnect and reconnect_: settle, remove, re-append, settle again, and
     the content is still there.
5. **md-editor stops leaking its interval.** `initializeEditor` starts
   `setInterval(() => this.toolbar?.updateState(), 100)` on every hydration and never clears it.
   Remove it: the toolbar already refreshes from `dispatchTransaction`, and ProseMirror dispatches
   a transaction for selection changes, including mouse selection. If a test shows a state only the
   interval caught (for example focus moving in or out), refresh on that event instead. If the
   interval has to stay, store its handle and clear it in `disconnectedCallback`. A test asserts
   that no toolbar refresh runs after disconnect.
6. **`defineElement(tag, constructor)` in `common`.** It registers the element unless the tag is
   taken. If a different constructor already holds the tag, which means two copies of a package
   are loaded, it keeps the existing one and reports a warning through `report`. Every
   registration uses it: the five unguarded ones (`code-editor`, `code-preview`, `code-diff`,
   `md-editor`, `md-preview`) and the guarded ones, including `md-icon`, `md-toggle` and the
   template's two sample elements. The template's elements show the helper to new formats.
7. **One documented rule for boolean attributes.** The README gains a short "Attributes" note:
   contract attributes compare to an explicit value (`readonly="true"` is read-only, a bare
   `readonly` is not), and display options are on when present and not `"false"` (`code-diff`'s
   `wrap`, `show-whitespace`). `common` exports `booleanAttribute(el, name, { defaultOn })`
   implementing the second rule, and `code-diff` uses it in place of its private `boolAttr`
   helpers. The meaning of `readonly` does not change; the raw-mode brief will settle the rule for
   any new contract attribute.

## Non-goals

- The lazy-engine helper itself (next spec). This spec fixes the four elements in place, so each
  fix is small and the helper later replaces the patched code.
- Changing any element's public behaviour beyond settling correctly.
- Moving elements in Context Manager or the harness.

## Acceptance / completion checklist

- [ ] The two new suite cases pass for every element in every format, and fail on `main` for the
      four lazy elements (verified once before the fix).
- [ ] No lazy element builds a view while disconnected.
- [ ] md-editor runs no timer after disconnect.
- [ ] Every `customElements.define` in the repository goes through `defineElement`; loading an
      element module twice in one test does not throw.
- [ ] `isCurrent` and `booleanAttribute` have unit tests in `common`; the README documents both
      and the attribute rule.
- [ ] `npm run check` is green.
- [ ] Context Manager: nothing to change; the fix arrives with the next pin move. Note it in the
      stage 5 WAL then.

## Implementation plan

One PR. Add `isCurrent` with its tests, then the two suite cases and confirm they fail for the four
lazy elements. Fix the four elements, then the md interval, then `defineElement` across all
registrations, then `booleanAttribute` in `code-diff` and the README note.
