// The example inventory in dev/example/, parsed with the core's functions and
// assembled into the states the elements take. A host's service does the
// assembling for real, overlaying drafts and check-ins; here every file is
// untracked and clean, as a host shows a repository nobody has edited.
import {
  aggregateItems,
  applyRoomTotals,
  demoteDuplicateIds,
  parseInventoryManifest,
  parseRoomFile,
} from '../src/index.js';

import type {
  SharedInventoryRoom,
  SharedInventoryRoomState,
  SharedInventorySchema,
  SharedInventorySpace,
} from '../src/types.js';

const files = import.meta.glob<string>('./example/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Where the example sits in an imagined repository. */
const SPACE_PATH = 'workshop';
const MANIFEST_PATH = `${SPACE_PATH}/inventory.yaml`;

const repoPath = (file: string): string => file.replace(/^\.\/example/, SPACE_PATH);

function schemaOf(content: string): { schema: SharedInventorySchema; warnings: string[] } {
  const parsed = parseInventoryManifest(content);
  if (!parsed.ok) {
    return {
      schema: {
        mode: 'invalid',
        errors: parsed.errors,
        ...(parsed.declaredVersion !== undefined
          ? { declaredVersion: parsed.declaredVersion }
          : {}),
      },
      warnings: [],
    };
  }
  const { manifest } = parsed;
  return {
    schema:
      manifest.version === 1 ? { mode: 'legacy', manifest } : { mode: 'configured', manifest },
    warnings: parsed.warnings,
  };
}

function zones(schema: SharedInventorySchema): SharedInventoryRoom[] {
  const parsed = Object.entries(files)
    .filter(([file]) => file.startsWith('./example/rooms/'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, content]): SharedInventoryRoom => {
      const path = repoPath(file);
      const slug = path.slice(path.lastIndexOf('/') + 1).replace(/\.yaml$/, '');
      const result = parseRoomFile(content, schema);
      const zone: SharedInventoryRoom = result.ok
        ? {
            slug,
            label: result.label ?? slug,
            path,
            items: result.items,
            totals: aggregateItems(schema, []),
            needsAttention: result.attention,
            writable: true,
            ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
          }
        : {
            slug,
            label: slug,
            path,
            items: [],
            totals: aggregateItems(schema, []),
            needsAttention: [],
            parseError: result.error,
            writable: false,
          };
      return zone;
    });
  demoteDuplicateIds(parsed);
  for (const zone of parsed) applyRoomTotals(zone, schema);
  return parsed;
}

function load(): { space: SharedInventorySpace; zones: SharedInventoryRoom[] } {
  const { schema, warnings } = schemaOf(files['./example/inventory.yaml'] ?? '');
  const all = zones(schema);
  const label = schema.mode === 'invalid' ? undefined : schema.manifest.label;
  return {
    zones: all,
    space: {
      manifestPath: MANIFEST_PATH,
      spacePath: SPACE_PATH,
      ...(label !== undefined ? { label } : {}),
      schema,
      rooms: all.map((zone) => ({
        slug: zone.slug,
        label: zone.label,
        path: zone.path,
        itemCount: zone.items.length,
        totals: zone.totals,
        needsAttentionCount: zone.needsAttention.length,
        ...(zone.parseError !== undefined ? { parseError: zone.parseError } : {}),
      })),
      totals: aggregateItems(
        schema,
        all.flatMap((zone) => zone.items)
      ),
      enabled: true,
      dirty: [],
      warnings,
    },
  };
}

/** The example's overview. */
export function exampleSpace(): SharedInventorySpace {
  return load().space;
}

/** One of the example's zones, by slug (the first when it has none). */
export function exampleZone(slug?: string): SharedInventoryRoomState {
  const { space, zones: all } = load();
  const zone = all.find((candidate) => candidate.slug === slug) ?? all[0]!;
  return {
    manifestPath: space.manifestPath,
    spacePath: space.spacePath,
    ...(space.label !== undefined ? { spaceLabel: space.label } : {}),
    schema: space.schema,
    room: zone,
    enabled: true,
    dirty: [],
    warnings: space.warnings,
  };
}
