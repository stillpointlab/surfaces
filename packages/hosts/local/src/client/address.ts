// The address names what is open, in the fragment: `#/file/<path>` for a file's
// preview, `#/edit/<path>` for its editor and `#/diff/<path>` for its changes
// since the last commit. Each segment of the path is percent-encoded, so a name
// with `#`, `%`, `?` or a space survives the round trip. A later view is one more
// entry in VIEWS.

export type View = 'preview' | 'edit' | 'diff';

export interface Address {
  view: View;
  path: string;
}

const VIEWS: Record<string, View> = { file: 'preview', edit: 'edit', diff: 'diff' };
const PREFIXES: Record<View, string> = { preview: 'file', edit: 'edit', diff: 'diff' };

/** The fragment for an address, with its `#`. */
export function formatAddress(address: Address): string {
  const path = address.path.split('/').map(encodeURIComponent).join('/');
  return `#/${PREFIXES[address.view]}/${path}`;
}

/** What a fragment names, or `null` for an empty or unknown one. */
export function parseAddress(hash: string): Address | null {
  const match = /^#\/([a-z]+)\/(.+)$/.exec(hash);
  if (!match) return null;
  const view = Object.hasOwn(VIEWS, match[1]) ? VIEWS[match[1]] : undefined;
  if (!view) return null;
  try {
    return { view, path: match[2].split('/').map(decodeURIComponent).join('/') };
  } catch {
    return null; // a malformed escape
  }
}
