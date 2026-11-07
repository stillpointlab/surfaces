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
- **The app contract** (`@stillpointlab/common-format/app`), a light entry for apps and the host
  pages that mount them:
  - `Result`, `ok()` and `fail()`: an answer is `{ ok: true, …fields }` or
    `{ ok: false, code, message, details? }`, and nothing throws for a rule.
  - The lifecycle half, `AppLifecycle` over `FolderNode`s: an app's manifest name,
    `validateAndScope` (the paths an instance owns, or every error in its manifest) and
    `describeInstance` (what the host's tree shows).
  - The element half, `AppElement<State>`: the host calls `setState`, and the element asks for ops
    with `requestOp(element, op)`, a cancelable `app-op` event the host claims and answers through
    `respond`. Nothing claiming it resolves to `OP_UNHANDLED`, and a host that throws to
    `OP_FAILED`. `answerOps(element, handler)` is the host's side. Ops carry paths, never a host's
    ids.
  - It also re-exports `createReadyGate` and the logging functions, so an app element needs nothing
    else from `common`.
- **Conformance suites** (`@stillpointlab/common-format/testing`). `describePreviewContract`,
  `describeEditorContract`, `describeImagePreviewContract`, `describeDiffContract`, and for the raw
  view `describeRawViewContract` and `describeKeymapModeContract`, and for app elements
  `describeAppElementContract`: vitest suites a format or app runs for each element it ships, asserting what the contracts promise and nothing more.
  They import `vitest`, so they live in their own entry and never reach a runtime bundle.
- **App core suite** (`@stillpointlab/common-format/testing/app`). `describeAppCore`: a vitest
  suite an app core runs over fixture folders. Every fixture mounts, and each rewrite re-parses and
  keeps comment lines, CRLF line breaks and the final newline (or its absence), the parts of a
  byte-preserving rewrite that can be checked without knowing the format. Its hooks wrap the core's
  own functions, and an optional `lifecycle` hook checks the core's `AppLifecycle` over the same
  fixtures. A rewrite that always ends with a line break (an append at
  the end of the file) sets the `addsFinalNewline` gap, recorded in the follow-ups. A separate entry, so it never loads the element suites.
- **YAML helpers** (`@stillpointlab/common-format/yaml`). `formatYamlScalar`: a scalar written plain
  when YAML reads it back as the same value, otherwise JSON-quoted. DOM-free, for the app cores.
- **Tokens.** `src/styles/_tokens.scss`: the `--spl-*` color custom properties with defaults, plus
  spacing and radius scales. Formats pull them in with `@use 'common/src/styles/tokens' as *;`
  (the style generator adds `packages/` to the Sass load path).
