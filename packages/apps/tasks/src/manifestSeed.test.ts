import { describe, expect, it } from 'vitest';

import { parseTasksManifest } from './manifest.js';
import { tasksManifestSeedContent } from './manifestSeed.js';

describe('tasksManifestSeedContent', () => {
  it('writes the minimal manifest byte for byte — no defaulted keys', () => {
    const content = tasksManifestSeedContent({
      columns: [
        { id: 'todo', label: 'Todo' },
        { id: 'in-progress', label: 'In progress' },
        { id: 'done', label: 'Done' },
      ],
      kinds: [{ id: 'task' }],
    });

    expect(content).toBe(
      [
        'version: 1',
        'columns:',
        '  - id: todo',
        '    label: Todo',
        '  - id: in-progress',
        '    label: In progress',
        '  - id: done',
        '    label: Done',
        'kinds:',
        '  - id: task',
        '',
      ].join('\n')
    );
  });

  it('writes descriptions only when provided and kind labels only when non-default', () => {
    const content = tasksManifestSeedContent({
      columns: [{ id: 'todo', label: 'Todo', description: 'Not started yet.' }],
      kinds: [
        { id: 'memo', label: 'Memo' }, // default capitalization — omitted
        { id: 'rfc', label: 'Design RFC' }, // custom — written
      ],
    });

    expect(content).toBe(
      [
        'version: 1',
        'columns:',
        '  - id: todo',
        '    label: Todo',
        '    description: Not started yet.',
        'kinds:',
        '  - id: memo',
        '  - id: rfc',
        '    label: Design RFC',
        '',
      ].join('\n')
    );
  });

  it('quotes scalars that YAML would otherwise reinterpret', () => {
    const content = tasksManifestSeedContent({
      columns: [{ id: 'todo', label: 'Todo: soon', description: 'true' }],
      kinds: [{ id: 'note' }],
    });

    expect(content).toContain('    label: "Todo: soon"');
    expect(content).toContain('    description: "true"');
  });

  it('always emits a manifest the parser accepts with no warnings', () => {
    const content = tasksManifestSeedContent({
      columns: [
        { id: 'todo', label: 'Todo' },
        { id: 'done', label: 'Done', description: 'Landed in main.' },
      ],
      kinds: [{ id: 'task' }, { id: 'note', label: 'Field note' }],
    });

    const parsed = parseTasksManifest(content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.warnings).toEqual([]);
    expect(parsed.manifest.defaultColumn).toBe('todo');
    expect(parsed.manifest.doneColumn).toBe('done');
    expect(parsed.manifest.kinds.map((kind) => kind.dir)).toEqual(['tasks', 'notes']);
    expect(parsed.manifest.kinds[1].label).toBe('Field note');
  });
});
