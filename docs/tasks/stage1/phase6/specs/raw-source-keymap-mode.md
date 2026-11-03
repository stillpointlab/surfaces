---
column: todo
created: 2026-11-03T00:05:12-07:00
tags: [formats, common, host-contract]
---

# Spec: editors with a raw view take a keymap mode

_From the Context Manager adoption of the raw view (context-manager#1009, stage 5 WAL). Touches
`common/src/raw.ts` like [line-endings-as-set](line-endings-as-set.md); whichever lands second
rebases._

## High-level goal

md, xmdl and sheet editors implement the contract's optional keymap-mode methods for their raw
text, so a host's keyboard-mode preference (Normal or Vim) reaches the `<code-editor>` inside a raw
view, and a choice made there reaches the host, as it does for a code good.

## Related context

- Follow-up to: the [raw view convention](../../phase5/specs/raw-view-convention.md).
- Depends on: nothing.
- Main files/areas: `common/src/raw.ts` and `contracts.ts`; the md, xmdl and sheet editors; the
  code README's keymap section; the root README's raw view rules.

## Why

The `EditorElement` contract has optional keymap-mode methods: `getSupportedKeymapModes`,
`getKeymapMode` and `setKeymapMode`, a `keymap-mode` attribute and a `keymap-mode-change` event.
Only `<code-editor>` implements them. Context Manager stores the person's choice and applies it to
whatever editor the page has. For md, xmdl and sheet that is a no-op, because they have no
`setKeymapMode`. The `<code-editor>` inside their raw view shows its own Normal/Vim toolbar and always
starts in Normal. A choice made there is never stored, because its `keymap-mode-change` does not
bubble out of the format's shadow root.

## Technical requirement

1. **The keymap applies to raw text.** md, xmdl and sheet editors implement the three methods, the
   `keymap-mode` attribute (reflected) and `keymap-mode-change` (dispatched on the element, not
   bubbling), as `<code-editor>` does. The mode governs the raw view only; the rich view's keys do
   not change.
2. **Supported modes follow the raw surface.** `getSupportedKeymapModes()` is
   `['normal', 'vim']` when `<code-editor>` is defined, else `['normal']`. `setKeymapMode` with an
   unsupported mode returns an `unsupported` result, as `<code-editor>` does.
3. **The mode is the editor's, not the surface's.** `setKeymapMode` while in rich records the mode
   and returns `applied`; the raw view opens in it. While in raw it forwards to the embedded
   `<code-editor>` and returns its result. A Vim load that fails is reported as `<code-editor>`
   reports it.
4. **Choices in the raw view reach the host.** When the person picks a mode on the embedded
   editor's toolbar, the format editor records it, reflects `keymap-mode` and dispatches its own
   `keymap-mode-change` with the embedded editor's detail.
5. **One helper in `common`.** `createRawSource` gains a `keymapMode` option and an
   `onKeymapModeChange` callback, and `RawSource` gains `setKeymapMode(mode)`. A small helper, for
   example `createKeymapState(host)`, holds the mode, reflects the attribute and dispatches the
   event; each format calls it from its existing methods. Per phase 4, this is a helper the
   element calls, not a base class.
6. **`readonly`.** As in `<code-editor>`: a read-only raw view runs in Normal and shows no
   toolbar. The recorded mode returns when `readonly` is removed.

## Clarifications

- **The embedded toolbar stays.** It is the only place a person chooses a mode, so hiding it would
  leave md, xmdl and sheet users with no way to change it. The alternative was to move the
  Normal/Vim choice into each format's raw toolbar beside the "Raw Text" switch. That gives one
  toolbar row instead of two, but each format then renders and keeps in step a control
  `<code-editor>` already has. It can follow if the stacked toolbars look wrong in Context Manager.

## Non-goals

- Vim in the rich views (ProseMirror, the sheet grid).
- New keymap modes.
- Any change to `<code-editor>`'s own keymap behaviour.

## Acceptance / completion checklist

- [ ] md, xmdl and sheet editors pass a keymap check: `setKeymapMode('vim')` in rich, then
      entering raw, gives an embedded editor in Vim. A toolbar choice in raw fires the format's
      `keymap-mode-change` and updates its attribute. With `?raw=plain`, only Normal is supported.
- [ ] The check lives in `common/src/testing` so the template's sample editor runs it too.
- [ ] Read-only raw is Normal with no toolbar, and the mode returns after `readonly` is removed.
- [ ] Checked by hand in the harness in Chromium, which already logs `keymap-mode-change`, with and
      without `<code-editor>` registered.
- [ ] `npm run check` is green.

## Context Manager follow-up (with the next pin move)

No code change: `initializeEditorKeymapPreference` already applies the stored mode through
`setKeymapMode` and stores `keymap-mode-change`. Check it on an md good: pick Vim in raw, reload,
and the raw view opens in Vim. Strike the WAL deferral.

## Implementation plan

One PR: the helper and `createRawSource` changes with unit tests, then the shared check, then md,
xmdl and sheet in turn, then a harness check in Chromium with and without `<code-editor>`.
