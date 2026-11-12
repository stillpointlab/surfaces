/**
 * The checks a new inventory's fields must pass (spec create-from-the-app),
 * shared by `<spl-inventory-create>`, which shows the first problem before
 * anything is sent, and `planInventoryCreate`, which refuses the same input
 * at the host. The `./create` entry: DOM-free and zod-free, so the form
 * carries none of the core.
 *
 * The folder is the host's field and the plan's rule, so it is not checked
 * here.
 */
import { fail, ok } from '@stillpointlab/common-format/app';

import {
  INVENTORY_CURRENCY_PATTERN,
  INVENTORY_FIELD_ID_MAX_LENGTH,
  INVENTORY_FIELD_ID_PATTERN,
  INVENTORY_FIELD_LABEL_MAX_LENGTH,
  INVENTORY_MAX_FIELDS,
  INVENTORY_RESERVED_FIELD_IDS,
  slugifyInventoryName,
} from './paths.js';

import type { InventoryManifestSeed } from './manifestSeed.js';
import type { Failure, Result } from '@stillpointlab/common-format/app';

export {
  INVENTORY_CURRENCY_PATTERN,
  INVENTORY_DEFAULT_CURRENCY,
  INVENTORY_DEFAULT_FOLDER,
  INVENTORY_FIELD_LABEL_MAX_LENGTH,
  INVENTORY_MAX_FIELDS,
  INVENTORY_RESERVED_FIELD_IDS,
  slugifyInventoryName,
} from './paths.js';

/** The longest inventory name. */
export const INVENTORY_LABEL_MAX_LENGTH = 120;
/** The most zones a create seeds. */
export const INVENTORY_CREATE_MAX_ZONES = 50;
/** The longest zone title. */
export const INVENTORY_ZONE_TITLE_MAX_LENGTH = 120;

/** What the create form collects: the create input without its folder. */
export interface InventoryCreateFields {
  label: string;
  fields?: InventoryManifestSeed['fields'];
  total?: InventoryManifestSeed['total'];
  /** Zone titles, each seeded as a file named by its slug. */
  zones?: string[];
}

/**
 * Which part of the form a refusal is about, as its `details[0]`: the name,
 * a zone or a column (by index), the currency, the total or its multiplier.
 */
export type InventoryCreateField =
  | { field: 'label' }
  | { field: 'zones'; index?: number }
  | { field: 'fields'; index?: number }
  | { field: 'currency' }
  | { field: 'total' }
  | { field: 'multiplyBy' };

const refuse = (code: string, message: string, where: InventoryCreateField): Failure =>
  fail(code, message, [where]);

/**
 * The first problem with a create's fields, in the order the form shows them,
 * or ok. Labels and titles are taken as given: the form trims them.
 */
export function checkInventoryCreate(input: InventoryCreateFields): Result {
  if (input.label === '') {
    return refuse('INVENTORY_LABEL_REQUIRED', 'Give the inventory a name.', { field: 'label' });
  }
  if (input.label.length > INVENTORY_LABEL_MAX_LENGTH) {
    return refuse(
      'INVENTORY_LABEL_TOO_LONG',
      `The name is too long (${INVENTORY_LABEL_MAX_LENGTH} characters max).`,
      { field: 'label' }
    );
  }

  const zones = input.zones ?? [];
  if (zones.length > INVENTORY_CREATE_MAX_ZONES) {
    return refuse(
      'INVENTORY_TOO_MANY_ZONES',
      `Add at most ${INVENTORY_CREATE_MAX_ZONES} zones to start with.`,
      { field: 'zones' }
    );
  }
  const zoneSlugs = new Set<string>();
  for (const [index, zone] of zones.entries()) {
    if (zone.length > INVENTORY_ZONE_TITLE_MAX_LENGTH) {
      return refuse(
        'INVENTORY_ROOM_NAME_INVALID',
        `“${zone}” is too long for a zone title (${INVENTORY_ZONE_TITLE_MAX_LENGTH} characters max).`,
        { field: 'zones', index }
      );
    }
    const slug = slugifyInventoryName(zone);
    if (slug === '') {
      return refuse(
        'INVENTORY_ROOM_NAME_INVALID',
        `“${zone}” needs letters or numbers to name its file.`,
        { field: 'zones', index }
      );
    }
    if (zoneSlugs.has(slug)) {
      return refuse(
        'INVENTORY_ROOM_NAME_DUPLICATE',
        `Two zones would both be saved as “${slug}.yaml”.`,
        { field: 'zones', index }
      );
    }
    zoneSlugs.add(slug);
  }

  const fields = input.fields ?? [];
  if (fields.length > INVENTORY_MAX_FIELDS) {
    return refuse(
      'INVENTORY_TOO_MANY_FIELDS',
      `Add at most ${INVENTORY_MAX_FIELDS} initial columns.`,
      { field: 'fields' }
    );
  }
  if (
    fields.some(
      (field) =>
        field.format !== undefined && !INVENTORY_CURRENCY_PATTERN.test(field.format.currency)
    )
  ) {
    return refuse(
      'INVENTORY_CURRENCY_INVALID',
      'The currency must be a three-letter code like USD.',
      { field: 'currency' }
    );
  }
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const [index, field] of fields.entries()) {
    const where: InventoryCreateField = { field: 'fields', index };
    if (field.label === '' || field.label.length > INVENTORY_FIELD_LABEL_MAX_LENGTH) {
      return refuse(
        'INVENTORY_FIELD_LABEL_INVALID',
        `Give every column a title of at most ${INVENTORY_FIELD_LABEL_MAX_LENGTH} characters.`,
        where
      );
    }
    if (
      field.id === '' ||
      field.id.length > INVENTORY_FIELD_ID_MAX_LENGTH ||
      !INVENTORY_FIELD_ID_PATTERN.test(field.id)
    ) {
      return refuse(
        'INVENTORY_FIELD_ID_INVALID',
        `“${field.label}” needs letters or numbers to make a field id.`,
        where
      );
    }
    if (INVENTORY_RESERVED_FIELD_IDS.has(field.id)) {
      return refuse(
        'INVENTORY_FIELD_ID_RESERVED',
        `“${field.label}” generates reserved id “${field.id}”. Choose another title.`,
        where
      );
    }
    if (ids.has(field.id)) {
      return refuse(
        'INVENTORY_FIELD_ID_DUPLICATE',
        `Two columns would use field id “${field.id}”.`,
        where
      );
    }
    ids.add(field.id);
    const folded = field.label.toLocaleLowerCase('en-US');
    if (labels.has(folded)) {
      return refuse(
        'INVENTORY_FIELD_LABEL_DUPLICATE',
        `Two columns have the label “${field.label}”.`,
        where
      );
    }
    labels.add(folded);
  }

  const { total } = input;
  if (total !== undefined) {
    const amount = fields.find((field) => field.id === total.field && field.type === 'number');
    if (!amount) {
      return refuse(
        'INVENTORY_TOTAL_INVALID',
        'Total must reference a Number or Currency column.',
        {
          field: 'total',
        }
      );
    }
    if (total.multiplyBy !== undefined) {
      const multiplier = fields.find(
        (field) => field.id === total.multiplyBy && field.type === 'number'
      );
      if (!multiplier || multiplier.id === amount.id) {
        return refuse(
          'INVENTORY_TOTAL_INVALID',
          'Multiply by must reference a different Number or Currency column.',
          { field: 'multiplyBy' }
        );
      }
    }
  }
  return ok();
}
