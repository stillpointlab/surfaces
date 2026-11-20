import { describe, expect, it, vi } from 'vitest';

// The `./meta` entry loads no zod, none of the core and none of the naming
// rules in `./paths`: a host page that lists the apps imports it, and in a host
// whose every page does, whatever it loads is on every page.

const evaluated = vi.hoisted(() => new Set<string>());

vi.mock('zod', async (load) => {
  evaluated.add('zod');
  return load();
});
vi.mock('./manifest.js', async (load) => {
  evaluated.add('manifest');
  return load();
});
vi.mock('./core.js', async (load) => {
  evaluated.add('core');
  return load();
});
vi.mock('./paths.js', async (load) => {
  evaluated.add('paths');
  return load();
});

describe('the ./meta entry', () => {
  it('loads neither zod, the core nor the naming rules', async () => {
    const { tasksMeta } = await import('./meta.js');

    expect(tasksMeta.label).toBe('Tasks');
    expect(tasksMeta.icon).toBe('task');
    expect([...evaluated]).toEqual([]);
  });

  it('is the module’s meta', async () => {
    const { tasksMeta } = await import('./meta.js');
    const { tasksModule } = await import('./module.js');

    expect(tasksModule.meta).toBe(tasksMeta);
    expect(evaluated).toContain('zod');
  });

  it('carries the create copy, plain, with the root consent', async () => {
    const { tasksMeta } = await import('./meta.js');

    expect(tasksMeta.create).toMatchObject({
      noun: 'a task project',
      subject: 'Task project',
      defaultFolder: 'tasks',
      folderExample: '“tasks” or “docs/tasks”',
      rootConsent: {
        confirm: 'I understand — make the whole repository this task project',
      },
    });
    expect(tasksMeta.create?.folderHelp).toMatch(/^Where tasks\.yaml lives in the repository\./);
    expect(tasksMeta.create?.folderHelp).not.toMatch(/[<>]/);
    expect(tasksMeta.create?.rootConsent?.warning).toMatch(/^Creating at the repository root/);
  });
});
