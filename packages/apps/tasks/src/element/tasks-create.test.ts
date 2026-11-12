// @vitest-environment jsdom
/// <reference lib="dom" />
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';
import {
  describeAppElementContract,
  expectNoHostileMarkup,
  HOSTILE_PAYLOAD,
  mount,
} from '@stillpointlab/common-format/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CREATE_VALIDITY_EVENT } from './create.js';

import type { TasksCreate, TasksCreateOps, TasksCreateState } from './tasks-create.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

const setInput = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const rows = (list: 'columns' | 'kinds'): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>(`#create-tasks-${list} .create-tasks-row`),
];
const field = (list: 'columns' | 'kinds', index: number, role: string): HTMLInputElement =>
  rows(list)[index].querySelector<HTMLInputElement>(`[data-role="${role}"]`)!;
const errorLine = (): HTMLElement => document.getElementById('create-tasks-error')!;

async function mountForm(state: TasksCreateState = {}): Promise<TasksCreate> {
  const el = mount<TasksCreate>('spl-tasks-create');
  el.setState(state);
  await el.whenReady();
  return el;
}

function host(
  el: HTMLElement,
  answer: () => Result<object> | Promise<Result<object>> = () => ok()
) {
  const ops: AppOp<TasksCreateOps>[] = [];
  answerOps<TasksCreateOps>(el, (op) => {
    ops.push(op);
    return answer();
  });
  return { ops };
}

describeAppElementContract<TasksCreateState, TasksCreate>('spl-tasks-create', {
  state: {},
  trigger: async (el) => {
    await el.submit();
  },
});

describe('<spl-tasks-create>', () => {
  afterEach(() => document.body.replaceChildren());

  it('starts with three columns and one kind, ids derived', async () => {
    await mountForm();
    expect(rows('columns').map((_, i) => field('columns', i, 'label').value)).toEqual([
      'Todo',
      'In progress',
      'Done',
    ]);
    expect(rows('columns').map((_, i) => field('columns', i, 'id').value)).toEqual([
      'todo',
      'in-progress',
      'done',
    ]);
    expect(field('kinds', 0, 'label').value).toBe('Task');
    expect(field('kinds', 0, 'id').value).toBe('task');
    expect(errorLine().hidden).toBe(true);
  });

  it('starts from the labels it is given', async () => {
    await mountForm({ columns: ['Backlog'], kinds: ['Spec', 'Note'] });
    expect(rows('columns')).toHaveLength(1);
    expect(field('kinds', 1, 'id').value).toBe('note');
  });

  it('follows the label with a slugified id until the id is edited by hand', async () => {
    await mountForm();
    setInput(field('columns', 0, 'label'), 'To Do Soon');
    expect(field('columns', 0, 'id').value).toBe('to-do-soon');
    setInput(field('columns', 0, 'id'), 'custom');
    setInput(field('columns', 0, 'label'), 'Renamed');
    expect(field('columns', 0, 'id').value).toBe('custom');
  });

  it('asks to create with every column and kind', async () => {
    const el = await mountForm();
    const { ops } = host(el);
    setInput(field('columns', 1, 'description'), 'Being worked on');
    document.getElementById('create-tasks-add-kind')!.click();
    expect(field('kinds', 1, 'label').placeholder).toBe('Note');
    setInput(field('kinds', 1, 'label'), 'Spec');

    await expect(el.submit()).resolves.toEqual({ ok: true });
    expect(ops).toEqual([
      {
        type: 'create',
        input: {
          columns: [
            { id: 'todo', label: 'Todo' },
            { id: 'in-progress', label: 'In progress', description: 'Being worked on' },
            { id: 'done', label: 'Done' },
          ],
          kinds: [
            { id: 'task', label: 'Task' },
            { id: 'spec', label: 'Spec' },
          ],
        },
      },
    ]);
  });

  it('leaves an untouched spare row out', async () => {
    const el = await mountForm();
    document.getElementById('create-tasks-add-column')!.click();
    const value = el.value();
    expect(value.ok && value.input.columns).toHaveLength(3);
  });

  it('shows the first problem on submit, asking nothing', async () => {
    const el = await mountForm();
    const { ops } = host(el);

    setInput(field('columns', 0, 'id'), 'Not A Slug');
    await el.submit();
    expect(errorLine().textContent).toContain('needs a lowercase id');
    expect(field('columns', 0, 'id').getAttribute('aria-invalid')).toBe('true');

    setInput(field('columns', 0, 'id'), 'unassigned');
    await el.submit();
    expect(errorLine().textContent).toContain('reserved for the built-in unassigned column');

    setInput(field('columns', 0, 'id'), 'done');
    await el.submit();
    expect(errorLine().textContent).toBe('Two columns share the id “done”.');

    setInput(field('columns', 0, 'id'), 'todo');
    setInput(field('kinds', 0, 'label'), '');
    setInput(field('kinds', 0, 'id'), 'task');
    await el.submit();
    expect(errorLine().textContent).toBe('Give every kind a label.');
    expect(field('kinds', 0, 'label').getAttribute('aria-invalid')).toBe('true');

    expect(ops).toHaveLength(0);
  });

  it("shows its host's refusal and keeps its fields", async () => {
    const el = await mountForm();
    host(el, () => fail('ROOT_CONFIRM_REQUIRED', 'Creating at the repository root …'));
    await expect(el.submit()).resolves.toMatchObject({ ok: false });
    expect(errorLine().hidden).toBe(false);
    expect(errorLine().textContent).toBe('Creating at the repository root …');
    expect(rows('columns')).toHaveLength(3);
  });

  it('submits on Enter in a text field', async () => {
    const el = await mountForm();
    const { ops } = host(el);
    field('columns', 0, 'label').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await vi.waitFor(() => expect(ops).toHaveLength(1));
  });

  it('removes rows, keeping one in each list', async () => {
    await mountForm();
    for (const button of document.querySelectorAll<HTMLElement>(
      '#create-tasks-columns [data-action="remove-row"]'
    )) {
      button.click();
    }
    expect(rows('columns')).toHaveLength(1);
    expect(field('columns', 0, 'label').value).toBe('');
  });

  it('tells its host when its validity changes', async () => {
    const el = await mountForm();
    const seen: boolean[] = [];
    el.addEventListener(CREATE_VALIDITY_EVENT, (event) =>
      seen.push((event as CustomEvent<{ valid: boolean }>).detail.valid)
    );
    setInput(field('columns', 0, 'id'), 'Bad Id');
    setInput(field('columns', 0, 'id'), 'todo');
    expect(seen).toEqual([false, true]);
  });

  it('renders hostile labels as text', async () => {
    await mountForm({ columns: [HOSTILE_PAYLOAD], kinds: [HOSTILE_PAYLOAD] });
    expectNoHostileMarkup(document.body);
    expect(field('columns', 0, 'label').value).toBe(HOSTILE_PAYLOAD);
  });
});
