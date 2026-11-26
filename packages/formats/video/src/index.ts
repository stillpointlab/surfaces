// The root entry: the element's type and the host's logging hooks. A format given
// a URL has no core (the host hands it a URL, not text to parse), and this entry
// registers no element; `./preview` does that.
export type { VideoPreviewElement } from './preview/video-preview';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
