import { afterEach, describe, it } from 'vitest';

import { create, mount, pending, settled, settledBy } from './support';

import type { UrlPreviewElement } from '../contracts';

export interface UrlPreviewContractOptions<T extends UrlPreviewElement = UrlPreviewElement> {
  /** A source the element can show. */
  src: string;
  /** What the source is called, as a host passes the file's name. */
  name: string;
  /**
   * Make the current source finish loading. A browser loads a real `src` on its
   * own; jsdom never does, so the format says how its own media is told it has
   * loaded (`load` on an `<img>`, `canplay` on a `<video>`). There is no default:
   * the suite knows no element's insides. A real browser ignores the extra event.
   */
  load: (el: T) => void;
  /** Make the current source fail to load (`error` on the media element). No default. */
  fail: (el: T) => void;
  /** Assert the element shows `src` under `name`. Default: no check beyond readiness. */
  shows?: (el: T, src: string, name: string) => void;
  /** Assert the element shows no source. Default: no check beyond readiness. */
  empty?: (el: T) => void;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

/**
 * The `UrlPreviewElement` conformance suite for one tag: the role every preview
 * given a URL plays, whatever it shows. What only the format knows (how its media
 * is told it loaded or failed, and how to see what it shows) comes in as hooks.
 */
export function describeUrlPreviewContract<T extends UrlPreviewElement = UrlPreviewElement>(
  tag: string,
  options: UrlPreviewContractOptions<T>
): void {
  const { src, name, load, fail, prepare } = options;
  const shows = options.shows ?? (() => {});
  const empty = options.empty ?? (() => {});

  describe(`<${tag}> URL preview contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('is pending until connected and settles with nothing to show', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      const events = settledBy(el);
      pending(el);

      document.body.append(el);
      await settled(el, events);
      empty(el);
    });

    it('is pending while a source loads and settles once it has', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      el.setSource(src, name);
      pending(el);
      shows(el, src, name);

      const events = settledBy(el);
      load(el);
      await settled(el, events);
      shows(el, src, name);
    });

    it('settles when the source fails to load', async () => {
      const el = mount<T>(tag, prepare);
      await settled(el);

      el.setSource(src, name);
      pending(el);
      fail(el);
      await settled(el);
    });

    it('shows a source set before connect once loaded', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      el.setSource(src, name);
      pending(el);

      document.body.append(el);
      pending(el);
      load(el);
      await settled(el);
      shows(el, src, name);
    });

    it('settles after a synchronous move right after mount', async () => {
      // Appending a connected element elsewhere disconnects and reconnects it in
      // one tick; work started for the first connection must not strand the second.
      const el = create<T>(tag);
      prepare?.(el);
      el.setSource(src, name);
      const first = document.createElement('div');
      const second = document.createElement('div');
      document.body.append(first, second);
      first.append(el);
      second.append(el);
      load(el);
      await settled(el);
      shows(el, src, name);
    });

    it('is pending while disconnected and settles again on reconnect', async () => {
      const el = mount<T>(tag, prepare);
      el.setSource(src, name);
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
