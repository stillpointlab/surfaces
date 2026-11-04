import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { BUILTIN_TASK_KINDS, UNASSIGNED_COLUMN_ID, UNASSIGNED_DIR } from './types.js';

import type { SharedTaskKindDescriptor, SharedTasksManifest } from './types.js';
import type { TreeNode } from './types.js';

/** Filename that marks a repo Tasks-View-ready (ADR-0014). */
export const TASKS_MANIFEST_FILENAME = 'tasks.yaml';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const slugSchema = z.string().regex(SLUG_PATTERN, 'must be a lowercase slug (a-z, 0-9, -, _)');

const columnSchema = z.object({
  id: slugSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  stage: slugSchema.optional(),
});

/**
 * Kind ids the LEGACY top-level `templates:` block must declare (today's
 * built-in handling, kept for manifests without a `kinds:` block). A declared
 * `kinds:` block carries templates on its entries, all optional — a creatable
 * kind without one creates cards from a stub.
 */
const REQUIRED_TEMPLATE_KIND_IDS = new Set(['brief', 'spec']);

/**
 * The legacy YAML `templates` keys are the built-in kind names. Only read
 * when no `kinds:` block is declared.
 */
const templatesShape = Object.fromEntries(
  BUILTIN_TASK_KINDS.map((kind) => [
    kind.id,
    REQUIRED_TEMPLATE_KIND_IDS.has(kind.id) ? z.string().min(1) : z.string().min(1).optional(),
  ])
);

/**
 * One `kinds:` entry. Only the id is required; everything else defaults at
 * resolution: label = id capitalized, badge = the id's first letter, dir =
 * `${id}s`, creatable = true, template = none (stub creation).
 */
const kindSchema = z.object({
  id: slugSchema,
  label: z.string().min(1).optional(),
  badge: z.string().min(1).optional(),
  dir: slugSchema.optional(),
  creatable: z.boolean().default(true),
  template: z.string().min(1).optional(),
});

/** A kind entry's folder name once defaults apply. */
const kindDirOf = (kind: { id: string; dir?: string }): string => kind.dir ?? `${kind.id}s`;

const manifestSchema = z
  .object({
    version: z.literal(1),
    columns: z.array(columnSchema).min(1),
    frontmatterKey: z.enum(['column', 'status']).default('column'),
    kinds: z.array(kindSchema).min(1).optional(),
    templates: z.object(templatesShape).optional(),
    defaultColumn: slugSchema.optional(),
    doneColumn: slugSchema.optional(),
    current: z
      .object({
        stage: z.number().int().positive(),
        phase: z.number().int().positive(),
      })
      .optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .superRefine((manifest, ctx) => {
    // The legacy templates block is the registry's template source only when
    // no `kinds:` block replaces it — one of the two must exist.
    if (manifest.kinds === undefined && manifest.templates === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['templates'],
        message: "required unless a 'kinds:' block is declared",
      });
    }
    if (manifest.kinds !== undefined) {
      const seenIds = new Set<string>();
      const seenDirs = new Set<string>();
      for (const kind of manifest.kinds) {
        const dir = kindDirOf(kind);
        if (kind.id === UNASSIGNED_COLUMN_ID || dir === UNASSIGNED_DIR) {
          ctx.addIssue({
            code: 'custom',
            path: ['kinds'],
            message: `'${UNASSIGNED_DIR}' is reserved for the backlog pool (kind '${kind.id}')`,
          });
        }
        if (seenIds.has(kind.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['kinds'],
            message: `duplicate kind id '${kind.id}'`,
          });
        }
        seenIds.add(kind.id);
        if (seenDirs.has(dir)) {
          ctx.addIssue({
            code: 'custom',
            path: ['kinds'],
            message: `duplicate kind folder '${dir}'`,
          });
        }
        seenDirs.add(dir);
      }
    }
    const seen = new Set<string>();
    for (const column of manifest.columns) {
      if (column.id === UNASSIGNED_COLUMN_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['columns'],
          message: `column id '${UNASSIGNED_COLUMN_ID}' is reserved for the implicit unassigned column`,
        });
      }
      if (seen.has(column.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['columns'],
          message: `duplicate column id '${column.id}'`,
        });
      }
      seen.add(column.id);
    }
    if (manifest.defaultColumn !== undefined && !seen.has(manifest.defaultColumn)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultColumn'],
        message: `defaultColumn '${manifest.defaultColumn}' is not a declared column id`,
      });
    }
    if (manifest.doneColumn !== undefined && !seen.has(manifest.doneColumn)) {
      ctx.addIssue({
        code: 'custom',
        path: ['doneColumn'],
        message: `doneColumn '${manifest.doneColumn}' is not a declared column id`,
      });
    }
    if (manifest.tags !== undefined) {
      const seenTags = new Set<string>();
      for (const tag of manifest.tags) {
        const lower = tag.toLowerCase();
        if (seenTags.has(lower)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tags'],
            message: `duplicate tag '${tag}' (tags match case-insensitively)`,
          });
        }
        seenTags.add(lower);
      }
    }
  });

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version',
  'columns',
  'frontmatterKey',
  'kinds',
  'templates',
  'defaultColumn',
  'doneColumn',
  'current',
  'tags',
]);
const KNOWN_COLUMN_KEYS = new Set(['id', 'label', 'description', 'stage']);
const KNOWN_KIND_KEYS = new Set(['id', 'label', 'badge', 'dir', 'creatable', 'template']);

