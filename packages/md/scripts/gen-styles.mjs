// Compile the editor SCSS to a TS module exporting the CSS as a string, so the
// editor can inject it into its shadow root without relying on a bundler-specific
// `?inline` import. Run before build/dev/test.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const here = dirname(fileURLToPath(import.meta.url));
const scssPath = resolve(here, '../src/editor/editor.scss');
const outPath = resolve(here, '../src/editor/editor.styles.ts');

const { css } = sass.compile(scssPath, { style: 'compressed' });

const banner = '// AUTO-GENERATED from editor.scss by scripts/gen-styles.mjs. Do not edit.\n';
writeFileSync(outPath, `${banner}export const editorStyles = ${JSON.stringify(css)};\n`);

console.log(`gen-styles: wrote ${outPath} (${css.length} bytes)`);
