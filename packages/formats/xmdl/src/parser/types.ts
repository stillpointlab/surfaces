export const XMDL_OUTPUT_FILE_TYPES = ['markdown', 'xml', 'json'] as const;
export type XmdlOutputFileType = (typeof XMDL_OUTPUT_FILE_TYPES)[number];

export const XMDL_PARAM_TYPES = ['string', 'enum', 'bool', 'number', 'date'] as const;
export type XmdlParamType = (typeof XMDL_PARAM_TYPES)[number];

export interface XmdlWarning {
  code: string;
  message: string;
  path?: string;
}

export interface XmdlParseError {
  code: string;
  message: string;
  path?: string;
}

export interface XmdlValidationMetadata {
  outputSchemaRef?: string;
}

export interface XmdlParam {
  name: string;
  type: XmdlParamType;
  required: boolean;
  description?: string;
  default?: unknown;
  values?: string[];
}

export interface XmdlPlaceholderReference {
  name: string;
  start: number;
  end: number;
}

export interface XmdlConditionalReference {
  name: string;
  start: number;
  end: number;
  bodyStart: number;
  bodyEnd: number;
}

export interface ParsedXmdlDocument {
  title: string;
  version: string;
  outputFileType: XmdlOutputFileType;
  outputContextType?: string;
  author?: string;
  createdAt?: string;
  lastUpdated?: string;
  license?: string;
  tags: string[];
  params: XmdlParam[];
  validation?: XmdlValidationMetadata;
  body: string;
  placeholders: XmdlPlaceholderReference[];
  conditionals: XmdlConditionalReference[];
}

export type XmdlParseResult =
  | { ok: true; document: ParsedXmdlDocument; warnings: XmdlWarning[] }
  | { ok: false; errors: XmdlParseError[]; warnings: XmdlWarning[] };

export type XmdlBindingValue = string | number | boolean | Date | null | undefined;
export type XmdlBindings = Record<string, XmdlBindingValue>;
