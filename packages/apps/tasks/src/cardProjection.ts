import {
  CardMeta,
  cardMetaFrom,
  parseFrontmatter,
  ReadColumnResult,
  tagsFrom,
  titleFrom,
} from './frontmatter.js';

import type { SharedTasksManifest } from './types.js';

/**
 * Everything card rendering needs from one file's bytes — the projection a
 * board card is built from, whichever tier supplied the content (a user's
 * draft, the good's latest version, or the upstream blob of a tracked file;
 * ADR-0023).
 *
 * Deliberately manifest-independent apart from the frontmatter key: a
 * projection is cached under the immutable blob sha, so nothing that a
 * tasks.yaml edit can change (declared column ids, the default column) may be
 * baked into it. Resolving the raw `column` against the manifest is the
 * caller's job — {@link resolveProjectionColumn}.
 */
export interface CardProjection {
  /**
   * The frontmatter column value as authored (string values only); null when
   * the key is missing, non-string, or the block did not parse.
   */
  column: string | null;
  /** Set when the frontmatter block exists but could not be parsed. */
  parseError?: string;
  /** Frontmatter `title:`, when it is a non-blank string. */
  title?: string;
  /** Frontmatter `tags:`; null when absent or not a list. */
  tags: string[] | null;
  /** Frontmatter `blocked:` / `completed:` / `pr:`. */
  meta: CardMeta;
}

/**
 * Project a card file's content in ONE frontmatter parse. Extracted from the
 * board service so tracked (good-less) files and imported goods are rendered
 * by exactly the same code — the two content tiers ADR-0023 leaves permanently
 * in place must never drift apart.
 */
export function parseCardProjection(content: string, frontmatterKey: string): CardProjection {
  const { data, parseError } = parseFrontmatter(content);
  const raw = data?.[frontmatterKey];
  const title = titleFrom(data);
  return {
    column: typeof raw === 'string' ? raw : null,
    ...(parseError !== undefined ? { parseError } : {}),
    ...(title !== undefined ? { title } : {}),
    tags: tagsFrom(data),
    meta: cardMetaFrom(data),
  };
}

/**
 * Resolve a projection's authored column against the manifest: a declared id
 * passes through, anything else is null with the offending id reported (⇒
 * needs-attention). Same contract as `readColumn`, minus the re-parse.
 */
export function resolveProjectionColumn(
  projection: CardProjection,
  manifest: SharedTasksManifest
): ReadColumnResult {
  if (projection.parseError !== undefined) {
    return { column: null, parseError: projection.parseError };
  }
  if (projection.column === null) return { column: null };
  const declared = manifest.columns.some((column) => column.id === projection.column);
  return declared
    ? { column: projection.column }
    : { column: null, undeclaredId: projection.column };
}

/**
 * The column a card actually renders in. Board cards with no column key sit in
 * the default column; corrupt frontmatter and undeclared ids stay null (⇒
 * needs-attention). Pool cards never have a column — membership is the
 * location (ADR-0020).
 */
export function effectiveColumn(
  read: ReadColumnResult,
  manifest: SharedTasksManifest,
  location: 'board' | 'pool'
): string | null {
  if (location === 'pool') return null;
  if (read.column !== null) return read.column;
  return read.parseError === undefined && read.undeclaredId === undefined
    ? manifest.defaultColumn
    : null;
}

/**
 * The non-fatal card problem a column read implies: an undeclared column id on
 * a board, or a hand-edited (and therefore ignored) column key on a pooled
 * card. Undefined when the column is unremarkable.
 */
export function columnWarning(
  read: ReadColumnResult,
  manifest: SharedTasksManifest,
  location: 'board' | 'pool'
): string | undefined {
  const pooledWarning = `pooled cards carry no '${manifest.frontmatterKey}:' key (ignored)`;
  if (read.undeclaredId !== undefined) {
    return location === 'pool'
      ? pooledWarning
      : `'${read.undeclaredId}' is not a column declared in tasks.yaml`;
  }
  if (location === 'pool' && read.parseError === undefined && read.column !== null) {
    return pooledWarning;
  }
  return undefined;
}
