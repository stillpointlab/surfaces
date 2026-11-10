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
  - The core half, `AppCore` over an `AppSnapshot` (the manifest path, the paths a host sees, the
    files' contents with its drafts laid over, and paths a new file may not use: plain data, no
    callbacks). `project(snapshot, view, facts)` answers the state one view renders, or `null` when
    its subject is gone; `facts` are what only the host knows, never its ids. `apply(snapshot, op)`
    answers the `FileChange`s an op makes (`write`, `create`, or `move` with the new content) or a
    refusal. `seed(input)` answers a new instance's files, and `placeNewFiles(files, { taken,
reusable })` whether they fit among a host's paths.
  - The element half, `AppElement<State>`: the host calls `setState`, and the element asks for ops
    with `requestOp(element, op)`, a cancelable `app-op` event the host claims and answers through
    `respond`. Nothing claiming it resolves to `OP_UNHANDLED`, and a host that throws to
    `OP_FAILED`. `answerOps(element, handler)` is the host's side. Ops carry paths, never a host's
    ids.
  - It also re-exports `createReadyGate` and the logging functions, so an app element needs nothing
    else from `common`.
- **Markup that escapes by default** (`@stillpointlab/common-format/html`), a light entry every
  component and app element builds its markup with:
  - `html`, a tagged template returning a `SafeHtml`. A `SafeHtml` value goes in as it is, an array
    item by item, `null`/`undefined`/`false` add nothing, and anything else is converted with
    `String()` and escaped (`&`, `<`, `>`, `"`, `'`). Only `html` makes a `SafeHtml`: there is no way
    to mark a string as safe, so markup that must not be escaped is written in the literal parts.
  - `render(target, content)`, the one place markup is set; it refuses anything but a `SafeHtml`.
    ESLint holds components and app elements to it.
  - `escapeHtml(text)` for a string outside a template (works in Node), and `isSafeHtml(value)`.
  - Escaping does not make data safe as an attribute name or an unquoted attribute value, inside
    `<script>` or `<style>` (set a stylesheet as `textContent`), or as a URL: it does not stop
    `javascript:`, so an `href` comes from code that builds the URL, never from a data string.
- **Conformance suites** (`@stillpointlab/common-format/testing`). `describePreviewContract`,
  `describeEditorContract`, `describeImagePreviewContract`, `describeDiffContract`, and for the raw
  view `describeRawViewContract` and `describeKeymapModeContract`, and for app elements
  `describeAppElementContract`: vitest suites a format or app runs for each element it ships, asserting what the contracts promise and nothing more.
  They import `vitest`, so they live in their own entry and never reach a runtime bundle.
  - **Hostile states.** `hostile(state, { except })` returns a deep copy with `HOSTILE_PAYLOAD`
    appended to every string (object keys and the `except`ed property names, such as a `mode` the
    element switches on, stay as they are). The payload breaks out of a quoted attribute and opens
    an `<img data-hostile>`. `expectNoHostileMarkup(root)` throws if any of it became markup in
    `root` or the open shadow roots inside it:

    ```ts
    element.setState(hostile(fixture, { except: ['mode', 'type'] }));
    await element.whenReady();
    expectNoHostileMarkup(element);
    ```
- **App core suite** (`@stillpointlab/common-format/testing/app`). `describeAppCore`: a vitest
  suite an app core runs over fixture folders. Every fixture mounts, and each change re-parses and
  keeps comment lines, CRLF line breaks and the final newline (or its absence), the parts of a
  byte-preserving rewrite that can be checked without knowing the format. A core that implements
  `AppCore` gives a `core` hook: each op is applied to a fixture, its changes written, and a view
  projected before and after (the round trip). An op whose core reads host facts beyond the files
  (a pending move, say) lays them on through its `snapshot`. A core that does not yet gives `rewrites`, each a
  `text → text` function. An optional `lifecycle` hook checks the core's `AppLifecycle` over the
  same fixtures. A rewrite that always ends with a line break (an append at
  the end of the file) sets the `addsFinalNewline` gap, recorded in the follow-ups. A separate entry, so it never loads the element suites.
- **YAML helpers** (`@stillpointlab/common-format/yaml`). `formatYamlScalar`: a scalar written plain
  when YAML reads it back as the same value, otherwise JSON-quoted. DOM-free, for the app cores.
- **Tokens.** `src/styles/_tokens.scss`: the `--spl-*` color custom properties with defaults, plus
  spacing and radius scales. Formats pull them in with `@use 'common/src/styles/tokens' as *;`
  (the style generator adds `packages/` to the Sass load path).
