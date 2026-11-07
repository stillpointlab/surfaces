import { describeAppCore } from '@stillpointlab/common-format/testing/app';

import {
  collectUnprojectedFileWarnings,
  detectBoards,
  detectPool,
  kindPathsOf,
} from './boardDetection.js';
import { parseFrontmatter, rewriteFrontmatter } from './frontmatter.js';
import { tasksLifecycle } from './lifecycle.js';
import { rewriteRelativeLinks } from './linkRewrite.js';
import { parseTasksManifest, validateManifestAgainstTree } from './manifest.js';
import {
  appendManifestListEntry,
  appendManifestTag,
  patchManifestEntryKey,
  removeManifestListEntry,
  rewriteManifestCurrent,
} from './manifestRewrite.js';

import type { TreeNode } from './types.js';
import type { Result } from '@stillpointlab/common-format/app';
import type { AppFixture, AppMountResult } from '@stillpointlab/common-format/testing/app';

function written(result: Result<{ content: string }>): string {
  if (!result.ok) throw new Error(`the rewrite refused: ${result.code} ${result.message}`);
  return result.content;
}

// The tasks core held to the app core suite (ADR-0028 decision 1: a rewrite
// keeps what a hand-edited file holds). Fixture folders hold the manifest at
// the root; README files and agent helper files beside cards stay unclaimed.

const minimal = {
  'tasks.yaml': [
    'version: 1',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: done',
    '    label: Done',
    'kinds:',
    '  - id: spec',
    '',
  ].join('\n'),
  'stage1/phase1/specs/first.md': '---\ncolumn: todo\n---\n\n# Spec: first\n',
};

const configuredManifest = [
  '# Tasks for the workshop repository.',
  'version: 1',
  'columns:',
  '  - id: todo',
  '    label: Todo',
  '  # handed to an agent, not yet landed',
  '  - id: in-progress',
  '    label: In progress',
  '  - id: done',
  '    label: Done',
  '',
  'defaultColumn: todo',
  'doneColumn: done',
  '',
  'kinds:',
  '  - id: seed',
  '    badge: sd',
  '  - id: spec',
  '    template: spec.template.md',
  '',
  '# The board opens here.',
  'current:',
  '  stage: 1',
  '  phase: 2',
  '',
  'tags:',
  '  # Type',
  '  - code',
  '  - docs',
  '',
].join('\n');

const configured = {
  'tasks.yaml': configuredManifest,
  'spec.template.md': '---\ncolumn: todo\n---\n\n# Spec: title\n',
  'stage1/phase2/specs/move-the-core.md': [
    '---',
    'column: in-progress',
    '# set by the board',
    'tags: [code]',
    '---',
    '',
    '# Spec: move the core',
    '',
    'See the [seed](../../../unassigned/seeds/idea.md).',
    '',
  ].join('\n'),
  'stage1/phase2/specs/no-frontmatter.md': '# Spec: written by hand\n\nNo block yet.\n',
  'unassigned/seeds/idea.md': '---\ncolumn: todo\n---\n\n# Seed: an idea\n',
  'unassigned/order.yaml': '# Backlog pool priority order\n- unassigned/seeds/idea.md\n',
  // Agents leave these beside cards. Not the app's, and the folder still mounts.
  'stage1/phase2/specs/README.md': 'Notes for whoever picks these up.\n',
  'stage1/phase2/specs/scratch.txt': 'helper output\n',
};

// Shaped like this repository's own docs/tasks/.
const surfacesShaped = {
  'tasks.yaml': [
    'version: 1',
    '',
    '# Three states.',
    'columns:',
    '  - id: todo',
    '    label: Todo',
    '  - id: done',
    '    label: Done',
    '',
    'frontmatterKey: column',
    'defaultColumn: todo',
    'doneColumn: done',
    '',
    'kinds:',
    '  - id: seed',
    '    badge: sd',
    '  - id: spike',
    '  - id: brief',
    '  - id: spec',
    '    badge: sp',
    '    creatable: false',
    '',
    'current:',
    '  stage: 2',
    '  phase: 3',
    '',
  ].join('\n'),
  'stage2/phase1/seeds/apps-breakout.md': '---\ncolumn: done\n---\n\n# Seed\n',
  'stage2/phase1/spikes/apps-breakout.md': '---\ncolumn: done\npr: 35\n---\n\n# Spike\n',
  'stage2/phase1/briefs/apps_breakout.md': '---\ncolumn: done\n---\n\n# Brief\n',
  'stage2/phase3/specs/tasks-core.md': '---\ncolumn: todo\n---\n\n# Spec: tasks core\n',
  'unassigned/seeds/result-types.md': '---\ncolumn: todo\n---\n\n# Seed\n',
  'unassigned/order.yaml': '- unassigned/seeds/result-types.md\n',
  'spec.template.md': '# Spec\n',
};

