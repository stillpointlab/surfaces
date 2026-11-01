# @stillpointlab/common-format

What every surface shares. No elements of its own.

- **Logging.** `setErrorHandler`, `setReporter`, `reportError`, `report`: injectable, console by
  default. One module instance serves every format, so a host configures it once; each format also
  re-exports the setters for callers that configure through the format they load.
- **Contracts.** `PreviewElement`, `EditorElement`, `ImagePreviewElement`, `DiffElement` and the
  keymap-mode types: the structural interfaces a host drives a surface through.
- **Tokens.** `src/styles/_tokens.scss`: the `--spl-*` color custom properties with defaults, plus
  spacing and radius scales. Formats pull them in with `@use 'common/src/styles/tokens' as *;`
  (the style generator adds `packages/` to the Sass load path).
