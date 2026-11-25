// Scaffold a format package from one of the templates in tooling/template.
//
//   npm run new-format -- <name>         a text format with an editor (template/format)
//   npm run new-format -- <name> --url   a preview given a URL, no editor (template/url-format)
//
// Copies the template to packages/formats/<name> as `@stillpointlab/<name>-format`,
// renaming `sample` → <name> (`sampleFormat` → <name>Format in camelCase) and
// `Sample` → <Name> in file names and contents. Each template is a workspace that
// builds, lints and tests with every other package, so the result does too with
// no edits beyond its name, appears in the harness (`npm run dev`) through its
// dev/fixtures.ts, and a host registers it through its `./format` descriptor.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templates = {
  text: join(root, 'tooling', 'template', 'format'),
  url: join(root, 'tooling', 'template', 'url-format'),
};
const formatsDir = join(root, 'packages', 'formats');

// What a build, a test run or an install leaves in a template is not copied.
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);
const SKIPPED_FILES = /\.styles\.ts$|\.tsbuildinfo$/;

const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Write the template (the URL one with `url`) to `<into>/<name>` and return that
 * folder. `into` is packages/formats unless a test says otherwise. Throws on a
 * name that is not kebab-case or a folder that already exists.
 *
 * @param {string} name
 * @param {{ url?: boolean, into?: string }} [options]
 * @returns {string}
 */
export function scaffold(name, { url = false, into = formatsDir } = {}) {
  if (!NAME.test(name)) throw new Error(`"${name}" is not a kebab-case name`);
  const pascal = name
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  const dest = join(into, name);
  if (existsSync(dest)) throw new Error(`${dest} already exists`);

  // The URL template's kebab names (its package, tag, id and extension) are
  // `sample-url`, so the two templates share the workspace and the harness; they
  // fold into the one name first. Then camelCase, kebab-case and PascalCase.
  const rename = (text) =>
    text
      .replaceAll('sample-url', 'sample')
      .replace(/sample(?=[A-Z])/g, camel)
      .replaceAll('sample', name)
      .replaceAll('Sample', pascal);

  const copy = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const source = join(from, entry.name);
      const target = join(to, rename(entry.name));
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) copy(source, target);
      } else if (!SKIPPED_FILES.test(entry.name)) {
        writeFileSync(target, rename(readFileSync(source, 'utf8')));
      }
    }
  };
  copy(url ? templates.url : templates.text, dest);
  return dest;
}

/** `npm run new-format -- <name> [--url]` */
function main(args) {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const names = args.filter((arg) => !arg.startsWith('-'));
  if (names.length !== 1 || flags.some((flag) => flag !== '--url') || !NAME.test(names[0])) {
    console.error('usage: npm run new-format -- <kebab-case-name> [--url]');
    process.exit(1);
  }
  const [name] = names;
  let dest;
  try {
    dest = scaffold(name, { url: flags.includes('--url') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  console.log(`created ${relative(root, dest)} (@stillpointlab/${name}-format)`);
  console.log('next: npm install, then add the row to the root README table and run npm run check');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
