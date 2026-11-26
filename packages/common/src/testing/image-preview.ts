import { expect } from 'vitest';

import { describeUrlPreviewContract } from './url-preview';

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

const imageOf = (el: ImagePreviewElement) => el.shadowRoot?.querySelector('img');

const dispatchOnImage = (type: string) => (el: ImagePreviewElement) => {
  imageOf(el)?.dispatchEvent(new Event(type));
};

/**
 * `<image-preview>`'s suite under the name it had while image was the only
 * preview given a URL: `describeUrlPreviewContract` with the hooks of an element
 * that shows its source in an `<img>` and its name as the alternative text.
 */
export function describeImagePreviewContract<T extends ImagePreviewElement = ImagePreviewElement>(
  tag: string,
  options: ImagePreviewContractOptions<T>
): void {
  const { src, alt, prepare } = options;
  describeUrlPreviewContract<T>(tag, {
    src,
    name: alt,
    load: options.load ?? dispatchOnImage('load'),
    fail: options.fail ?? dispatchOnImage('error'),
    shows: (el, shownSrc, shownAlt) => {
      expect(imageOf(el)?.getAttribute('src')).toBe(shownSrc);
      expect(imageOf(el)?.getAttribute('alt')).toBe(shownAlt);
    },
    empty: (el) => expect(imageOf(el)).toBeNull(),
    prepare,
  });
}
