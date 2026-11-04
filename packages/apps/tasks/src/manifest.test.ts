import { describe, expect, it } from 'vitest';

import { parseTasksManifest, validateManifestAgainstTree } from './manifest.js';

import type { TreeNode } from './types.js';

const VALID_MANIFEST = `
version: 1
columns:
  - id: briefed
    label: Briefed
  - id: in-progress
    label: In progress
    description: Actively worked
  - id: done
    label: Done
templates:
  brief: docs/tasks/brief.template.md
  spec: docs/tasks/spec.template.md
`;

// A kinds: manifest (ADR-0027). Ends inside the LAST entry so tests can
// append entry-level lines (template:, color:) to it.
const KINDS_MANIFEST = `
version: 1
columns:
  - id: todo
    label: Todo
kinds:
  - id: story
  - id: epic
    label: Epics!
    badge: E
    dir: epics-dir
    creatable: false
`;

describe('parseTasksManifest', () => {
  it('parses a valid manifest and applies defaults', () => {
    const result = parseTasksManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.columns.map((c) => c.id)).toEqual(['briefed', 'in-progress', 'done']);
    expect(result.manifest.frontmatterKey).toBe('column');
    expect(result.manifest.defaultColumn).toBe('briefed');
    expect(result.manifest.doneColumn).toBe('done');
    expect(result.manifest.current).toBeUndefined();
    expect(result.manifest.tags).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('honors explicit frontmatterKey and defaultColumn', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}
frontmatterKey: status
defaultColumn: done
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.frontmatterKey).toBe('status');
    expect(result.manifest.defaultColumn).toBe('done');
  });

  // Folder names are convention, not configuration (ADR-0021). A manifest
  // written before that decision still loads — the stale block is ignored with
  // a warning rather than failing the whole Tasks View.
  it('ignores a legacy conventions block with a warning', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}
conventions:
  briefsDir: ideas
  tasksDir: work
  unassignedDir: backlog
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(["unknown key 'conventions' is ignored"]);
    expect(result.manifest.columns.map((c) => c.id)).toEqual(['briefed', 'in-progress', 'done']);
  });

  it('honors doneColumn, current, and tags', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}
doneColumn: in-progress
current:
  stage: 3
  phase: 5
tags:
  - infra
  - ui
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.doneColumn).toBe('in-progress');
    expect(result.manifest.current).toEqual({ stage: 3, phase: 5 });
    expect(result.manifest.tags).toEqual(['infra', 'ui']);
    expect(result.warnings).toEqual([]);
  });

  it('rejects a doneColumn that is not a declared column', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}doneColumn: nope\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("doneColumn 'nope'"))).toBe(true);
  });

  it('rejects a non-integer current pointer', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}
current:
  stage: 3.5
  phase: 1
`);
    expect(result.ok).toBe(false);
  });

  it('rejects case-insensitive duplicate tags', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}tags: [Infra, infra]\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("duplicate tag 'infra'"))).toBe(true);
  });

  it('rejects unparseable YAML with an error result, not a throw', () => {
    const result = parseTasksManifest('columns: [unclosed');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('YAML parse error');
  });

  it('rejects a non-mapping document', () => {
    const result = parseTasksManifest('- just\n- a list\n');
    expect(result).toEqual({ ok: false, errors: ['manifest must be a YAML mapping'] });
  });

  it('rejects a missing/unsupported version', () => {
    const result = parseTasksManifest(VALID_MANIFEST.replace('version: 1', 'version: 2'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.startsWith('version'))).toBe(true);
  });

  it('rejects an empty column list', () => {
    const result = parseTasksManifest(`
version: 1
columns: []
templates:
  brief: b.md
  spec: t.md
