// The choice of which browser tests a CI run starts. The workflow only calls
// the script, so what it decides is tested here: in a repository made for each
// test, and on this one.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  browserPackages,
  changedProjects,
  projectArgs,
  projectsFor,
  selectionFor,
} from './browser-projects.ts';

const script = join(import.meta.dirname, 'browser-projects.ts');
const repoRoot = join(import.meta.dirname, '..');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'browser-projects-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A package at `dir`, with a browser config or without. */
function addPackage(dir: string, name: string, browser: boolean) {
  write(`${dir}/package.json`, JSON.stringify({ name }));
  write(`${dir}/src/index.ts`, 'export {};\n');
  if (browser) write(`${dir}/vitest.browser.config.ts`, 'export default {};\n');
}

function git(...args: string[]) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
    ].concat(args),
    { cwd: root, encoding: 'utf8' }
  );
}

/** A repository like this one: a workspace of each shape, two with browser tests. */
function makeRepo() {
  write(
    'package.json',
    JSON.stringify({
      workspaces: [
        'packages/common',
        'packages/formats/*',
        'packages/hosts/*',
        'tooling/template/*',
      ],
    })
  );
  addPackage('packages/common', '@t/common', false);
  addPackage('packages/formats/video', '@t/video', true);
  addPackage('packages/formats/video-extra', '@t/video-extra', false);
  addPackage('packages/formats/md', '@t/md', false);
  addPackage('tooling/template/url-format', '@t/sample-url', true);
  write('docs/notes.md', 'notes\n');
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
}

describe('browserPackages', () => {
  it('lists the workspaces that keep a browser config, by package name', () => {
    makeRepo();

    expect(browserPackages(root)).toEqual([
      { dir: 'tooling/template/url-format', name: '@t/sample-url' },
      { dir: 'packages/formats/video', name: '@t/video' },
    ]);
  });

  it("finds this repository's URL template", () => {
    expect(browserPackages(repoRoot)).toContainEqual({
      dir: 'tooling/template/url-format',
      name: '@stillpointlab/sample-url-format',
    });
  });
});

describe('changedProjects', () => {
  const packages = [
    { dir: 'packages/formats/video', name: '@t/video' },
    { dir: 'tooling/template/url-format', name: '@t/sample-url' },
  ];

  it('names a package when a file under it changed', () => {
    expect(changedProjects(['packages/formats/video/src/clip.ts'], packages)).toEqual(['@t/video']);
    expect(
      changedProjects(
        ['tooling/template/url-format/README.md', 'packages/formats/video/dev/media/a.webm'],
        packages
      )
    ).toEqual(['@t/video', '@t/sample-url']);
  });

  it('names none for docs, the root, common, the tooling or a package whose name only begins alike', () => {
    expect(
      changedProjects(
        [
          'docs/tasks/tasks.yaml',
          'README.md',
          'package-lock.json',
          'packages/common/src/index.ts',
          'tooling/vitest.ts',
          '.github/workflows/ci.yml',
          'packages/formats/video-extra/src/index.ts',
        ],
        packages
      )
    ).toEqual([]);
  });
});

describe('selectionFor', () => {
  it('runs every package by hand, those changed in a pull request, and none on a push', () => {
    expect(selectionFor('workflow_dispatch', {})).toBe('all');
    expect(selectionFor('pull_request', { pull_request: { base: { sha: 'abc123' } } })).toEqual({
      base: 'abc123',
    });
    expect(selectionFor('push', {})).toBeNull();
  });

  it('refuses a pull request with no base commit rather than guess', () => {
    expect(() => selectionFor('pull_request', {})).toThrow(/no base commit/);
  });
});

describe('projectsFor, in a repository', () => {
  it('runs only what a branch changed since it left main, not what main did since', () => {
    makeRepo();
    git('switch', '-q', '-c', 'feature');
    write('packages/formats/video/src/index.ts', 'export const a = 1;\n');
    write('packages/common/src/index.ts', 'export const b = 1;\n');
    git('commit', '-qam', 'feature');
    git('switch', '-q', 'main');
    write('tooling/template/url-format/src/index.ts', 'export const c = 1;\n');
    git('commit', '-qam', 'main moved on');
    git('switch', '-q', 'feature');

    expect(projectsFor({ base: 'main' }, root)).toEqual(['@t/video']);
  });

  it('runs none for a branch that changed only docs, and every one by hand', () => {
    makeRepo();
    git('switch', '-q', '-c', 'docs');
    write('docs/notes.md', 'more notes\n');
    git('commit', '-qam', 'docs');

    expect(projectsFor({ base: 'main' }, root)).toEqual([]);
    expect(projectsFor('all', root)).toEqual(['@t/sample-url', '@t/video']);
    expect(projectsFor(null, root)).toEqual([]);
  });

  it('runs a package a branch moved, under its new place', () => {
    makeRepo();
    git('switch', '-q', '-c', 'move');
    git('mv', 'packages/formats/md', 'packages/formats/notes');
    write('packages/formats/notes/vitest.browser.config.ts', 'export default {};\n');
    git('add', '.');
    git('commit', '-qm', 'move');

    expect(projectsFor({ base: 'main' }, root)).toEqual(['@t/md']);
  });
});

describe('the command, as CI calls it', () => {
  function run(env: Record<string, string>) {
    const output = join(root, 'github-output');
    writeFileSync(output, '');
    const stdout = execFileSync('node', [script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output, ...env },
    });
    return { stdout, output: readFileSync(output, 'utf8') };
  }

  it('writes every project and its arguments for a run by hand', () => {
    const event = join(root, 'event.json');
    writeFileSync(event, '{}');

    const { stdout, output } = run({
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_EVENT_PATH: event,
    });

    expect(stdout).toContain('@stillpointlab/sample-url-format\n');
    expect(output).toMatch(/^projects=.*@stillpointlab\/sample-url-format/m);
    expect(output).toMatch(/^args=.*--project @stillpointlab\/sample-url-format/m);
  });

  it('writes empty outputs for a pull request that changed nothing', () => {
    const event = join(root, 'event.json');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    writeFileSync(event, JSON.stringify({ pull_request: { base: { sha: head.trim() } } }));

    const { stdout, output } = run({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event });

    expect(stdout).toBe('');
    expect(output).toBe('projects=\nargs=\n');
  });
});

describe('projectArgs', () => {
  it('passes each project to vitest by name', () => {
    expect(projectArgs(['@t/a', '@t/b'])).toBe('--project @t/a --project @t/b');
    expect(projectArgs([])).toBe('');
  });
});
