// The host contract: what a host's storage answers, and what its server sends a
// page. Types only, so the entry is DOM-free and Node-free: the local host
// implements the port over a folder (`packages/hosts/local`), and a runner or a
// page reads it without either.
//
// A light entry (`@stillpointlab/common-format/host`).

import type { FileChange, FolderNode, Result } from '../app';

/** How a file differs from the last commit. */
export type FileStatus = 'changed' | 'new' | 'moved' | 'deleted';

/**
 * A change a host writes. `base` is the version the writer read; absent means
 * "do not check". A `move` without `content` keeps the file's bytes, which is how
 * a file that is not text (an image) is renamed.
 */
export type PortChange =
  | (FileChange & { base?: string })
  | { kind: 'move'; from: string; path: string; content?: undefined; base?: string }
  | { kind: 'delete'; path: string; base?: string };

export interface StoragePort {
  /** Every file and folder under the root, by path. */
  list(): Promise<FolderNode[]>;
  /** A text file's content, with an opaque version of it. */
  get(path: string): Promise<Result<{ text: string; version: string }>>;
  /** Write all the changes or none. Answers the new version of each path written. */
  put(changes: readonly PortChange[]): Promise<Result<{ versions: Record<string, string> }>>;
  /**
   * What differs from the last commit, by path, deleted files included. Empty
   * when the folder is not a repository.
   */
  status(): Promise<Record<string, FileStatus>>;
}

/** The codes a port refuses with. A host may add its own beside them. */
export type HostRefusalCode =
  | 'HOST_FILE_NOT_FOUND'
  | 'HOST_PATH_EXISTS'
  | 'HOST_FILE_CHANGED'
  | 'HOST_NOT_TEXT'
  | 'HOST_FILE_TOO_LARGE'
  | 'HOST_PATH_OUTSIDE_ROOT';

/**
 * What a host's event stream sends: file contents changed, the set of paths did,
 * or what git reports may have (a commit, a stage, a switch: `HEAD` or the index
 * moved), so the statuses are stale.
 */
export type HostEvent =
  { type: 'changed'; paths: string[] } | { type: 'listed' } | { type: 'status' };

/**
 * Whether a host's folder is under git, decided once when it starts:
 * `repository` (git runs and the folder is in a work tree), `no-repository` (it
 * is not, whether or not git runs), or `no-git` (git cannot be run, and the
 * folder looks like a repository).
 */
export type GitState = 'repository' | 'no-repository' | 'no-git';

/** A host's git: its state, and the current branch (`null` when detached, or outside `repository`). */
export interface HostGit {
  state: GitState;
  branch: string | null;
}

/**
 * One file that differs from the last commit, deleted files included. A moved
 * file carries the path it had (`from`), so a commit can name both.
 */
export interface HostChange {
  path: string;
  status: FileStatus;
  from?: string;
}

/** A host's listing as its server answers it: cut, and saying so, past its limit. */
export interface HostListing {
  nodes: FolderNode[];
  truncated: boolean;
}

/** What a host serves: the folder's own name, and an id to key stored state by. */
export interface HostRoot {
  name: string;
  id: string;
}
