import { afterEach, describe, expect, it } from 'vitest';

import { extensionOf } from '../format';

import { settled } from './support';

import type { EditorElement, ReadyElement } from '../contracts';
import type { FormatDescriptor, FormatElementEntry, FormatFile } from '../format';

export interface FormatDescriptorOptions {
  /**
   * Finish loading what this environment never loads, after `apply` and before
   * waiting: jsdom fetches no image, so a format that needs a URL dispatches
   * `load` on its rendered media here. Default: nothing.
   */
  load?: (element: HTMLElement) => void;
}

/**
 * The format descriptor suite: what a format's `./format` entry promises a host.
 * Run it in a test file that imports nothing of the format but its `./format`
 * entry, so the first check sees the tags as the import left them. `samples` are
 * files the format opens, at least one per family of extensions it opens (and
 * per setter `apply` chooses between); each has `text` for a text format and
 * `url` for a URL one.
 */
export function describeFormatDescriptor(
  format: FormatDescriptor,
  samples: readonly FormatFile[],
  options: FormatDescriptorOptions = {}
): void {
  const entries: [role: 'preview' | 'editor', entry: FormatElementEntry][] = [
    ['preview', format.preview],
  ];
  if (format.editor) entries.push(['editor', format.editor]);
  const tags = entries.map(([, entry]) => entry.tag);
  // Read while the file is collected, before any test has loaded an element.
  const definedOnImport = tags.filter((tag) => customElements.get(tag) !== undefined);

  describe(`the "${format.id}" format descriptor`, () => {
    afterEach(() => document.body.replaceChildren());

    it('importing the entry defines none of its tags', () => {
      expect(definedOnImport).toEqual([]);
    });

    it('has samples, each a file it opens with the content it needs', () => {
      expect(samples.length, 'at least one sample').toBeGreaterThan(0);
      for (const sample of samples) {
        expect(format.opens, sample.path).toContain(extensionOf(sample.path));
        if (format.needs === 'text') {
          expect(typeof sample.text, `${sample.path} has text`).toBe('string');
          expect(sample.url, `${sample.path} has no url`).toBeUndefined();
        } else {
          expect(typeof sample.url, `${sample.path} has a url`).toBe('string');
          expect(sample.text, `${sample.path} has no text`).toBeUndefined();
        }
      }
    });

    for (const [role, entry] of entries) {
      it(`${role}.load() defines <${entry.tag}>, and loads one module`, async () => {
        const first = await entry.load();
        expect(customElements.get(entry.tag), `<${entry.tag}> after load()`).toBeDefined();
        expect(await entry.load()).toBe(first);
      });

      for (const sample of samples) {
        it(`${role}: apply ${sample.path}, then whenReady() settles`, async () => {
          await entry.load();
          const element = document.createElement(entry.tag) as ReadyElement;
          document.body.append(element);

          format.apply(element, sample);
          options.load?.(element);
          await settled(element);

          if (role === 'editor' && format.needs === 'text') {
            expect((element as EditorElement).getContent()).toBe(sample.text);
          }
        });
      }

      const { applyPath } = format;
      if (applyPath) {
        // A rename under edits: the element takes another path's attributes and
        // keeps its content, and its own path's attributes are what `apply` set.
        it(`${role}: applyPath sets what apply sets for a path, and leaves the content`, async () => {
          await entry.load();
          const element = document.createElement(entry.tag) as ReadyElement;
          document.body.append(element);

          for (const [index, sample] of samples.entries()) {
            const other = samples[(index + 1) % samples.length] ?? sample;
            format.apply(element, sample);
            options.load?.(element);
            await settled(element);
            const applied = attributesOf(element);
            const content = contentOf(role, format, element);

            applyPath(element, other.path);
            expect(contentOf(role, format, element), `${sample.path} as ${other.path}`).toBe(
              content
            );
            applyPath(element, sample.path);
            await settled(element);
            expect(attributesOf(element), `${sample.path}, back from ${other.path}`).toEqual(
              applied
            );
            expect(contentOf(role, format, element), sample.path).toBe(content);
          }
        });
      }
    }
  });
}

/** An element's attributes by name, in name order. */
function attributesOf(element: HTMLElement): [name: string, value: string][] {
  return [...element.attributes]
    .map((attribute): [string, string] => [attribute.name, attribute.value])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** What an editor of a text format holds, or `null` for an element that cannot say. */
function contentOf(
  role: 'preview' | 'editor',
  format: FormatDescriptor,
  element: HTMLElement
): string | null {
  return role === 'editor' && format.needs === 'text'
    ? (element as EditorElement).getContent()
    : null;
}
