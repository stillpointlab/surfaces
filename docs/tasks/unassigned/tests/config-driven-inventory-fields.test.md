---
column: todo
created: 2026-08-29T12:42:40-07:00
tags: [apps]
---

# Config-driven Inventory fields v2 Test Plan (local)

> **Moved from Context Manager, 2026-11-14 (Jamie's ruling of 2026-11-09).** This plan was written
> for the inventory app (`packages/apps/inventory`) as mounted in Context Manager. It was not signed
> off there: no box in it is ticked. Do not walk it as written: rewrite its setup and steps for the
> local host (`npm run serve`) or the harness first. The GitHub connection, the check-in pull
> requests and the feature flag are Context Manager's host behaviour, and the Playwright walk the
> plan names (`e2e/inventory-walks/`) stays there. Links below point into the Context Manager
> repository.

Manual release test pass for the config-driven Inventory v2 surface, run against a local build with
a real GitHub connection. This is the acceptance source for updating the serial Playwright walk in
`e2e/inventory-walks/`: it describes the fixture, visible assertions, repository-byte checks, and
state transitions the updated walk must automate.

This plan covers the **99% flow** introduced by v2: manifest-owned columns, one optional total,
raw-versus-formatted numbers, Other data, schema evolution, neutral invalid-config recovery, v2
creation/export, and v1 compatibility. Exhaustive parser typo matrices, field-count/string limits,
forged API bodies, hostile YAML syntax, BOM/EOL variants, and formatter package permutations remain
in the automated unit/jsdom suite. The earlier
[Inventory MVP test plan](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage3/phase8/tests/inventory-mvp.test.md) remains the lifecycle
baseline; this plan supersedes its hard-coded field, Room-copy, Create, CSV, and wrong-typed-value
expectations where v2 behaves differently.

Feature background:
[config-driven Inventory fields v2 spec](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage4/phase4/specs/config_driven_inventory_fields.md),
[Inventory format guide](https://github.com/stillpointlab/context-manager/blob/main/docs/guides/inventory-format.md), and
[ADR-0022](https://github.com/stillpointlab/context-manager/blob/main/docs/adr/0022-inventory-view.md).

## Setup and fixture contract

Follow [smoke-test.md](https://github.com/stillpointlab/context-manager/blob/main/docs/tasks/stage1/phase12/tests/smoke-test.md) steps 1–4 for a clean local
build (migrate, reset, seed, build), log in, and then:

- \[ ] Confirm `INVENTORY_VIEW` is enabled. Use a scratch GitHub repository that may be committed
  to, branched, and opened as real pull requests; never point this walk at a repository containing
  work that matters.
- \[ ] Connect and fully Refresh the scratch repository before enabling either fixture. Remember
  that tracked files render from GitHub, first in-app writes create linked drafts, check-in opens a
  real PR, and merge + Refresh releases files back to tracked state.
- \[ ] Update `e2e/inventory-walks/baseline.ts` to seed two disjoint fixtures and restore both in
  cleanup:
  - `inventory/` is the primary configured-v2 fixture below.
  - `inventory-v1/` is a compact copy of the old v1 household fixture, retaining representative
    Value, Quantity, Container, Tags, declared fields, comments, and an unknown scalar key.
  - `inventory-walk-created/` remains reserved for §1H's two create-from-nothing cases.
- \[ ] Keep exact original bytes for every upstream lever. Each schema/recovery test restores the
  file it changed before moving on; the final cleanup restores only those three Inventory prefixes.
- \[ ] Keep downloaded CSV/ZIP files and screenshots in the walk's gitignored `.walk-out/` evidence
  directory.

The primary fixture's `inventory/inventory.yaml` is:

```yaml
version: 2
label: Workshop assets
fields:
  - id: owner
    label: Owner
    type: text
    required: true
  - id: replacement-value
    label: Replacement value
    type: number
    format:
      kind: currency
      currency: USD
      decimalPlaces: 2
  - id: quantity
    label: Quantity
    type: number
  - id: condition
    label: Condition
    type: text
    visibility:
      table: true
      add: true
      edit: false
    export: false
  - id: private-note
    label: Private note
    type: text
    visibility:
      table: false
      add: false
      edit: true
total:
  field: replacement-value
  multiplyBy: quantity
```

Seed three files under the compatibility path `inventory/rooms/`: Workshop, Archive, and an empty
Spares zone. The fixture deliberately mixes these cases:

| Zone     | Item          | Configured values                                             | Other data                                                   |
| -------- | ------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Workshop | Lathe         | owner Jamie; value 1200; quantity 1; condition good           | `power-source: 240V`, `insured: true`, scalar-list `manuals` |
| Workshop | Drill press   | owner Rowan; value 350.125; quantity 2; condition serviced    | structured `purchase` mapping                                |
| Workshop | Safety signs  | owner Jamie; missing value; quantity 4                        | none                                                         |
| Workshop | Vintage saw   | owner Morgan; raw text value `"$450"`; quantity 1             | legacy-like `value`, `container`, `tags`, and `description`  |
| Archive  | Tool chest    | owner Jamie; value 50; missing quantity                       | `shelf: north`                                               |
| Archive  | Surplus bolts | owner Rowan; value 2; quantity -3                             | none                                                         |
| Archive  | Floor jack    | missing required owner; value 100; quantity 1                 | none                                                         |
| Archive  | Old schematic | owner Jamie; structured replacement-value mapping; quantity 1 | structured `source` mapping and scalar `reviewed: false`     |

Use the slug of each displayed item name as its explicit stable id (`lathe`, `drill-press`,
`safety-signs`, and so on).

Put `private-note: classified` on Lathe. Keep hand-written comments before the Workshop item list
and inside Lathe so mutations can prove minimal diffs. The starting derived totals are Workshop
`$1,900.25`, Archive `$144.00`, and inventory `$2,044.25` across eight rendered items: missing or
invalid amounts contribute zero, missing quantity contributes one, and negative quantity remains a
number.

---

## 1. Configured-v2 happy paths

### 1A. Discover and enable

- \[ ] `inventory/inventory.yaml` is the only candidate in its folder: it has a hollow Inventory
  badge and an **Enable Inventory** action in preview; files under `rooms/` have neither.
- \[ ] Enable is instant, makes the badge solid, opens the instance URL, and imports nothing.
  Workshop, Archive, and Spares remain tracked GitHub files until their first edit.
- \[ ] User-facing copy says **Zone**, **Zones**, **Add zone**, **Download zone CSV**, and
  **Download inventory (.zip)**. URLs and repository paths deliberately remain `/room/<slug>` and
  `rooms/<slug>.yaml`.

### 1B. Overview and the one configured total

- \[ ] The overview shows the label **Workshop assets**, three Zone rows, the item counts above, and
  the exact configured totals from Setup. The aggregate is labelled **Total Replacement value**;
  there is no generic Subtotal, Unvalued, or guessed Value/Quantity language.
- \[ ] Spares shows `0 items`; its empty contribution does not hide or corrupt the inventory total.
- \[ ] Missing/invalid replacement values contribute `0`; missing quantity contributes `1`; the `-3`
  quantity contributes `-6`. Items with field issues stay in the count and table.
- \[ ] Zone links, back navigation, and project navigation retain the existing instance-scoped
  behavior.

### 1C. Schema-owned table, formatting, search, and issues

- \[ ] Workshop headers are exactly **Title**, **Owner**, **Replacement value**, **Quantity**,
  **Condition**, conditional **Other data**, and row actions, in manifest order. **Private note** is
  absent because it is table-hidden. No Description, Value, Serial, Acquired, Container, Tags, or
  unknown-key column is invented.
- \[ ] `350.125` displays as `$350.13` in the table while the configured total retains its own
  correctly formatted result. Plain text and unformatted numeric cells use their raw value.
- \[ ] The Vintage saw remains a normal row and shows its raw `"$450"` value with an accessible
  expected-number warning. Old schematic says **Structured value** with a warning. Floor jack
  remains a normal row with a missing-required Owner issue. None is demoted merely for a configured
  field problem.
- \[ ] Lathe's Other data button reports the right count and accessible name (for example, **Show 3
  other values for Lathe**). Rows without extras have no inert button. The legacy-like keys on
  Vintage saw neither group rows nor render special chips/columns.
- \[ ] Search `350.125` finds Drill press even though the cell displays `$350.13`. Search `$350.13`,
  `classified` (table-hidden field), `240V` (Other data), `drill-press` (id), and the structured
  purchase value does not match. Search remains case-insensitive over Title and raw scalar values of
  table-visible configured fields only.
- \[ ] At a narrow viewport, the table scrolls horizontally without clipping row actions or changing
  field order.

### 1D. Add item from the resolved schema

- \[ ] The compact Add form contains required **Title**, required **Owner**, **Replacement value
  (USD)**, **Quantity**, and **Condition**, in that order. Private note is add-hidden; no hard-coded
  More fields, Value, Container, or Tags controls exist.
- \[ ] Numeric controls use raw `type=number` / `step=any` values. Add **Planer**, owner Jamie,
  replacement value `12.345`, quantity `-2`, and condition new. The row appears immediately with
  `$12.35`; its negative contribution changes the totals without rounding the stored number.
- \[ ] The first mutation links only `inventory/rooms/workshop.yaml`. Reload retains the draft,
  GitHub remains unchanged, the appended item is last, and its keys are ordered `id`, `title`, then
  configured fields in manifest order. The YAML contains `12.345` and `-2`, not formatted strings,
  and contains no implicit legacy keys.
- \[ ] Blank required Owner and a non-finite numeric input such as `1e999` produce visible
  validation and no item. Browser request inspection shows v2 submits only `title` plus
  `fieldValues`; server-side rejection of add-hidden/undeclared/legacy properties remains pinned by
  service tests.

### 1E. Edit, repair, and visibility boundaries

- \[ ] Opening Lathe focuses **Configured fields**. The modal shows immutable id, title, Owner,
  Replacement value, Quantity, and table-hidden Private note in manifest order. Edit-hidden
  Condition is absent and survives every unrelated save byte-for-byte.
- \[ ] Change `1200` to `1199.5` and Private note to `restricted`; Save updates table/totals while
  the editor draft changes exactly those two scalar spans and preserves surrounding comments.
- \[ ] Vintage saw exposes the raw `"$450"` plus its type issue, leaves the number input empty, and
  does not coerce/delete it on an unrelated action. Enter `450` explicitly and Save; only then is
  the scalar repaired and the warning cleared.
- \[ ] Old schematic keeps its structured configured value read-only until **Replace with number**
  is chosen. Choosing it and entering `25` makes one deliberate replacement; cancel before Save
  first to prove the source is not changed merely by opening the control.
- \[ ] Floor jack cannot save any edit while required Owner is missing. Add Owner and Save in one
  action; the item stays in place and its required issue clears.

### 1F. Other data without dynamic columns

- \[ ] Open Lathe through its Other data affordance. The same item modal opens with **Other data**
  expanded and focused rather than creating a second dialog.
- \[ ] String, number, and Boolean extras use type-appropriate controls with immutable keys. Scalar
  lists and mappings render an honest summary and **Read-only — edit in YAML**; they have no Remove
  action. Other data still never becomes a table column.
- \[ ] In one save, change `power-source`, remove `insured`, and add Boolean `calibrated: false`.
  The draft changes only those spans; the scalar list and comments are byte-identical. Reload keeps
  the values and the affordance count updates.
- \[ ] Reject a new key colliding with `id`, `title`, or `owner`, an unsafe key, an empty numeric
  value, and a duplicate extra key with visible errors and no write. **Add other data** is absent
  from Add item by design.

### 1G. Delete and the draft → PR → release loop

- \[ ] Delete one configured item with the existing arm/confirm interaction. The item count and
  configured total update, and the draft removes exactly its YAML block.
- \[ ] With add/edit/Other-data/delete changes across Workshop and Archive, Check in lists exactly
  two dirty room files. One commit and one PR contain minimal, reviewable diffs with untouched
  comments and opaque YAML preserved.
- \[ ] Merge + Refresh clears the check-in bar, releases the linked files to tracked state, and
  leaves the same rows/totals visible. A later edit re-links without an adoption dialog. Unlink and
  discard before check-in restores the exact upstream state.
- \[ ] Immediately after the lifecycle assertion, reset the primary v2 manifest and Zone files to
  the Setup bytes and Refresh. Create, export, classification, and recovery assertions must not
  depend on §1D–§1G's mutations.

### 1H. Create canonical v2 inventories

Use two non-overlapping folders below `inventory-walk-created/`.

- \[ ] The repository-menu and folder-context entry points both still open Create inventory; the
  former defaults the Inventory folder and the latter preselects the clicked folder.
- \[ ] **Minimal register:** open Create inventory from the repo menu, use label `Simple Register`,
  folder `inventory-walk-created/simple`, and leave the one Zone and Initial columns rows blank.
  Currency code is hidden; Total is None. Create succeeds and `inventory.yaml` is exactly:

  ```yaml
  version: 2
  label: Simple Register
  ```

  There are no `fields`, `currency`, `containers`, `total`, or zone files. The overview is
  count-only. Add a Zone, then an item: its table/form has Title only (plus immutable id in Edit),
  with no monetary/unvalued defaults anywhere.

- \[ ] **Configured register:** use label `Configured Register`, folder
  `inventory-walk-created/configured`, Zones Kitchen and Garage, then Initial columns Owner/Text,
  Quantity/Number, and Replacement value/Currency. The UI shows stable generated ids, one shared
  Currency code defaulting to USD; enter CAD. Select Replacement value as Total and Quantity as
  Multiply by.
- \[ ] The configured manifest bytes are canonical: `version`, `label`, fields in entered order, the
  complete CAD/two-decimal format nested only under Replacement value, then `total`. It contains no
  default `required`, `visibility`, or `export` keys:

  ```yaml
  version: 2
  label: Configured Register
  fields:
    - id: owner
      label: Owner
      type: text
    - id: quantity
      label: Quantity
      type: number
    - id: replacement-value
      label: Replacement value
      type: number
      format:
        kind: currency
        currency: CAD
        decimalPlaces: 2
  total:
    field: replacement-value
    multiplyBy: quantity
  ```

  Zone files remain exactly `rooms/kitchen.yaml` and `rooms/garage.yaml`, each containing only its
  label.

- \[ ] Blank column rows are ignored. Duplicate labels/derived ids, reserved id results, duplicate
  Zone slugs, bad currency codes, an empty folder, and a colliding path fail inline before partial
  files appear. Text columns never appear in Total/Multiply by choices, and the selected Total is
  absent from Multiply by so self-multiplication cannot be selected.
- \[ ] Check in one created inventory with a newly added item: one PR creates manifest + Zone files
  with exact bytes. Merge + Refresh releases them and keeps the view enabled.

### 1I. Add Zone and view-instance isolation

- \[ ] The enabled v2 overview's **Add zone** row seeds `rooms/<slug>.yaml` with only `label:`,
  marks one new file dirty, and the empty Zone is immediately writable. Invalid/duplicate slugs
  retain the earlier inline errors, now using Zone wording.
- \[ ] The configured v2 fixture, minimal register, and configured register have distinct instance
  URLs and disjoint check-in sets; §3's v1 fixture later adds a fourth. Creating inside any existing
  Inventory scope is refused; sibling Inventory/Tasks scopes remain legal.
- \[ ] Deleting a sibling manifest upstream produces the existing dangling-instance Remove flow and
  does not delete its retained `rooms/*.yaml` files.

### 1J. Raw configured export

- \[ ] **Download zone CSV** produces a UTF-8-BOM, CRLF, final-record-terminated file beginning
  `id,title`. Export-enabled configured fields follow in manifest order even when table-hidden, so
  Private note is present and export-disabled Condition is absent. Workshop's exact starting header
  is
  `id,title,Owner,Replacement value,Quantity,Private note,power-source,insured,manuals,value,container,tags,description`.
- \[ ] Serializable Other-data columns follow configured fields in first-seen order. Strings, finite
  numbers, Booleans, and scalar lists export raw; a structured-only key creates no column. A
  configured id cannot appear again as an Other-data header.
- \[ ] Currency `350.125` exports as numeric `350.125`, not `$350.13`; negative configured numbers
  remain numeric `-3`, not apostrophe-prefixed text. Vintage saw's wrong-typed `"$450"` is retained
  as raw text in its configured field cell rather than being coerced or omitted.
- \[ ] **Download inventory (.zip)** contains `zones/workshop.csv`, `zones/archive.csv`,
  `zones/spares.csv`, and `inventory.csv`; it contains no `rooms/` directory. The flat file begins
  `zone,id,title`, uses Zone labels, and unions extra columns in first-seen order across Zones.
- \[ ] `WARNINGS.txt` names Drill press's omitted `purchase`, Old schematic's omitted structured
  configured value, and its structured `source`, while preserving both items and their remaining
  scalar cells in CSV.
- \[ ] Quick-add a temporary item titled `=SUM(A1) draft gauge` with valid required fields, do not
  check it in, and download again. The item is present, its title opens as text in a spreadsheet,
  and export reflects the resolved draft currently on screen. The exhaustive whitespace/header
  formula variants remain in the CSV unit suite. Unlink and discard afterward.
- \[ ] The empty Spares Zone download is disabled as nothing to export; `zones/spares.csv` still
  exists inside the whole-inventory ZIP with its header row.

---

## 2. Schema changes and recovery states

### 2A. Schema evolution reclassifies; it does not migrate

Use upstream manifest commits followed by Refresh, and checksum every room file before and after.

- \[ ] Add a declared text field `power-source`: Lathe's existing scalar is promoted from Other data
  into the configured column/form on the next read. No room file links, rewrites, or becomes dirty.
- \[ ] Change only its label, order, visibility, and export policy: table/form/CSV derivations move
  immediately and independently while raw room bytes stay identical.
- \[ ] Remove the field: `power-source` returns to Other data with the original value. Rename the id
  instead: the old key remains Other data and the new field is missing; no key is renamed.
- \[ ] Temporarily change Condition from text to number: incompatible source strings remain visible
  with field issues and are not coerced, deleted, or demoted. Restore the original manifest.

### 2B. Invalid-v2 neutral recovery and repair

- \[ ] Upstream-add strict typo `visiblity` under one v2 field and Refresh. The tree/preview and
  dashboard surface the validation error with its YAML path and do not return a generic 500.
- \[ ] The overview and Zone remain navigable, but the schema is neutral: table columns are Title +
  conditional Other data only; every former configured/legacy key is read-only Other data. There is
  no guessed USD, Value, Quantity, total, unvalued count, configured search, or partial field
  rendering.
- \[ ] Add item, Edit/Delete, Add zone, Zone CSV, and ZIP export are absent or disabled with a
  repair reason. Opening an item shows immutable id/title and Other data but disabled Save/Delete.
- \[ ] **Open inventory.yaml in editor** links the manifest on demand. Fix the typo in the editor;
  the normal check-in path accepts the linked manifest repair rather than being blocked by the prior
  invalid state. Check in, merge, and Refresh: configured rendering returns without any room-file
  rewrite.
- \[ ] Repeat the read-only assertions with `version: 99`; the message says the version is
  unsupported. Restore v2 before continuing. A positively identified valid v1 never enters this
  neutral mode.

### 2C. Field issues, duplicate ids, and read-only boundaries

- \[ ] Reconfirm the v2 distinction the old walk did not have: a raw wrong-typed configured scalar,
  a missing required field, and a structured configured value remain rendered items with local field
  warnings. Only duplicate ids are demoted to Needs attention, and both colliders are removed from
  item counts/totals/CSV with explicit warnings.
- \[ ] A structured Other-data mapping/list does not lock the whole v2 item; supported fields and
  scalar extras remain editable while opaque data stays read-only and byte-preserved.
- \[ ] A flow-style `items: [...]` Zone remains file-level read-only with editor recovery and does
  not affect neighbouring Zones. Restore it and confirm mutation returns.
- \[ ] With a valid manifest but an upstream-versus-draft conflict, check-in creates no partial PR
  and preserves the draft. Resolve through the existing Refresh/discard/reapply path; a second
  check-in after one's own merge remains conflict-free.

---

## 3. Frozen-v1 compatibility lane

Enable `inventory-v1/inventory.yaml` separately after the v2 assertions.

- \[ ] V1 still renders its hard-coded Description, Value, Quantity, Serial, Acquired, Container,
  and Tags behavior plus declared fields; grouping, unvalued counts, add/edit payloads, totals, and
  minimal-diff writes match the earlier MVP plan. Merely viewing or mutating never rewrites its
  manifest to v2.
- \[ ] UI copy still says Zone and Download zone CSV, but the compatibility export retains the v1
  schema: flat header `room`, legacy column order/serialization, and ZIP paths `rooms/<slug>.csv`.
  V1 currency display uses the shared fixed-locale formatter without changing stored/CSV values.
- \[ ] V1's historically tolerated malformed/free-form currency falls back to the plain display, and
  a positively identified malformed v1 manifest retains legacy recovery rather than borrowing
  partial v2 behavior.
- \[ ] One v1 add/edit/delete/check-in/merge/Refresh cycle still passes and touches only the v1
  fixture.

---

## 4. End-to-end insurance run

- \[ ] Starting from the restored v2 fixture: add an item whose title begins
  `=SUM(A1) do not execute`, edit a raw currency value, repair one invalid configured value, change
  and add scalar Other data, delete another item, and add a new Zone. One check-in produces one
  branch/commit/PR with only the expected Zone files and minimal diffs.
- \[ ] Merge + Refresh returns every changed file to tracked state with the same rows, field issues,
  counts, and totals. Download the ZIP: the formula title is text, configured numbers are raw,
  headers/order and `zones/` paths are correct, warnings honestly name structured omissions, and a
  second download after Refresh has byte-equivalent entry contents (archive metadata may differ).

---

## Automated walk update map

Retain the current numbered, serial `.walk.ts` architecture and real-GitHub safeguards. Update each
file's responsibility as follows; splitting a file is fine when it keeps state ownership clearer.

| Current walk file                            | V2 update                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `00-baseline-setup`                          | Seed/reset the primary v2 fixture, compact v1 fixture, and create prefixes |
| `01-enable-overview-1A-1B`                   | Enable v2; assert Zone copy, counts, and configured totals                 |
| `02-room-rendering-1C`                       | Manifest columns, raw search, field issues, and Other-data affordance      |
| `03-export-mutations-1D-1E-1F-1H`            | Dynamic add/edit/repair/extras/delete plus raw v2 CSV/ZIP                  |
| `04-checkin-pr-1G` / `05-release-upstream-*` | Keep lifecycle assertions, now against v2 room bytes                       |
| `06-create-inventory-1I`                     | Replace v1 creation with exact minimal and configured v2 creation          |
| `07-add-room-1J`                             | Assert Add zone copy while retaining `rooms/*.yaml` paths                  |
| `08-instances-drift-1K`                      | Cover v1 sibling isolation, dangling state, and invalid/unsupported v2     |
| `09-readonly-attention-2A-2B-2C`             | Separate field issues/structured extras from true read-only and duplicates |
| `10-conflicts-validation-2D-2E`              | Add required-field validation and schema-evolution byte checks             |
| `11-insurance-run-3`                         | Use the compound v2 flow and verify raw, formula-safe export               |
| `99-cleanup`                                 | Restore all v2/v1/create paths and upstream manifest/Zone bytes            |

Do not make the browser walk duplicate the exhaustive unit matrix. It needs one representative of
each resolved state and boundary above, direct byte assertions where the repository contract is the
feature, accessible selectors for warnings/Other data, and deterministic cleanup even after a failed
assertion.

## Sign-off

- \[ ] Every section above passes on the implementation branch, or each product deviation is filed
  before the config-driven Inventory walk is called complete.
- \[ ] The updated walk can start from a clean scratch repo, run serially without hand edits, retain
  evidence, and restore only its owned paths.
- \[ ] The frozen v1 lane and primary v2 lane both pass in the same run.
