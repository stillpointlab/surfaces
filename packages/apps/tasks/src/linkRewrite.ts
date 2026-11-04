/**
 * Relative-link integrity for file moves (ADR-0020, spec move_link_integrity).
 *
 * When the app moves a card, relative markdown links inside the moved file
 * are re-rooted so they keep resolving from the new location; links to files
 * moving in the SAME batch re-root against those files' new locations (so
 * sibling links between co-moving files stay byte-identical). Absolute URLs,
 * anchors, and already-broken links are left untouched — this module fixes
 * links the move would break, never links that were broken before it.
 *
 * Recomputed from content on demand — no registry, no tracking table
 * (consistent with the doc-references investigation and files-as-truth).
 */

/** Inline links/images `[x](target)` and reference definitions `[x]: target`. */
const INLINE_LINK_PATTERN = /(!?\[[^\]]*\]\()([^()\s]+)((?:\s+"[^"]*")?\))/g;
const REFERENCE_DEF_PATTERN = /(^[ \t]*\[[^\]]+\]:[ \t]+)(\S+)/gm;

function isRelativeTarget(target: string): boolean {
  return (
    target !== '' &&
    !/^[a-z][a-z0-9+.-]*:/i.test(target) && // http:, https:, mailto:, cm:, …
    !target.startsWith('/') &&
    !target.startsWith('#')
  );
}

/** Normalize `a/b/../c` → `a/c`; returns null when it escapes the repo root. */
function normalizePath(path: string): string | null {
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/** Relative path from `fromDir` to `toPath` (both repo-relative). */
function relativePath(fromDir: string, toPath: string): string {
  const from = fromDir === '' ? [] : fromDir.split('/');
  const to = toPath.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) {
    common += 1;
  }
  const ups = from.length - common;
  const rel = [...Array<string>(ups).fill('..'), ...to.slice(common)].join('/');
  return rel === '' ? '.' : rel;
}

export interface LinkRewriteResult {
  content: string;
  /** Links rewritten for the new location. */
  rewritten: number;
  /** Relative links that resolved to nothing even BEFORE the move (untouched). */
  broken: number;
}

/**
 * Re-root every relative link in `content` from `fromDir` to `toDir`.
 *
 * @param exists    Whether a repo-relative path exists (tree ∪ imported goods).
 * @param coMoving  Old path → new path for every file moving in this batch.
 */
export function rewriteRelativeLinks(
  content: string,
  fromDir: string,
  toDir: string,
  exists: (path: string) => boolean,
  coMoving?: Map<string, string>
): LinkRewriteResult {
  let rewritten = 0;
  let broken = 0;

  const rerootTarget = (target: string): string | null => {
    if (!isRelativeTarget(target)) return null;
    const hashIndex = target.indexOf('#');
    const bare = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const anchor = hashIndex === -1 ? '' : target.slice(hashIndex);
    if (bare === '') return null; // pure anchor
    const absolute = normalizePath(fromDir === '' ? bare : `${fromDir}/${bare}`);
    if (absolute === null) {
      broken += 1;
      return null; // escapes the repo — leave it
    }
    // A coMoving/redirect entry wins over the exists gate: the caller
    // declares the path as a moved file's former location, and a chained
    // move's hop path (e.g. the pool, pre-check-in) exists nowhere — the
    // link would otherwise read as pre-broken and stay stale.
    const redirected = coMoving?.get(absolute);
    if (redirected === undefined && !exists(absolute)) {
      broken += 1;
      return null; // was broken before the move — leave it
    }
    const destination = redirected ?? absolute;
    const next = relativePath(toDir, destination) + anchor;
    if (next === target) return null;
    rewritten += 1;
    return next;
  };

  const applied = content
    .replace(INLINE_LINK_PATTERN, (whole, open: string, target: string, close: string) => {
      const next = rerootTarget(target);
      return next === null ? whole : `${open}${next}${close}`;
    })
    .replace(REFERENCE_DEF_PATTERN, (whole, open: string, target: string) => {
      const next = rerootTarget(target);
      return next === null ? whole : `${open}${next}`;
    });

  return { content: applied, rewritten, broken };
}

/**
 * Every RELATIVE link in `content` resolved against `fromDir`: the raw
 * target, the repo-relative resolution (null when it escapes the repo root),
 * and the content offset (for line reporting). Absolute URLs, scheme links,
 * and pure anchors are excluded. Shared by the inbound-reference scan and
 * the check-doc-links repo script — one definition of "what counts as a
 * link".
 */
export function relativeLinkTargets(
  content: string,
  fromDir: string
): { target: string; resolved: string | null; index: number }[] {
  const links: { target: string; resolved: string | null; index: number }[] = [];
  const collect = (target: string, index: number): void => {
    if (!isRelativeTarget(target)) return;
    const bare = target.split('#')[0];
    if (bare === '') return;
    links.push({
      target,
      resolved: normalizePath(fromDir === '' ? bare : `${fromDir}/${bare}`),
      index,
    });
  };
  for (const match of content.matchAll(INLINE_LINK_PATTERN)) {
    collect(match[2], (match.index ?? 0) + match[1].length);
  }
  for (const match of content.matchAll(REFERENCE_DEF_PATTERN)) {
    collect(match[2], (match.index ?? 0) + match[1].length);
  }
  return links;
}

/**
 * Does `content` (living at `fromDir`) contain a relative link resolving to
 * `targetPath`? Drives the inbound-reference scan after a move.
 */
export function referencesPath(content: string, fromDir: string, targetPath: string): boolean {
  return relativeLinkTargets(content, fromDir).some((link) => link.resolved === targetPath);
}
