// `<spl-tasks-app>` in the harness: the app as a page, over the memory host.
// This is a host's client half, as the local host or Context Manager drives the
// shell: it answers the shell's ops (a core op through the module with the
// shell's `opView`, its reply passed to `learn`; the host ops; `project` and
// `refresh` from the files in memory), resolves `navigate` through the module's
// pages under a fragment base, reads the page again on `reload-request`, and
// opens a small options menu for `open-options-menu`. The shell answers
// `refresh-stage` and `close-candidates` itself, so this host does not: were
// one to reach it, it would be refused as unknown.
import './shell.css';

import { answerOps, fail, isCoreOp, matchAppPage, ok } from '@stillpointlab/common-format/app';

import { memoryAnswer } from '../../../../tooling/harness/memory-host';
import {
  projectResolvedCard,
  referencesTo,
  resolveTasks,
  tasksCore,
  tasksModule,
  tasksPages,
} from '../src/index.js';

import { fixedPath, knowOf, read } from './workspace.js';

import type { Workspace } from './workspace.js';
import type { HarnessElements } from '../../../../tooling/harness/types';
import type { TasksElementOps, TasksViews } from '../src/index.js';
import type { TasksApp } from '../src/shell/index.js';
import type {
  AppOp,
  AppShellInput,
  AppShellOps,
  AppView,
  Result,
} from '@stillpointlab/common-format/app';

export const SHELL_TAG = 'spl-tasks-app';

/** Where the shell's pages hang: a fragment, as the local host mounts an app. */
const baseOf = (ws: Workspace): string => `#/app/${ws.manifestPath}`;

type Op = { type: string } & Record<string, unknown>;

/** One menu item, as the board and the strip ask for them. */
interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** Any view of the workspace, as a host's one read answers it: checked by the bounds, then projected. */
function projectView(ws: Workspace, input: unknown): Result<{ state: object | null }> {
  const checked = tasksModule.bounds.view(input);
  if (!checked.ok) return checked;
  const view = checked.view as AppView<TasksViews>;
  const { snapshot, facts } = read(ws);
  return ok({ state: tasksCore.project(snapshot, view, facts) as object | null });
}

interface ShellHarness {
  shell: TasksApp;
  workspace: () => Workspace;
  /** The href of the page on screen, read again on `reload-request`. */
  href: string;
}

let harness: ShellHarness | null = null;

/** Show the shell's block and hide every other element's; or hide the shell's. */
export function showShell(elements: HarnessElements, on: boolean): void {
  for (const [tag, el] of Object.entries(elements.extras)) {
    const block = el.closest<HTMLElement>('.extra');
    if (!block) continue;
    if (tag === SHELL_TAG) block.hidden = !on;
    else if (on) block.hidden = true;
  }
}

/** The shell over `ws`, at the landing page: the host attached once, for the page's life. */
export function openShell(elements: HarnessElements, workspace: () => Workspace): void {
  const shell = elements.extras[SHELL_TAG] as TasksApp;
  if (!harness) {
    harness = { shell, workspace, href: baseOf(workspace()) };
    attach(harness);
    const pane = shell.parentElement;
    pane?.classList.add('tasks-shell-harness');
    if (pane) pane.style.height = 'auto';
  }
  harness.workspace = workspace;
  showShell(elements, true);
  void open(harness, baseOf(workspace()));
}

