import { fail, ok } from '@stillpointlab/common-format/app';
import { escapeCsvFormulaValue, serializeCsv } from '@stillpointlab/sheet-format/csv';

import type {
  SharedInventoryFieldDef,
  SharedInventoryItem,
  SharedInventoryRoom,
  SharedInventorySchema,
} from './types.js';
import type { Result } from '@stillpointlab/common-format/app';

export const CSV_BOM = '\uFEFF';
const CRLF = '\r\n';

interface TypedCsvCell {
  value: string;
  /** Finite values parsed as numbers stay numeric, including negatives. */
  numeric?: boolean;
}

interface CsvColumn {
  header: string;
  cell: (item: SharedInventoryItem) => TypedCsvCell;
}

type SchemaOrLegacyFields = SharedInventorySchema | SharedInventoryFieldDef[];

function resolvedSchema(input: SchemaOrLegacyFields): SharedInventorySchema {
  return Array.isArray(input)
    ? {
        mode: 'legacy',
        manifest: { version: 1, currency: 'USD', fields: input, containers: [] },
      }
    : input;
}

function textCell(value: string): TypedCsvCell {
  return { value };
}

function numericCell(value: number): TypedCsvCell {
  return { value: String(value), numeric: true };
}

function protectedCell(cell: TypedCsvCell): string {
  return cell.numeric ? cell.value : escapeCsvFormulaValue(cell.value);
}

function serializeTypedRows(rows: readonly (readonly TypedCsvCell[])[]): string {
  return serializeCsv(
    rows.map((row) => row.map(protectedCell)),
    {
      bom: true,
      lineEnding: CRLF,
      terminateFinalRecord: true,
      escapeFormulas: false,
    }
  );
}

/** Compatibility helpers now delegate quoting/formula policy to the sheet codec. */
export function toCsvCell(raw: string): string {
  return serializeCsv([[escapeCsvFormulaValue(raw)]], { escapeFormulas: false });
}

export function toCsvRow(cells: string[]): string {
  return serializeCsv([cells.map(escapeCsvFormulaValue)], { escapeFormulas: false });
}

function legacyUnknownKeys(items: readonly SharedInventoryItem[]): string[] {
  const keys: string[] = [];
  for (const item of items) {
    for (const extra of item.extraFields) {
      if (!keys.includes(extra.key)) keys.push(extra.key);
    }
  }
  return keys;
}

function configuredExtraKeys(
  items: readonly SharedInventoryItem[],
  declaredIds: ReadonlySet<string>
): string[] {
  const keys: string[] = [];
  for (const item of items) {
    for (const extra of item.extraFields) {
      if (declaredIds.has(extra.key) || extra.opaque || !Object.hasOwn(extra, 'value')) continue;
      if (!keys.includes(extra.key)) keys.push(extra.key);
    }
  }
  return keys;
}

function extraCell(item: SharedInventoryItem, key: string): TypedCsvCell {
  const extra = item.extraFields.find((candidate) => candidate.key === key);
  if (!extra || extra.opaque || !Object.hasOwn(extra, 'value')) return textCell('');
  if (Array.isArray(extra.value)) return textCell(extra.value.map(String).join(', '));
  if (typeof extra.value === 'number') return numericCell(extra.value);
  return textCell(String(extra.value));
}

function legacyExtraCell(item: SharedInventoryItem, key: string): TypedCsvCell {
  const cell = extraCell(item, key);
  // V1 historically passed every cell through formula protection after
  // stringification, including negative numeric extras.
  return textCell(cell.value);
}

function legacyColumns(
  fields: readonly SharedInventoryFieldDef[],
  items: readonly SharedInventoryItem[]
): CsvColumn[] {
  const text = (value: string | undefined): string => value ?? '';
  return [
    { header: 'id', cell: (item) => textCell(item.id) },
    { header: 'title', cell: (item) => textCell(item.title) },
    { header: 'description', cell: (item) => textCell(text(item.description)) },
    {
      header: 'value',
      // V1 preserves its historical formula protection for negative values.
      cell: (item) => textCell(item.value !== undefined ? String(item.value) : ''),
    },
    { header: 'quantity', cell: (item) => textCell(String(item.quantity)) },
    { header: 'serial', cell: (item) => textCell(text(item.serial)) },
    { header: 'acquired', cell: (item) => textCell(text(item.acquired)) },
    { header: 'container', cell: (item) => textCell(text(item.container)) },
    { header: 'tags', cell: (item) => textCell((item.tags ?? []).join(', ')) },
    ...fields.map((field): CsvColumn => ({
      header: field.label,
      cell: (item) =>
        textCell(
          item.fieldValues[field.id] !== undefined ? String(item.fieldValues[field.id]) : ''
        ),
    })),
    ...legacyUnknownKeys(items).map((key): CsvColumn => ({
      header: key,
      cell: (item) => legacyExtraCell(item, key),
    })),
  ];
}

