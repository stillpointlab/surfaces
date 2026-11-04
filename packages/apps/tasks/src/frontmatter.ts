import { FRONTMATTER_BLOCK_PATTERN } from '@stillpointlab/common-format/frontmatter';
import { parse as parseYaml } from 'yaml';

import type { SharedTasksManifest } from './types.js';

/**
 * Markdown YAML frontmatter parse/rewrite (ADR-0014).
 *
 * The rewriter is deliberately line-based, not parse-and-re-emit: a card move
 * must change exactly one line so check-in diffs stay minimal, and everything
 * else — unknown keys, key order, comments, body bytes, line-ending style —
 * must survive untouched. Only top-level scalar and flat-list keys can be
 * patched, which is all the Tasks View needs (the column key, `tags:`). List
 * values are always written as a single-line flow sequence (`tags: [a, b]`) —
 * the single-line shape is what preserves the line-based stability guarantee —
 * though hand-authored block lists are read fine and replaced whole when
 * patched. A literal `---` line inside a block scalar would be misread as the
 * closing delimiter; that limitation is accepted and irrelevant for the flat
 * frontmatter these files use.
 */

// Delimiter pattern shared with the client-side editor frontmatter shield
// (`src/shared/utils/frontmatterBlock.ts` documents its shape).
const FRONTMATTER_PATTERN = FRONTMATTER_BLOCK_PATTERN;

export interface ParsedFrontmatter {
  /** Parsed mapping, or null when there is no block or the YAML is invalid. */
  data: Record<string, unknown> | null;
  /** Set only when a block exists but cannot be read as a YAML mapping. */
  parseError?: string;
  /** Content after the frontmatter block (the whole input when no block). */
  body: string;
}

/**
 * Parse an optional leading frontmatter block. Never throws: no block is
 * normal (`data: null`, no error) and garbage YAML is a card-goes-to-Unassigned
 * condition (`data: null` + `parseError`), not a server error.
 */
export function parseFrontmatter(md: string): ParsedFrontmatter {
  // A UTF-8 BOM would hide the block from the byte-0-anchored pattern.
  const src = md.startsWith('\uFEFF') ? md.slice(1) : md;
  const match = FRONTMATTER_PATTERN.exec(src);
  if (!match) {
    return { data: null, body: md };
  }
  const rawBlock = match[1] ?? '';
  const body = src.slice(match[0].length);

  let data: unknown;
  try {
    data = parseYaml(rawBlock);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, parseError: `frontmatter YAML parse error: ${message}`, body };
  }
  if (data === null || data === undefined) {
    return { data: {}, body };
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return { data: null, parseError: 'frontmatter is not a YAML mapping', body };
  }
  return { data: data as Record<string, unknown>, body };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Slug-like values stay plain; anything else is JSON-quoted (valid YAML). */
export function formatScalar(value: string): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(value)) return JSON.stringify(value);
  // Slug-looking values can still be YAML non-strings ('123' → number,
  // 'True'/'null' → keyword): emit plain only what the parser reads back as
  // the identical string, else quote. Keeps '123' a tag instead of a number
  // that readers silently drop.
  return parseYaml(value) === value ? value : JSON.stringify(value);
}

/** A patchable frontmatter value: scalar, flat list, or `null` to remove. */
export type FrontmatterPatchValue = string | string[] | null;

/** Lists emit as a single-line flow sequence; see the module doc. */
function formatValue(value: string | string[]): string {
  return Array.isArray(value) ? `[${value.map(formatScalar).join(', ')}]` : formatScalar(value);
}

/**
 * Count the segments after a key line that continue its value on following
 * indented lines (a hand-authored block list). Segments alternate line,
 * separator, line, … so continuations step by two. Interior blank lines
 * belong to the block when more indented content follows (YAML allows them);
 * stopping at the blank would orphan the remaining items as parse garbage.
 */
