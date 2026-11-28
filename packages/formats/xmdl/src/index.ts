// The root entry: the parser, the editor's type and the host's logging hooks. It
// registers no element. `./editor` defines <xmdl-editor>, and `./preview` defines
// <xmdl-preview>.
export type { XmdlEditor } from './editor/xmdl-editor';
export { createXmdlStarter, parseXmdl, renderXmdl, splitFrontmatterBlock } from './parser';
export { setErrorHandler, setReporter } from '@stillpointlab/common-format';
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
