# @stillpointlab/common-format

What every surface shares. No elements of its own.

- **Logging.** `setErrorHandler`, `setReporter`, `reportError`, `report`: injectable, console by
  default. One module instance serves every format, so a host configures it once; each format also
  re-exports the setters for callers that configure through the format they load.
- **Contracts.** `PreviewElement`, `EditorElement`, `UrlPreviewElement` (a preview given a URL;
  `ImagePreviewElement` is its older name), `DiffElement` and the
  keymap-mode types: the structural interfaces a host drives a surface through. All extend
  `ReadyElement`: `whenReady()` resolves once the element is hydrated and its latest content is in
  the DOM, mirrored by a `ready` attribute and event.
- **Ready gate.** `createReadyGate(host)` implements that for an element: `begin()` returns a cycle
  token before asynchronous work, `settle(token)` marks the element ready when that cycle lands
  (ignored if a newer cycle began), `settle()` with no token is for synchronous work, and `begin()`
  on disconnect makes the element pending until it is connected and rendered again.
- **Media.** For a preview over an `<audio>` or a `<video>`. `mediaFailureOf(media)`, after its
  `error` event: `'load'` when the file did not arrive, `'decode'` when it arrived and the browser
  has no decoder for it. `MediaError.code` decides it when it can; for
  `MEDIA_ERR_SRC_NOT_SUPPORTED`, which Chromium and Firefox give a 404 and a file of noise alike,
  it asks the address once (`fetch`, the body let go, no cache). `releaseMedia(media)` lets a
  media element go: paused, its `src` taken away, then `load()`, so it stops sounding and its
  download ends.
- **The format descriptor** (`@stillpointlab/common-format/format`), a light entry that touches no
  DOM, for hosts and for each format's own `./format` entry:
  - `FormatDescriptor`: which paths a format opens (`opens`, lower-case extensions with the dot),
    whether it needs a file's `text` or a `url`, its `preview` and optional `editor` (each a `tag`
    and a `load()` that resolves to the package's `./preview` or `./editor` module, so an element
    is never defined twice), and `apply(element, file)`, which hands a mounted element a
    `FormatFile` (`path` with `text` or `url`) through the format's own setter and attributes. The
    host creates, places, listens to and reads back the element through the contracts above. A
    format whose elements take attributes from the path may also have `applyPath(element, path)`,
    which sets those and leaves the content alone, for a host that renames an open file with
    edits in it.
  - `createFormatRegistry(formats, { fallback })`: `find(path)` answers the first registered
    format whose `opens` has the path's extension, without regard to case, or `null`. The
    extension is the file name's last dot onwards (`types.d.ts` matches `.ts`; a dotfile such as
    `.md` matches `.md`), as `extensionOf(path)` gives it; `fileNameOf(path)` is the last segment.
    `find` never reads a file: whether an unmatched file is text is the host's question, and a host
    that decides it is uses `fallback`. The registry holds no other policy, such as size limits.
  - **Register in this order:** `md`, `xmdl`, `sheet`, `image`, `audio`, `video`, `code`, with
    `code` also as the fallback, as the local host does. The order matters where two formats open
    one ending: `code` opens `.md` and `.markdown` too, so markdown must come first, and `code`
    last. Context Manager's classifier tests a path in the same order without `audio` and
    `video`, which it does not register yet. No other format opens their endings, so a host that
    registers them before `code` still classes every other path as Context Manager does.

    ```ts
    import { createFormatRegistry } from '@stillpointlab/common-format/format';
    import { audioFormat } from '@stillpointlab/audio-format/format';
    import { codeFormat } from '@stillpointlab/code-format/format';
    import { imageFormat } from '@stillpointlab/image-format/format';
    import { mdFormat } from '@stillpointlab/md-format/format';
    import { sheetFormat } from '@stillpointlab/sheet-format/format';
    import { videoFormat } from '@stillpointlab/video-format/format';
    import { xmdlFormat } from '@stillpointlab/xmdl-format/format';

    const registry = createFormatRegistry(
      [mdFormat, xmdlFormat, sheetFormat, imageFormat, audioFormat, videoFormat, codeFormat],
      { fallback: codeFormat }
    );
    ```

- **The app contract** (`@stillpointlab/common-format/app`), a light entry for apps and the host
  pages that mount them:
  - `Result`, `ok()` and `fail()`: an answer is `{ ok: true, …fields }` or
    `{ ok: false, code, message, details? }`, and nothing throws for a rule.
  - The lifecycle half, `AppLifecycle` over `FolderNode`s: an app's manifest name,
    `validateAndScope` (the paths an instance owns, or a `ManifestFailure` with every error in its
    manifest in `details`; `manifestFailure` builds one) and `describeInstance` (what the host's
    tree shows).
  - The core half, `AppCore` over an `AppSnapshot` (the manifest path, the paths a host sees, the
    files' contents with its drafts laid over, and paths a new file may not use: plain data, no
    callbacks). `project(snapshot, view, facts)` answers the state one view renders, or `null` when
    its subject is gone; `facts` are what only the host knows, never its ids. `apply(snapshot, op)`
    answers the `FileChange`s an op makes (`write`, `create`, or `move` with the new content) or a
    refusal. `seed(input)` answers a new instance's files, and `placeNewFiles(files, { taken,
