# @stillpointlab/inventory-app

The inventory app's core: DOM-free, so a host runs it on its server and in its client alike. The
root entry (`.`) exports:

- the file model's types (`SharedInventory*`, and `TreeNode`, `common`'s `FolderNode`) and path rules (`slugifyInventoryName`,
  the field-id and currency patterns);
- reading: `parseInventoryManifest`, `parseRoomFile`, `detectInventoryAt`;
- the rules: field validation (`fields.ts`), totals and duplicate-id demotion (`totals.ts`), each
  answering a `Result` from `@stillpointlab/common-format/app` whose refusal (`code`, `message`)
  the host maps to its own errors;
- byte-preserving rewrites: `appendItem`, `patchItem`, `deleteItem` (`roomWriter.ts`);
- seeds: `manifestSeedContent`, `roomSeedContent`;
- CSV: `serializeRoom` and `serializeSpace` (each a `Result<{ content }>`), `exportWarnings`;
- the lifecycle: `inventoryLifecycle`, the `AppLifecycle` a host mounts an inventory folder with.

Two more entries import nothing: `./paths` exports the path rules alone (`slugifyInventoryName`,
the folder and currency defaults, the field-id and currency patterns), and `./types` the shared
types. A client that needs only those imports them there: `.` builds the manifest's zod schemas at
module scope, which a bundler cannot drop. `./element` is the app's two elements (below).

The core was moved as-is from Context Manager (source commit `373a20ae`), and the elements followed
(source commit `b73e3c59`). The host side stays there: drafts, check-in, routes and the page that
mounts the elements. After the Element section, this README is the file format.

## Element

`@stillpointlab/inventory-app/element` registers two elements. It imports `./types`, `./paths`,
`@stillpointlab/sheet-format/presentation` (number and currency formatting), `common-format/app`,
`common-format/elements`, `common-format/html` and `@stillpointlab/modal-dialog-component`, never
the core's root.

- **`<spl-inventory-overview>`**: an inventory's zones, with counts, totals, a badge on zones with
  local changes, "Add zone" and the ZIP export. `setState(space)` takes a `SharedInventorySpace`, or
  `null` for a repository with no inventory.
- **`<spl-inventory-zone>`**: one zone's items (configured, legacy or neutral columns), a filter,
  quick add, the CSV export, and an item dialog (a `<modal-dialog>` inside the element) for editing
  fields and Other data or deleting the item. `setState(zone)` takes a `SharedInventoryRoomState`.

Both settle (`whenReady()`, the `ready` attribute) once they have rendered a state, render in light
DOM, and build their markup with `html` from `common-format/html`, so repository text is escaped
wherever it lands.

- **Links in.** `links: InventoryLinks` builds the URLs the elements render as anchors:
  `zone(path)`, `exportAll()`, `exportZone(path)`, and `editor(path)`, which returns `undefined` for
  a file not yet linked. Without links, zone names render as text and exports as disabled.
- **Ops out**, each asked through `requestOp` and naming a zone by its file's path:

  | Op            | Fields                  | Reply                         |
  | ------------- | ----------------------- | ----------------------------- |
  | `add-zone`    | `title`                 | `{ space }`, the new overview |
  | `add-item`    | `path`, `item`          | `{ state }`, the new zone     |
  | `update-item` | `path`, `id`, `changes` | `{ state }`                   |
  | `delete-item` | `path`, `id`            | `{ state }`                   |
  | `link-editor` | `path`, `kind`          | `{ href }`, then followed     |

  `item` and `changes` are the bodies a host's endpoints take: the title, `fieldValues`,
  `extraValues` and, for version 1, its own fields. A failure's `message` shows inline (adding) or as
  a notification (saving); `INVENTORY_ITEM_NOT_FOUND` warns and asks for a reload.

