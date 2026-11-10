import { parse as parseYaml } from 'yaml';

/**
 * Backlog-pool order file (ADR-0020): a YAML list of repo paths in priority
 * order, living inside the pool folder. Reading is tolerant — the file is in
 * the repo and may be hand-edited or missing. Writing keeps what a person
 * added (ADR-0028 decision 1): `rewriteOrderFile` refills the file's item
 * lines in the new order and leaves its comments and blank lines where they
 * are, regenerating only a file it cannot read line by line.
 */

/**
 * Parse the order file to a list of paths. Anything that isn't a YAML list
 * (missing/empty file, garbage, a mapping) resolves to [] — pool cards then
 * sort by path alone. Non-string items are dropped. `invalid` distinguishes
 * unparseable content from a genuinely empty/missing file so the board can
 * warn instead of silently discarding a hand-ordered backlog.
 */
export function parseOrderFileDetailed(content: string): { paths: string[]; invalid: boolean } {
  if (content.trim() === '') return { paths: [], invalid: false };
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch {
    return { paths: [], invalid: true };
  }
  if (!Array.isArray(raw)) return { paths: [], invalid: true };
  return {
    paths: raw.filter((item): item is string => typeof item === 'string' && item.trim() !== ''),
    invalid: false,
  };
}

export function parseOrderFile(content: string): string[] {
  return parseOrderFileDetailed(content).paths;
}

/**
 * Sort pool cards by their order-file index; unlisted paths sort last, stable
 * by path. Listed paths that no longer exist are simply never matched (and
 * pruned on the next reorder write).
 */
export function orderPoolCards<T extends { path: string }>(cards: T[], order: string[]): T[] {
  const indexByPath = new Map(order.map((path, index) => [path, index]));
  return [...cards].sort((a, b) => {
    const ai = indexByPath.get(a.path) ?? Number.MAX_SAFE_INTEGER;
    const bi = indexByPath.get(b.path) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.path.localeCompare(b.path);
  });
}

/** Quote a path only when YAML's plain-scalar rules require it. */
function formatOrderPath(path: string): string {
  return /^[A-Za-z0-9_][A-Za-z0-9_./ -]*$/.test(path) && !path.includes(': ')
    ? path
    : JSON.stringify(path);
}

/** One line of an order file, and the line break that ends it ('' for the last). */
interface OrderLine {
  text: string;
  eol: string;
}

function linesOf(content: string): OrderLine[] {
  const parts = content.split(/(\r\n|\r|\n)/);
  const lines: OrderLine[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    lines.push({ text: parts[i]!, eol: parts[i + 1] ?? '' });
  }
  // A final line break leaves an empty last part, which is no line.
  if (lines.length > 1 && lines.at(-1)!.text === '' && lines.at(-1)!.eol === '') lines.pop();
  return lines;
}

/** A `- path` item line's path and its trailing comment, or null when it is not one. */
function itemOf(text: string): { path: string; comment: string } | null {
  const match = /^-[ \t]+(.*?)([ \t]+#.*)?$/.exec(text);
  if (!match) return null;
  // The lazy split first; a quoted path holding ' #' only reads whole.
  for (const [value, comment] of [
    [match[1]!, match[2] ?? ''],
    [`${match[1]!}${match[2] ?? ''}`, ''],
  ] as const) {
    let parsed: unknown;
    try {
      parsed = parseYaml(`- ${value}`);
    } catch {
      continue;
    }
    if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
      return { path: parsed[0], comment };
    }
  }
  return null;
}

/**
 * The order file holding `paths`, kept as a person left it. Item lines are
 * refilled in the new order, each path keeping its trailing comment; comment
 * and blank lines stay where they are, so a group heading heads whatever
 * ranks below it. A path that left the list loses its line, a new one goes
 * after the last item, and an emptied list is written `[]`. Line breaks follow
 * the file's own, and so does its final newline. A file with anything else in
 * it (a nested or flow list, a mapping, only comments) is regenerated, as is a
 * missing one.
 */
export function rewriteOrderFile(
  content: string | null | undefined,
  paths: readonly string[]
): string {
  const regenerated = (): string => formatOrderFile([...paths]);
  if (content === null || content === undefined || content.trim() === '') return regenerated();
  const read = parseOrderFileDetailed(content);
  if (read.invalid) return regenerated();

  const lines = linesOf(content);
  const items = new Map<number, { path: string; comment: string }>();
  let emptyList: number | null = null;
  for (const [index, { text }] of lines.entries()) {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (emptyList === null && /^\[\][ \t]*(#.*)?$/.test(trimmed)) {
      emptyList = index;
      continue;
    }
    const item = itemOf(text);
    if (!item) return regenerated();
    items.set(index, item);
  }
  // What the lines say must be what the file parses to.
  const listed = [...items.values()].map((item) => item.path);
  if ((items.size > 0 && emptyList !== null) || listed.join('\n') !== read.paths.join('\n')) {
    return regenerated();
  }

  const eol = /\r\n|\r|\n/.exec(content)?.[0] ?? '\n';
  const wanted = new Set(paths);
  const commentOf = new Map([...items.values()].map((item) => [item.path, item.comment]));
  const itemText = (path: string): string =>
    `- ${formatOrderPath(path)}${commentOf.get(path) ?? ''}`;
  const slots = [...items.entries()].filter(([, item]) => wanted.has(item.path)).map(([i]) => i);
  // Where new lines go: after the last kept item, else where the list was.
  const place = slots.at(-1) ?? [...items.keys()].at(0) ?? emptyList;
  const rest = paths.slice(slots.length);
  const fill = new Map(slots.map((index, n) => [index, paths[n]!]));

  const out: OrderLine[] = [];
  for (const [index, line] of lines.entries()) {
    const slot = fill.get(index);
    if (slot !== undefined) out.push({ text: itemText(slot), eol: line.eol });
    else if (!items.has(index) && index !== emptyList) out.push(line);
    if (index !== place) continue;
    if (paths.length === 0) out.push({ text: '[]', eol: '' });
    for (const path of rest) out.push({ text: itemText(path), eol: '' });
  }
  // Every line but the last ends with a break; the last ends as the file did.
  const final = lines.at(-1)!.eol;
  return out
    .map((line, n) => line.text + (n === out.length - 1 ? final : line.eol || eol))
    .join('');
}

/** Serialize the full order list (regenerates the file; top = highest priority). */
export function formatOrderFile(paths: string[]): string {
  const header = '# Backlog pool priority order (ADR-0020) — top = highest priority.\n';
  if (paths.length === 0) return `${header}[]\n`;
  return header + paths.map((path) => `- ${formatOrderPath(path)}`).join('\n') + '\n';
}