reusable })` whether they fit among a host's paths.
  - The module, `AppModule`: everything a host needs to run an app without knowing which it is.
    It names the app (`id`), its lifecycle and core, which element ops are the core's
    (`coreOps`) and which the host answers itself (`hostOps`), how an element op becomes a core
    op (`toCoreOp`, adding what only the host knows, such as the time), the element's `reply` to
    a core op from the instance after its changes, and `refusalClass(code, op)`: `not-found`,
    `conflict` or `invalid`, which a host maps onto its own answers. The harness answers both
    apps through their modules with one in-memory host (`tooling/harness/memory-host.ts`): the
    runner below over the memory port.
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
  `describeEditorContract`, `describeUrlPreviewContract` (and `describeImagePreviewContract`, the
  same suite with image's hooks), `describeDiffContract`, and for the raw
  view `describeRawViewContract` and `describeKeymapModeContract`, and for app elements
  `describeAppElementContract`: vitest suites a format or app runs for each element it ships, asserting what the contracts promise and nothing more.
  They import `vitest`, so they live in their own entry and never reach a runtime bundle.
  - **Format descriptors.** `describeFormatDescriptor(format, samples, { load })`, which each
    format runs in a test file that imports only its `./format` entry: importing the entry defines
    none of the format's tags, `preview.load()` (and `editor.load()`) defines its tag, and for each
    sample `apply` on a connected element then `whenReady()` settles, with `getContent()` reading
    back the text for a text format's editor. A format with `applyPath` is given another
    sample's path and its own again: the content stays and the attributes are back to what
    `apply` set. Samples are `FormatFile`s, at least one per family of extensions. `load` finishes what jsdom never loads (an image) before the wait.
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
- **The host contract** (`@stillpointlab/common-format/host`), DOM-free and Node-free (its test
  fails the built entry if it names anything from either):
  - `StoragePort`: what a host's storage answers. `list()` the folder's `FolderNode`s, `get(path)` a
    text file with an opaque `version` (the local host's is a SHA-256 of the bytes), `put(changes)`
    all or none, and `status()` per path (`FileStatus`: `changed`, `new`, `moved`, `deleted`).
  - `PortChange`: an app's `FileChange` with an optional `base`, the version the writer read (a
    mismatch refuses the whole `put`), plus a `delete`, and a `move` without `content` that keeps the
    file's bytes. `HostRefusalCode` names the `HOST_` codes a port refuses with.
  - What a host's server sends a page: `HostEvent` (`changed` with paths, or `listed`),
    `HostListing` and `HostRoot`. The local host's routes are in
    [`packages/hosts/local`](../hosts/local/README.md).
  - `HostChange`: one file that differs from the last commit, with its old path (`from`) when it
    moved and its text then (`base`) when the host can read it.
  - **The runner**, one for every host, over a `StoragePort` and a `RunnerHost` (`port`, `now()`,
    and `know(module, loaded)`: the module's facts and the snapshot's host parts, which the runner
    lays over the files and never looks inside). `loadInstance` lists the port, reads the
    manifest, asks the lifecycle for the scope and reads it, answering a `LoadedInstance` with the
    version of each file and one `revision` for them all. `runOp` runs an op in seven steps: a
    core op (`APP_OP_UNKNOWN`), inside the module's bounds, loaded with what the host knows,
    applied, every change the instance's (`APP_PATH_OUT_OF_SCOPE`), written in one `put` at the
    versions read (a path named twice is `APP_CHANGES_INVALID`), and replied from the instance
    loaded again, with its revision. `projectView` reads a view, `createInstance` seeds, places
    and creates an instance. `hostRefusalClass(code)` classes the runner's and the port's codes
    (a file that moved on under an op is a `conflict`); any other code is the module's.
  - **The memory port**, `createMemoryPort(files, { committed? })`: a `StoragePort` over a map of
    paths to text with the local host's rules for `put` and its refusal codes, and `changes()`,
    `commit(paths?)` and `files()` beside them. The harness runs its apps on it.
- **Storage port suite** (`@stillpointlab/common-format/testing/host`).
  `describeStoragePort(name, make, { status? })`: the port's rules as vitest tests, which the
  memory port runs here and the local host's port runs over a temporary repository, so the two
  cannot drift apart. A separate entry, so it never loads the element suites.
- **Tokens.** `src/styles/_tokens.scss`: the `--spl-*` color custom properties with defaults, plus
  spacing and radius scales. Formats pull them in with `@use 'common/src/styles/tokens' as *;`
  (the style generator adds `packages/` to the Sass load path).
