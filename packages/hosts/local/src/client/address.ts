// The address names what is open, in the fragment: `#/file/<path>` for a file's
// preview, `#/edit/<path>` for its editor and `#/diff/<path>` for its changes
// since the last commit. Each segment of the path is percent-encoded, so a name
// with `#`, `%`, `?` or a space survives the round trip. A later view is one more
// entry in VIEWS.
//
// An app is `#/app/<manifestPath>`, then the app's own sub-path, then a query if
// its page has one: `#/app/home/inventory.yaml/room/kitchen`. The manifest's
// segments are encoded as a file's are (`appBase`); the sub-path and the query are
// the app's own, kept encoded as its links wrote them, for `matchAppPage` and the
// page's `resolve`. Which segments are the manifest's is known only with the
// instances: the longest manifest path that is a prefix, ending at a segment's
// edge, is the instance.

import { appBase } from '../shared/apps';

export type View = 'preview' | 'edit' | 'diff';

/** A file, in one of its views. */
export interface FileAddress {
  view: View;
  path: string;
}

/** A page of an app. */
export interface AppAddress {
  view: 'app';
  /** The instance's manifest, or `null` when no instance the page knows is at the address. */
  manifestPath: string | null;
  /**
   * What follows the manifest's path, still encoded: `''` or `/room/kitchen`.
   * Without an instance, the whole path after `#/app`.
   */
  subPath: string;
  /** The query after the `?`, still encoded, without the `?`: `''` when there is none. */
  query: string;
}

export type Address = FileAddress | AppAddress;

const VIEWS: Record<string, View> = { file: 'preview', edit: 'edit', diff: 'diff' };
const PREFIXES: Record<View, string> = { preview: 'file', edit: 'edit', diff: 'diff' };

/** The fragment for an address, with its `#`. */
export function formatAddress(address: Address): string {
  if (address.view === 'app') {
    const query = address.query === '' ? '' : `?${address.query}`;
    const base = address.manifestPath === null ? '#/app' : appBase(address.manifestPath);
    return `${base}${address.subPath}${query}`;
  }
  const path = address.path.split('/').map(encodeURIComponent).join('/');
  return `#/${PREFIXES[address.view]}/${path}`;
}

/** An app's address under its instance: its page at `subPath` (`''` for its first page). */
export function appAddress(manifestPath: string, subPath = '', query = ''): AppAddress {
  return { view: 'app', manifestPath, subPath, query };
}

/**
 * What a fragment names, or `null` for an empty or unknown one. An app's address
 * is split with `manifests`, the instances the page knows.
 */
export function parseAddress(hash: string, manifests: readonly string[] = []): Address | null {
  const match = /^#\/([a-z]+)\/(.+)$/.exec(hash);
  if (!match) return null;
  if (match[1] === 'app') return parseApp(match[2], manifests);
  const view = Object.hasOwn(VIEWS, match[1]) ? VIEWS[match[1]] : undefined;
  if (!view) return null;
  try {
    return { view, path: match[2].split('/').map(decodeURIComponent).join('/') };
  } catch {
    return null; // a malformed escape
  }
}

function parseApp(rest: string, manifests: readonly string[]): AppAddress | null {
  const cut = rest.indexOf('?');
  const path = cut === -1 ? rest : rest.slice(0, cut);
  const query = cut === -1 ? '' : rest.slice(cut + 1);
  const segments = path.split('/');
  let decoded: string[];
  try {
    decoded = segments.map(decodeURIComponent);
  } catch {
    return null; // a malformed escape
  }
  let best: { manifestPath: string; length: number } | null = null;
  for (const manifestPath of manifests) {
    const parts = manifestPath.split('/');
    if (parts.length > decoded.length || (best && parts.length <= best.length)) continue;
    if (parts.every((part, i) => part === decoded[i]))
      best = { manifestPath, length: parts.length };
  }
  if (!best) return { view: 'app', manifestPath: null, subPath: `/${path}`, query };
  const after = segments.slice(best.length);
  return {
    view: 'app',
    manifestPath: best.manifestPath,
    subPath: after.length === 0 ? '' : `/${after.join('/')}`,
    query,
  };
}
