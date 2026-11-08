# Apps

An app owns a **scope**: it is mounted by a manifest onto a folder of goods and is the sole executor
inside it, running import → transform → flush over many goods (Context Manager ADR-0028). Tasks and
inventory are the first two, and they move here from Context Manager's `src/` in the apps breakout.

A format, by contrast, edits **one good** and is selected by its content type. See
[`../formats/`](../formats/).

## Placement test

- Does the user work on one good's bytes, chosen by content type? → a **format**, however rich its
  editor (sheet is the stress test: one `.sheet` good with an app-like interior).
- Does the user work on a tree of goods under a manifest, with a model of its own? → an **app**.
- Grey case? Prefer a container format (the `.sheet` envelope precedent) and keep it a format. Apps
  are for when the unit of work is a folder, not a file.
- A UI element with no good and no mount of its own, rendered by formats, apps or the host? → a
  **component** (`packages/components/<name>`).

Both are the same kind of citizen to the host: a stateless client of the `get` / `list` / `put`
contract (`put` is a proposal), so both share `packages/common` and the scaffold.

## The package convention

- **Name:** `@stillpointlab/<name>-app`, in `packages/apps/<name>`.
- **`.` is the core.** The root entry is DOM-free and runs in Node and the browser: Context
  Manager's server runs it, and so does its client. It imports only `yaml`, `zod`,
  `@stillpointlab/common-format` (including `./yaml`) and the formats' DOM-free entries.
- **The lifecycle** is exported from the root as `<name>Lifecycle`, an `AppLifecycle` from
  `@stillpointlab/common-format/app`: the manifest's name, the paths an instance owns, and what the
  host's tree shows. The host adds its own policy (its error codes, adoption budgets) beside it.
- **`./element` is reserved** for the app's element: an `AppElement` that takes state through
  `setState` and asks its host for ops with `requestOp`, by path. It imports the core's light
  entries and `common-format/app`, never the core's root. It builds its markup with `html` and
  `render` from `common-format/html` (ESLint enforces it), and its tests render a `hostile()` state.
- **More DOM-free entries when a client needs a slice.** A bundler keeps a module's top-level
  calls (a zod schema, say), so a client that needs only constants or a helper gets an entry with
  just those (inventory's `./paths`).
- **Shared types** (the app's file model, its path rules) are exported from the root, so a host
  imports them from the package and keeps no copy.
- **The README is the file-format reference**: what the manifest and the files in scope hold, for
  someone editing them by hand.
- **Build and test** with the shared tooling: `formatPackage` from `tooling/tsup.ts`, and
  `appTest()` from `tooling/vitest.ts` (Node; an element test opts into jsdom per file with
  `// @vitest-environment jsdom`).
- **Conformance:** the core runs `describeAppCore` from `@stillpointlab/common-format/testing/app`
  over fixture folders of its own, with its lifecycle; an element runs `describeAppElementContract`.
