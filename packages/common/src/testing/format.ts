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
    }
  });
}
