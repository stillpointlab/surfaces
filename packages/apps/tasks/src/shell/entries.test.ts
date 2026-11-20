// @vitest-environment jsdom
/// <reference lib="dom" />
import { describe, expect, it, vi } from 'vitest';

// The root entry is the DOM-free core: importing it evaluates none of the
// elements or the shell and registers nothing. `./shell` registers the shell and
// the two elements it lays out, and not the create form.

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('./tasks-app.js', async (load) => {
  evaluated.add('shell');
  return load();
});
vi.mock('../element/task-board.js', async (load) => {
  evaluated.add('board');
  return load();
});
vi.mock('../element/tasks-nav.js', async (load) => {
  evaluated.add('nav');
  return load();
});
vi.mock('@stillpointlab/spl-icon-component', async (load) => {
  evaluated.add('spl-icon');
  return load();
});

const TAGS = ['spl-tasks-app', 'spl-task-board', 'spl-tasks-nav'];

// One sequence, in order: the module registry is shared by the file.
describe('the root and ./shell entries', () => {
  it('the root entry loads no DOM code and registers no element', async () => {
    const root = await import('../index.js');

    expect(root.tasksModule.id).toBe('tasks');
    expect([...evaluated]).toEqual([]);
    for (const tag of TAGS) expect(customElements.get(tag)).toBeUndefined();
  });

  it('`./shell` registers the shell and its two elements, not the create form', async () => {
    const shell = await import('./index.js');

    expect(customElements.get('spl-tasks-app')).toBe(shell.TasksApp);
    expect(customElements.get('spl-task-board')).toBeDefined();
    expect(customElements.get('spl-tasks-nav')).toBeDefined();
    expect(customElements.get('spl-tasks-create')).toBeUndefined();
    expect([...evaluated].sort()).toEqual(['board', 'nav', 'shell', 'spl-icon']);
  });
});
