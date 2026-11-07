---
column: in-progress
created: 2026-11-07T13:27:40-07:00
tags: [apps, common, code]
---

# Spec: the shared components move here

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 4. One spec, because
the two components are small and share one Context Manager adoption._

## High-level goal

`packages/components/` exists as the third category beside `formats/` and `apps/`, and holds
`<modal-dialog>` and `<spl-icon>`, moved from Context Manager with their tag names, attributes, slots
and events unchanged. Context Manager imports them from the submodule and deletes its copies. Users
see no change, apart from the one fix named in requirement 3.

## Related context

- Decisions: the brief's answers (one package per component, `@stillpointlab/<name>-component`;
  `modal-dialog` and `spl-icon`; `options-menu` only if phase 5 needs it; `spl-toggle` stays).
- Placement test: `packages/apps/README.md` already has the components line.
- Context Manager decisions: ADR-0035 (amended by the adoption).
- Main files: Context Manager's `src/client/components/modal-dialog/` and
  `src/client/components/icon/`, at `e8e8450b`. Here: `tooling/gen-styles.mjs`,
  `tooling/check-tokens.mjs`, `tooling/harness/`, `packages/common/src/styles/_tokens.scss`.

## Technical requirement

1. **The category.** `packages/components/*` joins everything that lists the other two:
   - the root `workspaces` and `vitest.config.ts`'s projects;
   - `tooling/gen-styles.mjs` and `tooling/check-tokens.mjs`;
   - the harness: the fixtures glob and path pattern in `main.ts`, the `include` in its `tsconfig.json`,
     and the `-format` package name pattern in its `vite.config.ts`, so `npm run dev` works inside a
     component package;
   - the root README's package table and layout.

2. **The package convention**, written down in a new `packages/components/README.md`:
   - **Name:** `@stillpointlab/<name>-component`, in `packages/components/<name>`, where `<name>` is
     the tag.
   - **One entry, `.`.** It registers the element through `defineElement` from `common` and exports
     its class. `sideEffects` lists the entry's source and `dist` files, so a bare import survives
     tree shaking.
   - **Styles** use `common`'s tokens and pass `check-tokens`. The stylesheet name has no hyphen,
     because `gen-styles` turns `<name>.scss` into an export called `<name>Styles`.
   - **No host contract.** A component has no good and no mount, so it has no `whenReady` and no
     conformance suite. It raises events for anything the host owns.
   - **Build and test** with `formatPackage` and `formatTest()` (jsdom), like the formats.
   - **The README** lists the element's attributes, slots, events and the tokens it reads.

3. **`@stillpointlab/modal-dialog-component`.**

   | Context Manager                                | Here (`packages/components/modal-dialog/src/`) |
   | ---------------------------------------------- | ---------------------------------------------- |
   | `components/modal-dialog/modal-dialog.ts`      | `modal-dialog.ts`                              |
   | `components/modal-dialog/modal-dialog.scss`    | `modal.scss`                                   |
   | `components/modal-dialog/modal-dialog.test.ts` | `modal-dialog.test.ts`, its 8 tests unchanged  |

   The element changes in three ways:
   - It imports `modalStyles` instead of `modal-dialog.scss?inline`.
   - It registers through `defineElement`.
   - **The one behaviour change:** the default title is set as text, not interpolated into
     `innerHTML`. Today `<h2>${this.title}</h2>` renders the attribute as markup.
     `decision-dialog` builds its title from an agent's name and escapes it, but the attribute parser
     undoes the escape, so a name containing markup would render as markup. No caller relies on markup in a title, so nothing else changes. A new test covers it.

   The stylesheet changes less than the brief expected. Context Manager's `$surface-overlay`,
   `$text-primary`, `$text-muted`, `$background-hover` and `$primary-blue` are already
   `var(--spl-*)`, and `common`'s spacing and radius values are identical, so `@use`ing `common`'s
   tokens changes only the fallbacks. Two things have no token:
   - `$mobile-breakpoint` becomes a local `768px`.
   - Three literal colours would fail `check-tokens`. They become two new tokens in `_tokens.scss`, with
     today's values as their defaults, and join the README's Theming table:

     ```scss
     $overlay-scrim: var(--spl-overlay-scrim, rgba(0, 0, 0, 0.5));
     $overlay-shadow: var(
       --spl-overlay-shadow,
       0 4px 6px rgba(0, 0, 0, 0.1),
       0 1px 3px rgba(0, 0, 0, 0.08)
     );
     ```

     `$shadow-color` is close but has a different alpha, so reusing it would change the look. Both
     values are the same in light and dark today, so Context Manager sets neither.

4. **`@stillpointlab/spl-icon-component`.**

   | Context Manager             | Here (`packages/components/spl-icon/src/`) |
   | --------------------------- | ------------------------------------------ |
   | `components/icon/icon.ts`   | `spl-icon.ts`                              |
   | `components/icon/icon.scss` | `icon.scss`, all 33 icons                  |
   - The class is exported as `SplIcon` (today an unexported `IconButton`), and it registers through
     `defineElement`.
   - The stylesheet needs no token work: it uses no Context Manager variables and passes
     `check-tokens` as it stands, since its glyphs are masks filled with `currentColor`.
   - Context Manager has no test for it. A small one here covers the rendered name, size and padding,
     and a re-render when an attribute changes.

