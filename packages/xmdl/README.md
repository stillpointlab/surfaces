# @stillpointlab/xmdl-editor

XMDL parser and web component package for typed template documents.

This package currently provides the XMDL MVP parser, a small render helper, and minimal
`<xmdl-editor>` / `<xmdl-preview>` custom-element entrypoints. The preview and apply interfaces are
expanded by follow-on Context Manager tasks.

## XMDL MVP

An XMDL document is a leading YAML front matter block followed by a template body. The parser only
consumes the first leading front matter block, so Markdown output can include its own generated
front matter at the start of the template body.

Supported body syntax:

- `{{paramName}}`
- `{{#if paramName}}...{{/if}}`

Helpers, loops, partials, arbitrary code execution, and project-content params are intentionally out
of scope for the MVP.