/** Mount the way Context Manager's tasks lifecycle derives the scope. */
function mount(files: AppFixture, manifestPath: string): AppMountResult {
  const parsed = parseTasksManifest(files[manifestPath] ?? '');
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const nodes: TreeNode[] = Object.keys(files).map((path) => ({ path, type: 'blob' }));
  const treeErrors = validateManifestAgainstTree(parsed.manifest, nodes);
  if (treeErrors.length > 0) return { ok: false, errors: treeErrors };

  const kinds = parsed.manifest.kinds;
  const scope = new Set<string>([manifestPath]);
  for (const board of detectBoards(nodes, manifestPath, kinds)) {
    for (const path of kindPathsOf(board, kinds)) scope.add(path);
  }
  const pool = detectPool(nodes, manifestPath, kinds);
  for (const path of kindPathsOf(pool, kinds)) scope.add(path);
  scope.add(pool.orderPath);
  return {
    ok: true,
    scope,
    warnings: [...parsed.warnings, ...collectUnprojectedFileWarnings(nodes, manifestPath, kinds)],
  };
}

const manifestParses = (text: string): boolean => parseTasksManifest(text).ok;
const cardParses = (text: string): boolean => parseFrontmatter(text).parseError === undefined;

const card = 'stage1/phase2/specs/move-the-core.md';
const exists = (path: string): boolean => path in configured;

describeAppCore('tasks', {
  manifest: 'tasks.yaml',
  lifecycle: tasksLifecycle,
  fixtures: { minimal, configured, 'surfaces-shaped': surfacesShaped },
  mount,
  rewrites: [
    {
      name: 'move a card',
      fixture: 'configured',
      path: card,
      apply: (text) => rewriteFrontmatter(text, { column: 'done' }),
      reparses: cardParses,
    },
    {
      name: "set a card's tags",
      fixture: 'configured',
      path: card,
      apply: (text) => rewriteFrontmatter(text, { tags: ['code', 'docs'] }),
      reparses: cardParses,
    },
    {
      name: 'move a card that has no frontmatter',
      fixture: 'configured',
      path: 'stage1/phase2/specs/no-frontmatter.md',
      apply: (text) => rewriteFrontmatter(text, { column: 'done' }),
      reparses: cardParses,
    },
    {
      name: 'move a minimal card',
      fixture: 'minimal',
      path: 'stage1/phase1/specs/first.md',
      apply: (text) => rewriteFrontmatter(text, { column: 'done' }),
      reparses: cardParses,
    },
    {
      name: 'relink a card moved out of the pool',
      fixture: 'configured',
      path: card,
      apply: (text) =>
        rewriteRelativeLinks(text, 'stage1/phase2/specs', 'stage1/phase3/specs', exists).content,
      reparses: cardParses,
    },
    {
      name: 'move current',
      fixture: 'configured',
      path: 'tasks.yaml',
      apply: (text) => rewriteManifestCurrent(text, { stage: 1, phase: 3 }),
      reparses: manifestParses,
    },
    {
      name: 'add a column',
      fixture: 'configured',
      path: 'tasks.yaml',
      apply: (text) =>
        written(
          appendManifestListEntry(text, 'columns', { id: 'review', fields: [['label', 'Review']] })
        ),
      reparses: manifestParses,
    },
    {
      name: 'relabel a column',
      fixture: 'configured',
      path: 'tasks.yaml',
      apply: (text) => written(patchManifestEntryKey(text, 'columns', 'todo', 'label', 'To do')),
      reparses: manifestParses,
    },
    {
      name: 'remove a column',
      fixture: 'configured',
      path: 'tasks.yaml',
      apply: (text) => written(removeManifestListEntry(text, 'columns', 'in-progress')),
      reparses: manifestParses,
    },
    {
      name: 'add a tag',
      fixture: 'configured',
      path: 'tasks.yaml',
      apply: (text) => written(appendManifestTag(text, 'infra')),
      reparses: manifestParses,
    },
    {
      name: 'move current in a surfaces-shaped manifest',
      fixture: 'surfaces-shaped',
      path: 'tasks.yaml',
      apply: (text) => rewriteManifestCurrent(text, { stage: 2, phase: 4 }),
      reparses: manifestParses,
    },
    {
      name: 'add a column to a minimal manifest',
      fixture: 'minimal',
      path: 'tasks.yaml',
      apply: (text) =>
        written(
          appendManifestListEntry(text, 'columns', { id: 'doing', fields: [['label', 'Doing']] })
        ),
      reparses: manifestParses,
    },
  ],
});
