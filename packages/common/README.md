# @stillpointlab/common-format

What every surface shares. No elements of its own.

- **Logging.** `setErrorHandler`, `setReporter`, `reportError`, `report`: injectable, console by
  default. One module instance serves every format, so a host configures it once; each format also
  re-exports the setters for callers that configure through the format they load.
- **Contracts.** `PreviewElement`, `EditorElement`, `ImagePreviewElement`, `DiffElement` and the
  keymap-mode types: the structural interfaces a host drives a surface through. All extend
  `ReadyElement`: `whenReady()` resolves once the element is hydrated and its latest content is in
  the DOM, mirrored by a `ready` attribute and event.
- **Ready gate.** `createReadyGate(host)` implements that for an element: `begin()` returns a cycle
  token before asynchronous work, `settle(token)` marks the element ready when that cycle lands
  (ignored if a newer cycle began), `settle()` with no token is for synchronous work, and `begin()`
  on disconnect makes the element pending until it is connected and rendered again.
- **Conformance suites** (`@stillpointlab/common-format/testing`). `describePreviewContract`,
  `describeEditorContract`, `describeImagePreviewContract`, `describeDiffContract`: vitest suites a
  format runs for each element it ships, asserting what the contracts promise and nothing more.
  They import `vitest`, so they live in their own entry and never reach a runtime bundle.
- **Tokens.** `src/styles/_tokens.scss`: the `--spl-*` color custom properties with defaults, plus
  spacing and radius scales. Formats pull them in with `@use 'common/src/styles/tokens' as *;`
  (the style generator adds `packages/` to the Sass load path).