5. **Harness fixtures.** Each package gets a `dev/fixtures.ts` that mounts its tag as an extra element,
   so the restyle can be checked in both themes:
   - `modal-dialog`: an `Open` toggle, with fixtures for a default title, a `header` slot, and a long
     body that scrolls;
   - `spl-icon`: select controls for icon name, size and padding.

   If the harness assumes an editor or a preview anywhere an extras-only module reaches, that is fixed
   in the harness, not worked around in the fixture.

6. **The Context Manager adoption** (one PR there, after this merges), in the
   `context-manager-surfaces` checkout:
   - Move the pin. Add `packages/surfaces/packages/components/*` to `workspaces`, after `common`, and
     update the lockfile.
   - Point the imports at the packages: 47 files import `modal-dialog` and 12 import `icon`, as value,
     type and bare imports. The `vi.mock` calls in `dashboard.test.ts` and `inventory.test.ts` follow.
   - Delete `src/client/components/modal-dialog/` and `src/client/components/icon/`.
   - Keep the host's own rules: `modal-dialog:not(:defined)` in `_base.scss`, and the `spl-icon` host
     rules in page stylesheets.
   - Amend ADR-0035: a third category, its placement line, and the workspace glob.
   - Compare the client build output with the previous build. No page should grow by more than
     `defineElement` and what it imports.
   - Run the tasks walks (`e2e/walks/`) and the inventory walks against the scratch repository. The
     database reset needs Jamie, and so do pushes to the scratch repository.
   - Add a WAL entry.

## Clarifications

- **`spl-icon` is not yet needed by an app element.** The board element and the inventory page script
  render no `<spl-icon>`: their only uses are in the EJS shells (`back-arrow`, `task`), which stay with
  the host. It moves because the brief decided it, it is the smallest move here, and `options-menu`
  renders it if that follows in phase 5.
- **`modal-dialog` is needed by inventory first.** The board element renders none either: its dialogs
  live in the page and EJS. Inventory's item dialog is built by the page script bound for phase 6.
  Whether the board's dialogs move with its element is a phase 5 question.
- **Kept as they are, each with a WAL entry:**
  - `icon-name="spinner"` is used on two dashboard pages and no such icon exists, so by its CSS it
    renders a filled square rather than a glyph.
  - `<spl-icon>` always has `role="button"` and `tabindex="0"`, even when it is decorative.
  - `<spl-icon>` interpolates its attributes into `innerHTML`. Its callers pass fixed names and labels,
    apart from `conversation-indicator`, whose label comes from admin-configured provider and model
    names, so it does not get the title's fix here.
  - `md-icon` holds 18 of the same icon names as inline SVG. It stays as it is.
- **No history comes with the code**, as for the cores. The PR names the Context Manager source commit.

## Non-goals

- `options-menu`, `spl-toggle`, `notification-banner` or any other component.
- Formats or apps adopting the components, including `md-icon`.
- Any change to the elements' attributes, slots, events or focus behaviour, or new dialog features.
- App elements or the contract (phases 5 and 6).
- A component scaffold: the [one scaffold](../../../unassigned/seeds/one-scaffold-for-formats-and-apps.md)
  seed covers it.

## Acceptance / completion checklist

- [x] `packages/components/` is in the workspaces, `gen-styles`, `check-tokens`, test projects and
      harness, with its README.
- [x] Both packages build, typecheck and pass their tests, including the 8 moved modal tests unchanged.
- [x] A test proves markup in a modal title renders as text.
- [x] A bare import of each package registers its tag in a production build.
- [x] Both components checked in the harness, light and dark.
- [x] `--spl-overlay-scrim` and `--spl-overlay-shadow` are in `_tokens.scss` and the Theming table.
- [ ] Context Manager adoption PR is green, with the pin on the merge commit, its copies deleted, and
      ADR-0035 amended.
- [ ] The client build shows no page growth beyond `defineElement`.
- [ ] The tasks and inventory walks were run after the adoption, or the PR says which were not and why.
- [x] `npm run check` green here.

## Implementation plan

1. Surfaces PR: the category and convention, the two tokens, both packages copied from Context Manager
   `e8e8450b`, their fixtures.
2. Context Manager PR, from `context-manager-surfaces`: the adoption above, walked.
3. Phase close: this card done, WAL entries, changelog section, `current` moved to 2/5.

## Implementation notes

- Copied from Context Manager `e8e8450b`. The 8 moved modal tests are unchanged; 2 new title tests and
  4 `spl-icon` tests join them.
- Compiled against Context Manager's stylesheets, `icon.scss` is identical. `modal.scss` differs only
  in the token fallbacks and the two new tokens, and the browser computes today's scrim and shadow
  from them.
- `eslint.config.mjs` also needed the new category, which the spec did not list.
- The harness gave an extra element a ready badge whether it had a ready signal or not, so components
  sat on "pending". The badge now needs `whenReady`, and the formats' extras keep theirs.
- Checked in the harness with Chromium, driven by Context Manager's Playwright since this repository
  has none: all four modal fixtures in both themes, Escape, all 33 masks, and the sizes and paddings.
