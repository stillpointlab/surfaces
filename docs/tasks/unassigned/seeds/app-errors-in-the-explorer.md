---
created: 2026-11-18T19:40:00-07:00
tags: [apps, dev-tooling, feature]
---

# An app's errors in the explorer, when its files are shown

Jamie, 2026-11-18, trying stage 5 in the local host on an inventory with a zone file that does
not parse: once the app's files are shown ("Show files…", the row marked `unlocked`), the
expanded folder should show which file has the error.

Where it stands:

- The app's own page says it: the overview marks the zone "could not be parsed", and the zone's
  page has the parser's message.
- The explorer does not. With the files shown, `house/rooms/cellar.yaml` is a row like any
  other, with git's mark if it changed. A person who unlocked the files to fix the error has to
  know which file to open.
- What the explorer knows of an instance is `valid` and `errors` (`FoundInstance` in
  `packages/hosts/local/src/shared/apps.ts`): the manifest's own problems, as text, with no
  path. A zone's parse error, or a card whose frontmatter is broken, is known only inside the
  app's projection.

What a spec would have to settle (the claude agent's list, not Jamie's):

- where the errors come from. The module is the app's descriptor, so the likely home is a member
  beside `fromChanges`: the files with problems, each with a path, a message and, when the parser
  gives one, a line and column (see
  [errors at their line and column](errors-at-line-and-column.md));
- how a row shows it: a mark like git's, with the message as its title, and whether a folder
  holding one is marked too, as a folder holding a change is;
- whether the locked row (the app's name, with no files under it) shows that something inside
  is wrong, so a person knows there is a reason to show the files;
- when it is read again: on the app's own events, as the page's revision is;
- tasks has the same shape: a card with unreadable frontmatter, a manifest with an unknown
  column.
