import { afterEach, describe, it } from 'vitest';

import { create, defaultRendered, mount, pending, settled, settledBy } from './support';

import type { PreviewElement } from '../contracts';

export interface PreviewContractOptions<T extends PreviewElement = PreviewElement> {
  /** Content the element renders. */
  content: string;
  /** A second content, different from the first, for re-set cases. */
  altContent?: string;
  /** Assert that `content` reached the DOM. Default: the shadow root rendered something. */
  rendered?: (el: T, content: string) => void;
  /** Runs on each created element before it is connected (stubs, attributes). */
  prepare?: (el: T) => void;
}

/** The `PreviewElement` conformance suite for one tag. */
export function describePreviewContract<T extends PreviewElement = PreviewElement>(
  tag: string,
  options: PreviewContractOptions<T>
): void {
  const { content, prepare } = options;
  const altContent = options.altContent ?? `${content}\nmore`;
  const rendered = options.rendered ?? defaultRendered;

  describe(`<${tag}> preview contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('is pending until connected, then settles with the attribute and event', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      const events = settledBy(el);
      pending(el);
      el.setContent(content);
      pending(el);

      document.body.append(el);
      await settled(el, events);
      rendered(el, content);
    });

    it('settles after content set while connected', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      // A synchronous element never leaves the settled state here, so no event
      // is owed; an asynchronous one goes pending and settles again.
      el.setContent(content);
      await settled(el);
      rendered(el, content);
    });

    it('resolves whenReady to the latest of several sets', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(altContent);
      el.setContent(content);

      await settled(el);
      rendered(el, content);
    });

    it('is idempotent for the same content', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(content);
      await settled(el);
      el.setContent(content);

      await settled(el);
      rendered(el, content);
    });

    it('is pending while disconnected and settles again on reconnect', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(content);
      await settled(el);

      el.remove();
      pending(el);

      const events = settledBy(el);
      document.body.append(el);
      await settled(el, events);
      rendered(el, content);
    });
  });
}
