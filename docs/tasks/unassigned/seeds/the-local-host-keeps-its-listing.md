---
created: 2026-11-21T13:30:00-07:00
tags: [apps, host-contract, code]
---

# The local host keeps its listing between changes

A question of speed, for a large folder, and nothing is wrong today. The local host's server
finds the app instances again on every write and every app route: `instances()` in
`packages/hosts/local/src/server/apps/app-host.ts` calls `discover`, which asks the port for
the whole listing (in a repository, `git ls-files` and one `lstat` for each file) and reads
every manifest. A save, an op on a board, a page of an app and the lock's check on a write each
pay for one. From stage 5's follow-up log (apps-in-the-local-host, step 1); Jamie ruled it a
seed on 2026-11-21.

Nobody has measured it. On this repository's own folder it does not show. It would on a folder
of tens of thousands of files, where each listing is some hundreds of milliseconds.

The plain answer is to keep the listing, and the instances found in it, until something
changes. What makes it a spec and not a fix (the claude agent's list, not Jamie's):

- **A stale answer weakens the lock.** `checkWrite` uses the instances to refuse a write into a
  locked app's files. If the kept answer is older than a manifest that just appeared, a write
  that should be refused goes through. So the kept answer must be dropped by everything that
  can change it, not only by the watcher.
- **The watcher is late by design.** It joins bursts of changes, so it reports a change some
  tens of milliseconds after it happened. The host's own writes (a `put`, an op, a create, an
  undo) know at once and can drop the answer themselves. A change made outside the host has
  that window whatever is done, as git's `HEAD` has (see the entry on the kept base texts,
  closed in #155).
- **Where it is kept.** In the port, every caller of `list` gains (the explorer's listing
  too). In the apps' server, only discovery does. The port is the wider fix and the wider risk.
- **What to measure first:** `list` and `discover` on a folder of 10,000 and 50,000 files, in
  and out of a repository, so the spec starts from numbers.
