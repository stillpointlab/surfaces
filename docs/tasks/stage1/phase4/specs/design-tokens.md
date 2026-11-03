---
column: todo
created: 2026-11-02T19:05:48-07:00
tags: [formats, common, polish]
---

# Spec: one token set, used by every format

_From the phase 4 spike [shared-element-patterns](../spikes/shared-element-patterns.md), finding 1.
Independent of the other phase 4 specs; the toolbar spec's style partial builds on it._

## High-level goal

Every element's colours come from one documented set of `--spl-*` tokens in `common`. A host
themes every surface, light and dark, by setting those properties, and an unthemed host gets one
consistent light default.

## Related context

- The tokens today: `packages/common/src/styles/_tokens.scss` (19 colours with defaults, spacing,
  radius). Only md and the template `@use` it.
- The drift, measured in the spike: code, xmdl and sheet write `var(--spl-*, #literal)` by hand,
  with defaults that disagree (`--spl-border-color` is `#eee` in the tokens and `#d0d7de` in code and
  xmdl). 37 property names live outside the token file. Image uses `--color-*` names no host sets.
  Sheet alone ships a `prefers-color-scheme: dark` block.
- The host: Context Manager sets about 50 `--spl-*` properties in `src/client/styles/_base.scss`,
  light on `:root` and dark under `html[data-theme='dark']`. It is the de facto theme. 28 names the
  formats use are never set by it, and several are near-duplicates of names it does set: xmdl's
  `--spl-error-background`, `--spl-warning-background`, `--spl-warning-text` against the host's
  `--spl-error-bg`, `--spl-warning-bg`, `--spl-warning-color`. Those colours keep their light
  defaults in Context Manager's dark theme.
- The harness defines light and dark values for the token set in `tooling/harness/harness.css`.
- Styles are compiled by `tooling/gen-styles.mjs`, which puts `packages/` on the Sass load path.
  `*.styles.ts` is gitignored, but two are tracked: sheet's generated `table.styles.ts` and
  image's hand-written `preview.styles.ts`.

## Technical requirement

1. **One canonical token set.** `_tokens.scss` holds every shared colour as
   `$name: var(--spl-name, <light default>)`, grouped by family with a comment each: surfaces,
   text, borders, accent, feedback (error, warning, success), focus, buttons, code, overlay and
   shadow. Naming rule: a name Context Manager already sets wins; a new name is added only where no
   host name fits. The expected result:

   | Format's name today                                                              | Canonical token                                                                           |
   | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | `--spl-error-background`, `--spl-error-text`                                     | `--spl-error-bg`, `--spl-error-color`                                                     |
   | `--spl-error-border`                                                             | `--spl-error-border` (new)                                                                |
   | `--spl-warning-background`, `--spl-warning-text`                                 | `--spl-warning-bg`, `--spl-warning-color`                                                 |
   | `--spl-warning-border`                                                           | `--spl-warning-border` (new)                                                              |
   | `--spl-status-complete-*`                                                        | `--spl-success-bg`, `--spl-success-color`                                                 |
   | `--spl-status-incomplete-*`                                                      | `--spl-warning-bg`, `--spl-warning-color`                                                 |
   | `--spl-action-background`, `-text`, `-border`                                    | `--spl-button-bg`, `--spl-button-text`, `--spl-border-color`                              |
   | `--spl-focus-ring`, `--spl-header-bg`, `--spl-button-*`, `--spl-error-bg-subtle` | unchanged, now in the token file                                                          |
   | `--spl-code-active-line-bg`, `--spl-code-selection-bg`                           | unchanged, now in the token file                                                          |
   | image's `--color-text`, `-surface`, `-text-muted`, `-danger`                     | `--spl-text-primary`, `--spl-background-primary`, `--spl-text-muted`, `--spl-error-color` |

   The implementer may adjust the mapping where a rename would visibly change Context Manager, and
   records each adjustment in the PR.

2. **One default per token.** Where format fallbacks disagree, the token's default wins. Each rule
   keeps the property it uses today, so a themed host (Context Manager, the harness) renders
   exactly as before; only an unthemed host sees the unified defaults.
3. **Every format stylesheet uses the tokens.** Each `packages/formats/**/*.scss` starts with
   `@use 'common/src/styles/tokens' as *;` and refers to colours through the SCSS variables.
   Format-scoped properties stay allowed (`--spl-sheet-*`, `--spl-xmdl-*`, and sheet's sizes such
   as `--spl-sheet-row-height`), but a scoped colour falls back to a token
   (`var(--spl-sheet-text, #{$text-primary})`), never to a literal.
4. **A check keeps it that way.** A small `tooling/check-tokens.mjs`, run by `npm run lint`, fails
   on colour literals (hex, `rgb()`, `rgba()`, `hsl()`, named colours other than `transparent`,
   `currentColor` and `inherit`) in format stylesheets. `_tokens.scss` is exempt. The template's
   stylesheets pass it.
5. **Image gets a stylesheet.** Its styles move from the hand-written `preview.styles.ts` into
   `preview.scss` on the tokens, and the generated module is no longer tracked.
6. **No generated styles in git.** Sheet's `table.styles.ts` is removed from the index
   (`git rm --cached`); every script that compiles TypeScript already runs `gen:styles` first.
7. **The host owns dark mode.** Elements ship light defaults only. Sheet's
   `prefers-color-scheme: dark` block goes; a host provides dark values by setting the tokens, as
   Context Manager and the harness do. The harness's dark block gains every new token.
8. **The tokens are documented.** The README gains a "Theming" section with a table of every token,
   its light default and what it colours, and one line on setting them on `:root` or any ancestor
   for light and dark.

## Non-goals

- Restyling anything. Values change only where a fallback disagreed with its token, which an
  unthemed host sees and a themed host does not.
- Spacing, radius and typography tokens beyond what `_tokens.scss` already has.
- Changing Context Manager's theme in this PR. Its follow-up is listed below.

## Acceptance / completion checklist

- [ ] Every format stylesheet `@use`s the tokens; `npm run lint` includes the literal check and
      passes; a deliberate literal makes it fail.
- [ ] No `--color-*` names remain; every `--spl-*` colour name in `packages/formats` is in the
      token file or is format-scoped with a token fallback.
- [ ] No `*.styles.ts` is tracked.
- [ ] The harness renders every format unchanged in light and dark, checked by hand or with
      screenshots before and after. Any intended change is listed in the PR.
- [ ] The README's "Theming" table matches `_tokens.scss`.
- [ ] Context Manager follow-up written into the stage 5 WAL for the next pin move: set the new
      tokens (`--spl-error-border`, `--spl-warning-border`, `--spl-code-active-line-bg`,
      `--spl-code-selection-bg`, and any others the PR adds) in `_base.scss` for both themes, and
      check xmdl and image in dark mode.
- [ ] `npm run check` is green.

## Implementation plan

One PR. Extend `_tokens.scss` and the harness's dark block first, then convert one format per
commit (code, xmdl, sheet, image), then add the check script, then the README. Take harness
screenshots in both themes before the first conversion to compare against.
