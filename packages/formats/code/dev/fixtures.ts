// This format in the surfaces harness (`npm run dev`), mounted through its
// descriptor. `<code-diff>` is an extra the descriptor does not cover.
import '../src/diff';

import { codeFormat, languageFromPath } from '../src/format';

import type { HarnessFixture, HarnessFormat } from '../../../../tooling/harness/types';
import type { DiffElement } from '@stillpointlab/common-format';

const python = `def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}!"


for i in range(3):
    print(greet(f"world {i}"))
`;

const typescript = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

for (const i of [0, 1, 2]) {
  console.log(greet(\`world \${i}\`));
}
`;

/**
 * A fixture for the file at `path`: the descriptor hands the editor and preview the
 * content with the language the path implies, and the diff shows it against `changed`.
 */
const inFile = (path: string, content: string, changed: string): HarnessFixture => ({
  content,
  path,
  apply: ({ editor, preview, extras }) => {
    for (const el of [editor, preview]) if (el) codeFormat.apply(el, { path, text: content });
    const diff = extras['code-diff'] as DiffElement | undefined;
    const language = languageFromPath(path);
    if (language) diff?.setAttribute('language', language);
    else diff?.removeAttribute('language');
    diff?.setContents({ left: content, right: changed });
  },
});

/** A boolean attribute control for the diff (`"true"` / `"false"`, as the element reads them). */
const diffToggle = (attribute: string, label: string, initial: boolean) =>
  ({
    kind: 'toggle',
    label,
    initial,
    apply: ({ extras }, on) => extras['code-diff']?.setAttribute(attribute, String(on)),
  }) satisfies NonNullable<HarnessFormat['controls']>[number];

export default {
  format: codeFormat,
  elements: { extra: ['code-diff'] },
  fixtures: {
    Python: inFile(
      'greet.py',
      python,
      python.replace('Hello', 'Hi').replace('range(3)', 'range(5)')
    ),
    TypeScript: inFile(
      'greet.ts',
      typescript,
      typescript.replace('[0, 1, 2]', '[0, 1, 2, 3]').replace('Hello', 'Hey')
    ),
    'Plain text': inFile('notes.txt', 'one\ntwo\tthree\nfour  \n', 'one\ntwo three\nfour\nfive\n'),
    'Long file': inFile(
      'values.py',
      Array.from({ length: 120 }, (_, i) => `value_${i} = ${i}`).join('\n'),
      Array.from({ length: 120 }, (_, i) =>
        i === 60 ? `value_${i} = "changed"` : `value_${i} = ${i}`
      ).join('\n')
    ),
  },
  controls: [
    diffToggle('wrap', 'Diff: wrap', true),
    diffToggle('show-whitespace', 'Diff: show whitespace', false),
    diffToggle('ignore-whitespace', 'Diff: ignore whitespace', false),
    diffToggle('collapse-unchanged', 'Diff: collapse unchanged', true),
  ],
} satisfies HarnessFormat;