function continuationSpan(segments: string[], lineIndex: number): number {
  let last = lineIndex;
  for (let i = lineIndex + 2; i < segments.length; i += 2) {
    if (/^[ \t]/.test(segments[i]) && segments[i].trim() !== '') {
      last = i;
      continue;
    }
    if (segments[i].trim() === '') {
      let next = i + 2;
      while (next < segments.length && segments[next].trim() === '') next += 2;
      if (next < segments.length && /^[ \t]/.test(segments[next]) && segments[next].trim() !== '') {
        last = next;
        i = next;
        continue;
      }
    }
    break;
  }
  return last - lineIndex;
}

/**
 * Set (or, with `null`, remove) top-level frontmatter keys, preserving every
 * byte outside the patched lines. A file without a frontmatter block gains a
 * minimal one in the file's own line-ending style. Works textually, so it can
 * repair a file whose YAML is currently garbage (e.g. dragging a corrupt card
 * out of Unassigned appends a fresh key line).
 */
export function rewriteFrontmatter(
  md: string,
  patch: Record<string, FrontmatterPatchValue>
): string {
  // Preserve (and see past) a UTF-8 BOM — patching through it would prepend
  // a SECOND block and demote the real frontmatter to visible body text.
  const bom = md.startsWith('\uFEFF') ? '\uFEFF' : '';
  if (bom !== '') {
    return bom + rewriteFrontmatter(md.slice(1), patch);
  }

  // An empty list carries no information; treat it as removal.
  const entries = Object.entries(patch).map(([key, value]): [string, string | string[] | null] => [
    key,
    Array.isArray(value) && value.length === 0 ? null : value,
  ]);
  if (entries.length === 0) return md;

  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const match = FRONTMATTER_PATTERN.exec(md);

  if (!match) {
    const lines = entries
      .filter((entry): entry is [string, string | string[]] => entry[1] !== null)
      .map(([key, value]) => `${key}: ${formatValue(value)}`);
    if (lines.length === 0) return md;
    return `---${eol}${lines.join(eol)}${eol}---${eol}${md}`;
  }

  const rawBlock = match[1] ?? '';
  const openingLength = /^---[ \t]*\r?\n/.exec(md)![0].length;
  const opening = md.slice(0, openingLength);
  const closing = md.slice(openingLength + rawBlock.length, match[0].length);
  const body = md.slice(match[0].length);

  // Segments alternate line, separator, line, … so untouched lines keep their
  // own (possibly mixed) line endings byte-for-byte.
  const segments = rawBlock === '' ? [] : rawBlock.split(/(\r?\n)/);

  for (const [key, value] of entries) {
    // Match the bare key and its quoted spellings — YAML reads `"column":`
    // as the same key, and missing it would append a duplicate line.
    const keyLinePattern = new RegExp(
      `^(?:${escapeRegExp(key)}|"${escapeRegExp(key)}"|'${escapeRegExp(key)}')[ \\t]*:`
    );
    let lineIndex = -1;
    for (let i = 0; i < segments.length; i += 2) {
      if (keyLinePattern.test(segments[i])) {
        lineIndex = i;
        break;
      }
    }

    // A block-list value spans following indented lines; they belong to the
    // key and are removed together with (or replaced by) the patched line.
    if (lineIndex >= 0) {
      segments.splice(lineIndex + 1, continuationSpan(segments, lineIndex));
    }

    if (value === null) {
      if (lineIndex >= 0) {
        // Remove the line plus one adjoining separator to avoid a blank line.
        const start = lineIndex > 0 ? lineIndex - 1 : lineIndex;
        const count = lineIndex > 0 ? 2 : Math.min(2, segments.length - lineIndex);
        segments.splice(start, count);
      }
      continue;
    }

    const line = `${key}: ${formatValue(value)}`;
    if (lineIndex >= 0) {
      segments[lineIndex] = line;
    } else if (segments.length === 0) {
      segments.push(line);
    } else {
      segments.push(eol, line);
    }
  }

  if (segments.length === 0) {
    // Every key was removed: drop the now-empty block entirely.
    return body;
  }
  // `closing` starts with the newline that ended the last content line — except
  // when the original block was empty, where it is bare `---…`; supply one.
  const separator = /^\r?\n/.test(closing) ? '' : eol;
  return `${opening}${segments.join('')}${separator}${closing}${body}`;
}