`);
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate column ids', () => {
    const result = parseTasksManifest(VALID_MANIFEST.replace('id: done', 'id: briefed'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("duplicate column id 'briefed'"))).toBe(true);
  });

  it('rejects the reserved unassigned column id', () => {
    const result = parseTasksManifest(VALID_MANIFEST.replace('id: done', 'id: unassigned'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes('reserved'))).toBe(true);
  });

  it('rejects non-slug column ids', () => {
    const result = parseTasksManifest(VALID_MANIFEST.replace('id: done', 'id: "Not A Slug"'));
    expect(result.ok).toBe(false);
  });

  it('rejects a defaultColumn that is not a declared column', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}defaultColumn: nope\n`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("defaultColumn 'nope'"))).toBe(true);
  });

  it('tolerates unknown keys with warnings', () => {
    const result = parseTasksManifest(`${VALID_MANIFEST}
somethingCustom: true
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(["unknown key 'somethingCustom' is ignored"]);
  });

  it('warns on unknown column keys', () => {
    const result = parseTasksManifest(
      VALID_MANIFEST.replace('label: Done', 'label: Done\n    wip_limit: 3')
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(["unknown key 'columns.2.wip_limit' is ignored"]);
  });

  it('resolves the built-in registry with legacy templates attached when kinds: is absent', () => {
    const result = parseTasksManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.kinds.map((k) => k.id)).toEqual([
      'spike',
      'brief',
      'spec',
      'review',
      'test',
    ]);
    expect(result.manifest.kinds.find((k) => k.id === 'brief')?.template).toBe(
      'docs/tasks/brief.template.md'
    );
    expect(result.manifest.kinds.find((k) => k.id === 'spike')?.template).toBeUndefined();
  });

  it('rejects a manifest with neither kinds: nor templates:', () => {
    const result = parseTasksManifest(VALID_MANIFEST.replace(/templates:[\s\S]*$/, ''));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("unless a 'kinds:' block"))).toBe(true);
  });
});

describe('parseTasksManifest kinds: block (ADR-0027)', () => {
  it('resolves declared kinds with defaults: label, badge, dir, creatable', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST}    template: docs/epic.template.md\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.kinds).toEqual([
      { id: 'story', label: 'Story', badge: 's', dir: 'storys', creatable: true },
      {
        id: 'epic',
        label: 'Epics!',
        badge: 'E',
        dir: 'epics-dir',
        creatable: false,
        template: 'docs/epic.template.md',
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('a template-less creatable kind is valid (stub creation)', () => {
    const result = parseTasksManifest(KINDS_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.kinds[0].template).toBeUndefined();
  });

  it('rejects duplicate kind ids', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST.replace('id: epic', 'id: story')}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("duplicate kind id 'story'"))).toBe(true);
  });

  it('rejects duplicate resolved dirs (an explicit dir colliding with a default)', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST.replace('dir: epics-dir', 'dir: storys')}`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("duplicate kind folder 'storys'"))).toBe(true);
  });

  it('rejects an id or dir that collides with the reserved pool folder', () => {
    const byId = parseTasksManifest(`${KINDS_MANIFEST.replace('id: epic', 'id: unassigned')}`);
    expect(byId.ok).toBe(false);
    const byDir = parseTasksManifest(
      `${KINDS_MANIFEST.replace('dir: epics-dir', 'dir: unassigned')}`
    );
    expect(byDir.ok).toBe(false);
    if (byDir.ok) return;
    expect(byDir.errors.some((e) => e.includes('reserved for the backlog pool'))).toBe(true);
  });

  it('rejects a non-slug kind id and an empty kinds list', () => {
    expect(parseTasksManifest(`${KINDS_MANIFEST.replace('id: epic', 'id: "Not Slug"')}`).ok).toBe(
      false
    );
    expect(
      parseTasksManifest(`version: 1\ncolumns:\n  - id: todo\n    label: Todo\nkinds: []\n`).ok
    ).toBe(false);
  });

  it('warns when a declared kinds: block shadows a leftover top-level templates:', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST}templates:\n  brief: b.md\n  spec: s.md\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      "top-level 'templates:' is ignored when a 'kinds:' block is declared — move templates onto the kind entries",
    ]);
    // The built-in registry is NOT consulted: the declared kinds stand alone.
    expect(result.manifest.kinds.map((k) => k.id)).toEqual(['story', 'epic']);
  });

  it('warns on duplicate badges (resolved, not just declared)', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST.replace('badge: E', 'badge: s')}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(["kinds 'story' and 'epic' share the badge 's'"]);
  });

  it('warns on unknown kind-entry keys', () => {
    const result = parseTasksManifest(`${KINDS_MANIFEST}    color: red\n`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(["unknown key 'kinds.1.color' is ignored"]);
  });
});

describe('validateManifestAgainstTree', () => {
  const nodes: TreeNode[] = [
    { path: 'docs', type: 'tree', sha: 'd1' },
    { path: 'docs/tasks', type: 'tree', sha: 'd2' },
    { path: 'docs/tasks/brief.template.md', type: 'blob', sha: 'b1' },
    { path: 'docs/tasks/spec.template.md', type: 'blob', sha: 'b2' },
  ];

  function manifestOf(content: string) {
    const result = parseTasksManifest(content);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.manifest;
  }

  it('passes when both template paths exist as blobs', () => {
    expect(validateManifestAgainstTree(manifestOf(VALID_MANIFEST), nodes)).toEqual([]);
  });

  it('reports each missing template path', () => {
    const manifest = manifestOf(
      VALID_MANIFEST.replace('docs/tasks/brief.template.md', 'missing/brief.md')
    );
    const errors = validateManifestAgainstTree(manifest, nodes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("template for kind 'brief': 'missing/brief.md'");
  });

  it('a tree entry does not satisfy a template path (must be a blob)', () => {
    const manifest = manifestOf(
      VALID_MANIFEST.replace('docs/tasks/brief.template.md', 'docs/tasks')
    );
    expect(validateManifestAgainstTree(manifest, nodes)).toHaveLength(1);
  });

  it('validates a declared spike template path', () => {
    const manifest = manifestOf(
      `${VALID_MANIFEST.replace(
        'spec: docs/tasks/spec.template.md',
        'spec: docs/tasks/spec.template.md\n  spike: docs/tasks/spike.template.md'
      )}`
    );
    const errors = validateManifestAgainstTree(manifest, nodes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("template for kind 'spike': 'docs/tasks/spike.template.md'");
  });

  it('validates kind-entry template paths the same way', () => {
    const manifest = manifestOf(`${KINDS_MANIFEST}    template: missing/epic.md\n`);
    const errors = validateManifestAgainstTree(manifest, nodes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("template for kind 'epic': 'missing/epic.md'");
  });
});
