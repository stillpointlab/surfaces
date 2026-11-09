/// <reference lib="dom" />
/**
 * Inventory states the element, page and op tests share: a legacy overview
 * (as seeded, and straight after "Create inventory"), a legacy zone whose
 * repository text tries to break out of every attribute it lands in, and a
 * configured zone with valid, mismatched, structured and Other data values.
 */
import type {
  SharedInventoryManifestV1,
  SharedInventoryManifestV2,
  SharedInventoryZoneState,
  SharedInventorySpace,
} from '../types.js';

export const LEGACY_MANIFEST: SharedInventoryManifestV1 = {
  version: 1,
  label: 'Maple St House',
  currency: 'USD',
  fields: [],
  containers: [],
};

export const SPACE: SharedInventorySpace = {
  manifestPath: 'inventory.yaml',
  spacePath: '',
  label: 'Maple St House',
  schema: { mode: 'legacy', manifest: LEGACY_MANIFEST },
  currency: 'USD',
  fields: [],
  containers: [],
  zones: [
    {
      slug: 'kitchen',
      label: 'Kitchen',
      path: 'rooms/kitchen.yaml',
      itemCount: 1,
      totals: { itemCount: 1, value: 10, unvaluedCount: 0 },
      subtotal: 10,
      unvaluedCount: 0,
      needsAttentionCount: 0,
    },
  ],
  totals: { itemCount: 1, value: 10, unvaluedCount: 0 },
  enabled: true,
  dirty: [],
  warnings: [],
};

export const SEEDED: SharedInventorySpace = {
  ...SPACE,
  zones: [
    {
      slug: 'attic',
      label: 'Attic',
      path: 'rooms/attic.yaml',
      itemCount: 0,
      totals: { itemCount: 0, value: 0, unvaluedCount: 0 },
      subtotal: 0,
      unvaluedCount: 0,
      needsAttentionCount: 0,
    },
    ...SPACE.zones,
  ],
  dirty: [{ path: 'rooms/attic.yaml', kind: 'zone', newFile: true }],
};

/** Straight after "Create inventory": nothing is upstream, everything is new. */
export const JUST_CREATED: SharedInventorySpace = {
  ...SPACE,
  manifestPath: 'inventory/inventory.yaml',
  spacePath: 'inventory',
  label: 'Maple Street House',
  zones: [
    {
      slug: 'garage',
      label: 'Garage',
      path: 'inventory/rooms/garage.yaml',
      itemCount: 0,
      totals: { itemCount: 0, value: 0, unvaluedCount: 0 },
      subtotal: 0,
      unvaluedCount: 0,
      needsAttentionCount: 0,
    },
    {
      slug: 'kitchen',
      label: 'Kitchen',
      path: 'inventory/rooms/kitchen.yaml',
      itemCount: 0,
      totals: { itemCount: 0, value: 0, unvaluedCount: 0 },
      subtotal: 0,
      unvaluedCount: 0,
      needsAttentionCount: 0,
    },
  ],
  totals: { itemCount: 0, value: 0, unvaluedCount: 0 },
  dirty: [
    { path: 'inventory/inventory.yaml', kind: 'manifest', newFile: true },
    { path: 'inventory/rooms/garage.yaml', kind: 'zone', newFile: true },
    { path: 'inventory/rooms/kitchen.yaml', kind: 'zone', newFile: true },
  ],
};

export const ATTRIBUTE_PAYLOADS = {
  container: `shelf" onmouseover="window.inventoryInjected=true & 'single'`,
  description: `rare description " data-extra="broken & <em>markup</em>`,
  fieldId: `condition" onfocus="window.inventoryInjected=true`,
  fieldLabel: `Condition "quoted" & 'single' <strong>label</strong>`,
  itemId: `tv" onmouseover="window.inventoryInjected=true`,
  readOnly: `flow map " onmouseover="window.inventoryInjected=true & 'single'`,
  serial: `SN'42" onerror="window.inventoryInjected=true &`,
  title: `Living "Room" TV's & <screen>`,
  warning: `warning " onmouseover="window.inventoryInjected=true & 'single'`,
} as const;

