---
column: todo
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, code]
---

# Spec: create from the app

_The [generic app host brief](../briefs/generic_app_host.md), desired outcome 5. After
[one-view-page](one-view-page.md), whose client registry it extends._

## High-level goal

Each app's element package ships its own create form: the per-app fields, their validation and
their copy. Context Manager hosts one create dialog around any app's form, and one create endpoint
that runs the core's `seed` and the host's own checks. The two create dialogs, their markup in the
project page, and the two create endpoints go.

## Related context

- Jamie, on the brief: an app will always need some per-app detail when it is created; the app
  should supply that surface, so Context Manager stops keeping custom create UI for each app.
- Context Manager today:
  - `createInventoryModal.ts` (364 lines) and `createTasksModal.ts` (353);
  - their markup in `project.ejs`;
  - `POST /tasks/create` and `POST /inventory/create`;
  - the repo tree's create menu items.
- The cores' create inputs: `CreateInventoryInput` (label, folder, fields, total, zones) and
  `CreateTasksInput` (columns, kinds, folder, `confirmRoot`).
- Their plans are `planInventoryCreate` and `planTasksCreate`, both behind `core.seed`, and both
  hosts place the files with `placeNewFiles`.

## Technical requirement

### Surfaces: a create form per app

`<spl-inventory-create>` and `<spl-tasks-create>`, from each app's element entry. Each:

- **Renders the app's own fields** with today's copy: inventory's name, zones and columns; tasks'
  columns and kinds, with ids derived from labels.
- **Answers `value()`** with the app's create input minus the folder, or a `Failure` naming the
  first problem. The checks are today's dialogs' checks, which mirror the server's.
- **Raises `change`** when validity changes, so the host can enable its Create button.
- **Shows a refusal** the host hands back: `showError(failure)`, for a refusal tied to a field.
- **Passes `describeAppElementContract`.** The forms render through `html`.

The validation the forms and the plans share moves to a light entry, `./create`, free of DOM and
zod. The form imports it, and so does the core's plan, so the two cannot drift.

### Context Manager: one dialog, one endpoint

- **`createAppModal.ts`** hosts the folder field and the root warning, which every app has, around
  the registered form. The client entry gains `createForm`, the form's tag, plus a label for the
  tree's menu item.
- **The tree's create items come from the client registry,** one per app.
- **`POST …/views/create`** takes `{ app, folder, confirmRoot?, input }`. It runs the entry's
  `module.core.seed({ ...input, folder, confirmRoot })`, then the host's checks: a synced tree,
  overlapping views and a resumed create, as both endpoints do today. Then it places the files
  with `placeNewFiles` and seeds them through the generic seed helper.
- **What goes:** the two dialogs, their markup in `project.ejs`, and the two create endpoints with
  their service methods (`createInventory`, `createTasks`).

## Clarifications

- **The root rule stays the core's.** Tasks asks for `confirmRoot` and inventory refuses the root
  (`INVENTORY_FOLDER_REQUIRED`). The dialog shows the root warning when the core's refusal asks for
  it.
- **Context Manager's `inventory-root-confirm` seed becomes a core-only change after this:**
  inventory's plan would answer `ROOT_CONFIRM_REQUIRED` as tasks' does. It stays a seed.
- **Copy and limits do not change.** Inventory's walk 06 (`06-create-inventory-1I`) checks its
  dialog. No walk creates a tasks instance (the tasks walks enable an existing manifest), so the
  Context Manager PR adds a check for it: a walk step, or at least a recorded drive of the dialog,
  root warning included.

## Non-goals

- New create options for either app.
- Creating from outside the project page.

## Acceptance / completion checklist

- [ ] Both create forms ship from their element entries, pass the element contract, and share
      their checks with the plans through `./create`.
- [ ] The harness has a "Create" fixture for each app, answering through the core's `seed`.
- [ ] One dialog and one endpoint create either app, and the two dialogs and endpoints are gone.
- [ ] Both walk suites pass, with no selector changes.

## Implementation plan

1. Surfaces PR: the `./create` entries, both forms, tests and harness fixtures.
2. Context Manager PR: the dialog, the endpoint and the registry entries, walked.
