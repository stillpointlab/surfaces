import { fail, ok } from '@stillpointlab/common-format/app';
import { formatYamlScalar } from '@stillpointlab/common-format/yaml';
import { parse as parseYaml } from 'yaml';

import { formatScalar } from './frontmatter.js';

import type { Failure, Result } from '@stillpointlab/common-format/app';

/**
 * Minimal-diff edits to `tasks.yaml` (ADR-0020).
 *
 * The manifest is hand-edited, so app writes — current-pointer bumps and
 * tag-registry additions, the only two shapes the app ever patches — must
 * change only the affected lines. Like the frontmatter rewriter this works
 * textually, never parse-and-re-emit: comments, key order, quoting style,
 * unknown keys, and line-ending style all survive untouched. Shapes the
 * rewriter cannot patch conservatively (a flow list spanning lines, a bracket
 * hidden in a comment) answer a `TASKS_MANIFEST_UNPATCHABLE` failure instead
 * of corrupting the file.
 */

function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Split into lines that KEEP their own trailing newline (the last line may
 * have none). Untouched lines rejoin byte-for-byte, so a mixed-EOL file stays
 * mixed — a pointer bump must never be a whole-file line-ending diff.
 */
function splitLines(content: string): string[] {
  return content === '' ? [] : content.split(/(?<=\n)/);
}

/** A line's text without its trailing newline. */
function textOf(line: string): string {
  return line.replace(/\r?\n$/, '');
}

/** The line's own newline, else the file default for lines that lack one. */
function eolOf(line: string, eol: string): string {
  return /\r?\n$/.exec(line)?.[0] ?? eol;
}

/**
 * Extent of a top-level key's block: the key line plus every following line
 * that is indented and non-blank — including interior blank lines when more
 * indented content follows (YAML allows them; stopping at the blank would
 * split the block). Returns the exclusive end index.
 */
function blockEnd(lines: string[], keyLineIndex: number): number {
  let end = keyLineIndex + 1;
  while (end < lines.length) {
    const text = textOf(lines[end]);
    if (/^[ \t]/.test(text) && text.trim() !== '') {
      end += 1;
      continue;
    }
    if (text.trim() === '') {
      let next = end + 1;
      while (next < lines.length && textOf(lines[next]).trim() === '') next += 1;
      if (next < lines.length) {
        const nextText = textOf(lines[next]);
        if (/^[ \t]/.test(nextText) && nextText.trim() !== '') {
          end = next;
          continue;
        }
      }
    }
    break;
  }
  return end;
}

function findTopLevelKey(lines: string[], key: string): number {
  const pattern = new RegExp(`^${key}:(\\s|$)`);
  return lines.findIndex((line) => pattern.test(textOf(line)));
}

/** Append lines at the end of the file, preserving a single trailing newline. */
function appendLines(content: string, added: string[], eol: string): string {
  const base = content === '' || content.endsWith('\n') ? content : content + eol;
  return base + added.join(eol) + eol;
}

/** Splice replacement line texts in, giving each the file's EOL style. */
function spliceLines(
  lines: string[],
  start: number,
  count: number,
  replacement: string[],
  eol: string
): void {
  const removed = lines.slice(start, start + count);
  // Replaced lines keep the EOL style of the lines they replace, not the
  // file-wide detected one — one stray CRLF elsewhere must not restyle them.
  const localEol = removed.length > 0 ? eolOf(removed[0], eol) : eol;
  const atFileEnd = start + count >= lines.length;
  const lastRemovedHadNewline = removed.length === 0 || /\n$/.test(removed[removed.length - 1]);
  const newLines = replacement.map((text, i) => {
    const isLast = i === replacement.length - 1;
    // The file's final line keeps its missing-newline state.
    if (isLast && atFileEnd && !lastRemovedHadNewline) return text;
    return text + localEol;
  });
  lines.splice(start, count, ...newLines);
}

/**
 * Set the `current:` stage/phase pointer, replacing an existing block (or
 * inline flow mapping, preserving that style) or appending one at the end.
 */
export function rewriteManifestCurrent(
  content: string,
  current: { stage: number; phase: number }
): string {
  const eol = detectEol(content);
  const lines = splitLines(content);
  const index = findTopLevelKey(lines, 'current');

  const blockLines = ['current:', `  stage: ${current.stage}`, `  phase: ${current.phase}`];
  if (index === -1) {
    return appendLines(content, blockLines, eol);
  }

  const inlineValue = textOf(lines[index]).slice('current:'.length).trim();
  const replacement =
    inlineValue !== '' && !inlineValue.startsWith('#')
      ? [`current: { stage: ${current.stage}, phase: ${current.phase} }`]
      : blockLines;
  spliceLines(lines, index, blockEnd(lines, index) - index, replacement, eol);
  return lines.join('');
}

