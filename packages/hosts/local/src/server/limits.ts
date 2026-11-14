// The local host's limits, each one constant (drafts, per the host-server spec).

/** `get` refuses a file over this many bytes with `HOST_FILE_TOO_LARGE`. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;

/** `GET /api/list` cuts the list past this many nodes, and says so. */
export const LIST_LIMIT = 20_000;

/**
 * The walk (a folder git does not list) stops after this many files, so serving a
 * very large folder (a home directory) does not read all of it. Past
 * `LIST_LIMIT` the route cuts the list anyway.
 */
export const WALK_LIMIT = 100_000;

/** `PUT /api/files` refuses a body over this many bytes. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;

/** The watcher joins events this close together into one burst... */
export const BURST_MS = 100;
/** ...and sends a burst that keeps going at least this often. */
export const BURST_MAX_MS = 1000;

/** How long one `git` command may run. */
export const GIT_TIMEOUT_MS = 10_000;

/**
 * How long a commit (and the switch to a new branch) may run, hooks and signing
 * included, before it is stopped. Longer than `GIT_TIMEOUT_MS`, since a hook may
 * lint or test; short enough that a hook waiting for input does not hold the
 * host's writes for long.
 */
export const COMMIT_TIMEOUT_MS = 60_000;