function configuredColumns(
  schema: Extract<SharedInventorySchema, { mode: 'configured' }>,
  items: readonly SharedInventoryItem[]
): CsvColumn[] {
  const fields = schema.manifest.fields.filter((field) => field.export);
  const declaredIds = new Set(schema.manifest.fields.map((field) => field.id));
  return [
    { header: 'id', cell: (item) => textCell(item.id) },
    { header: 'title', cell: (item) => textCell(item.title) },
    ...fields.map((field): CsvColumn => ({
      header: field.label,
      cell: (item) => {
        const resolved = item.resolvedFieldValues?.[field.id];
        if (resolved?.state === 'valid') {
          return typeof resolved.value === 'number'
            ? numericCell(resolved.value)
            : textCell(resolved.value);
        }
        if (resolved?.state === 'invalid') {
          return typeof resolved.value === 'number'
            ? numericCell(resolved.value)
            : textCell(String(resolved.value));
        }
        return textCell('');
      },
    })),
    ...configuredExtraKeys(items, declaredIds).map((key): CsvColumn => ({
      header: key,
      cell: (item) => extraCell(item, key),
    })),
  ];
}

function columnsFor(
  schema: Exclude<SharedInventorySchema, { mode: 'invalid' }>,
  items: readonly SharedInventoryItem[]
): CsvColumn[] {
  return schema.mode === 'legacy'
    ? legacyColumns(schema.manifest.fields, items)
    : configuredColumns(schema, items);
}

function exportableSchema(
  input: SchemaOrLegacyFields
): Result<{ schema: Exclude<SharedInventorySchema, { mode: 'invalid' }> }> {
  const schema = resolvedSchema(input);
  if (schema.mode === 'invalid') {
    return fail('INVENTORY_SCHEMA_INVALID', 'Repair inventory.yaml before exporting');
  }
  return ok({ schema });
}

/** One zone as a CSV file. */
export function serializeRoom(
  room: SharedInventoryRoom,
  input: SchemaOrLegacyFields
): Result<{ content: string }> {
  const exportable = exportableSchema(input);
  if (!exportable.ok) return exportable;
  const columns = columnsFor(exportable.schema, room.items);
  return ok({
    content: serializeTypedRows([
      columns.map((column) => textCell(column.header)),
      ...room.items.map((item) => columns.map((column) => column.cell(item))),
    ]),
  });
}

/** The full inventory as one flat CSV. V2 leads with `zone`; v1 keeps `room`. */
export function serializeSpace(
  rooms: SharedInventoryRoom[],
  input: SchemaOrLegacyFields
): Result<{ content: string }> {
  const exportable = exportableSchema(input);
  if (!exportable.ok) return exportable;
  const { schema } = exportable;
  const allItems = rooms.flatMap((room) => room.items);
  const columns = columnsFor(schema, allItems);
  return ok({
    content: serializeTypedRows([
      [
        textCell(schema.mode === 'configured' ? 'zone' : 'room'),
        ...columns.map((c) => textCell(c.header)),
      ],
      ...rooms.flatMap((room) =>
        room.items.map((item) => [
          textCell(room.label),
          ...columns.map((column) => column.cell(item)),
        ])
      ),
    ]),
  });
}

/** WARNINGS.txt body for skipped rooms/items and v2 structured cells. */
export function exportWarnings(rooms: SharedInventoryRoom[], input?: SchemaOrLegacyFields): string {
  const lines: string[] = [];
  const resolved = input === undefined ? undefined : resolvedSchema(input);
  const grouping = resolved?.mode === 'configured' ? 'zone' : 'room';
  for (const room of rooms) {
    if (room.parseError) {
      lines.push(`${room.label} (${room.path}): ${grouping} skipped — ${room.parseError}`);
    }
    for (const attention of room.needsAttention) {
      const which = attention.title ?? attention.id ?? 'item';
      lines.push(`${room.label} (${room.path}): '${which}' skipped — ${attention.reason}`);
    }
  }

  const schema = resolved;
  if (schema?.mode === 'configured') {
    for (const room of rooms) {
      for (const item of room.items) {
        for (const field of schema.manifest.fields.filter((candidate) => candidate.export)) {
          if (item.resolvedFieldValues?.[field.id]?.state === 'structured') {
            lines.push(
              `${room.label} (${room.path}): '${item.title}' field '${field.id}' omitted — structured value`
            );
          }
        }
        for (const extra of item.extraFields) {
          if (extra.opaque) {
            lines.push(
              `${room.label} (${room.path}): '${item.title}' key '${extra.key}' omitted — ${extra.summary ?? 'structured value'}`
            );
          }
        }
      }
    }
  }

  if (lines.length === 0) return '';
  const heading =
    schema?.mode === 'configured'
      ? 'Items, zones, and values excluded from this export:'
      : 'Items and rooms excluded from this export:';
  return `${heading}${CRLF}${CRLF}${lines.join(CRLF)}${CRLF}`;
}

export function exportSlug(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug === '' ? 'inventory' : slug;
}
