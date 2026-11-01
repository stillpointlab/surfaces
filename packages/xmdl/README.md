# @stillpointlab/xmdl-editor

XMDL parser and web component package for typed template documents.

This package provides the XMDL 0.1 parser and renderer plus `<xmdl-editor>` and `<xmdl-preview>`
custom-element entrypoints.

## XMDL MVP

An XMDL document is a required leading YAML frontmatter block followed by a template body. The
frontmatter requires `title`, a semver-like `version`, `outputFileType`, and an array of typed
`params`. The parser consumes only the first leading block, so Markdown output may include its own
generated frontmatter at the start of the body.

Supported body syntax:

- `{{paramName}}`
- `{{#if booleanParam}}...{{/if}}` for a declared `bool` param

Param types are `string`, `enum`, `bool`, `number`, and `date`. Helpers, loops, includes, partials,
arbitrary code execution, and project-content params are intentionally out of scope. Context
Manager Apply saves Markdown and XML output; JSON is parse/preview-only in 0.1.

## Development

Use Node.js 24.15+ on the 24.x line for development. Node.js 22.22.2+ on the
22.x line and 26+ also satisfy the build and test requirements.

Run `npm ci` to install dependencies, then `npm run build` to generate ESM,
CommonJS, and type declarations with tsup 9.
