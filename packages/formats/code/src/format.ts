// The `./format` entry: which paths this format opens, the language a path
// implies, and how a host mounts the format (see `FormatDescriptor` in common).
// Importing it defines no element and loads no CodeMirror: each `load()` is the
// package's `./preview` or `./editor` entry, which the build keeps as its own file
// (splitting is on).
import { extensionOf } from '@stillpointlab/common-format/format';

import type { PreviewElement } from '@stillpointlab/common-format';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

// Extension → a language name `@codemirror/language-data` resolves (the elements'
// `language` attribute). Copied from Context Manager's `EXTENSION_TO_LANGUAGE` at
// e82fd321, so both hosts class a path the same way.
const LANGUAGES: ReadonlyMap<string, string> = new Map([
  ['.js', 'JavaScript'],
  ['.mjs', 'JavaScript'],
  ['.cjs', 'JavaScript'],
  ['.jsx', 'JavaScript'],
  ['.ts', 'TypeScript'],
  ['.tsx', 'TypeScript'],
  ['.mts', 'TypeScript'],
  ['.cts', 'TypeScript'],
  ['.py', 'Python'],
  ['.json', 'JSON'],
  ['.html', 'HTML'],
  ['.htm', 'HTML'],
  ['.css', 'CSS'],
  ['.scss', 'SCSS'],
  ['.sass', 'Sass'],
  ['.less', 'LESS'],
  ['.java', 'Java'],
  ['.go', 'Go'],
  ['.rs', 'Rust'],
  ['.rb', 'Ruby'],
  ['.php', 'PHP'],
  ['.sh', 'Shell'],
  ['.bash', 'Shell'],
  ['.zsh', 'Shell'],
  ['.sql', 'SQL'],
  ['.yaml', 'YAML'],
  ['.yml', 'YAML'],
  ['.xml', 'XML'],
  ['.c', 'C'],
  ['.h', 'C'],
  ['.cpp', 'C++'],
  ['.cc', 'C++'],
  ['.cxx', 'C++'],
  ['.hpp', 'C++'],
  ['.cs', 'C#'],
  ['.kt', 'Kotlin'],
  ['.kts', 'Kotlin'],
  ['.swift', 'Swift'],
  ['.md', 'Markdown'],
  ['.markdown', 'Markdown'],
]);

/**
 * The language a path implies, by its extension without regard to case
 * (`app.py` → `Python`), or `null` when it has none this format knows: the
 * elements then show plain text with line numbers.
 */
export function languageFromPath(path: string): string | null {
  return LANGUAGES.get(extensionOf(path)) ?? null;
}

export const codeFormat: FormatDescriptor = {
  id: 'code',
  opens: [...LANGUAGES.keys()],
  needs: 'text',
  preview: { tag: 'code-preview', load: () => import('./preview/index') },
  editor: { tag: 'code-editor', load: () => import('./editor/index') },
  apply(element, file) {
    const language = languageFromPath(file.path);
    if (language) element.setAttribute('language', language);
    else element.removeAttribute('language');
    (element as PreviewElement).setContent(file.text ?? '');
  },
};
