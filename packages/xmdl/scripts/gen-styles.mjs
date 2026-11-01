import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
  {
    scss: '../src/editor/editor.scss',
    out: '../src/editor/editor.styles.ts',
    name: 'editorStyles',
  },
  {
    scss: '../src/preview/preview.scss',
    out: '../src/preview/preview.styles.ts',
    name: 'previewStyles',
  },
];

for (const target of targets) {
  const scssPath = resolve(here, target.scss);
  const outPath = resolve(here, target.out);
  const { css } = sass.compile(scssPath, { style: 'compressed' });
  const source = target.scss.split('/').pop();
  const banner = `// AUTO-GENERATED from ${source} by scripts/gen-styles.mjs. Do not edit.\n`;
  writeFileSync(outPath, `${banner}export const ${target.name} = ${JSON.stringify(css)};\n`);
  console.log(`gen-styles: wrote ${outPath} (${css.length} bytes)`);
}
