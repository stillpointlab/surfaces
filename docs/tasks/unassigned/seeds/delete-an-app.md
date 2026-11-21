---
created: 2026-11-21T15:45:00-07:00
tags: [apps, host-contract, feature]
---

# Delete an app

A person cannot delete an app instance in one action. Jamie asked on 2026-11-21 whether it is
possible now; it is not, and he wants to think about the second-order effects before anything
is built, so this is a seed and not a fix.

What the local host offers today (tried by hand on 2026-11-21, against the built host):

- **Undo,** while the app's create is the journal's latest step.
- **By hand:** "Show files…" on the app's row, then Delete on each file and folder under it in
  the tree. Once the manifest is gone the folder is an ordinary folder. A new task project is
  one file; a board with stages, or an inventory with zones, is many.
- **No entry does it.** A locked app's menu is Open and "Show files…"; unlocked, it is Open,
  "Lock files" and "New file…". The app's own row has no Delete in either state.

What Context Manager offers for removing an app was not looked at for this seed. A spec would
start there.

What a spec would have to settle (the claude agent's list, not Jamie's; the second-order
effects are his to weigh):

- **What is deleted.** The manifest alone (the folder becomes ordinary and every card or zone
  file stays), or every file in the app's scope. At the served root the scope is a list of
  paths among other files, not a folder.
- **Whether it can be undone.** The journal keeps text up to its limit; an app with an image
  or a large file would be a delete that cannot be kept as a step, and asks first today.
- **Uncommitted work.** Files that are new or changed since the last commit are gone for good
  once deleted; a commit keeps the rest in git's history.
- **Who may ask.** A person from the app's row; whether an app's own page offers it; whether an
  agent may (Context Manager's MCP tools refuse a write inside an app unless asked on purpose).
- **Where it lives.** The module's lifecycle could say what an instance's files are (it already
  gives the scope), with each host doing the delete its own way: the local host as one journal
  step, Context Manager through its goods and a check-in.
- **Words.** "Delete" for the files, "Remove" or "Disable" for leaving them: the two should not
  share a word.