export type ManifestParseResult =
  { ok: true; manifest: SharedTasksManifest; warnings: string[] } | { ok: false; errors: string[] };

/** Unknown keys are tolerated (the file is hand-edited) but surfaced as warnings. */
function collectUnknownKeyWarnings(raw: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`unknown key '${key}' is ignored`);
    }
  }
  if (Array.isArray(raw.columns)) {
    raw.columns.forEach((column, index) => {
      if (column === null || typeof column !== 'object' || Array.isArray(column)) return;
      for (const key of Object.keys(column)) {
        if (!KNOWN_COLUMN_KEYS.has(key)) {
          warnings.push(`unknown key 'columns.${index}.${key}' is ignored`);
        }
      }
    });
  }
  if (Array.isArray(raw.kinds)) {
    raw.kinds.forEach((kind, index) => {
      if (kind === null || typeof kind !== 'object' || Array.isArray(kind)) return;
      for (const key of Object.keys(kind)) {
        if (!KNOWN_KIND_KEYS.has(key)) {
          warnings.push(`unknown key 'kinds.${index}.${key}' is ignored`);
        }
      }
    });
  }
  return warnings;
}

/**
 * The resolved registry: `kinds:` entries with defaults applied, or the
 * built-in list carrying the legacy `templates:` paths when no block is
 * declared.
 */
function resolveKinds(
  kinds: z.infer<typeof kindSchema>[] | undefined,
  templates: Record<string, string | undefined> | undefined
): SharedTaskKindDescriptor[] {
  if (kinds === undefined) {
    const legacy = templates ?? {};
    return BUILTIN_TASK_KINDS.map((kind) =>
      legacy[kind.id] !== undefined ? { ...kind, template: legacy[kind.id] } : { ...kind }
    );
  }
  return kinds.map((kind) => ({
    id: kind.id,
    label: kind.label ?? kind.id.charAt(0).toUpperCase() + kind.id.slice(1),
    badge: kind.badge ?? kind.id.charAt(0),
    dir: kindDirOf(kind),
    creatable: kind.creatable,
    ...(kind.template !== undefined ? { template: kind.template } : {}),
  }));
}

/** Non-fatal `kinds:` advisories: shadowed legacy block, colliding badges. */
function collectKindWarnings(
  declared: boolean,
  rawTemplates: unknown,
  resolved: SharedTaskKindDescriptor[]
): string[] {
  if (!declared) return [];
  const warnings: string[] = [];
  if (rawTemplates !== undefined) {
    warnings.push(
      "top-level 'templates:' is ignored when a 'kinds:' block is declared — move templates onto the kind entries"
    );
  }
  const seenBadges = new Map<string, string>();
  for (const kind of resolved) {
    const holder = seenBadges.get(kind.badge);
    if (holder !== undefined) {
      warnings.push(`kinds '${holder}' and '${kind.id}' share the badge '${kind.badge}'`);
    }
    seenBadges.set(kind.badge, holder ?? kind.id);
  }
  return warnings;
}

/**
 * Parse and validate a `tasks.yaml` manifest. Returns a result, never throws:
 * a broken manifest is a user-facing repo problem, not a server error.
 * Validation levels 1 (YAML parses) and 2 (shape valid) live here; level 3
 * (declared paths exist in the synced tree) is `validateManifestAgainstTree`.
 */
export function parseTasksManifest(content: string): ManifestParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [`YAML parse error: ${message}`] };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a YAML mapping'] };
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
    );
    return { ok: false, errors };
  }

  const { templates: rawTemplates, kinds: rawKinds, ...rest } = parsed.data;
  const kinds = resolveKinds(rawKinds, rawTemplates as Record<string, string | undefined>);
  const manifest: SharedTasksManifest = {
    ...rest,
    kinds,
    defaultColumn: parsed.data.defaultColumn ?? parsed.data.columns[0].id,
    doneColumn: parsed.data.doneColumn ?? parsed.data.columns[parsed.data.columns.length - 1].id,
    tags: parsed.data.tags ?? [],
  };
  return {
    ok: true,
    manifest,
    warnings: [
      ...collectUnknownKeyWarnings(raw as Record<string, unknown>),
      ...collectKindWarnings(
        rawKinds !== undefined,
        (raw as Record<string, unknown>).templates,
        kinds
      ),
    ],
  };
}

/**
 * Level-3 validation: every path the manifest declares must exist as a blob in
 * the connection's synced tree. Returns human-readable errors (empty = valid).
 *
 * Template paths are resolved relative to the repo root, matching how they are
 * written in `tasks.yaml`.
 */
export function validateManifestAgainstTree(
  manifest: SharedTasksManifest,
  nodes: TreeNode[]
): string[] {
  const blobPaths = new Set(nodes.filter((node) => node.type === 'blob').map((node) => node.path));
  const errors: string[] = [];
  for (const kind of manifest.kinds) {
    if (kind.template !== undefined && !blobPaths.has(kind.template)) {
      errors.push(
        `template for kind '${kind.id}': '${kind.template}' does not exist in the repo tree`
      );
    }
  }
  return errors;
}
