---
created: 2026-11-20T14:50:00-07:00
tags: [apps, host-contract, polish]
---

# The host's words in an app

An app's copy says "repository" and "pull request", which are Context Manager's words. The local
host serves a folder and commits. Stage 5's follow-up log had it twice: each app's create copy
(the folder help, tasks' root warning), and the board's in-flight chip, "PR…".

Jamie, 2026-11-20, draining that log before Context Manager adopts the apps' pieces: leave the
copy as it is for the adoption, and seed this. The module's create copy is word for word what
Context Manager's registries hold today, so adopting it changes nothing a person reads there.

Where it stands:

- **Already the host's:** the check-in review's words (`CheckinWords`, on a shell's input), and
  `AppShellInput.location`, "a name for where the instance lives: a repository, a folder".
- **The create copy,** in each app's `meta.ts`: "Where the files live in the repository", "this
  repository can hold other app views", "Creating at the repository root…", "make the whole
  repository this task project".
- **The board:** the chip "PR…" with "the pull request is being opened", "Checked in — view pull
  request", "Tracked from the repository — read only" and its `repo` badge.
- **Tasks' shell:** "Refresh — sync the repository and update this board", and the empty state's
  "the repository root".
- **Tasks' dialogs:** "from the repository's brief template".
- **Inventory's overview:** "This repository has no inventory yet".
- The local host's own words are in `packages/hosts/local/src/client/words.ts`, and none of
  the above passes through it.

What a spec would have to settle (the claude agent's list, not Jamie's):

- one mechanism or two. A host could give a few nouns (where an instance lives, what a check-in
  becomes) that the apps' sentences use, or whole phrases as `CheckinWords` does. Nouns are
  less to supply and read worse in a sentence built around another word;
- where they travel: the shell's input reaches the elements, but `meta` is read before any
  shell exists, by a page that only lists the apps;
- the defaults when a host gives none, which should say neither "repository" nor "pull
  request", as the shells' check-in words already do;
- which of the board's marks are a host's facts and not only its words: a tracked card and a
  pull request's link exist in Context Manager alone.
