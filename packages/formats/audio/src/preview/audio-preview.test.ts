// What the contract leaves to the format: the words for each state, the one
// report of a failure, and which media is heard. jsdom loads no media, so each
// test says when the `<img>` loaded or failed.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AudioPreview } from './audio-preview';

const create = (): AudioPreview => document.createElement('audio-preview') as AudioPreview;
const mediaOf = (el: AudioPreview) => el.shadowRoot!.querySelector('img');
const statusOf = (el: AudioPreview) => el.shadowRoot!.querySelector('.spl-status');

describe('audio-preview', () => {
  afterEach(() => {
    document.body.replaceChildren();
    setErrorHandler(null);
  });

  it('is defined by its module', () => {
    expect(customElements.get('audio-preview')).toBe(AudioPreview);
  });

  it('says there is nothing to show without a source', () => {
    const el = create();
    document.body.append(el);

    expect(statusOf(el)?.textContent).toBe('No audio selected.');
    expect(mediaOf(el)).toBeNull();
  });

  it('shows the source under its name, covered while it loads', async () => {
    const el = create();
    el.setSource('/files/clip', 'clip.audio');
    document.body.append(el);

    expect(mediaOf(el)?.getAttribute('src')).toBe('/files/clip');
    expect(mediaOf(el)?.getAttribute('alt')).toBe('clip.audio');
    expect(el.shadowRoot!.querySelector('.audio-preview__loading')).not.toBeNull();

    mediaOf(el)!.dispatchEvent(new Event('load'));
    await el.whenReady();
    expect(el.shadowRoot!.querySelector('.audio-preview__loading')).toBeNull();
    expect(mediaOf(el)?.getAttribute('src')).toBe('/files/clip');
  });

  it('says a failure in words and reports it once', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/missing', 'missing.audio');
    document.body.append(el);

    mediaOf(el)!.dispatchEvent(new Event('error'));
    await el.whenReady();

    expect(statusOf(el)?.textContent).toBe("Couldn't load this audio.");
    expect(statusOf(el)?.getAttribute('role')).toBe('alert');
    expect(mediaOf(el)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('Audio preview failed to load', {
      src: '/files/missing',
    });
  });

  it('hears only the media it shows: a late failure of the one it replaced says nothing', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = create();
    el.setSource('/files/first', 'first');
    document.body.append(el);
    const first = mediaOf(el)!;

    el.setSource('/files/second', 'second');
    const second = mediaOf(el)!;
    expect(second).not.toBe(first);

    first.dispatchEvent(new Event('error'));
    expect(handler).not.toHaveBeenCalled();
    expect(el.hasAttribute('ready')).toBe(false);

    second.dispatchEvent(new Event('load'));
    await el.whenReady();
    expect(mediaOf(el)?.getAttribute('src')).toBe('/files/second');
  });

  it('relabels the media it shows for a new name, without loading again', async () => {
    const el = create();
    el.setSource('/files/clip', 'old name');
    document.body.append(el);
    mediaOf(el)!.dispatchEvent(new Event('load'));
    await el.whenReady();
    const media = mediaOf(el);

    el.setSource('/files/clip', 'new name');

    expect(mediaOf(el)).toBe(media);
    expect(media?.getAttribute('alt')).toBe('new name');
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('keeps loaded media across a reconnect, and settles without loading again', async () => {
    const el = create();
    el.setSource('/files/clip', 'clip');
    document.body.append(el);
    mediaOf(el)!.dispatchEvent(new Event('load'));
    await el.whenReady();
    const media = mediaOf(el);

    el.remove();
    expect(el.hasAttribute('ready')).toBe(false);
    document.body.append(el);

    await el.whenReady();
    expect(mediaOf(el)).toBe(media);
  });

  it('clears the media when the source is taken away', async () => {
    const el = create();
    el.setSource('/files/clip', 'clip');
    document.body.append(el);

    el.setSource('');
    await el.whenReady();

    expect(mediaOf(el)).toBeNull();
    expect(statusOf(el)?.textContent).toBe('No audio selected.');
  });
});
