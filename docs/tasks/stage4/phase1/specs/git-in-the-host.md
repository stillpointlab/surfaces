---
column: todo
created: 2026-11-13T18:40:00-07:00
tags: [dev-tooling, code, major-feature]
---

# Spec: git in the local host

_The [local host brief](../briefs/local_host.md), outcome 2. Stage 4, phase 3. Two steps, each one
PR here: status and diff, then commit._

## High-level goal

In a served folder that is a git repository, the explorer marks what changed, a changed file
shows its diff against the last commit, and chosen files are committed on the current branch or
a new one. Everything is done by running the installed `git`. A folder that is not a repository
works as before, with none of this.

## Related context

- The [local host spike](../spikes/local-host.md), finding 6: git stands in for drafts and
  check-in. Its answered questions: moves and deletes are staged, and how.
- `StoragePort.status()` and `FileStatus` ([host-server](../../phase2/specs/host-server.md)); the tree's marks
  ([explorer-tree](../../phase2/specs/explorer-tree.md)); `<code-diff>` and `DiffElement`
  (`packages/formats/code`, `packages/common/src/contracts.ts`).

## Work package

- **Owns:** `packages/hosts/local/src/server/git/` (the only module that runs `git`), its routes,
  the `HostClient` methods for them, and the page's diff view and commit dialog.
- **Changes:** the Node port's `put` (staging) and `status()`; the watcher (two paths under
  `.git`).
- **Step 2 depends on step 1.** Nothing else runs beside either.

## Technical requirement

### Running git

One function runs `git` with an argument list (never a shell string), in the served root, with
`GIT_OPTIONAL_LOCKS=0` for reads and a timeout. Paths go after `--`. At start the host asks once
whether the root is inside a work tree (`git rev-parse --show-toplevel` and `--show-prefix`). The
served root may be a folder inside a repository: every path the host shows stays relative to the
served root, and git is given the prefix.

The host is in one of three states, decided once at start and answered by `GET /api/git` as
`{ state, branch }`:

| State           | When                                                        | What the page does                                                                                       |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `repository`    | `git` runs and the root is in a work tree                   | marks, the Changes view and Commit; `branch` is the current branch, or `null` when detached              |
| `no-repository` | the root is not in a repository, whether or not `git` runs  | none of them, and no notice: the folder is just a folder                                                 |
| `no-git`        | `git` cannot be run, and the folder looks like a repository | none of them, and one line in the explorer's header: "git was not found, so changes and commit are off." |

Degrading with a notice, not refusing to start, is Jamie's choice (2026-11-13), and so is
showing the notice only for a folder that looks like a repository.

**"Looks like a repository"** is a light check, used only when `git` cannot be run: a `.git`
entry, a folder or a file, in the served root or in any folder above it. A file counts because
a worktree and a submodule have one. It does not read the entry, and it ignores git's other
rules (`GIT_DIR`, ceiling directories, bare repositories). When `git` runs, git's own answer is
used and this check is not.

Outside `repository`, `status()` answers `{}` and the routes below refuse with
`HOST_NOT_A_REPOSITORY` or `HOST_GIT_NOT_FOUND`. Nothing else changes: files list, open, save,
and are created, renamed and deleted as before, and a write stages nothing. The host does not
look for `git` again during the run.

### Step 1: status, diff and staging

- **`status()`** reads `git status --porcelain=v2 -z` limited to the served root, and maps each
  entry to one `FileStatus`: an untracked file is `new`, a rename is `moved` on its new path, a
  removal is `deleted`, anything else that differs is `changed`. The tree shows them.
- **A deleted file has no row,** since the list holds files on disk. The commit dialog lists it.
- **The watcher** also watches `.git/HEAD` and `.git/index`, and sends a new event,
  `{ type: 'status' }`, so a commit or a stage made in a terminal updates the marks.
