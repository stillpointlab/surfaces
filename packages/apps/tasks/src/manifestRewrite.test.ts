import { describe, expect, it } from 'vitest';

import { parseTasksManifest } from './manifest.js';
import {
  appendManifestListEntry,
  appendManifestTag,
  patchManifestEntryKey,
  patchManifestTopLevelScalar,
  removeManifestListEntry,
  rewriteManifestCurrent,
} from './manifestRewrite.js';

const MANIFEST = `# Tasks View manifest (ADR-0014).
# Hand-edited; comments and ordering must survive app writes.
version: 1

columns:
  - id: briefed
    label: Briefed
  - id: done
    label: Done

frontmatterKey: column
defaultColumn: briefed

templates:
  brief: docs/tasks/brief.template.md
  spec: docs/tasks/spec.template.md
`;

function expectOnlyDiff(
  before: string,
  after: string,
  changedPredicate: (line: string) => boolean
) {
  const beforeKept = before.split('\n').filter((line) => !changedPredicate(line));
  const afterKept = after.split('\n').filter((line) => !changedPredicate(line));
  expect(afterKept).toEqual(beforeKept);
}

describe('rewriteManifestCurrent', () => {
  it('appends a current block when the key is missing', () => {
    const result = rewriteManifestCurrent(MANIFEST, { stage: 3, phase: 5 });
    expect(result).toBe(`${MANIFEST}current:\n  stage: 3\n  phase: 5\n`);
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.current).toEqual({ stage: 3, phase: 5 });
  });

  it('replaces an existing block in place, touching nothing else', () => {
    const before = `${MANIFEST}current:\n  stage: 2\n  phase: 10\n\ntags:\n  - infra\n`;
    const result = rewriteManifestCurrent(before, { stage: 3, phase: 6 });
    expect(result).toContain('current:\n  stage: 3\n  phase: 6\n\ntags:');
    expectOnlyDiff(before, result, (line) => /^\s+(stage|phase):/.test(line));
  });

  it('preserves an inline flow mapping style', () => {
    const before = `${MANIFEST}current: { stage: 2, phase: 10 }\n`;
    const result = rewriteManifestCurrent(before, { stage: 3, phase: 1 });
    expect(result).toBe(`${MANIFEST}current: { stage: 3, phase: 1 }\n`);
  });

  it('preserves CRLF line endings', () => {
    const before = MANIFEST.replace(/\n/g, '\r\n');
    const result = rewriteManifestCurrent(before, { stage: 1, phase: 2 });
    expect(result).toContain('current:\r\n  stage: 1\r\n  phase: 2\r\n');
    expect(result).not.toMatch(/[^\r]\n/);
  });

  it('does not treat an indented or commented current key as the pointer', () => {
    const before = `${MANIFEST}# current: { stage: 9, phase: 9 }\n`;
    const result = rewriteManifestCurrent(before, { stage: 3, phase: 5 });
    expect(result).toContain('# current: { stage: 9, phase: 9 }');
    expect(result).toContain('current:\n  stage: 3\n  phase: 5');
  });
});

describe('appendManifestTag', () => {
  it('creates the registry when missing', () => {
    const result = appendManifestTag(MANIFEST, 'infra');
    expect(result).toBe(`${MANIFEST}tags:\n  - infra\n`);
  });

  it('appends to a block list matching its indentation', () => {
    const before = `${MANIFEST}tags:\n  - infra\n  - ui\n`;
    const result = appendManifestTag(before, 'payments');
    expect(result).toBe(`${MANIFEST}tags:\n  - infra\n  - ui\n  - payments\n`);
  });

  it('appends inside a single-line flow list', () => {
    const before = `${MANIFEST}tags: [infra, ui]\n`;
    const result = appendManifestTag(before, 'payments');
    expect(result).toBe(`${MANIFEST}tags: [infra, ui, payments]\n`);
  });

  it('fills an empty flow list', () => {
    const before = `${MANIFEST}tags: []\n`;
    const result = appendManifestTag(before, 'infra');
    expect(result).toBe(`${MANIFEST}tags: [infra]\n`);
  });

  it('is idempotent, case-insensitively', () => {
    const before = `${MANIFEST}tags:\n  - Infra\n`;
    expect(appendManifestTag(before, 'infra')).toBe(before);
    expect(appendManifestTag(before, 'INFRA')).toBe(before);
  });

  it('quotes non-slug tags', () => {
    const result = appendManifestTag(MANIFEST, 'needs review');
    expect(result).toContain('- "needs review"');
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.tags).toEqual(['needs review']);
  });

  it('rejects an empty tag', () => {
    expect(() => appendManifestTag(MANIFEST, '  ')).toThrow('non-empty');
  });

  it('result still parses as a valid manifest', () => {
    const result = appendManifestTag(rewriteManifestCurrent(MANIFEST, { stage: 3, phase: 5 }), 'x');
    const parsed = parseTasksManifest(result);
    expect(parsed.ok).toBe(true);
  });
});

