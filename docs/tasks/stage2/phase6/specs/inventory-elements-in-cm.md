---
column: done
pr: 'stillpointlab/context-manager#1056'
completed: 2026-11-08
created: 2026-11-08T00:43:23-07:00
tags: [apps, host-contract, code]
---

# Spec: the inventory page becomes two elements that ask for ops

_The [apps breakout brief](../../phase1/briefs/apps_breakout.md), desired outcome 6, first half: the
same step [transport-blind-task-board](../../phase5/specs/transport-blind-task-board.md) took for the
board. The work is a Context Manager PR, and this spec names only what it needs. It needs
[html-safe-templates](html-safe-templates.md) on the pin._

## High-level goal

Context Manager's inventory page script stops rendering the inventory itself. Its overview and zone
views become `<spl-inventory-overview>` and `<spl-inventory-zone>`, still in Context Manager. They take
state through setters, ask for every change as an op by path, raise requests for what the host owns,
and build their markup with `html` from `common-format/html`. The page answers the ops with the API
calls it makes today. The elements know no API, project, connection or good id. The new code calls
the place a zone. Users see no change.

## Related context

- Context Manager: `src/client/pages/inventory/` (the page script, 1,351 lines; its stylesheet, 624;
  its EJS shell; `inventory.test.ts`, 21 tests), and the inventory walks in `e2e/inventory-walks/`,
  which select on the page's classes and ids.
- The element half of the contract: [app-contract](../../phase5/specs/app-contract.md),
  requirement 5 (`AppElement`, `requestOp`, `answerOps`, `describeAppElementContract`).
- ADR-0037, the task board's ops, which this follows.
- Jamie on phase 6: zone is the preferred term, and the move is the time to rename where possible;
  light DOM like the board; the check-in and the editor link stay in Context Manager for now;
  components HTML-safe.

## Technical requirement

1. **Two elements.** `src/client/components/inventory/` holds them, with a shared module for what both
   render (notices, the check-in bar, editor recovery, totals, money and number formatting).
   - `<spl-inventory-overview>`: today's space view. `setState(space | null)`; `null` renders today's
     "no inventory yet" notice.
   - `<spl-inventory-zone>`: today's room view, including the filter, quick add and the item dialog.
     `setState(zoneState)`. The dialog becomes a `<modal-dialog>` the element renders inside itself;
     the EJS shell loses `#inventory-item-dialog`.

   Both render into their light DOM with `render` and `html` from `common-format/html`. Nothing else
   writes markup. This fixes the unescaped legacy money fallback, and `field.type` and the other
   values the page wrote into attributes unescaped.

2. **The ops.** Each reply is what the endpoint answers today, less what the element does not use.

   | Today (the page fetches)             | Op                                  | Reply       |
   | ------------------------------------ | ----------------------------------- | ----------- |
   | `POST rooms` (add zone)              | `add-zone { title }`                | `{ space }` |
   | `POST rooms/:slug/items` (quick add) | `add-item { path, item }`           | `{ state }` |
   | `PATCH rooms/:slug/items/:id` (save) | `update-item { path, id, changes }` | `{ state }` |
   | `DELETE rooms/:slug/items/:id`       | `delete-item { path, id }`          | `{ state }` |
   - `path` is the zone file's path. The page maps it to the slug the API takes, from the latest
     state it holds.
   - `item` and `changes` are the bodies the page sends today, built by the same code.
   - A failure carries the endpoint's error `code` and `message`. The element's messages and its
     special case for `INVENTORY_ITEM_NOT_FOUND` stay the same: a warning, then a `reload-request`
     (below) where the page reloaded after 900 ms.
   - Reporting: today the page reports a failed add unless the status is 400 or 409. The page keeps
     that rule when it answers, and the element does not report op failures itself.

3. **Requests stay events.** For what the host owns:
   - `notification { message, type }`, as the board raises it. The page forwards it to its banner.
   - `checkin-request`, from the check-in bar's button. The page opens its check-in dialog, which
     stays in the EJS shell with its job watch and reload, and lists the dirty files from the latest
     state it holds.
   - `open-editor { path }`, from the editor recovery button. The page links the file through the
     import endpoint and navigates to the editor, as the button does today.
   - `reload-request`, for the item-not-found case.

4. **Links come from the page.** The element renders real anchors, so the page sets
   `links: InventoryLinks` before or with the first state:

   ```ts
   interface InventoryLinks {
     zone(path: string): string; // the zone page
     exportAll(): string; // export.zip
     exportZone(path: string): string; // the zone's CSV
     editor(path: string): string | undefined; // the editor, when the file is linked
   }
   ```

   When `editor` returns `undefined`, the element renders today's button and raises `open-editor`.
   The page builds `editor` from the good ids in its state. Without `links`, zone names render as text
   and the downloads as disabled.

5. **The elements never read host ids.** They render states whose type still has `goodId`,
   `goodPublicId` and `manifestGoodPublicId`, but never read them. The check-in list's good ids are
   the page's.

