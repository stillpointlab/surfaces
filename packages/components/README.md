# Components

A component is a UI element with no good and no mount of its own, rendered by formats, apps or the
host. The set is deliberately small: a component moves here when an app element needs to render it
inside itself, or when moving it costs almost nothing beside one that does. Page chrome stays with
the host. See the placement test in [`../apps/README.md`](../apps/README.md).

## The package convention

- **Name:** `@stillpointlab/<name>-component`, in `packages/components/<name>`, where `<name>` is the
  tag.
- **One entry, `.`.** It registers the element through `defineElement` from `common` and exports its
  class. `sideEffects` lists the entry's source and `dist` files, so a bare
  `import '@stillpointlab/<name>-component'` survives tree shaking.
- **Styles** use `common`'s tokens and pass `tooling/check-tokens.mjs`. The stylesheet's name has no
  hyphen, because `tooling/gen-styles.mjs` turns `<name>.scss` into an export called `<name>Styles`
  (`modal.scss`, `modalStyles`).
- **No host contract.** A component has no good and no mount, so it has no `whenReady` and no
  conformance suite. It raises events for anything the host owns.
- **Build and test** with `formatPackage` from `tooling/tsup.ts` and `formatTest()` from
  `tooling/vitest.ts` (jsdom).
- **`dev/fixtures.ts`** mounts the tag as an extra element in the harness, with controls for what can
  vary.
- **The README** lists the element's attributes, slots, events and the tokens it reads.