/**
 * The `title:` of an already-parsed frontmatter mapping. Split from
 * {@link readTitle} so a caller that needs several keys (the card projection)
 * pays for ONE YAML parse instead of one per key.
 */
export function titleFrom(data: Record<string, unknown> | null): string | undefined {
  const value = data?.['title'];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Read a file's frontmatter `title:` as a trimmed non-empty string. A missing
 * block, unparseable YAML, non-string value, or blank string all resolve to
 * undefined — the card then falls back to its filename.
 */
export function readTitle(md: string): string | undefined {
  return titleFrom(parseFrontmatter(md).data);
}

/**
 * Read a frontmatter list key (default `tags`) as trimmed non-empty strings.
 * Tolerates both authored shapes — block list and flow sequence — since both
 * parse to a YAML array. A missing block/key or a non-array value resolves to
 * null; an empty list resolves to `[]`.
 */
export function readTags(md: string, key = 'tags'): string[] | null {
  return tagsFrom(parseFrontmatter(md).data, key);
}

/** {@link readTags} over an already-parsed mapping (see {@link titleFrom}). */
export function tagsFrom(data: Record<string, unknown> | null, key = 'tags'): string[] | null {
  const value = data?.[key];
  if (!Array.isArray(value)) return null;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Converged doc metadata (ADR-0020): frontmatter keys, no body blockquotes. */
export interface CardMeta {
  /** Free-text reason; presence renders a blocked badge. */
  blocked?: string;
  /** ISO date the work completed. */
  completed?: string;
  /** PR number or URL. */
  pr?: string;
}

/**
 * Read the optional metadata keys (`blocked:`, `completed:`, `pr:`) in one
 * parse. Values are stringified scalars; missing block/keys resolve to an
 * empty object — the board never requires them.
 */
export function readCardMeta(md: string): CardMeta {
  return cardMetaFrom(parseFrontmatter(md).data);
}

/** {@link readCardMeta} over an already-parsed mapping (see {@link titleFrom}). */
export function cardMetaFrom(data: Record<string, unknown> | null): CardMeta {
  if (data === null) return {};
  const scalar = (key: string): string | undefined => {
    const value = data[key];
    if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
    if (typeof value === 'number') return String(value);
    return undefined;
  };
  const blocked = scalar('blocked');
  const completed = scalar('completed');
  const pr = scalar('pr');
  return {
    ...(blocked !== undefined ? { blocked } : {}),
    ...(completed !== undefined ? { completed } : {}),
    ...(pr !== undefined ? { pr } : {}),
  };
}

export interface ReadColumnResult {
  /** A declared manifest column id, else null (⇒ needs-attention). */
  column: string | null;
  parseError?: string;
  /** Set when the key held a string that is not a declared column id. */
  undeclaredId?: string;
}

/**
 * Read a file's board column per the manifest's `frontmatterKey`. A missing
 * key, non-string value, undeclared column id, or unparseable frontmatter all
 * resolve to null — the implicit unassigned column is the designed dumping
 * ground for corrupt state.
 */
export function readColumn(md: string, manifest: SharedTasksManifest): ReadColumnResult {
  const { data, parseError } = parseFrontmatter(md);
  if (data === null) {
    return parseError === undefined ? { column: null } : { column: null, parseError };
  }
  const value = data[manifest.frontmatterKey];
  if (typeof value !== 'string') {
    return { column: null };
  }
  const declared = manifest.columns.some((column) => column.id === value);
  return declared ? { column: value } : { column: null, undeclaredId: value };
}
