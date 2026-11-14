// The descriptor suite over the `./format` entry alone, so the suite sees the tags
// as importing it left them, with one sample per language the format opens.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { describe, expect, it } from 'vitest';

import { codeFormat, languageFromPath } from './format';

describeFormatDescriptor(codeFormat, [
  { path: 'src/app.js', text: 'export const one = 1;\n' },
  { path: 'src/types.d.ts', text: 'export type One = 1;\n' },
  { path: 'tools/run.py', text: 'print("hello")\n' },
  { path: 'package.json', text: '{ "name": "x" }\n' },
  { path: 'index.html', text: '<p>hello</p>\n' },
  { path: 'site.css', text: 'p { color: red; }\n' },
  { path: 'site.scss', text: '$c: red;\np { color: $c; }\n' },
  { path: 'site.sass', text: '$c: red\np\n  color: $c\n' },
  { path: 'site.less', text: '@c: red;\np { color: @c; }\n' },
  { path: 'Main.java', text: 'class Main {}\n' },
  { path: 'main.go', text: 'package main\n' },
  { path: 'main.rs', text: 'fn main() {}\n' },
  { path: 'app.rb', text: 'puts 1\n' },
  { path: 'index.php', text: '<?php echo 1;\n' },
  { path: 'run.sh', text: 'echo hi\n' },
  { path: 'query.sql', text: 'select 1;\n' },
  { path: 'config.yml', text: 'a: 1\n' },
  { path: 'feed.xml', text: '<a/>\n' },
  { path: 'main.c', text: 'int main(void) { return 0; }\n' },
  { path: 'main.cpp', text: 'int main() {}\n' },
  { path: 'Program.cs', text: 'class P {}\n' },
  { path: 'Main.kt', text: 'fun main() {}\n' },
  { path: 'main.swift', text: 'print(1)\n' },
  { path: 'notes.md', text: '# Notes\n' },
]);

describe('languageFromPath', () => {
  it.each([
    ['app.py', 'Python'],
    ['src/App.TSX', 'TypeScript'],
    ['src/types.d.ts', 'TypeScript'],
    ['scripts/build.MJS', 'JavaScript'],
    ['Dockerfile.yaml', 'YAML'],
    ['README.markdown', 'Markdown'],
    ['lib.hpp', 'C++'],
  ])('%j → %j', (path, language) => {
    expect(languageFromPath(path)).toBe(language);
  });

  it.each(['Makefile', 'notes.txt', 'archive.tar.gz', 'dir.py/Makefile', 'x.constructor', ''])(
    '%j has none',
    (path) => {
      expect(languageFromPath(path)).toBeNull();
    }
  );

  it('opens exactly the extensions it knows a language for', () => {
    for (const extension of codeFormat.opens) {
      expect(languageFromPath(`file${extension}`), extension).not.toBeNull();
    }
    expect(codeFormat.opens).toHaveLength(40);
  });

  it('answers names the elements resolve to a CodeMirror language', async () => {
    const { findLanguage } = await import('./editor/language');
    const names = new Set(codeFormat.opens.map((extension) => languageFromPath(extension)));

    for (const name of names) {
      const found = await findLanguage(name);
      expect(found?.name.toLowerCase(), String(name)).toBe(name?.toLowerCase());
    }
  });
});

describe('codeFormat.apply', () => {
  const stand = () => {
    const element = document.createElement('div');
    const set: string[] = [];
    Object.assign(element, { setContent: (text: string) => set.push(text) });
    return { element, set };
  };

  it('sets the language the path implies, then the content', () => {
    const { element, set } = stand();
    codeFormat.apply(element, { path: 'tools/run.py', text: 'print(1)\n' });

    expect(element.getAttribute('language')).toBe('Python');
    expect(set).toEqual(['print(1)\n']);
  });

  it('removes a language the path does not imply, as the fallback for plain text', () => {
    const { element, set } = stand();
    element.setAttribute('language', 'Python');
    codeFormat.apply(element, { path: 'notes.txt', text: 'plain' });

    expect(element.hasAttribute('language')).toBe(false);
    expect(set).toEqual(['plain']);
  });
});