describe('rewriter hardening (review H9/M6/M8/L3)', () => {
  it('quotes YAML-keyword and numeric tags so they round-trip as strings', () => {
    const base = 'version: 1\ntags:\n  - infra\n';
    expect(appendManifestTag(base, '123')).toContain('- "123"');
    expect(appendManifestTag(base, 'true')).toContain('- "true"');
    expect(appendManifestTag(base, 'null')).toContain('- "null"');
  });

  it('refuses a flow list spanning multiple lines instead of corrupting it', () => {
    const content = 'version: 1\ntags: [infra,\n  ui]\n';
    expect(() => appendManifestTag(content, 'payments')).toThrow(/cannot patch/);
  });

  it('refuses a ] hidden in a trailing comment instead of writing into it', () => {
    const content = 'version: 1\ntags: [infra] # keep ] here\n';
    expect(() => appendManifestTag(content, 'ui')).toThrow(/cannot patch/);
  });

  it('sees past a blank line inside a block list (idempotency + append point)', () => {
    const content = 'tags:\n  - infra\n\n  - payments\nversion: 1\n';
    // Already present after the blank: no duplicate appended.
    expect(appendManifestTag(content, 'payments')).toBe(content);
    // A new tag lands after the LAST item, keeping the block one block.
    const added = appendManifestTag(content, 'ui');
    expect(added).toBe('tags:\n  - infra\n\n  - payments\n  - ui\nversion: 1\n');
  });

  it('a pointer bump on a mixed-EOL file changes only the current block', () => {
    const content =
      'version: 1\r\ncolumns:\n  - id: briefed\n    label: B\ncurrent:\n  stage: 1\n  phase: 1\n';
    const bumped = rewriteManifestCurrent(content, { stage: 1, phase: 2 });
    // The CRLF header line survives untouched; only the block changed.
    expect(bumped.startsWith('version: 1\r\n')).toBe(true);
    expect(bumped).toContain('  phase: 2');
    expect(bumped.replace('  phase: 2', '  phase: 1')).toBe(content);
  });
});

// Board-settings primitives (spec tasks_edit): byte-preserving list-entry and
// top-level-scalar patches. The fixture deliberately carries comments in
// every position an op touches — surviving them IS the contract.
const SETTINGS_MANIFEST = `# The board's shape — hand-edited, comments must survive.
version: 1

columns:
  # workflow lanes, in order
  - id: todo
    label: Todo
  - id: doing
    label: Doing
    description: Underway.
  - id: done
    label: Done

defaultColumn: todo

kinds:
  - id: spike
    badge: s # keep distinct from spec
  - id: spec
    creatable: false
`;

describe('appendManifestListEntry', () => {
  it('appends a column entry at the section end, matching indentation', () => {
    const result = appendManifestListEntry(SETTINGS_MANIFEST, 'columns', {
      id: 'review',
      fields: [
        ['label', 'In review'],
        ['description', 'PR open.'],
      ],
    });

    expect(result).toContain(
      '  - id: done\n    label: Done\n  - id: review\n    label: In review\n    description: PR open.\n\ndefaultColumn: todo'
    );
    expectOnlyDiff(SETTINGS_MANIFEST, result, (line) =>
      ['review', 'In review', 'PR open.'].some((needle) => line.includes(needle))
    );
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.columns.map((c) => c.id)).toEqual([
      'todo',
      'doing',
      'done',
      'review',
    ]);
  });

  it('appends a kind entry and quotes values YAML would reinterpret', () => {
    const result = appendManifestListEntry(SETTINGS_MANIFEST, 'kinds', {
      id: 'memo',
      fields: [['label', 'Memo: quick']],
    });

    expect(result).toContain(
      '  - id: spec\n    creatable: false\n  - id: memo\n    label: "Memo: quick"\n'
    );
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.kinds.map((k) => k.id)).toEqual(['spike', 'spec', 'memo']);
  });

  it('fails loudly on a missing section or a flow list', () => {
    expect(() =>
      appendManifestListEntry('version: 1\ncolumns:\n  - id: a\n    label: A\n', 'kinds', {
        id: 'memo',
        fields: [],
      })
    ).toThrowError(/kinds: section .* not declared/);
    expect(() =>
      appendManifestListEntry('version: 1\ncolumns: [{ id: a, label: A }]\n', 'columns', {
        id: 'b',
        fields: [['label', 'B']],
      })
    ).toThrowError(/flow list/);
  });
});

