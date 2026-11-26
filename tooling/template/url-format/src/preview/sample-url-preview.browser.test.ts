// What jsdom cannot show: the browser itself loads the media, or fails to. The
// jsdom tests beside this one say when the `<img>` loaded; here nothing is
// dispatched by hand, and each test waits for the element's ready signal, never
// for a time. A real format tests its own media here: a clip that plays, a page
// that draws.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './sample-url-preview';

import type { SamplePreview } from './sample-url-preview';

// A file of this package, by URL; the README has the command that made it.
const swatch = new URL('../../dev/media/swatch.png', import.meta.url).href;

const create = (): SamplePreview => document.createElement('sample-url-preview') as SamplePreview;
const mediaOf = (el: SamplePreview) => el.shadowRoot!.querySelector('img');
const statusOf = (el: SamplePreview) => el.shadowRoot!.querySelector('.spl-status');

describe('sample-url-preview in a browser', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
  });

  it('shows an image the browser loaded from a file of the package', async () => {
    const el = create();
    el.setSource(swatch, 'swatch.png');
    document.body.append(el);

    await el.whenReady();

    const media = mediaOf(el)!;
    expect(media.complete).toBe(true);
    expect([media.naturalWidth, media.naturalHeight]).toEqual([64, 36]);
    expect(el.shadowRoot!.querySelector('.sample-url-preview__loading')).toBeNull();
  });

  it('says in words that a missing file failed, and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const missing = new URL('no-such-file.png', swatch).href;
    const el = create();
    el.setSource(missing, 'no-such-file.png');
    document.body.append(el);

    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this sample.");
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Sample preview failed to load', { src: missing });
  });
});
