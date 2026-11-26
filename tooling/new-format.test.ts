// The scaffold itself: each template, written to a folder of its own, leaves no
// `sample` behind and names the package, its tags and its descriptor anew. It
// reads and writes files only, so it needs no install; that the result builds and
// tests is proved by the templates, which are workspaces tested where they lie.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatScaffold, scaffold } from './new-format.ts';

/** Every file under `dir`, relative to it. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

let into: string;
beforeEach(() => {
  into = mkdtempSync(join(tmpdir(), 'new-format-'));
});
afterEach(() => rmSync(into, { recursive: true, force: true }));

// A name with a dash, so each case of it (kebab, camel, Pascal) is exercised.
const name = 'trial-clip';

describe.each([
  { template: 'format', url: false, tags: ['trial-clip-preview', 'trial-clip-editor'] },
  { template: 'url-format', url: true, tags: ['trial-clip-preview'] },
])('new-format from tooling/template/$template', ({ url, tags }) => {
  it('leaves no sample in a file name or a file', () => {
    const dest = scaffold(name, { url, into });

    const files = filesUnder(dest);
    expect(files.filter((file) => /sample/i.test(file))).toEqual([]);
    for (const file of files) {
      const text = readFileSync(join(dest, file), 'utf8');
      expect(text, file).not.toMatch(/sample/i);
      // A camelCase identifier came out whole (`trialClipFormat`, not `trial-clipFormat`).
      expect(text, file).not.toMatch(/trial-clip[A-Z]/);
    }
  });

  it("names the package, its tags and its descriptor's id anew", () => {
    const dest = scaffold(name, { url, into });

    const manifest = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(manifest.name).toBe('@stillpointlab/trial-clip-format');
    const format = readFileSync(join(dest, 'src/format.ts'), 'utf8');
    expect(format).toContain('export const trialClipFormat: FormatDescriptor');
    expect(format).toContain("id: 'trial-clip',");
    expect(format).toContain("opens: ['.trial-clip'],");
    expect([...format.matchAll(/tag: '([^']+)'/g)].map((match) => match[1])).toEqual(tags);
    for (const tag of tags) {
      const role = tag.slice(name.length + 1);
      const element = readFileSync(join(dest, `src/${role}/${tag}.ts`), 'utf8');
      expect(element).toContain(`defineElement('${tag}',`);
    }
  });

  it('copies none of what a build, a test run or an install left in the template', () => {
    const dest = scaffold(name, { url, into });

    expect(
      filesUnder(dest).filter((file) => /(^|\/)(node_modules|dist)\/|\.styles\.ts$/.test(file))
    ).toEqual([]);
  });

  it('formats what a long name pushed past the width, and then has nothing left to format', async () => {
    const dest = scaffold('a-format-with-quite-a-long-name', { url, into });

    expect(await formatScaffold(dest)).not.toEqual([]);
    expect(await formatScaffold(dest)).toEqual([]);
  });

  it('leaves a short name as the template wrote it', async () => {
    const dest = scaffold('clip', { url, into });

    expect(await formatScaffold(dest)).toEqual([]);
  });

  it('refuses a folder that exists and a name that is not kebab-case', () => {
    scaffold(name, { url, into });

    expect(() => scaffold(name, { url, into })).toThrow(/already exists/);
    expect(() => scaffold('Trial', { url, into })).toThrow(/kebab-case/);
  });
});

describe('new-format --url', () => {
  it('carries the browser test, its config and its media, the media byte for byte', () => {
    const dest = scaffold(name, { url: true, into });
    const template = join(import.meta.dirname, 'template', 'url-format');

    expect(filesUnder(dest)).toEqual(
      expect.arrayContaining([
        'dev/media/swatch.png',
        'src/preview/trial-clip-preview.browser.test.ts',
        'vitest.browser.config.ts',
      ])
    );
    expect(readFileSync(join(dest, 'dev/media/swatch.png'))).toEqual(
      readFileSync(join(template, 'dev/media/swatch.png'))
    );
    const test = readFileSync(join(dest, 'src/preview/trial-clip-preview.browser.test.ts'), 'utf8');
    expect(test).toContain("document.createElement('trial-clip-preview')");
  });
});