6. **The page.** `inventory.ts` becomes the host side: it reads the SSR'd JSON as today, sets `links`
   and the state, answers ops with `answerOps`, handles the four requests, and sets the page title
   (`#inventory-title`) from the state it sets and from each reply. It routes the elements' errors to
   Context Manager's reporter with `setErrorHandler`. The back link, the header, the banner and the
   check-in dialog stay in the EJS shell.

7. **Ready.** Each element implements `ReadyElement` through `createReadyGate` from
   `common-format/app`, settling after its first render with state, and passes
   `describeAppElementContract`.

8. **Zone, where the code is new.** The elements, their classes, ids, data attributes, ops, events,
   types and test names say zone: `.inventory-zone-row`, `#inventory-add-zone`, `zone(path)` and so on.
   The state types and their `room` fields keep their names until
   [zone-vocabulary](zone-vocabulary.md). The route (`/room/:slug`), the API (`/rooms`) and the
   repository's `rooms/` folder do not change (see Non-goals).

9. **Styles.** The page stylesheet splits: what the elements render goes beside them as
   `inventory.scss`, injected into their light DOM as the board's is, with its selectors renamed with
   the markup; the page shell (`.inventory-page`, `.inventory-bar`, the title) stays with the page.
   Rendering is otherwise unchanged.

10. **Tests.**
    - The 21 page tests become element tests that answer ops with `answerOps` instead of mocking
      `apiFetch`, and keep every behaviour they check.
    - Every element test fixture also renders through `hostile()` and passes
      `expectNoHostileMarkup`.
    - The page gets tests for its op answers (each op to its endpoint and slug, an API error becoming
      a failure with the same code, the 400/409 reporting rule) and for each request.

11. **A Context Manager ADR (0038)**, the host side: the inventory elements talk to their page in ops
    keyed by path, links come from the page, and ids, linking, check-in and the API are the page's.
    It cites ADR-0037 rather than amending it. The elements are on their way to surfaces.

## Clarifications

- **Why this lands in Context Manager first.** The rewrite is the risky part, and it is walked where
  it runs. The move ([inventory-elements](inventory-elements.md)) is then only packaging, as phase 5
  showed.
- **Two elements, not one.** The page has two variants, and nothing on the overview is on the zone
  page except the shared notices, which a shared module serves.
- **The item dialog moves into the element.** It is app UI built from the zone's state, unlike the
  check-in dialog, which is host substrate.
- **Renaming the markup breaks walk selectors.** About a hundred selectors in the inventory walks
  name `inventory-room-*` and the page's ids. They are updated in the walks in the same PR, and the PR
  says so.

## Non-goals

- Any API, route or server change, and the create-inventory dialog on the project page.
- Renaming the route, the API paths or the `rooms/` folder of a repository's inventory. The folder is
  part of the file format (ADR-0022) in repositories that already exist. A rename there needs a
  migration and is recorded in the WAL.
- Moving the elements (next spec), or moving the check-in or the editor link into them.

## Acceptance / completion checklist

- [x] The elements import nothing from Context Manager's `utils/` or `shared/utils/sanitize`, read no
      host id, and write markup only through `render`.
- [x] Each op in the table is answered by the page with today's endpoint, and each request is
      handled as today.
- [x] The page's behaviours keep their tests, rewritten to answer ops; the hostile fixtures pass; the
      page's answers are tested; both elements pass `describeAppElementContract`.
- [x] ADR-0038 is written.
- [x] The inventory walks were run, with the selector renames in the walks and called out in the PR.

## Implementation plan

1. After [html-safe-templates](html-safe-templates.md) merges: a Context Manager PR that moves the pin
   (bringing the `<spl-icon>` fix) and makes the elements, the page, the EJS shell, the tests, the
   walks' selectors and the ADR, walked.
2. Phase notes here: this card done, with the PR.

## Implementation notes

- Landed as context-manager#1056, merged 2026-11-08, with ADR-0038. `<spl-inventory-overview>` and
  `<spl-inventory-zone>` render in light DOM through `render(this, html…)`, and share a base class
  for the style element, the ready gate, links, notifications and delegated events. The item dialog
  is one `<modal-dialog>` the zone element creates and re-appends.
- **Departure:** "Open in editor" is an op, `link-editor {path, kind}` → `{href}`, not the spec's
  `open-editor` request. The button needs to know whether linking worked, so it can restore itself
  on failure or follow the URL the page answers, as it did before. The page keeps a map of linked
  editors and answers at once for a file already linked.
- The zone element's delete method is `deleteItem`: `remove()` would shadow `Element.remove`.
- A fix on the way: the legacy money total was put into the markup unescaped when a manifest's
  currency isn't a three-letter code. It is escaped now, with a test.
- The page's 21 tests became 50 element tests (each zone fixture also rendered through `hostile()`),
  9 tests of the page's op answers and 8 page tests. The page's script and stylesheet went from 60.0
  to 65.9 kB raw (15.1 to 16.9 kB gzipped), the elements' stylesheet now shipping inside the
  script.
- About 34 walk selectors were renamed to say zone (`inventory-room-*` → `inventory-zone-*`). The
  inventory walks passed 38/38. A first run never reached the branch: a stale phase 5 server held
  port 3004.
