// Which packages' browser tests a CI run starts: those a pull request changes,
// every one when the run is started by hand, none on a push to main.
//
//   node tooling/browser-projects.ts <base>   the packages with browser tests changed since
//                                              <base> (a ref or a commit), one name a line
//   node tooling/browser-projects.ts --all    every package with browser tests
//   node tooling/browser-projects.ts          in CI: decided by GITHUB_EVENT_NAME and the
//                                              event's payload, and written to GITHUB_OUTPUT
//                                              as `projects` (names) and `args` (--project …)
//
// A package has browser tests when it keeps a vitest.browser.config.ts at its root.
// A package is changed when the diff from <base> (from where the pull request
// left main) touches a file under it. A change to common or to the tooling runs
// no other package's tests: the run by hand at a stage's close covers that.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BROWSER_CONFIG = 'vitest.browser.config.ts';

/** A workspace: its folder relative to the root, and its package's name. */
export interface BrowserPackage {
  dir: string;
  name: string;
}

/** Every package (`'all'`), those changed since a base commit, or none (`null`). */
export type Selection = 'all' | { base: string } | null;

/** The part of a GitHub Actions event's payload this reads. */
export interface GitHubEvent {
  pull_request?: { base?: { sha?: string } };
}

/**
 * Every workspace that keeps a browser config, as `{ dir, name }`: its folder
 * relative to `root` and its package's name, which is its vitest project's name.
 */
export function browserPackages(root: string = repoRoot): BrowserPackage[] {
  const { workspaces = [] } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    workspaces?: string[];
  };
  const dirs = workspaces.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern];
    const parent = pattern.slice(0, -2);
    if (!existsSync(join(root, parent))) return [];
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`);
  });
  return dirs
    .filter((dir) => existsSync(join(root, dir, BROWSER_CONFIG)))
    .map((dir) => ({
      dir,
      name: (JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as { name: string })
        .name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The names of the packages that hold one of `files` (paths relative to the
 * repository's root, as git prints them).
 */
export function changedProjects(files: string[], packages: BrowserPackage[]): string[] {
  return packages
    .filter(({ dir }) => files.some((file) => file.startsWith(`${dir}/`)))
    .map(({ name }) => name);
}

/**
 * The files changed between where HEAD left `base` and HEAD (`git diff base...HEAD`),
 * a rename as both its paths.
 */
export function changedFiles(base: string, root: string = repoRoot): string[] {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

/**
 * What a GitHub Actions event asks for: every package (`'all'`), those changed
 * since a base commit (`{ base }`), or none (`null`).
 */
export function selectionFor(eventName: string, event: GitHubEvent): Selection {
  if (eventName === 'workflow_dispatch') return 'all';
  if (eventName === 'pull_request') {
    const base = event.pull_request?.base?.sha;
    if (!base) throw new Error('a pull_request event with no base commit');
    return { base };
  }
  return null;
}

/** The project names a selection runs. */
export function projectsFor(selection: Selection, root: string = repoRoot): string[] {
  if (selection === null) return [];
  const packages = browserPackages(root);
  if (selection === 'all') return packages.map(({ name }) => name);
  return changedProjects(changedFiles(selection.base, root), packages);
}

/** The arguments `npm run test:browser --` takes to run just these projects. */
export function projectArgs(projects: string[]): string {
  return projects.map((name) => `--project ${name}`).join(' ');
}

function main(args: string[]): void {
  let selection: Selection;
  if (args.length === 1 && args[0] === '--all') selection = 'all';
  else if (args.length === 1 && !args[0].startsWith('-')) selection = { base: args[0] };
  else if (args.length === 0 && process.env.GITHUB_EVENT_NAME) {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')
    ) as GitHubEvent;
    selection = selectionFor(process.env.GITHUB_EVENT_NAME, event);
  } else {
    console.error('usage: node tooling/browser-projects.ts <base-ref> | --all');
    process.exit(1);
  }
  const projects = projectsFor(selection);
  for (const name of projects) console.log(name);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `projects=${projects.join(' ')}\nargs=${projectArgs(projects)}\n`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
