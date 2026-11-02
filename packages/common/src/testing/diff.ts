import { afterEach, describe, expect, it } from 'vitest';

import { create, mount, pending, settled, settledBy } from './support';

import type { DiffElement } from '../contracts';

export interface DiffContractOptions<T extends DiffElement = DiffElement> {
  left: string;
  right: string;
  /** Assert both sides reached the DOM. Default: the shadow root's text contains each. */
  rendered?: (el: T, contents: { left: string; right: string }) => void;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

function defaultRendered(el: DiffElement, contents: { left: string; right: string }): void {
  const text = el.shadowRoot?.textContent ?? '';
  expect(text).toContain(contents.left);
  expect(text).toContain(contents.right);
}

/** The `DiffElement` conformance suite for one tag. */
export function describeDiffContract<T extends DiffElement = DiffElement>(
  tag: string,
  options: DiffContractOptions<T>
): void {
  const { left, right, prepare } = options;
  const rendered = options.rendered ?? defaultRendered;
  const contents = { left, right };
  const swapped = { left: right, right: left };

  describe(`<${tag}> diff contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('is pending until connected, then settles with both sides rendered', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      const events = settledBy(el);
      el.setContents(contents);
      pending(el);

      document.body.append(el);
      await settled(el, events);
      rendered(el, contents);
    });

    it('settles after contents set while connected', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      el.setContents(contents);
      await settled(el);
      rendered(el, contents);

      el.setContents(swapped);
      await settled(el);
      rendered(el, swapped);
    });

    it('is pending while disconnected and settles again on reconnect', async () => {
      const el = mount<T>(tag, prepare);
      el.setContents(contents);
      await settled(el);

      el.remove();
      pending(el);

      document.body.append(el);
      await settled(el);
      rendered(el, contents);
    });
  });
}
