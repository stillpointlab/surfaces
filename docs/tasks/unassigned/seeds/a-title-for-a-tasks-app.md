---
created: 2026-11-22T16:30:00-07:00
tags: [apps, tasks, manifest, feature]
---

# A title for a Tasks app

A Tasks app has no name of its own. `tasks.yaml` carries no title, so every instance is
"Tasks", and a host tells two of them apart by adding the folder. An inventory names itself:
its manifest has a top-level `label`. Jamie asked on 2026-11-22 for instances to show their own
titles, after Context Manager's file page named a locked file's app only by its kind.

What is there today (read from the code on 2026-11-22, not tried by hand):

- **Tasks:** `describeInstance` in `packages/apps/tasks/src/lifecycle.ts` answers the literal
  `'Tasks'`; its comment says the manifest has no title and the host tells twins apart.
- **Inventory:** `describeInstance` in `packages/apps/inventory/src/lifecycle.ts` answers the
  manifest's `label`, else `'Inventory'`.
- **Context Manager's tree** shows what `describeInstance` answers, with the folder added for
  two instances of one kind. It reads the manifest on each read and stores no title.
- **Context Manager's file page** shows the kind's name (the module's `meta.label`) for a file
  inside an app, never the instance's title. Showing the title there is Context Manager's
  change and follows this seed: it has no function that answers one instance's title, only one
  that answers every instance of a repository. Its follow-up entry was struck in favour of this
  card on 2026-11-22, so the card carries that part too.

What a spec would have to settle (the claude agent's list, not Jamie's):

- **The field.** A top-level `label` in `tasks.yaml`, as the inventory has, or another word.
  Optional, with "Tasks" when it is absent, so no manifest written today changes.
- **Whether the manifest's version moves.** An unknown top-level key is ignored with a warning
  today (`collectUnknownKeyWarnings` in `packages/apps/tasks/src/manifest.ts`), so an older host
  would read a titled manifest and warn about it.
- **Where a person sets it.** At create, in the app's own page, or only by editing the file.
- **What shows it.** The explorer's row, the app page's heading, the check-in's pull request
  title, and each host's words for a locked file.
- **Twins.** Whether the folder is still added when two instances have different titles.
