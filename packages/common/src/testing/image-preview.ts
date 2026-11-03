import { afterEach, describe, expect, it } from 'vitest';

import { create, mount, pending, settled, settledBy } from './support';

import type { ImagePreviewElement } from '../contracts';

export interface ImagePreviewContractOptions<T extends ImagePreviewElement = ImagePreviewElement> {
  /** A source the element can show. */
  src: string;
  alt: string;
  /**
   * Make the current image finish loading. Browsers load a real `src` on their
   * own; jsdom never does, so the default dispatches `load` on the rendered
   * `<img>`. A real browser ignores the extra event once the image has loaded.
   */
  load?: (el: T) => void;
  /** Make the current image fail. Default: dispatch `error` on the rendered `<img>`. */
  fail?: (el: T) => void;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

const dispatchOnImage = (type: string) => (el: ImagePreviewElement) => {
  el.shadowRoot?.querySelector('img')?.dispatchEvent(new Event(type));
};

/** The `ImagePreviewElement` conformance suite for one tag. */
export function describeImagePreviewContract<T extends ImagePreviewElement = ImagePreviewElement>(
  tag: string,
  options: ImagePreviewContractOptions<T>
): void {
  const { src, alt, prepare } = options;
  const load = options.load ?? dispatchOnImage('load');
  const fail = options.fail ?? dispatchOnImage('error');

  describe(`<${tag}> image preview contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('is pending until connected and settles with nothing to show', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      const events = settledBy(el);
      pending(el);

      document.body.append(el);
      await settled(el, events);
      expect(el.shadowRoot?.querySelector('img')).toBeNull();
    });

    it('is pending while a source loads and settles once it has', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      el.setSource(src, alt);
      pending(el);
      const img = el.shadowRoot?.querySelector('img');
      expect(img?.getAttribute('src')).toBe(src);
      expect(img?.getAttribute('alt')).toBe(alt);

      const events = settledBy(el);
      load(el);
      await settled(el, events);
      expect(el.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe(src);
    });

    it('settles when the source fails to load', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      el.setSource(src, alt);
      pending(el);
      fail(el);
      await settled(el);
    });

    it('shows a source set before connect once loaded', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      el.setSource(src, alt);
      pending(el);

      document.body.append(el);
      pending(el);
      load(el);
      await settled(el);
      expect(el.shadowRoot?.querySelector('img')?.getAttribute('alt')).toBe(alt);
    });

    it('settles after a synchronous move right after mount', async () => {
      // Appending a connected element elsewhere disconnects and reconnects it in
      // one tick; work started for the first connection must not strand the second.
      const el = create<T>(tag);
      prepare?.(el);
      el.setSource(src, alt);
      const first = document.createElement('div');
      const second = document.createElement('div');
      document.body.append(first, second);
      first.append(el);
      second.append(el);
      load(el);
      await settled(el);
      expect(el.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe(src);
    });

    it('is pending while disconnected and settles again on reconnect', async () => {
      const el = mount<T>(tag, prepare);
      el.setSource(src, alt);
      load(el);
      await settled(el);

      el.remove();
      pending(el);

      document.body.append(el);
      load(el);
      await settled(el);
    });
  });
}
