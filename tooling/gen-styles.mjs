// Compile each component's SCSS to a TS module exporting the CSS as a string, so
// the component can inject it into its shadow root without relying on a
// bundler-specific `?inline` import. Run before build/dev/test.
//
// Every `packages/*/src/**/<name>.scss` (partials `_*.scss` excluded) becomes a
// sibling `<name>.styles.ts` exporting `<name>Styles`. With a directory argument
// only that package is generated; without one, all of them.
import { readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as sass from 'sass';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

function* scssFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') yield* scssFiles(path);
    } else if (entry.name.endsWith('.scss') && !entry.name.startsWith('_')) {
      yield path;
    }
  }
}

const targets = process.argv[2]
  ? [resolve(process.argv[2])]
  : readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(packagesDir, entry.name));

for (const pkg of targets) {
  for (const scssPath of scssFiles(join(pkg, 'src'))) {
    const name = basename(scssPath, '.scss');
    const outPath = join(dirname(scssPath), `${name}.styles.ts`);
    const { css } = sass.compile(scssPath, { style: 'compressed' });
    const banner = `// AUTO-GENERATED from ${name}.scss by tooling/gen-styles.mjs. Do not edit.\n`;
    writeFileSync(outPath, `${banner}export const ${name}Styles = ${JSON.stringify(css)};\n`);
    console.log(`gen-styles: wrote ${relative(root, outPath)} (${css.length} bytes)`);
  }
}
