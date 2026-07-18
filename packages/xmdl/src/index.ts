import './editor/xmdl-editor';

export { XmdlEditor } from './editor/xmdl-editor';
export { createXmdlStarter, parseXmdl, renderXmdl, splitFrontmatterBlock } from './parser';
export { setErrorHandler, setReporter } from './editor/log';
export type {
  ParsedXmdlDocument,
  XmdlBindingValue,
  XmdlBindings,
  XmdlConditionalReference,
  XmdlOutputFileType,
  XmdlParam,
  XmdlParamType,
  XmdlParseError,
  XmdlParseResult,
  XmdlPlaceholderReference,
  XmdlValidationMetadata,
  XmdlWarning,
} from './parser';
