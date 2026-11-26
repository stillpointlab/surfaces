// Browser entry: importing this registers the <pdf-preview> custom element.
import './pdf-preview';

export { PdfPreview } from './pdf-preview';
export type { PdfPreviewElement } from './pdf-preview';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
