// Fail when a format stylesheet hardcodes a colour. Colours come from the shared
// tokens in packages/common/src/styles/_tokens.scss (`@use 'common/src/styles/tokens'
// as *;`), so a host themes every surface by setting the `--spl-*` properties.
// Format-scoped properties (`--spl-sheet-*`, `--spl-xmdl-*`) are fine as long as
// their fallback is a token, never a literal. Run by `npm run lint`.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scanned = [
  join(root, 'packages/components'),
  join(root, 'packages/formats'),
  join(root, 'packages/apps'),
  join(root, 'packages/hosts'),
  join(root, 'tooling/template'),
];

const NAMED = [
  'white',
  'black',
  'red',
  'green',
  'blue',
  'gray',
  'grey',
  'orange',
  'yellow',
  'purple',
  'pink',
  'silver',
  'navy',
  'teal',
  'maroon',
  'olive',
  'lime',
  'aqua',
  'fuchsia',
];
const RULES = [
  { name: 'hex colour', pattern: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()/rgba()', pattern: /\brgba?\(/g },
  { name: 'hsl()/hsla()', pattern: /\bhsla?\(/g },
  // A bare colour keyword in a value; `$primary-blue` and `--spl-text-blue` are names, not keywords.
  {
    name: 'named colour',
    pattern: new RegExp(`:[^;{}]*(?<![\\w$-])(${NAMED.join('|')})(?![\\w-])`, 'g'),
  },
];

function* stylesheets(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist'].includes(entry.name)) yield* stylesheets(path);
    } else if (entry.name.endsWith('.scss')) {
      yield path;
    }
  }
}

/** Blank out comments, keeping line numbers. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (line) => ' '.repeat(line.length));
}

const problems = [];
for (const dir of scanned) {
  for (const file of stylesheets(dir)) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          problems.push(`${relative(root, file)}:${index + 1}: ${rule.name}: ${line.trim()}`);
        }
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`check-tokens: ${problems.length} hardcoded colour(s); use a token from common:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('check-tokens: no hardcoded colours in format stylesheets');
