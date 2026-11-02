// The host-contract conformance suite for the element this format ships.
import { describeImagePreviewContract } from '@stillpointlab/common-format/testing';

import './preview';

import type { ImagePreview } from './preview/image-preview';

describeImagePreviewContract<ImagePreview>('image-preview', {
  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 2'%3E%3Crect width='2' height='2' fill='%234f8cff'/%3E%3C/svg%3E",
  alt: 'A blue square',
});
