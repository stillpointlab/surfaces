// The inventory app's lifecycle (Context Manager ADR-0022/0023/0024/0025): an
// inventory.yaml marks a space; its scope is the manifest and every
// convention-detected Zone file beside it, anchored at the given manifest and
// never re-detected. Moved from Context Manager's `services/inventory/lifecycle.ts`,
// without the host's own fields.

import { detectInventoryAt } from './detection.js';
import { parseInventoryManifest } from './manifest.js';

import type { AppLifecycle } from '@stillpointlab/common-format/app';

export const inventoryLifecycle: AppLifecycle = {
  manifestName: 'inventory.yaml',
  validateAndScope: (content, nodes, manifestPath) => {
    const parsed = parseInventoryManifest(content);
    if (!parsed.ok) return parsed;
    const detection = detectInventoryAt(manifestPath, nodes);
    const scope = new Set<string>([
      detection.manifestPath,
      ...detection.zones.map((zone) => zone.path),
    ]);
    return { ok: true, scope, warnings: parsed.warnings };
  },
  // The space's own label when the manifest parses, else the generic name: a
  // broken manifest still gets a row in the host's tree notices.
  describeInstance: (content) => {
    const parsed = content === null ? null : parseInventoryManifest(content);
    return { label: (parsed?.ok ? parsed.manifest.label : undefined) ?? 'Inventory' };
  },
};
