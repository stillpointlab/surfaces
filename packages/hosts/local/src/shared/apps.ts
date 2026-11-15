// What the local host's server and its page say to each other about apps: the
// instances discovery found, the event that says they changed, and the answers of
// the app routes. Types and one pure rule (the region), with nothing from Node or
// the DOM, so both halves import it.

import type { HostEvent } from '@stillpointlab/common-format/host';

/** One instance discovery found: a manifest a module claims, whether or not it is valid. */
export interface FoundInstance {
  /** The module's id: `inventory`. */
  app: string;
  manifestPath: string;
  /** The manifest's folder: the row in the tree. `''` is the served root. */
  folder: string;
  /** The instance's name in the tree, from the app's `describeInstance`. */
  label: string;
  /** The module's `meta.icon`. */
  icon: string;
  /** The lifecycle took the manifest, and the instance's region overlaps no other's. */
  valid: boolean;
  /** Why it is not valid: the lifecycle's errors, and an overlap's. Empty when valid. */
  errors: string[];
  /** Its files are listed in the tree and take the explorer's writes. Every run starts locked. */
  unlocked: boolean;
  /**
   * The region of an instance at the served root: its scope's paths. Absent for
   * an instance in a folder, whose region is the folder and everything under it.
   */
  scope?: string[];
}

/** Where an instance's region is: a folder, or a root instance's paths. */
export type Region = Pick<FoundInstance, 'folder' | 'scope'>;

/**
 * Whether `path` is in the region: under the folder (the folder itself
 * included), or for an instance at the root, one of its scope's paths.
 */
export function inRegion(region: Region, path: string): boolean {
  if (region.folder === '') return region.scope?.includes(path) ?? false;
  return path === region.folder || path.startsWith(`${region.folder}/`);
}

/**
 * Where an instance's pages hang in the page's address: `#/app/` and the
 * manifest's path, each segment percent-encoded as in every other address. The
 * shell's `base`, and the `base` a page's redirect is joined to.
 */
export function appBase(manifestPath: string): string {
  return `#/app/${manifestPath.split('/').map(encodeURIComponent).join('/')}`;
}

/** What the local host's event stream sends:the host's events, and `apps` when discovery's answer changed. */
export type LocalHostEvent = HostEvent | { type: 'apps' };

/** `GET /api/apps`. */
export interface AppsAnswer {
  apps: FoundInstance[];
}

/** A page of an instance, as `GET /api/apps/page` resolves it. */
export interface AppPageShown {
  view: ({ type: string } & Record<string, unknown>) | null;
  state: object | null;
  extras?: Record<string, unknown>;
  /** The document title: the page's `title(state)`. */
  title: string;
  /**
   * The host's revision: the runner's (the scope's files), joined with a digest
   * of the changes the facts were made from, so a commit moves it.
   */
  revision: string;
}

/** A page that sends the reader to another: `redirect` is an address under the app's base. */
export interface AppPageRedirect {
  redirect: string;
  permanent?: boolean;
}

/** `GET /api/apps/page`'s success: a page shown, or a redirect. */
export type AppPageAnswer = AppPageShown | AppPageRedirect;

/** `POST /api/apps/op`'s success. A core op carries the host's revision after it; a host op answered on the server does not. */
export interface AppOpAnswer {
  reply: object;
  revision?: string;
}

/** `POST /api/apps/lock`'s success: on locking, what the lifecycle says of the manifest now. */
export interface AppLockAnswer {
  errors: string[];
  warnings: string[];
}
