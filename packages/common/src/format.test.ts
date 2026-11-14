// @vitest-environment node
// In Node: the registry and its helpers touch no DOM.
import { describe, expect, it } from 'vitest';

import { createFormatRegistry, extensionOf, fileNameOf } from './format';

import type { FormatDescriptor } from './format';

const descriptor = (id: string, opens: readonly string[]): FormatDescriptor => ({
  id,
  opens,
  needs: 'text',
  preview: { tag: `${id}-preview`, load: async () => ({}) },
  apply: () => {},
});

const md = descriptor('md', ['.md', '.markdown']);
const sheet = descriptor('sheet', ['.csv', '.sheet']);
const code = descriptor('code', ['.ts', '.md', '.json']);

describe('extensionOf', () => {
  it.each([
    ['notes.md', '.md'],
    ['docs/notes.md', '.md'],
    ['README.MARKDOWN', '.markdown'],
    ['src/types.d.ts', '.ts'],
    ['archive.tar.gz', '.gz'],
    ['.md', '.md'],
    ['dir/.eslintrc', '.eslintrc'],
    ['Makefile', ''],
    ['dir.v2/Makefile', ''],
    ['trailing.', '.'],
    ['', ''],
  ])('%j → %j', (path, extension) => {
    expect(extensionOf(path)).toBe(extension);
  });
});

describe('fileNameOf', () => {
  it.each([
    ['photo.png', 'photo.png'],
    ['assets/img/photo.png', 'photo.png'],
    ['dir/', ''],
  ])('%j → %j', (path, name) => {
    expect(fileNameOf(path)).toBe(name);
  });
});

describe('createFormatRegistry', () => {
  it('finds the format whose `opens` has the extension, without regard to case', () => {
    const registry = createFormatRegistry([md, sheet]);

    expect(registry.find('notes.md')).toBe(md);
    expect(registry.find('docs/Notes.MD')).toBe(md);
    expect(registry.find('README.markdown')).toBe(md);
    expect(registry.find('data/table.CSV')).toBe(sheet);
    expect(registry.find('report.sheet')).toBe(sheet);
  });

  it('answers the first registered format when two open an extension', () => {
    expect(createFormatRegistry([md, code]).find('notes.md')).toBe(md);
    expect(createFormatRegistry([code, md]).find('notes.md')).toBe(code);
    expect(createFormatRegistry([md, code]).find('main.ts')).toBe(code);
  });

  it('matches a name with two dots on the last one', () => {
    const registry = createFormatRegistry([code]);

    expect(registry.find('src/types.d.ts')).toBe(code);
    expect(registry.find('package.lock.json')).toBe(code);
  });

  it('answers null for no extension, an unknown one, or a dot in a folder name', () => {
    const registry = createFormatRegistry([md, sheet, code], { fallback: code });

    expect(registry.find('Makefile')).toBeNull();
    expect(registry.find('notes.txt')).toBeNull();
    expect(registry.find('notes.md/Makefile')).toBeNull();
    expect(registry.find('trailing.')).toBeNull();
    expect(registry.find('')).toBeNull();
  });

  it('holds the fallback apart from matching', () => {
    expect(createFormatRegistry([md], { fallback: code }).fallback).toBe(code);
    expect(createFormatRegistry([md]).fallback).toBeNull();
    expect(createFormatRegistry([md], { fallback: code }).find('main.ts')).toBeNull();
  });

  it('lists the formats in registration order, as a copy the caller cannot change', () => {
    const formats = [md, sheet];
    const registry = createFormatRegistry(formats);
    formats.push(code);

    expect(registry.formats).toEqual([md, sheet]);
    expect(Object.isFrozen(registry.formats)).toBe(true);
    expect(registry.find('main.ts')).toBeNull();
  });

  it('refuses two formats with one id', () => {
    expect(() => createFormatRegistry([md, descriptor('md', ['.mdx'])])).toThrow(
      /"md" is registered twice/
    );
  });

  it.each(['md', '.MD', '.d.ts', '.', 'x/.md'])('refuses %j in `opens`', (extension) => {
    expect(() => createFormatRegistry([descriptor('odd', [extension])])).toThrow(
      /expected a lower-case extension/
    );
  });
});