- **Requests**, plain bubbling events a host answers with its own UI: `notification
{ message, type }`, `checkin-request` (the check-in bar's button) and `reload-request`.
- **Host-styled classes.** The elements render the host's `button`, `button-primary`,
  `button-secondary`, `form-input` and `sr-only` classes and bring no rules for them, so a page's
  buttons and inputs look like its own.
- **Styles** live in each element's light DOM and read the `--spl-*` tokens, including
  `--spl-alert-color`, `--spl-alert-bg` and `--spl-alert-text` for warnings and the check-in bar.

In the harness (`npm run dev`, "inventory"), fixtures cover every case the elements render (the
overview configured, legacy, just created, disabled, invalid and empty; zones configured, legacy,
read-only, broken, empty, neutral and with hostile strings) and an example inventory in
`dev/example/` parsed by the core, as files alone. An in-memory host answers the ops, and the
controls switch it off or make it refuse the next op.

## Inventory repository format

An inventory is a hand-editable `inventory.yaml` manifest plus one YAML file per Zone. New
inventories use version 2, where the manifest is the only authority for non-structural item fields.
Version 1 remains supported with its original behavior and is never converted automatically.

### Files and Zones

For a manifest at `house/inventory.yaml`, Zone files are the non-recursive `house/rooms/*.yaml`
files. The application calls these groups **Zones**; the `rooms` directory and `/rooms` routes
remain the storage and compatibility convention. A Zone file has an optional label and a block-style
item list:

```yaml
label: Garage
items:
  - id: cordless-drill
    title: Cordless drill
    owner: Sam
    replacement-value: 129.95
    quantity: 2
```

Item ids are generated when an item is added, remain immutable, and must be unique across the
inventory. In v2, `id` and `title` are the only structural keys.

### Version 2 manifest

A complete representative manifest is:

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
      currency: CAD
      decimalPlaces: 2
  - id: quantity
    label: Quantity
    type: number
    visibility:
      table: true
      add: true
      edit: true
    export: false
total:
  field: replacement-value
  multiplyBy: quantity
```

The smallest valid v2 manifest is:

```yaml
version: 2
```

It intentionally produces an id/title-only inventory. There are no implicit Value, Quantity,
Container, currency, or other domain fields.

#### Field rules and defaults

`fields` is optional and defaults to an empty list. Each field requires:

- `id`: a unique lowercase slug matching `^[a-z0-9][a-z0-9_-]*$`, at most 100 characters, and not
  `id` or `title`;
- `label`: a non-empty label of at most 120 characters, unique without regard to case; and
- `type`: exactly `text` or `number`. Numbers must be finite YAML numbers.

The remaining policies have these defaults:

| Property           | Default | Meaning                                              |
| ------------------ | ------- | ---------------------------------------------------- |
| `required`         | `false` | The value must be valid before an item can be saved. |
| `visibility.table` | `true`  | Show the field as a table column.                    |
| `visibility.add`   | `true`  | Accept and show it in Add item.                      |
| `visibility.edit`  | `true`  | Accept and show it in Edit item.                     |
| `export`           | `true`  | Include it in CSV, independently of visibility.      |

A required field must be visible in both Add and Edit. The manifest accepts at most 100 fields and
is strict: unknown keys at the manifest, field, visibility, format, or total level are validation
errors rather than ignored typos.

Currency is an optional presentation format on a number field:

```yaml
format:
  kind: currency
  currency: USD
  decimalPlaces: 2
```

The currency designator must contain three uppercase letters; decimal places must be an integer from
0 through 10. Formatting affects display only. A raw YAML value of `12.345` stays `12.345` in
inputs, API data, search, writes, and CSV even if it displays as `$12.35`.

#### One optional total

`total.field` must name a declared number field. Optional `total.multiplyBy` must name a different
declared number field. The calculation over valid, non-duplicate items is:

```text
sum((numeric(total.field) or 0) * (numeric(total.multiplyBy) or 1))
```

Without `total`, Zone and inventory summaries show item counts only. Formatting and numeric types
never opt a field into a total implicitly.

### Other data and schema changes

Every non-structural item key not declared in `fields` is **Other data**. Strings, finite numbers,
and Booleans can be added, edited, or removed in the item dialog. Scalar lists remain visible as a
read-only summary. Nulls, mappings, nested sequences, aliases, and other structures remain visible
but read-only; use the YAML editor to change them. All unsupported values and comments round-trip
untouched.

Changing the manifest reclassifies data on the next read; it does not rewrite Zone files:

- declaring an existing key promotes matching scalar values to a configured field;
- removing a declaration demotes its values to Other data;
- labels, order, visibility, formatting, requiredness, and export change only derived views;
- changing a field id does not rename old keys; and
- changing a type preserves incompatible values and reports them for repair.

### CSV export

CSV always contains raw data, not formatted display strings. A v2 Zone CSV starts with `id,title`;
the flat inventory CSV starts with `zone,id,title`. Export-enabled declared fields follow in
manifest order, then serializable Other-data keys in first-seen order. Boolean and numeric extras
remain raw scalar text, while scalar lists retain their comma-space compatibility representation.

Structured values never become JSON or YAML inside a cell. A key that is scalar elsewhere gets a
blank cell where its value is structured; a structured-only key gets no column. `WARNINGS.txt` in
the ZIP identifies each omitted structured cell. Exports use UTF-8 BOM, CRLF records, safe RFC CSV
quoting, and formula-injection protection for text. Known numeric cells, including negative numbers,
remain numeric. V2 ZIP entries use `zones/<slug>.csv`; v1 retains `rooms/<slug>.csv`.

### Invalid manifests and version 1

An invalid v2 or unsupported future manifest puts the inventory into neutral, read-only recovery.
The application still shows Zones, structural id/title data, and Other data, with validation paths
and an **Open inventory.yaml in editor** action. Add, edit, delete, Add Zone, and CSV/ZIP export
stay disabled until the manifest is valid; an existing repair can still be checked in. The
application does not guess legacy fields or a default currency in this state.

A valid `version: 1` manifest keeps the original home-inventory interpretation, mutation behavior,
column order, and export layout. V1 tolerances and its conventional fields remain isolated to that
version. Authoring v2 by hand is a schema decision, not an in-place migration service; no room file
is automatically rewritten or converted.

Context Manager's ADR-0022 (the inventory view) records the architecture decision, and its v2
implementation spec (config-driven inventory fields) the normative validation and recovery
contract.