/** A registry section the board-settings ops patch (spec tasks_edit). */
export type ManifestListSection = 'columns' | 'kinds';

/**
 * The section's item lines and geometry, or a loud failure. Items are the
 * `- ` lines at the section's shallowest item indentation; each spans from
 * its dash line to the next item (or the block end). Only the app-authored
 * block shape is patchable — a flow list (`columns: [...]`), a missing
 * section, or a dash-less block fails with the "edit by hand" message, never
 * a guess (the manifestRewrite doctrine).
 */
function sectionItems(
  lines: string[],
  section: ManifestListSection
):
  | {
      keyIndex: number;
      end: number;
      itemIndent: string;
      items: { start: number; end: number; id: string | null }[];
    }
  | Failure {
  const unpatchable = (why: string): Failure =>
    fail(
      'TASKS_MANIFEST_UNPATCHABLE',
      `the ${section}: section in tasks.yaml ${why} — make this change by editing the file`
    );
  const keyIndex = findTopLevelKey(lines, section);
  if (keyIndex === -1) return unpatchable('is not declared');
  const inlineValue = textOf(lines[keyIndex]).slice(`${section}:`.length).trim();
  if (inlineValue !== '' && !inlineValue.startsWith('#')) {
    return unpatchable('is a single-line flow list the app cannot patch safely');
  }

  const end = blockEnd(lines, keyIndex);
  const dashLines: { index: number; indent: string }[] = [];
  for (let i = keyIndex + 1; i < end; i++) {
    const match = /^(\s*)-(\s|$)/.exec(textOf(lines[i]));
    if (match) dashLines.push({ index: i, indent: match[1] });
  }
  const itemIndent = dashLines.length > 0 ? dashLines[0].indent : '  ';
  const itemStarts = dashLines.filter((line) => line.indent === itemIndent);

  const items = itemStarts.map((start, i) => ({
    start: start.index,
    end: i + 1 < itemStarts.length ? itemStarts[i + 1].index : end,
    id: idOfItemLine(textOf(lines[start.index])),
  }));
  return { keyIndex, end, itemIndent, items };
}

