// The root entry: the document codec, the selection model, the presentation
// rules, the elements' types and the host's logging hook. It registers no
// element. `./editor` defines <sheet-editor>, `./grid` defines <sheet-grid>, and
// `./preview` defines <sheet-preview>.
export { parseSheetDocument, serializeSheetDocument } from './document';
export type {
  ParsedSheetDocument,
  ParseSheetDocumentOptions,
  SerializeSheetDocumentOptions,
  SheetDocumentError,
  SheetDocumentErrorCode,
  SheetDocumentInput,
  SheetDocumentParseResult,
} from './document';
export type { SheetEditor, SheetEditorMode } from './editor/sheet-editor';
export type { SheetGrid, SheetGridDataOptions } from './grid/sheet-grid';
export {
  createSheetMergeIndex,
  createSheetSelection,
  moveSheetSelection,
  resolveSheetCoordinate,
  resolveSheetUnit,
  sheetRangesIntersect,
} from './interaction';
export type {
  SheetCanvasBounds,
  SheetCoordinate,
  SheetMergeIndex,
  SheetMoveDirection,
  SheetSelection,
} from './interaction';
export {
  formatA1CellRange,
  formatA1Range,
  MAX_SHEET_ALIGNMENT_RULES,
  MAX_SHEET_DECIMAL_PLACES,
  MAX_SHEET_FORMAT_RULES,
  MAX_SHEET_MERGES,
  MAX_SHEET_VALUE_FORMAT_RULES,
  parseA1CellRange,
  parseA1Range,
  validateSheetPresentation,
} from './presentation';
export type {
  SheetAlignmentRule,
  SheetCellRange,
  SheetContentOptions,
  SheetFormatRule,
  SheetHorizontalAlignment,
  SheetPresentation,
  SheetPresentationIssue,
  SheetPresentationIssueCode,
  SheetPresentationValidationContext,
  SheetPresentationValidationResult,
  SheetVerticalAlignment,
  SheetValueFormatKind,
  SheetValueFormatRule,
} from './presentation';
export { setErrorHandler } from '@stillpointlab/common-format';
export type { SheetPreview } from './preview/sheet-preview';
