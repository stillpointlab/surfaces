// This format in the surfaces harness (`npm run dev`).
import '../src/editor';
import '../src/preview';
import '../src/diff';

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

/** A fixture that sets the language on all three elements and shows a diff against `changed`. */
const inLanguage = (language: string, content: string, changed: string): HarnessFixture => ({
  content,
  apply: ({ editor, preview, extras }) => {
    editor?.setAttribute('language', language);
    editor?.setContent(content);
    preview?.setAttribute('language', language);
    preview?.setContent(content);
    const diff = extras['code-diff'] as DiffElement | undefined;
    diff?.setAttribute('language', language);
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
  elements: { editor: 'code-editor', preview: 'code-preview', extra: ['code-diff'] },
  fixtures: {
    Python: inLanguage(
      'python',
      python,
      python.replace('Hello', 'Hi').replace('range(3)', 'range(5)')
    ),
    TypeScript: inLanguage(
      'typescript',
      typescript,
      typescript.replace('[0, 1, 2]', '[0, 1, 2, 3]').replace('Hello', 'Hey')
    ),
    'Plain text': inLanguage('', 'one\ntwo\tthree\nfour  \n', 'one\ntwo three\nfour\nfive\n'),
    'Long file': inLanguage(
      'python',
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
