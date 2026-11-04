/** Canonical v2 `inventory.yaml` seeding for the Create inventory flow. */
import { formatYamlScalar } from '@stillpointlab/common-format/yaml';

import type { SharedInventoryCurrencyFormatV2 } from './types.js';

export interface InventoryManifestSeedField {
  id: string;
  label: string;
  type: 'text' | 'number';
  format?: SharedInventoryCurrencyFormatV2;
}

export interface InventoryManifestSeed {
  label: string;
  fields?: InventoryManifestSeedField[];
  total?: {
    field: string;
    multiplyBy?: string;
  };
}

/**
 * Keys are emitted in contract order. Default policy and empty sections are
 * omitted so the shortest inventory remains `version` + `label`.
 */
export function manifestSeedContent(seed: InventoryManifestSeed): string {
  const lines = ['version: 2', `label: ${formatYamlScalar(seed.label)}`];
  const fields = seed.fields ?? [];
  if (fields.length > 0) {
    lines.push('fields:');
    for (const field of fields) {
      lines.push(`  - id: ${formatYamlScalar(field.id)}`);
      lines.push(`    label: ${formatYamlScalar(field.label)}`);
      lines.push(`    type: ${field.type}`);
      if (field.format !== undefined) {
        lines.push('    format:');
        lines.push(`      kind: ${field.format.kind}`);
        lines.push(`      currency: ${field.format.currency}`);
        lines.push(`      decimalPlaces: ${field.format.decimalPlaces}`);
      }
    }
  }
  if (seed.total !== undefined) {
    lines.push('total:');
    lines.push(`  field: ${formatYamlScalar(seed.total.field)}`);
    if (seed.total.multiplyBy !== undefined) {
      lines.push(`  multiplyBy: ${formatYamlScalar(seed.total.multiplyBy)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