export const LEGACY_ZONE: SharedInventoryZoneState = {
  manifestPath: 'inventory.yaml',
  spacePath: '',
  spaceLabel: 'Maple St House',
  schema: {
    mode: 'legacy',
    manifest: {
      ...LEGACY_MANIFEST,
      fields: [
        {
          id: ATTRIBUTE_PAYLOADS.fieldId,
          label: ATTRIBUTE_PAYLOADS.fieldLabel,
          type: 'text',
        },
      ],
      containers: [ATTRIBUTE_PAYLOADS.container],
    },
  },
  currency: 'USD',
  fields: [
    {
      id: ATTRIBUTE_PAYLOADS.fieldId,
      label: ATTRIBUTE_PAYLOADS.fieldLabel,
      type: 'text',
    },
  ],
  containers: [ATTRIBUTE_PAYLOADS.container],
  zone: {
    slug: 'living-room',
    label: 'Living Room',
    path: 'rooms/living-room.yaml',
    items: [
      {
        id: ATTRIBUTE_PAYLOADS.itemId,
        title: ATTRIBUTE_PAYLOADS.title,
        description: ATTRIBUTE_PAYLOADS.description,
        serial: ATTRIBUTE_PAYLOADS.serial,
        container: ATTRIBUTE_PAYLOADS.container,
        quantity: 1,
        value: 10,
        tags: [`tag " onmouseover="window.inventoryInjected=true`],
        fieldValues: { [ATTRIBUTE_PAYLOADS.fieldId]: `good & "quoted"` },
        extraFields: [],
        warnings: [ATTRIBUTE_PAYLOADS.warning],
      },
      {
        id: 'locked-item',
        title: 'Locked neighbour',
        quantity: 1,
        fieldValues: {},
        extraFields: [],
        readOnly: ATTRIBUTE_PAYLOADS.readOnly,
      },
    ],
    totals: { itemCount: 2, value: 10, unvaluedCount: 1 },
    subtotal: 10,
    unvaluedCount: 1,
    needsAttention: [],
    writable: true,
  },
  enabled: true,
  dirty: [],
  warnings: [],
};

export const CONFIGURED_MANIFEST: SharedInventoryManifestV2 = {
  version: 2,
  label: 'Workshop',
  fields: [
    {
      id: 'owner',
      label: 'Owner',
      type: 'text',
      required: true,
      visibility: { table: true, add: true, edit: true },
      export: true,
    },
    {
      id: 'amount',
      label: 'Replacement value',
      type: 'number',
      required: false,
      visibility: { table: true, add: true, edit: true },
      export: true,
      format: { kind: 'currency', currency: 'USD', decimalPlaces: 2 },
    },
    {
      id: 'quantity',
      label: 'Quantity',
      type: 'number',
      required: false,
      visibility: { table: false, add: true, edit: true },
      export: true,
    },
    {
      id: 'secret',
      label: 'Secret',
      type: 'text',
      required: false,
      visibility: { table: false, add: false, edit: false },
      export: false,
    },
  ],
  total: { field: 'amount', multiplyBy: 'quantity' },
};

export const CONFIGURED_ZONE: SharedInventoryZoneState = {
  manifestPath: 'inventory/inventory.yaml',
  spacePath: 'inventory',
  spaceLabel: 'Workshop',
  schema: { mode: 'configured', manifest: CONFIGURED_MANIFEST },
  zone: {
    slug: 'workshop',
    label: 'Workshop floor',
    path: 'inventory/rooms/workshop.yaml',
    items: [
      {
        id: 'lathe',
        title: 'Lathe',
        quantity: 1,
        fieldValues: { owner: 'Jamie', amount: 12.345, quantity: 2, secret: 'classified' },
        resolvedFieldValues: {
          owner: { state: 'valid', value: 'Jamie' },
          amount: { state: 'valid', value: 12.345 },
          quantity: { state: 'valid', value: 2 },
          secret: { state: 'valid', value: 'classified' },
        },
        extraFields: [
          { key: 'location', value: 'bench' },
          { key: 'warranty', value: true },
          { key: 'labels', value: ['heavy', 'powered'] },
          {
            key: 'receipt',
            opaque: true,
            summary: 'Mapping',
            readOnlyReason: 'Mapping can only be edited in YAML',
          },
        ],
      },
      {
        id: 'spare',
        title: 'Spare motor',
        quantity: 1,
        fieldValues: { owner: 'Morgan' },
        resolvedFieldValues: {
          owner: { state: 'valid', value: 'Morgan' },
          amount: {
            state: 'invalid',
            value: 'wrong',
            issue: {
              kind: 'type-mismatch',
              expected: 'number',
              actual: 'text',
              message: 'expected number, found text',
            },
          },
          quantity: { state: 'missing' },
          secret: { state: 'missing' },
        },
        extraFields: [],
      },
    ],
    totals: {
      itemCount: 2,
      total: {
        fieldId: 'amount',
        label: 'Replacement value',
        value: 24.69,
        format: { kind: 'currency', currency: 'USD', decimalPlaces: 2 },
      },
    },
    needsAttention: [],
    writable: true,
  },
  enabled: true,
  dirty: [],
  warnings: [],
};
