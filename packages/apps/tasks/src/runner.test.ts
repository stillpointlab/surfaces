// The tasks module on common's runner over a port in memory: what a host that
// knows only files (the harness, the local host) runs. The host's facts and the
// snapshot's pending moves are the module's `fromChanges` over the port's
// changes, which carry each file's text at the last commit.
import {
  createInstance,
  createMemoryPort,
  projectView,
  runOp,
} from '@stillpointlab/common-format/host';
import { describe, expect, it } from 'vitest';

import { tasksModule } from './module.js';

import type { SharedTaskBoardState, SharedTaskCard } from './types.js';
import type { AnyAppModule } from '@stillpointlab/common-format/app';
import type { LoadedInstance, MemoryPort, RunnerHost } from '@stillpointlab/common-format/host';

const module = tasksModule as AnyAppModule;
const NOW = '2026-11-14T12:00:00.000Z';
const MANIFEST = 'docs/tasks/tasks.yaml';
const PHASE1 = 'docs/tasks/stage1/phase1';
const PHASE2 = 'docs/tasks/stage1/phase2';
const CARD = `${PHASE1}/specs/login.md`;

const FILES: Record<string, string> = {
  [MANIFEST]: [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: in-progress',
    '    label: In progress',
    '  - id: done',
    '    label: Done',
    'kinds:',
    '  - id: spec',
    '  - id: seed',
    'current:',
    '  stage: 1',
    '  phase: 1',
    '',
  ].join('\n'),
  [CARD]: '---\ncolumn: todo\ntitle: Login\n---\n\n# Login\n',
  [`${PHASE1}/specs/other.md`]: '---\ncolumn: done\n---\n\n# Other\n',
  [`${PHASE2}/specs/.gitkeep`]: '',
  'README.md': 'The repository.\n',
};

function hostOver(files: Record<string, string> = FILES): RunnerHost & { port: MemoryPort } {
  const port = createMemoryPort(files);
  return {
    port,
    know: async (m: AnyAppModule, loaded: LoadedInstance) =>
      m.fromChanges(port.changes(), loaded.snapshot),
    now: () => NOW,
  };
}

const cardOf = (reply: object): SharedTaskCard => (reply as { card: SharedTaskCard }).card;

describe('tasks on the runner', () => {
  it('moves a card to another column: changed, and dirty with the column it had', async () => {
    const host = hostOver();
    const answer = await runOp(host, module, MANIFEST, {
      op: { type: 'move', path: CARD, column: 'in-progress' },
      view: { type: 'board', path: PHASE1 },
    });
    if (!answer.ok) throw new Error(answer.message);
    expect(cardOf(answer.reply)).toMatchObject({
      path: CARD,
      column: 'in-progress',
      changed: true,
      dirty: true,
      versionColumn: 'todo',
    });
  });

  it('a card moved back to its column is changed no longer once its text is the same', async () => {
    const host = hostOver();
    await runOp(host, module, MANIFEST, { op: { type: 'move', path: CARD, column: 'done' } });
    const back = await runOp(host, module, MANIFEST, {
      op: { type: 'move', path: CARD, column: 'todo' },
    });
    if (!back.ok) throw new Error(back.message);
    expect(cardOf(back.reply).dirty).toBeFalsy();
  });

  it('moves a card to another phase: it shows where it moved from, the old path hidden', async () => {
    const host = hostOver();
    const answer = await runOp(host, module, MANIFEST, {
      op: { type: 'move-file', path: CARD, target: { boardPath: PHASE2, column: 'todo' } },
    });
    if (!answer.ok) throw new Error(answer.message);
    const moved = cardOf(answer.reply);
    expect(moved).toMatchObject({ changed: true, movedFrom: CARD });
    expect(moved.path.startsWith(`${PHASE2}/`)).toBe(true);
    expect(host.port.changes()).toContainEqual({
      path: moved.path,
      status: 'moved',
      from: CARD,
      base: FILES[CARD],
    });

    const phase1 = await projectView(host, module, MANIFEST, { type: 'board', path: PHASE1 });
    const phase2 = await projectView(host, module, MANIFEST, { type: 'board', path: PHASE2 });
    const paths = (answer: typeof phase1): string[] =>
      answer.ok ? (answer.state as SharedTaskBoardState).cards.map((card) => card.path) : [];
    expect(paths(phase1)).not.toContain(CARD);
    expect(paths(phase2)).toContain(moved.path);
  });

  it('creates a card stamped with the host’s time, new and changed', async () => {
    const host = hostOver();
    const answer = await runOp(host, module, MANIFEST, {
      op: { type: 'create-card', boardPath: PHASE1, title: 'Sign up', kind: 'spec' },
    });
    if (!answer.ok) throw new Error(answer.message);
    const card = cardOf(answer.reply);
    expect(card).toMatchObject({ changed: true });
    expect(host.port.changes()).toEqual([{ path: card.path, status: 'new' }]);
    expect(host.port.files()[card.path]).toContain(NOW.slice(0, 10));
  });

  it('a created card moved to another phase is only renamed: still new, with no old path', async () => {
    const host = hostOver();
    const created = await runOp(host, module, MANIFEST, {
      op: { type: 'create-card', boardPath: PHASE1, title: 'Sign up', kind: 'spec' },
    });
    if (!created.ok) throw new Error(created.message);
    const moved = await runOp(host, module, MANIFEST, {
      op: {
        type: 'move-file',
        path: cardOf(created.reply).path,
        target: { boardPath: PHASE2, column: 'todo' },
      },
    });
    if (!moved.ok) throw new Error(moved.message);
    expect(cardOf(moved.reply).movedFrom).toBeUndefined();
    expect(host.port.changes()).toEqual([{ path: cardOf(moved.reply).path, status: 'new' }]);
  });

  it('creates a task project in a folder, and refuses one that does not fit', async () => {
    const host = hostOver({ 'README.md': 'r' });
    const input = {
      columns: [
        { id: 'todo', label: 'Todo' },
        { id: 'done', label: 'Done' },
      ],
      kinds: [{ id: 'spec' }],
    };
    expect(await createInstance(host, module, { folder: 'plans', input })).toEqual({
      ok: true,
      manifestPath: 'plans/tasks.yaml',
    });
    const nav = await projectView(host, module, 'plans/tasks.yaml', { type: 'nav' });
    expect(nav.ok && nav.state).not.toBeNull();

    const again = await createInstance(host, module, { folder: 'plans', input });
    expect(again.ok).toBe(false);
    expect(again.ok || tasksModule.refusalClass(again.code, 'create')).toBe('conflict');
  });
});
