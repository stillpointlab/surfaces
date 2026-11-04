import { formatYamlScalar } from '@stillpointlab/common-format/yaml';
import { parse as parseYaml } from 'yaml';

import { slugifyInventoryName } from './paths.js';

import type { SharedInventoryScalar } from './types.js';

/**
 * Line-based room-file writer (ADR-0022). Never parse-and-re-emit: the app's
 * edits must be exactly what a careful human would have typed — minimal
 * diffs, byte-stable outside the touched span, comments and unknown keys
 * untouched. The price is a supported-shape rule: a file the line scan
 * cannot confidently place an edit in is valid to READ but read-only to the
 * writer (the UI offers the editor instead). Same discipline as the tasks
 * frontmatter rewriter (`../tasks/frontmatter.ts`).
 *
 * Shape rule (spec inventory_add_item #1): a top-level block-style `items:`
 * sequence (or none at all), every entry starting `- ` at one consistent
 * indent, and no anchors/aliases/merge keys or flow-style *entries* at the
 * item level. Flow lists as leaf values (`tags: [a, b]`) are supported —
 * the writer emits them itself.
 */

/** One `- ` entry's location: segment indices of its first and last line. */
export interface RoomEntrySpan {
  /** Segment index (line) of the `- ` line. */
  start: number;
  /** Segment index (line) of the last line belonging to this entry. */
  end: number;
  /** The entry's `id:` value when one line-scans out (the edit handle). */
  id?: string;
  /**
   * Set when THIS item uses YAML the writer can't confidently patch
   * (anchors, aliases, merge keys, flow maps): the item is read-only in an
   * otherwise writable file (spec inventory_edit_item #4) — appends are
   * unaffected, edits of this item fall back to the editor.
   */
  readOnlyReason?: string;
}

export type RoomShapeScan =
  | {
      writable: true;
      /** Line ending for inserted lines (the file's dominant style). */
      eol: string;
      /** Segment index of the top-level `items:` line; null when absent. */
      itemsLine: number | null;
      /** Indent of the `- ` entry lines ('  ' when there are none yet). */
      entryIndent: string;
      entries: RoomEntrySpan[];
      /**
       * Segment index of the last line inside the sequence (insertion goes
       * after it); the `items:` line itself when the sequence is empty; null
       * when `items:` is absent (append a fresh block at EOF).
       */
      insertAfter: number | null;
    }
  | { writable: false; reason: string };

