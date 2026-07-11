import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { isValidIdentifier, parseBodyReferences } from './body';
import { splitFrontmatterBlock } from './frontmatter';
import {
  XMDL_OUTPUT_FILE_TYPES,
  XMDL_PARAM_TYPES,
  type ParsedXmdlDocument,
  type XmdlParam,
  type XmdlParseError,
  type XmdlParseResult,
  type XmdlWarning,
} from './types';

const TOP_LEVEL_KEYS = new Set([
  'title',
  'version',
  'author',
  'createdAt',
  'lastUpdated',
  'license',
  'tags',
  'outputFileType',
  'outputContextType',
  'params',
  'validation',
]);

const PARAM_KEYS = new Set([
  'name',
  'type',
  'required',
  'description',
  'default',
  'values',
  'options',
]);

const SEMVER_LIKE_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const validationSchema = z
  .object({
    outputSchemaRef: z.string().min(1).optional(),
  })
  .passthrough()
  .optional();

const paramSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(XMDL_PARAM_TYPES),
    required: z.boolean().optional().default(false),
    description: z.string().optional(),
    default: z.unknown().optional(),
    values: z.array(z.string()).optional(),
    options: z.array(z.string()).optional(),
  })
  .passthrough();

const frontmatterSchema = z
  .object({
    title: z.string().min(1),
    version: z.string().min(1),
    author: z.string().optional(),
    createdAt: z.string().optional(),
    lastUpdated: z.string().optional(),
    license: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    outputFileType: z.enum(XMDL_OUTPUT_FILE_TYPES),
    outputContextType: z.string().optional(),
    params: z.array(paramSchema),
    validation: validationSchema,
  })
  .passthrough();

export function parseXmdl(source: string): XmdlParseResult {
  const warnings: XmdlWarning[] = [];
  const errors: XmdlParseError[] = [];
  const parts = splitFrontmatterBlock(source);

  if (!parts) {
    return {
      ok: false,
      errors: [
        {
          code: 'xmdl.frontmatter.required',
          message: 'XMDL documents must start with a YAML front matter block.',
        },
      ],
      warnings,
    };
  }

  const parsedYaml = parseFrontmatterYaml(parts.yaml, errors);
  if (!parsedYaml) return { ok: false, errors, warnings };
  if (!isRecord(parsedYaml)) {
    return {
      ok: false,
      errors: [
        {
          code: 'xmdl.frontmatter.mappingRequired',
          message: 'XMDL front matter must be a YAML mapping.',
        },
      ],
      warnings,
    };
  }

  collectUnknownKeyWarnings(parsedYaml, TOP_LEVEL_KEYS, warnings);

  const schemaResult = frontmatterSchema.safeParse(parsedYaml);
  if (!schemaResult.success) {
    return {
      ok: false,
      errors: schemaResult.error.issues.map((issue) => ({
        code: 'xmdl.frontmatter.invalid',
        message: issue.message,
        path: issue.path.join('.'),
      })),
      warnings,
    };
  }

  const frontmatter = schemaResult.data;
  if (!SEMVER_LIKE_PATTERN.test(frontmatter.version)) {
    errors.push({
      code: 'xmdl.frontmatter.invalidVersion',
      message: 'XMDL version must be semver-like, for example "0.1.0".',
      path: 'version',
    });
  }

  const params = normalizeParams(frontmatter.params, errors, warnings);
  const paramsByName = new Map(params.map((param) => [param.name, param]));
  const bodyRefs = parseBodyReferences(parts.body, paramsByName);
  errors.push(...bodyRefs.errors);

  if (errors.length > 0) return { ok: false, errors, warnings };

  const document: ParsedXmdlDocument = {
    title: frontmatter.title,
    version: frontmatter.version,
    outputFileType: frontmatter.outputFileType,
    outputContextType: frontmatter.outputContextType,
    author: frontmatter.author,
    createdAt: frontmatter.createdAt,
    lastUpdated: frontmatter.lastUpdated,
    license: frontmatter.license,
    tags: frontmatter.tags,
    params,
    validation: frontmatter.validation,
    body: parts.body,
    placeholders: bodyRefs.placeholders,
    conditionals: bodyRefs.conditionals,
  };

  return { ok: true, document, warnings };
}

function parseFrontmatterYaml(yaml: string, errors: XmdlParseError[]): unknown | null {
  try {
    return parseYaml(yaml);
  } catch (error) {
    errors.push({
      code: 'xmdl.frontmatter.yamlInvalid',
      message: error instanceof Error ? error.message : 'Unable to parse XMDL front matter YAML.',
    });
    return null;
  }
}

function normalizeParams(
  params: z.infer<typeof paramSchema>[],
  errors: XmdlParseError[],
  warnings: XmdlWarning[],
): XmdlParam[] {
  const names = new Set<string>();
  const normalized: XmdlParam[] = [];

  params.forEach((param, index) => {
    collectUnknownKeyWarnings(param, PARAM_KEYS, warnings, `params.${index}`);

    if (!isValidIdentifier(param.name)) {
      errors.push({
        code: 'xmdl.param.invalidName',
        message: `Param name "${param.name}" is not a valid identifier.`,
        path: `params.${index}.name`,
      });
    }

    if (names.has(param.name)) {
      errors.push({
        code: 'xmdl.param.duplicateName',
        message: `Param name "${param.name}" is declared more than once.`,
        path: `params.${index}.name`,
      });
    }
    names.add(param.name);

    const values = param.values ?? param.options;
    if (param.type === 'enum' && (!values || values.length === 0)) {
      errors.push({
        code: 'xmdl.param.enumValuesRequired',
        message: `Enum param "${param.name}" must declare at least one allowed value.`,
        path: `params.${index}.values`,
      });
    }

    if (param.values && param.options) {
      warnings.push({
        code: 'xmdl.param.enumDuplicateOptions',
        message: `Enum param "${param.name}" declares both values and options; values wins.`,
        path: `params.${index}`,
      });
    }

    normalized.push({
      name: param.name,
      type: param.type,
      required: param.required,
      description: param.description,
      default: param.default,
      values,
    });
  });

  return normalized;
}

function collectUnknownKeyWarnings(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  warnings: XmdlWarning[],
  basePath?: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      warnings.push({
        code: 'xmdl.frontmatter.unknownKey',
        message: `Unknown XMDL key "${key}" will be ignored.`,
        path: basePath ? `${basePath}.${key}` : key,
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