- **The diff.** `GET /api/base?path=` answers the file's text at `HEAD` (`git show`), or
  `HOST_FILE_NOT_FOUND` for a new file. The pane gains a **Changes** view beside Preview and
  Edit when the open file is `changed` or `moved`: `<code-diff>` with the `HEAD` text on the
  left, the file on the right, and the language from the path. The address is `#/diff/<path>`.
- **Staging the host's own moves and deletes.** After `put` writes a `move` or a `delete` of a
  tracked file, the port stages it: `git add -A -- <from> <to>` for a move, and
  `git add -u -- <path>` for a delete, so git reports a rename and a deletion. `git rm` is not
  used, because it refuses a file with uncommitted changes. An untracked file needs no staging.
  Nothing else is ever staged by a write.

### Step 2: commit

`POST /api/commit` takes `{ paths, message, branch? }` and answers `{ commit, branch }`.

1. Refuse, with a message that says why, when: no path is given; the message is empty; a merge,
   rebase or cherry-pick is in progress; `HEAD` is detached and no branch is given; a path is
   not changed.
2. With `branch`, check the name with `git check-ref-format --branch`, refuse if it exists, and
   switch to it (`git switch -c`), which carries the working tree across.
3. Stage each chosen path: `git add -A --` for one that is on disk, and `git add -u --` for one
   that is gone from disk and still in the index. A path already staged as removed (the old
   path of a move the host staged) needs nothing, and naming it to `git add` is an error.
4. `git commit -m <message> -- <paths>`, with the old path of every moved file among the paths.
   That commits those paths alone and leaves anything else that was staged as it was. Leaving
   the old path out commits the new file and leaves the removal staged.
5. On failure (no identity set, a hook that refuses), answer git's own message, and leave the
   working tree as it is.

The page's **Commit** button, in the explorer's header, shows the number of changed files and
opens a dialog:

- the changed files, each with a checkbox (checked) and its status, a moved file as old → new;
- a message field, required;
- a choice: "On `<current branch>`" or "On a new branch", with a name field.

After a commit the marks clear for the files committed, and a notice names the commit's short
id and branch.

## Clarifications

- **The list still comes from `git ls-files`.** Nothing about listing changes here.
- **Hooks run.** A commit made here is an ordinary commit.
- **Nothing is pushed,** and no remote is read: no fetch, no divergence, no pull request. Those
  are the brief's deferred GitHub work.
- **Submodules and nested repositories** are listed as git lists them and are otherwise left alone.
  - **This commit function is the one check-in uses** in
    [checkin-review](../../../stage5/phase1/specs/checkin-review.md).
- **The staging and commit commands were tried** in a scratch repository (git on Fedora 44,
  2026-11-13): a renamed file with uncommitted edits staged as a rename, and a commit of chosen
  paths left another staged file staged. The tests in this spec repeat both.

## Non-goals

Stage and unstage by hand, discard a change, amend, stash, history, blame, branch switching
without a commit, and anything that needs the network.

## Acceptance / completion checklist

- [ ] Tests over temporary repositories for the git module: each status; a served root inside a
      repository; staging a move and a delete, of clean and of changed files; `HEAD` text.
- [ ] Commit tests: chosen paths only, with other staged work left alone; a new branch; each
      refusal; a failing hook leaves the tree as it was.
- [ ] A folder with no repository serves with no git controls and no notice, with `git` on the
      `PATH` and off it.
- [ ] With `git` off the `PATH`, a repository serves with the notice, the walk listing, and
      working file operations. So does a folder inside one, and a worktree (a `.git` file).
- [ ] By hand: edit, rename and delete files, see the marks and a diff, commit on a new branch,
      and read the result with `git log --stat`.
- [ ] `npm run check` is green.

## Implementation plan

1. PR: the git module, `status()`, the watcher's two paths, the `HEAD` route, the Changes view,
   and staging in `put`.
2. PR: the commit route, the dialog and the notice.