/** Split into [line, sep, line, sep, …] so untouched lines keep their bytes. */
function toSegments(content: string): string[] {
  return content === '' ? [] : content.split(/(\r?\n)/);
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

const TOP_LEVEL_ITEMS = /^items[ \t]*:[ \t]*(#.*)?$/;
const TOP_LEVEL_ITEMS_WITH_VALUE = /^items[ \t]*:[ \t]*\S/;
/** Anchors/aliases/tags/flow collections opening the entry itself. */
const ENTRY_UNSUPPORTED = /^-[ \t]+(?:[&*!]|\{|\[)/;
/** Anchors/aliases/tags/flow maps in a value position (flow LISTS are fine). */
const VALUE_UNSUPPORTED = /:[ \t]+(?:[&*][^ \t]|!!|\{)/;
const MERGE_KEY = /^<<[ \t]*:/;

/**
 * Classify a room file for the writer. Read-only is a UI state with a
 * reason, not an error — reading is unaffected.
 */
export function scanRoomShape(content: string): RoomShapeScan {
  if (content.startsWith('\uFEFF')) {
    // Preserve-and-recurse like the frontmatter rewriter would; the caller
    // re-attaches the BOM on write (see appendItem).
    const inner = scanRoomShape(content.slice(1));
    return inner;
  }
  const segments = toSegments(content);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  let itemsLine: number | null = null;
  for (let i = 0; i < segments.length; i += 2) {
    const line = segments[i];
    if (indentOf(line) > 0 || line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (i > 0 && /^(---|\.\.\.)([ \t]|$)/.test(line)) {
      return { writable: false, reason: 'file contains multiple YAML documents' };
    }
    if (TOP_LEVEL_ITEMS.test(line)) {
      if (itemsLine !== null) {
        return { writable: false, reason: `duplicate top-level 'items:' key` };
      }
      itemsLine = i;
      continue;
    }
    if (TOP_LEVEL_ITEMS_WITH_VALUE.test(line)) {
      return {
        writable: false,
        reason: `'items:' carries an inline value (flow style) — block sequence required`,
      };
    }
  }

  if (itemsLine === null) {
    return {
      writable: true,
      eol,
      itemsLine: null,
      entryIndent: '  ',
      entries: [],
      insertAfter: null,
    };
  }

  // Walk the sequence region: everything until the next top-level line.
  const entries: RoomEntrySpan[] = [];
  let entryIndent: string | null = null;
  let regionEnd = itemsLine; // last line seen that belongs to the sequence
  for (let i = itemsLine + 2; i < segments.length; i += 2) {
    const line = segments[i];
    const trimmed = line.trim();
    if (trimmed === '') continue; // blank lines join only if more content follows
    const indent = indentOf(line);
    if (indent === 0) break; // next top-level key / end of region

    const isComment = trimmed.startsWith('#');
    const isDash = /^-([ \t]|$)/.test(trimmed);
    const lineIndent = line.slice(0, indent);
    // An ENTRY is a dash at the sequence's own indent; a deeper dash is a
    // nested list inside the current entry (a continuation), and a dash at
    // any other indent is a shape the writer won't guess at.
    if (isDash && (entryIndent === null || lineIndent === entryIndent)) {
      entryIndent ??= lineIndent;
      const entry: RoomEntrySpan = { start: i, end: i };
      // Item-level YAML the writer won't patch marks the ITEM read-only,
      // not the file — appending never touches existing entries.
      if (ENTRY_UNSUPPORTED.test(trimmed)) {
        entry.readOnlyReason = 'the item uses anchors, tags, or a flow-style entry';
      } else if (VALUE_UNSUPPORTED.test(trimmed)) {
        entry.readOnlyReason = 'the item uses anchors, aliases, tags, or flow maps';
      }
      entries.push(entry);
    } else if (entryIndent !== null && indent > entryIndent.length) {
      // Continuation, nested content, or a comment inside the current entry.
      const entry = entries[entries.length - 1];
      if (!isComment && entry !== undefined && entry.readOnlyReason === undefined) {
        if (MERGE_KEY.test(trimmed)) {
          entry.readOnlyReason = 'the item uses YAML merge keys';
        } else if (VALUE_UNSUPPORTED.test(line)) {
          entry.readOnlyReason = 'the item uses anchors, aliases, tags, or flow maps';
        }
      }
    } else if (isDash) {
      return { writable: false, reason: 'inconsistent item indentation' };
    } else if (!isComment) {
      // Non-entry content directly under items: that is not an entry.
      return { writable: false, reason: `unrecognized content under 'items:'` };
    }
    if (entries.length > 0) entries[entries.length - 1].end = i;
    regionEnd = i;
  }

  // Resolve entry ids (line scan; slice 3's span handle).
  const contentIndent = (entryIndent ?? '  ').length + 2;
  for (const entry of entries) {
    const id = scanEntryId(segments, entry, contentIndent);
    if (id !== undefined) entry.id = id;
  }

  return {
    writable: true,
    eol,
    itemsLine,
    entryIndent: entryIndent ?? '  ',
    entries,
    insertAfter: regionEnd,
  };
}

/** The `id:` scalar of one entry, read textually (quoted spellings included). */
function scanEntryId(
  segments: string[],
  entry: RoomEntrySpan,
  contentIndent: number
): string | undefined {
  const idPattern = /^(?:id|"id"|'id')[ \t]*:[ \t]*(.*)$/;
  for (let i = entry.start; i <= entry.end; i += 2) {
    let line = segments[i];
    if (i === entry.start) {
      const dash = /^[ \t]*-[ \t]+/.exec(line);
      if (!dash) continue;
      line = line.slice(dash[0].length);
    } else {
      if (indentOf(line) !== contentIndent) continue;
      line = line.trimStart();
    }
    const match = idPattern.exec(line);
    if (match) {
      const raw = match[1].replace(/[ \t]+#.*$/, '').trim();
      try {
        const parsed = parseYaml(raw);
        return typeof parsed === 'string' || typeof parsed === 'number'
          ? String(parsed)
          : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** The fields of a new item, already in emit order (id and title first). */
export interface NewItemBlock {
  id: string;
  title: string;
  description?: string;
  value?: number;
  quantity?: number;
  serial?: string;
  acquired?: string;
  container?: string;
  tags?: string[];
  /** Declared-field values, in manifest order. */
  fieldValues?: [string, SharedInventoryScalar][];
}

/** The emitted lines of one item block (no indentation, no EOLs). */
export function itemBlockLines(item: NewItemBlock): string[] {
  const lines: string[] = [
    `id: ${formatYamlScalar(item.id)}`,
    `title: ${formatYamlScalar(item.title)}`,
  ];
  for (const key of [
    'description',
    'value',
    'quantity',
    'serial',
    'acquired',
    'container',
  ] as const) {
    const value = item[key];
    if (value !== undefined) lines.push(`${key}: ${formatYamlScalar(value)}`);
  }
  if (item.tags !== undefined && item.tags.length > 0) {
    lines.push(`tags: [${item.tags.map(formatYamlScalar).join(', ')}]`);
  }
  for (const [key, value] of item.fieldValues ?? []) {
    lines.push(`${key}: ${formatYamlScalar(value)}`);
  }
  return lines;
}

export type AppendResult = { ok: true; content: string } | { ok: false; reason: string };

/**
 * Append one item at the end of the located `items:` sequence — never blind
 * EOF: trailing keys and comments after the sequence stay untouched below
 * the inserted block. When `items:` is absent entirely the block appends at
 * EOF (safe: there is no sequence to misjudge). Byte-stable outside the
 * inserted span; what this emits `scanRoomShape` can always re-scan.
 */
export function appendItem(content: string, item: NewItemBlock): AppendResult {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const src = bom === '' ? content : content.slice(1);
  const scan = scanRoomShape(src);
  if (!scan.writable) return { ok: false, reason: scan.reason };

  const { eol, entryIndent } = scan;
  const bodyIndent = `${entryIndent}  `;
  const block = itemBlockLines(item)
    .map((line, index) => (index === 0 ? `${entryIndent}- ${line}` : `${bodyIndent}${line}`))
    .join(eol);

  if (scan.itemsLine === null) {
    // No sequence to misjudge: `items:` + block at EOF, on its own lines.
    const needsLeadingEol = src !== '' && !/\r?\n$/.test(src);
    const suffix = `items:${eol}${block}${eol}`;
    return { ok: true, content: `${bom}${src}${needsLeadingEol ? eol : ''}${suffix}` };
  }

  const segments = toSegments(src);
  const insertAfter = scan.insertAfter ?? scan.itemsLine;
  // Splice after the last belonging line, re-using its separator; a file
  // ending without a newline gains one so the block starts on its own line.
  const hasSeparatorAfter = insertAfter + 1 < segments.length;
  if (hasSeparatorAfter) {
    segments.splice(insertAfter + 2, 0, block, segments[insertAfter + 1]);
  } else {
    segments.push(eol, block, eol);
  }
  return { ok: true, content: bom + segments.join('') };
}

/** A patchable item field value: scalar, tag list, or `null` to remove. */
export type ItemPatchValue = SharedInventoryScalar | string[] | null;

export type ItemEditResult =
  | { ok: true; content: string }
  | { ok: false; notFound: true }
  | { ok: false; notFound?: false; reason: string };

function formatPatchValue(value: SharedInventoryScalar | string[]): string {
  return Array.isArray(value)
    ? `[${value.map(formatYamlScalar).join(', ')}]`
    : formatYamlScalar(value);
}

/** Bare and quoted spellings of a field key at a value position. */
function keyPattern(key: string): RegExp {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')[ \\t]*:`);
}

/**
 * The last segment index of the field whose key line sits at `lineIndex`:
 * more-indented following lines (block scalars, nested lists) belong to the
 * value and are replaced/removed with it as ONE span. Interior blank lines
 * join when more value content follows — same rule as the frontmatter
 * rewriter's continuationSpan.
 */
function fieldSpanEnd(
  segments: string[],
  lineIndex: number,
  valueIndent: number,
  entryEnd: number
): number {
  let last = lineIndex;
  for (let i = lineIndex + 2; i <= entryEnd; i += 2) {
    const line = segments[i];
    if (line.trim() === '') {
      let next = i + 2;
      while (next <= entryEnd && segments[next].trim() === '') next += 2;
      if (next <= entryEnd && indentOf(segments[next]) > valueIndent) {
        last = next;
        i = next;
        continue;
      }
      break;
    }
    if (indentOf(line) > valueIndent) {
      last = i;
      continue;
    }
    break;
  }
  return last;
}

interface LocatedItem {
  segments: string[];
  bom: string;
  eol: string;
  entryIndent: string;
  entry: RoomEntrySpan;
}

/** Locate one item's span by id in a writable file (shared edit plumbing). */
function locateItem(content: string, id: string): LocatedItem | ItemEditResult {
  const bom = content.startsWith('\uFEFF') ? '\uFEFF' : '';
  const src = bom === '' ? content : content.slice(1);
  const scan = scanRoomShape(src);
  if (!scan.writable) return { ok: false, reason: scan.reason };
  const entry = scan.entries.find((candidate) => candidate.id === id);
  if (!entry) return { ok: false, notFound: true };
  if (entry.readOnlyReason !== undefined) return { ok: false, reason: entry.readOnlyReason };
  return { segments: toSegments(src), bom, eol: scan.eol, entryIndent: scan.entryIndent, entry };
}

/**
 * Patch one item at FIELD granularity (spec inventory_edit_item #2): each
 * changed field replaces its own line span in place, a newly-set field
 * appends a line at the end of the item's block, and `null` removes the
 * field's span. Lines the edit doesn't touch — unknown keys, comments,
 * other fields — keep their exact bytes and order. Fields are applied one
 * at a time (each on a fresh scan) so earlier edits can't skew later spans.
 */
export function patchItem(
  content: string,
  id: string,
  patch: Record<string, ItemPatchValue>
): ItemEditResult {
  let current = content;
  for (const [key, value] of Object.entries(patch)) {
    const located = locateItem(current, id);
    if ('ok' in located) return located;
    const { segments, bom, eol, entryIndent, entry } = located;
    const contentIndent = `${entryIndent}  `;

    // Find the field's key line inside the span: on the `- ` line itself,
    // or a continuation line at the item's content indent.
    const pattern = keyPattern(key);
    let lineIndex = -1;
    let onDashLine = false;
    for (let i = entry.start; i <= entry.end; i += 2) {
      const line = segments[i];
      if (i === entry.start) {
        const dash = /^[ \t]*-[ \t]+/.exec(line);
        if (dash && pattern.test(line.slice(dash[0].length))) {
          lineIndex = i;
          onDashLine = true;
          break;
        }
      } else if (
        indentOf(line) === contentIndent.length &&
        !line.trim().startsWith('#') &&
        pattern.test(line.trimStart())
      ) {
        lineIndex = i;
        break;
      }
    }

    if (value === null) {
      if (lineIndex === -1) continue; // clearing an absent field is a no-op
      const spanEnd = fieldSpanEnd(segments, lineIndex, contentIndent.length, entry.end);
      if (onDashLine) {
        // The field shares the `- ` line: the dash must survive the removal.
        segments.splice(lineIndex + 2, spanEnd - lineIndex);
        segments[lineIndex] = `${entryIndent}-`;
      } else {
        const count = Math.min(spanEnd + 2, segments.length) - lineIndex;
        segments.splice(lineIndex, count);
        // A trailing line without a separator leaves a dangling one behind.
        if (lineIndex >= segments.length && lineIndex > 0) segments.splice(lineIndex - 1, 1);
      }
    } else {
      const rendered = `${key}: ${formatPatchValue(value)}`;
      if (lineIndex === -1) {
        // Absent: append at the end of the item's block.
        const insertAfter = entry.end;
        if (insertAfter + 1 < segments.length) {
          segments.splice(
            insertAfter + 2,
            0,
            `${contentIndent}${rendered}`,
            segments[insertAfter + 1]
          );
        } else {
          segments.push(eol, `${contentIndent}${rendered}`, eol);
        }
      } else {
        const spanEnd = fieldSpanEnd(segments, lineIndex, contentIndent.length, entry.end);
        segments.splice(lineIndex + 2, spanEnd - lineIndex);
        segments[lineIndex] = onDashLine
          ? `${entryIndent}- ${rendered}`
          : `${contentIndent}${rendered}`;
      }
    }
    current = bom + segments.join('');
  }
  return { ok: true, content: current };
}

/**
 * Delete one item's whole span — the `- ` line through the last line
 * belonging to the entry, and nothing else. An emptied sequence leaves
 * `items:` in place (an empty room remains valid and writable).
 */
export function deleteItem(content: string, id: string): ItemEditResult {
  const located = locateItem(content, id);
  if ('ok' in located) return located;
  const { segments, bom, entry } = located;
  if (entry.end + 1 < segments.length) {
    segments.splice(entry.start, entry.end - entry.start + 2);
  } else {
    // The entry closes the file without a trailing separator: remove the
    // separator BEFORE the span too, or a blank line appears at EOF.
    segments.splice(Math.max(entry.start - 1, 0), entry.end - entry.start + 2);
  }
  return { ok: true, content: bom + segments.join('') };
}

/**
 * Slugify a title into an item id: lowercase alphanumeric runs joined by
 * `-`, capped, with a degenerate-title fallback. Space-global uniqueness is
 * the caller's job (`-2`, `-3`, … against every id in the space, drafts
 * included).
 */
export function slugifyItemId(title: string): string {
  const slug = slugifyInventoryName(title);
  return slug === '' ? 'item' : slug;
}

/** First free id: the slug, else slug-2, slug-3, … against the taken set. */
export function disambiguateItemId(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i += 1) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