describe('patchManifestEntryKey', () => {
  it('replaces a value in place, keeping the line comment', () => {
    const result = patchManifestEntryKey(SETTINGS_MANIFEST, 'kinds', 'spike', 'badge', 'sk');

    expect(result).toContain('    badge: sk # keep distinct from spec');
    expectOnlyDiff(SETTINGS_MANIFEST, result, (line) => line.includes('badge:'));
  });

  it('adds an absent key directly after the dash line', () => {
    const result = patchManifestEntryKey(
      SETTINGS_MANIFEST,
      'columns',
      'todo',
      'description',
      'Queued.'
    );

    expect(result).toContain('  - id: todo\n    description: Queued.\n    label: Todo\n');
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.columns[0].description).toBe('Queued.');
  });

  it('null removes the key line; removing an absent key is a no-op', () => {
    const removed = patchManifestEntryKey(
      SETTINGS_MANIFEST,
      'columns',
      'doing',
      'description',
      null
    );
    expect(removed).not.toContain('Underway.');
    expectOnlyDiff(SETTINGS_MANIFEST, removed, (line) => line.includes('Underway.'));

    expect(patchManifestEntryKey(SETTINGS_MANIFEST, 'columns', 'todo', 'description', null)).toBe(
      SETTINGS_MANIFEST
    );
  });

  it('writes booleans bare and never touches the id line', () => {
    const result = patchManifestEntryKey(SETTINGS_MANIFEST, 'kinds', 'spike', 'creatable', false);
    expect(result).toContain(
      '  - id: spike\n    creatable: false\n    badge: s # keep distinct from spec'
    );

    expect(() =>
      patchManifestEntryKey(SETTINGS_MANIFEST, 'kinds', 'spike', 'id', 'other')
    ).toThrowError(/immutable/);
  });

  it('404-shaped failure for an id the section does not declare', () => {
    expect(() =>
      patchManifestEntryKey(SETTINGS_MANIFEST, 'columns', 'nope', 'label', 'X')
    ).toThrowError(/no columns entry with id 'nope'/);
  });
});

describe('removeManifestListEntry', () => {
  it('removes exactly the entry block, leaving comments above it', () => {
    const result = removeManifestListEntry(SETTINGS_MANIFEST, 'columns', 'doing');

    expect(result).toContain(
      '  # workflow lanes, in order\n  - id: todo\n    label: Todo\n  - id: done\n'
    );
    expect(result).not.toContain('Doing');
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.columns.map((c) => c.id)).toEqual(['todo', 'done']);
  });

  it('removing the LAST entry of the section keeps the following blank line and key', () => {
    const result = removeManifestListEntry(SETTINGS_MANIFEST, 'kinds', 'spec');

    expect(result).toContain('  - id: spike\n    badge: s # keep distinct from spec\n');
    expect(result).not.toContain('creatable: false');
  });
});

describe('patchManifestTopLevelScalar', () => {
  it('replaces an existing key in place', () => {
    const result = patchManifestTopLevelScalar(SETTINGS_MANIFEST, 'defaultColumn', 'doing');

    expect(result).toContain('\ndefaultColumn: doing\n');
    expectOnlyDiff(SETTINGS_MANIFEST, result, (line) => line.startsWith('defaultColumn:'));
  });

  it('inserts a missing key directly after the columns block', () => {
    const result = patchManifestTopLevelScalar(SETTINGS_MANIFEST, 'doneColumn', 'done');

    expect(result).toContain('    label: Done\ndoneColumn: done\n\ndefaultColumn: todo');
    const parsed = parseTasksManifest(result);
    expect(parsed.ok && parsed.manifest.doneColumn).toBe('done');
  });
});