function attach(h: ShellHarness): void {
  const { shell } = h;
  /** The view the op being answered was sent with: the shell's `opView`. */
  let opView: AppView<TasksViews> | undefined;
  const ws = (): Workspace => h.workspace();

  const cardAt = (path: string): Result<object> => {
    const { snapshot, facts } = read(ws());
    const resolved = resolveTasks(snapshot);
    const card = resolved?.ok ? projectResolvedCard(snapshot, resolved.tasks, path, facts) : null;
    return card ? ok({ card }) : fail('NOT_FOUND', `No card at ${path}`);
  };

  const inMemory = memoryAnswer({
    module: tasksModule,
    // The module's facts from the port's changes, with the fixture's pinned ones under them.
    workspace: () => {
      const at = ws();
      return {
        port: at.port,
        manifestPath: at.manifestPath,
        know: async (_module, loaded) => knowOf(at, loaded.snapshot),
      };
    },
    view: () => opView,
    // A host's own ops; the shell answers the two that only read a view.
    hostOps: {
      // A resolve keeps one side of a divergence; here, the facts drop it.
      resolve: (op) => {
        const path = op.path as string;
        delete ws().fixed[fixedPath(ws(), path)]?.diverged;
        return cardAt(path);
      },
      'scan-references': (op) =>
        ok({ references: referencesTo(read(ws()).snapshot, op.path as string) }),
      'read-file': (op) => {
        const content = ws().port.files()[op.path as string];
        return typeof content === 'string'
          ? ok({ content })
          : fail('NOT_FOUND', `No file at ${op.path as string}`);
      },
    },
  });

  answerOps<TasksElementOps & AppShellOps>(
    shell,
    async (op: AppOp<TasksElementOps & AppShellOps>): Promise<Result<object>> => {
      if (op.type === 'project') return projectView(ws(), op.view);
      // The memory host's files are their own source: there is nothing to bring up to date.
      if (op.type === 'refresh') return ok();
      // The memory host reads the view before its first await, so it is this op's alone.
      opView = shell.opView(op) as AppView<TasksViews> | undefined;
      const pending = inMemory(op as Op);
      opView = undefined;
      const reply = await pending;
      if (reply.ok && isCoreOp(tasksModule, op.type)) shell.learn(op, reply);
      return reply;
    }
  );

  shell.addEventListener('navigate', (event) => {
    const { href } = (event as CustomEvent<{ href: string }>).detail;
    if (!href.startsWith(baseOf(ws()))) return;
    event.preventDefault();
    void open(h, href);
  });
  shell.addEventListener('reload-request', () => void open(h, h.href));
  shell.addEventListener('open-options-menu', (event) => {
    const { items, anchor } = (event as CustomEvent<{ items: MenuItem[]; anchor: Element }>).detail;
    openMenu(event.target as HTMLElement, items, anchor);
  });
}

/** Resolve a page under the base through the module's pages, as a host's router does. */
async function open(h: ShellHarness, href: string): Promise<void> {
  const ws = h.workspace();
  const base = baseOf(ws);
  const [subPath = '', query = ''] = href.slice(base.length).split('?');
  const matched = matchAppPage(tasksPages, subPath);
  const project = async (view: unknown): Promise<object | null> => {
    const read = projectView(ws, view);
    return read.ok ? read.state : null;
  };
  const resolution = matched
    ? await matched.page.resolve({
        params: matched.params,
        query: Object.fromEntries(new URLSearchParams(query)),
        base,
        manifestPath: ws.manifestPath,
        project,
      })
    : { notFound: true as const };
  if ('redirect' in resolution) return open(h, resolution.redirect);
  if ('notFound' in resolution) {
    notify(h.shell, `Not found: ${href}`);
    return;
  }
  const state = resolution.view ? await project(resolution.view) : null;
  if (state === null && resolution.view && !matched!.page.emptyWhenMissing) {
    notify(h.shell, `Not found: ${href}`);
    return;
  }
  h.href = href;
  const input: AppShellInput = {
    base,
    back: { href: '#project', label: 'Back to project' },
    location: 'harness/workshop',
    view: resolution.view,
    state,
    ...(resolution.extras ? { extras: resolution.extras } : {}),
  };
  h.shell.setState(input);
}

/** A note in the harness's event log, as a host's banner would show it. */
function notify(shell: HTMLElement, message: string): void {
  shell.dispatchEvent(
    new CustomEvent('notification', { detail: { message, type: 'warning' }, bubbles: true })
  );
}

// ---- A small options menu, as a host's -----------------------------------------

let closeMenu: (() => void) | null = null;

/** The host's menu: the items under the anchor; a choice answers on the element that asked. */
function openMenu(asker: HTMLElement, items: readonly MenuItem[], anchor: Element): void {
  closeMenu?.();
  const menu = document.createElement('div');
  menu.className = 'tasks-harness-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.disabled = item.disabled === true;
    if (item.title) button.title = item.title;
    button.addEventListener('click', () => {
      closeMenu?.();
      asker.dispatchEvent(new CustomEvent('options-menu-select', { detail: { itemId: item.id } }));
    });
    menu.append(button);
  }
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  document.body.append(menu);
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

  const outside = (event: Event): void => {
    if (!menu.contains(event.target as Node)) closeMenu?.();
  };
  const escape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeMenu?.();
  };
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  document.addEventListener('keydown', escape);
  closeMenu = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    closeMenu = null;
  };
}
