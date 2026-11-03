---
column: todo
created: 2026-11-02T19:05:48-07:00
tags: [formats, common, code]
---

# Spec: a lazy-engine helper, composed by each element

_From the phase 4 spike [shared-element-patterns](../spikes/shared-element-patterns.md), finding 2.
Jamie, 2026-11-02: hoist interfaces and helper functions, not a configurable component framework._

## High-level goal

The four elements that lazy-load an engine (`code-editor`, `code-preview`, `code-diff`,
`md-editor`) share one small, tested piece of code for loading the engine and settling the ready
gate, instead of four hand-written copies. A failed engine load shows the user a message instead of
a blank pane. Each element keeps its own fields, rendering, engine construction and teardown.

## Related context

- Depends on: [element-lifecycle-fixes](element-lifecycle-fixes.md) (`ReadyGate.isCurrent`, the
  move and reconnect cases in the conformance suites). Those cases are this spec's safety net.
- The shared lifecycle today, in all four elements: connect begins a cycle, renders a loading
  shell and defers `load(cycle)` with `setTimeout`; `load` awaits a `Promise.all` of dynamic
  imports, stores the modules on the instance, re-renders and defers `initialize(cycle)` with a
  second `setTimeout`; `initialize` builds the view from the buffered content and settles;
  disconnect destroys the view and begins a cycle.
- The failure path today: a failed import reports the error, re-renders without the loading text,
  and settles. The user sees an empty pane.
- Loading text is written four ways ("Loading editor…", "Loading editor...", "Loading…",
  "Loading..." in image), and failure messages vary per element.
- Main files: the four elements, `packages/common/src/ready.ts`, `packages/common/src/index.ts`, and
  the image preview for the placeholders.

## Technical requirement

1. **`createLazyLoader(load)`** in `common`. Returns a function that runs `load` once and returns
   the same promise to every caller, so every instance of an element shares one import. A rejected
   load is forgotten, so the next connection retries. Each element defines its loader at module
   level, keeping its own list of imports and its own module bag type.
2. **`hydrate(gate, steps)`** in `common`, called by the element from `connectedCallback` after it
   renders its loading shell (and by `code-diff`'s rebuild):

   ```ts
   hydrate<T>(gate: ReadyGate, steps: {
     load: () => Promise<T>;                     // usually the element's lazy loader
     build: (modules: T) => void | Promise<void>; // the element's own view construction
     fail: (error: unknown) => void;             // report and render the failure state
   }): number                                    // the cycle token, for the element's own use
   ```

   It begins a cycle, awaits `load`, and stops if the cycle is no longer current. Otherwise it runs
   `build` and awaits it, then settles the cycle if it is still current. If `load` or `build`
   throws while the cycle is current, it calls `fail` and settles. A stale cycle never builds,
   fails or settles. `build` may be async, so `code-editor` can await its language and keymap
   before the element counts as settled.

3. **No deferrals without a reason.** The two `setTimeout(…, 0)` hops ("so the shadow DOM is
   ready") go: shadow roots and `innerHTML` are synchronous. If an engine needs a laid-out mount,
   that engine's `build` waits for it. A deferral that a test shows to be needed stays, with a
   comment saying which test.
4. **What stays in the element.** Its fields and module bag, `render()`, view construction in
   `build`, view teardown in `disconnectedCallback` (followed by `gate.begin()`), buffered
   `setContent` and `getContent`, attribute handling, and every engine-specific detail. No base
   class, mixin, decorator or lifecycle registry, and no option that switches behaviour inside the
   helper.
5. **Status placeholders.** `common` exports `createStatus(kind, message)`, which returns an element
   with `class="spl-status spl-status--<kind>"` for `loading`, `empty` and `error`. Loading gets
   `role="status"`, error gets `role="alert"`. A `_status.scss` partial in
   `common/src/styles` styles them from the tokens, and each element's stylesheet `@use`s it. The
   messages: "Loading…" while loading; "Couldn't load the editor." or "Couldn't load the preview."
   after a failed engine load. The four lazy elements and `image-preview` use them; sheet keeps its
   own messages, which sit inside its grid layout.
6. **Tests.** Unit tests in `common` for both helpers: one shared import across callers; a retry
   after a rejection; a stale cycle neither builds nor settles; a failed `load` and a throwing
   `build` both call `fail` and settle; an async `build` delays the settle. One element test per
   format makes the engine import fail (for example with `vi.doMock`) and asserts the error
   placeholder and a settled element. The conformance suites, including the move and reconnect
   cases, stay green.

## Clarifications

- `md-preview` is out: it renders asynchronously per `setContent` and already guards with a render
  token. It may use `createStatus` if that is trivial; otherwise it stays as is.
- The failure placeholder is temporary for editors over text formats: the raw-mode work will make
  an engine failure fall back to the source. The helper's `fail` hook is where that will attach.

## Non-goals

- A base element class, or a helper that renders, owns fields or knows about views.
- Changing what each element renders once loaded.
- Raw-mode fallback on failure (the raw-mode brief).

## Acceptance / completion checklist

- [ ] `createLazyLoader`, `hydrate` and `createStatus` are exported from `common`, unit-tested,
      and described in the README next to the ready gate.
- [ ] The four lazy elements use them; none has a `setTimeout` hop or an instance-level
      `Promise.all` of imports left, unless a comment names the test that needs it.
- [ ] A failed engine import shows the error placeholder and settles, with one test per format.
- [ ] Loading and error text is consistent across the four elements and image.
- [ ] The conformance suites are green, including the move and reconnect cases.
- [ ] `npm run check` is green; the harness shows each element loading normally.

## Implementation plan

One PR after the lifecycle fixes land. Add the helpers and `_status.scss` with their tests, then
convert `code-preview` (the simplest), `code-diff` (including its rebuild path), `code-editor`
(async `build` for language and keymap), and `md-editor` last. Finish with image's placeholders and
a pass in the harness.
