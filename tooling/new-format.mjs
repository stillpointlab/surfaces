// Scaffold a format package from tooling/template/format.
//
//   npm run new-format -- <name>        e.g. npm run new-format -- video
//
// Copies the template to packages/formats/<name>, renaming `sample` → <name>
// and `Sample` → <Name> in file names and contents, and assigns the next free
// playground port. The template is a complete, buildable format, so the result
// builds, tests and lints with no edits beyond its name.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = join(root, 'tooling', 'template', 'format');
const formatsDir = join(root, 'packages', 'formats');
const TEMPLATE_PORT = 5199;

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error('usage: npm run new-format -- <kebab-case-name>');
  process.exit(1);
}
const pascal = name
  .split('-')
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join('');
const dest = join(formatsDir, name);
if (existsSync(dest)) {
  console.error(`${dest} already exists`);
  process.exit(1);
}

// Next free playground port: one above the highest a format declares.
let port = 5180;
for (const entry of readdirSync(formatsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const config = join(formatsDir, entry.name, 'vite.config.ts');
  if (!existsSync(config)) continue;
  const match = /port:\s*(\d+)/.exec(readFileSync(config, 'utf8'));
  if (match) port = Math.max(port, Number(match[1]) + 1);
}

const rename = (text) =>
  text
    .replaceAll('sample', name)
    .replaceAll('Sample', pascal)
    .replaceAll(String(TEMPLATE_PORT), String(port));

function copy(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, rename(entry.name));
    if (entry.isDirectory()) copy(source, target);
    else writeFileSync(target, rename(readFileSync(source, 'utf8')));
  }
}

copy(template, dest);

console.log(
  `created packages/formats/${name} (@stillpointlab/${name}-format, playground port ${port})`
);
console.log('next: npm install, then add the row to the root README table and run npm run check');
