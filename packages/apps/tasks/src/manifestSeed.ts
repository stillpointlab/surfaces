/**
 * Seeding a new `tasks.yaml` manifest into the connected repo (spec
 * tasks_create). The tasks sibling of the inventory's `manifestSeed.ts`: the
 * same app-only good (no `importedBlobSha`) that detection sees at once and
 * the first check-in publishes — only the bytes differ. Per ADR-0027 the
 * bare manifest IS the whole app: no stage/phase scaffolding, no templates,
 * no `.gitkeep`.
 */
import { formatYamlScalar } from '@stillpointlab/common-format/yaml';

/** What the create dialog collects; everything else keeps its default. */
export interface TasksManifestSeed {
  columns: { id: string; label: string; description?: string }[];
  kinds: { id: string; label?: string }[];
}

/** The resolver's default label for a kind id (`manifest.ts#resolveKinds`). */
const defaultKindLabel = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * The bytes a careful human would write for a brand-new manifest: block
 * style, minimal, keys in reading order (`version`, `columns`, `kinds`).
 * The omission rule is absolute — a key equal to its documented default is
 * not written: no `frontmatterKey`/`defaultColumn`/`doneColumn`/`current`/
 * `tags`, no kind `label` that matches the id capitalized, never a `dir`,
 * `badge`, `creatable`, or `template` (the dialog does not collect them).
 */
export function tasksManifestSeedContent(seed: TasksManifestSeed): string {
  const lines = ['version: 1', 'columns:'];
  for (const column of seed.columns) {
    lines.push(`  - id: ${formatYamlScalar(column.id)}`);
    lines.push(`    label: ${formatYamlScalar(column.label)}`);
    if (column.description !== undefined && column.description !== '') {
      lines.push(`    description: ${formatYamlScalar(column.description)}`);
    }
  }
  lines.push('kinds:');
  for (const kind of seed.kinds) {
    lines.push(`  - id: ${formatYamlScalar(kind.id)}`);
    if (kind.label !== undefined && kind.label !== defaultKindLabel(kind.id)) {
      lines.push(`    label: ${formatYamlScalar(kind.label)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