/** The `id:` scalar on an item's dash line (`- id: todo`), null otherwise. */
function idOfItemLine(lineText: string): string | null {
  const match = /^\s*-\s+id:\s*([^#]*)(#.*)?$/.exec(lineText);
  if (!match) return null;
  const raw = match[1].trim();
  const quoted = /^(['"])(.*)\1$/.exec(raw);
  return (quoted ? quoted[2] : raw) || null;
}

/** The section item spanning [start, end) whose dash line declares this id. */
function findItem(
  lines: string[],
  section: ManifestListSection,
  id: string
): { start: number; end: number; itemIndent: string } | Failure {
  const found = sectionItems(lines, section);
  if ('ok' in found) return found;
  const { items, itemIndent } = found;
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    return fail(
      'TASKS_MANIFEST_UNPATCHABLE',
      `no ${section} entry with id '${id}' has the '- id: ${id}' shape the app can patch — make this change by editing the file`
    );
  }
  return { ...item, itemIndent };
}

/**
 * Append an entry to `columns:` / `kinds:` (spec tasks_edit): a dash line for
 * the id plus one sub-key line per extra field, matching the existing items'
 * indentation (two spaces under the key when the section is empty). Values
 * are quoted only when YAML would otherwise reinterpret them.
 */
export function appendManifestListEntry(
  content: string,
  section: ManifestListSection,
  entry: { id: string; fields: [string, string | boolean][] }
): Result<{ content: string }> {
  const eol = detectEol(content);
  const lines = splitLines(content);
  const found = sectionItems(lines, section);
  if ('ok' in found) return found;
  const { end, itemIndent } = found;

  const subIndent = `${itemIndent}  `;
  // The lenient scalar rule (the seed writer's): quote only what YAML would
  // reinterpret, so `label: In progress` stays as a human would write it.
  const added = [
    `${itemIndent}- id: ${formatYamlScalar(entry.id)}`,
    ...entry.fields.map(
      ([key, value]) =>
        `${subIndent}${key}: ${typeof value === 'boolean' ? String(value) : formatYamlScalar(value)}`
    ),
  ];

  // Mirror appendManifestTag's end-of-file dance: keep the trailing-newline
  // state, and never merge the first added line into a newline-less last line.
  const neighborEol = end > 0 ? eolOf(lines[end - 1], eol) : eol;
  const insertAtEnd = end === lines.length;
  const hadTrailingNewline = lines.length === 0 || /\n$/.test(lines[lines.length - 1]);
  if (insertAtEnd && lines.length > 0 && !hadTrailingNewline) {
    lines[end - 1] += neighborEol;
  }
  const withEol = added.map((text, i) => {
    const isLast = i === added.length - 1;
    return insertAtEnd && !hadTrailingNewline && isLast ? text : text + neighborEol;
  });
  lines.splice(end, 0, ...withEol);
  return ok({ content: lines.join('') });
}

/**
 * Set (value), add (absent key), or remove (null) one scalar key inside the
 * entry `- id: <id>` — never the id line itself. An added key lands directly
 * after the dash line; a replaced value keeps its line's indentation and any
 * trailing comment; booleans are written bare.
 */
export function patchManifestEntryKey(
  content: string,
  section: ManifestListSection,
  id: string,
  key: string,
  value: string | boolean | null
): Result<{ content: string }> {
  if (key === 'id') {
    return fail('TASKS_ID_IMMUTABLE', 'ids are immutable through app surfaces (ADR-0028)');
  }
  const eol = detectEol(content);
  const lines = splitLines(content);
  const item = findItem(lines, section, id);
  if ('ok' in item) return item;

  const keyPattern = new RegExp(`^(\\s*)${key}:\\s*([^#]*?)(\\s*#.*)?$`);
  let keyLine = -1;
  let match: RegExpExecArray | null = null;
  for (let i = item.start + 1; i < item.end; i++) {
    match = keyPattern.exec(textOf(lines[i]));
    if (match) {
      keyLine = i;
      break;
    }
  }

  const formatted =
    value === null ? '' : typeof value === 'boolean' ? String(value) : formatYamlScalar(value);

  if (keyLine === -1) {
    if (value === null) return ok({ content }); // removing an absent key is a no-op
    const subIndent = `${item.itemIndent}  `;
    const neighborEol = eolOf(lines[item.start], eol);
    lines.splice(item.start + 1, 0, `${subIndent}${key}: ${formatted}${neighborEol}`);
    return ok({ content: lines.join('') });
  }

  if (value === null) {
    lines.splice(keyLine, 1);
    return ok({ content: lines.join('') });
  }
  const comment = match![3] ?? '';
  lines[keyLine] = `${match![1]}${key}: ${formatted}${comment}${eolOf(lines[keyLine], eol)}`;
  return ok({ content: lines.join('') });
}

/**
 * Remove the entry `- id: <id>` — its dash line through its last sub-key
 * line. Comment lines ABOVE the entry stay (they more often describe the
 * section than the entry; the check-in diff makes any leftover obvious).
 */
export function removeManifestListEntry(
  content: string,
  section: ManifestListSection,
  id: string
): Result<{ content: string }> {
  const lines = splitLines(content);
  const item = findItem(lines, section, id);
  if ('ok' in item) return item;
  // Trailing comment/blank lines inside the span belong to the NEXT entry's
  // reading context as much as this one's — leave any line that is not
  // indented deeper than the dash or is a comment at item depth… simpler and
  // safer: the span ends where the next item (or the block) starts, and
  // comment lines directly above that boundary are left in place.
  let end = item.end;
  while (end > item.start + 1) {
    const text = textOf(lines[end - 1]);
    if (text.trim() === '' || text.trim().startsWith('#')) end -= 1;
    else break;
  }
  lines.splice(item.start, end - item.start);
  return ok({ content: lines.join('') });
}

/**
 * Set a top-level scalar (`defaultColumn:` / `doneColumn:`), replacing in
 * place (keeping any trailing comment) or inserting directly after the
 * `columns:` block when absent — next to the ids it names.
 */
export function patchManifestTopLevelScalar(
  content: string,
  key: 'defaultColumn' | 'doneColumn',
  value: string
): Result<{ content: string }> {
  const eol = detectEol(content);
  const lines = splitLines(content);
  const index = findTopLevelKey(lines, key);
  if (index !== -1) {
    const match = /^([^#:]*:\s*)([^#]*?)(\s*#.*)?$/.exec(textOf(lines[index]))!;
    lines[index] = `${key}: ${formatYamlScalar(value)}${match[3] ?? ''}${eolOf(lines[index], eol)}`;
    return ok({ content: lines.join('') });
  }
  const columnsIndex = findTopLevelKey(lines, 'columns');
  if (columnsIndex === -1) {
    return fail(
      'TASKS_MANIFEST_UNPATCHABLE',
      `tasks.yaml has no columns: section to anchor ${key} to — make this change by editing the file`
    );
  }
  const end = blockEnd(lines, columnsIndex);
  const neighborEol = end > 0 ? eolOf(lines[end - 1], eol) : eol;
  const insertAtEnd = end === lines.length;
  const hadTrailingNewline = lines.length === 0 || /\n$/.test(lines[lines.length - 1]);
  if (insertAtEnd && lines.length > 0 && !hadTrailingNewline) {
    lines[end - 1] += neighborEol;
  }
  const itemEol = insertAtEnd && !hadTrailingNewline ? '' : neighborEol;
  lines.splice(end, 0, `${key}: ${formatYamlScalar(value)}${itemEol}`);
  return ok({ content: lines.join('') });
}

/** The `tags:` value a single line parses to, or null when it does not parse. */
function tagsOfLine(lineText: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = (parseYaml(lineText) as Record<string, unknown> | null)?.['tags'];
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.every((item) => typeof item === 'string') ? (parsed as string[]) : null;
}

/**
 * Append a tag to the `tags:` registry. Case-insensitively idempotent: a tag
 * already present returns the content unchanged. Handles the three authored
 * shapes — block list, single-line flow list (including `[]`), and a missing
 * key — always preserving the file's existing style where one exists.
 */
export function appendManifestTag(content: string, tag: string): Result<{ content: string }> {
  const trimmed = tag.trim();
  if (trimmed === '') {
    return fail('TASKS_TAG_EMPTY', 'tag must be non-empty');
  }

  const eol = detectEol(content);
  const lines = splitLines(content);
  const index = findTopLevelKey(lines, 'tags');
  const formatted = formatScalar(trimmed);

  if (index === -1) {
    return ok({ content: appendLines(content, ['tags:', `  - ${formatted}`], eol) });
  }

  const end = blockEnd(lines, index);
  const existingYaml = lines.slice(index, end).map(textOf).join('\n');
  let existing: unknown;
  try {
    existing = (parseYaml(existingYaml) as Record<string, unknown>)?.tags;
  } catch {
    return fail('TASKS_TAGS_UNPARSEABLE', 'tags registry in tasks.yaml is not parseable YAML');
  }
  const existingTags = Array.isArray(existing) ? existing.map(String) : [];
  if (existingTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
    return ok({ content });
  }

  const keyLineText = textOf(lines[index]);
  const inlineValue = keyLineText.slice('tags:'.length).trim();
  if (inlineValue.startsWith('[')) {
    // Single-line flow list: insert before the closing bracket — then VERIFY
    // by re-parsing. A `]` inside a trailing comment or a flow list spanning
    // lines cannot be patched conservatively; corrupting a hand-edited
    // manifest 400s the whole tasks area, so fail loudly instead.
    const closing = keyLineText.lastIndexOf(']');
    const candidate =
      closing === -1
        ? null
        : keyLineText.slice(0, closing).trimEnd() +
          (existingTags.length === 0 ? `${formatted}]` : `, ${formatted}]`) +
          keyLineText.slice(closing + 1);
    const parsedTags = candidate === null ? null : tagsOfLine(candidate);
    if (
      candidate === null ||
      parsedTags === null ||
      parsedTags.length !== existingTags.length + 1 ||
      parsedTags[parsedTags.length - 1] !== trimmed
    ) {
      return fail(
        'TASKS_MANIFEST_UNPATCHABLE',
        'the tags: list in tasks.yaml has a shape the app cannot patch safely — add the tag by editing the file'
      );
    }
    lines[index] = candidate + eolOf(lines[index], eol);
    return ok({ content: lines.join('') });
  }

  // Block list (or bare `tags:` with no items): append an item line matching
  // the indentation of the last item, defaulting to two spaces.
  const lastItem = lines
    .slice(index + 1, end)
    .map(textOf)
    .reverse()
    .find((line) => /^\s*-\s/.test(line));
  const indent = lastItem ? (/^(\s*)/.exec(lastItem)?.[1] ?? '  ') : '  ';
  // Inserting at the file end: keep the file's trailing-newline state — and
  // if the current last line lacks one, give it one first or the new item
  // would merge into it.
  // The new item matches its neighbor's EOL style, not the file-wide one.
  const neighborEol = end > 0 ? eolOf(lines[end - 1], eol) : eol;
  const insertAtEnd = end === lines.length;
  const hadTrailingNewline = lines.length === 0 || /\n$/.test(lines[lines.length - 1]);
  if (insertAtEnd && lines.length > 0 && !hadTrailingNewline) {
    lines[end - 1] += neighborEol;
  }
  const itemEol = insertAtEnd && !hadTrailingNewline ? '' : neighborEol;
  lines.splice(end, 0, `${indent}- ${formatted}${itemEol}`);
  return ok({ content: lines.join('') });
}
