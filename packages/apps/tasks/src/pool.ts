import { parse as parseYaml } from 'yaml';

/**
 * Backlog-pool order file (ADR-0020): a YAML list of repo paths in priority
 * order, living inside the pool folder. Reading is tolerant — the file is in
 * the repo and may be hand-edited or missing; writing regenerates the whole
 * file (it is a generated artifact, unlike frontmatter/manifest rewrites).
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

/** Serialize the full order list (regenerates the file; top = highest priority). */
export function formatOrderFile(paths: string[]): string {
  const header = '# Backlog pool priority order (ADR-0020) — top = highest priority.\n';
  if (paths.length === 0) return `${header}[]\n`;
  return header + paths.map((path) => `- ${formatOrderPath(path)}`).join('\n') + '\n';
}
