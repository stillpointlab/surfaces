// A PDF that asks for a password: the form in place of the pages, the password
// handed to pdf.js and kept nowhere, a wrong one said, ready settled while it
// asks, and the task let go for a new source. pdf.js is faked
// (`testing/fake-pdfjs.ts`): a test says when it asks and reads what it was given.
import { setErrorHandler } from '@stillpointlab/common-format';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeDocument, pdfjsError, resetEngine, taskFor } from '../testing/fake-pdfjs';

import './pdf-preview';

import type { PdfPreview } from './pdf-preview';

vi.mock('./engine', async () => (await import('../testing/fake-pdfjs')).fakeEngine);
vi.mock('../worker/start', async () => {
  const fake = await import('../testing/fake-pdfjs');
  return { startWorker: vi.fn(fake.startFakeWorker) };
});

const SRC = '/files/locked.pdf';

const tick = () => new Promise<void>((done) => setTimeout(done, 0));
const rootOf = (el: PdfPreview) => el.shadowRoot!;
const formOf = (el: PdfPreview) => rootOf(el).querySelector<HTMLElement>('.pdf-preview__unlock');
const fieldOf = (el: PdfPreview) => formOf(el)!.querySelector('input')!;
const errorOf = (el: PdfPreview) => formOf(el)!.querySelector('.pdf-preview__unlock-error')!;
const openOf = (el: PdfPreview) =>
  formOf(el)!.querySelector<HTMLButtonElement>('.pdf-preview__unlock-open')!;

/** An element on `SRC`, which pdf.js has asked a password for. */
async function asking(): Promise<PdfPreview> {
  const el = document.createElement('pdf-preview') as PdfPreview;
  el.setSource(SRC, 'locked.pdf');
  document.body.append(el);
  // The engine's import and the worker, then the task is open.
  await tick();
  await tick();
  void taskFor(SRC)!.ask();
  await el.whenReady();
  return el;
}

/** Type `password` in the field and send it with the button or Enter. */
function send(el: PdfPreview, password: string, how: 'button' | 'enter' = 'button'): void {
  fieldOf(el).value = password;
  if (how === 'button') openOf(el).click();
  else fieldOf(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

describe('pdf-preview with a password', () => {
  beforeEach(() => resetEngine());

  afterEach(async () => {
    document.body.replaceChildren();
    await tick();
    setErrorHandler(null);
  });

  it('asks in place of the pages, settled, takes no focus, and reports nothing', async () => {
    const handler = vi.fn();
    setErrorHandler(handler);
    const el = await asking();
    const form = formOf(el)!;

    expect(el.hasAttribute('ready')).toBe(true);
    expect(form.getAttribute('role')).toBe('group');
    expect(rootOf(el).getElementById(form.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'This PDF needs a password to open.'
    );
    expect(fieldOf(el).type).toBe('password');
    expect(fieldOf(el).getAttribute('autocomplete')).toBe('one-time-code');
    expect(fieldOf(el).closest('label')?.textContent).toContain('Password');
    expect(openOf(el).textContent).toBe('Open');
    expect(errorOf(el).textContent).toBe('');
    expect(rootOf(el).activeElement).toBeNull();
    expect(rootOf(el).querySelector('form')).toBeNull();
    expect(rootOf(el).querySelector('.pdf-preview__page')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it('hands the password to pdf.js, empties the field, and is pending until a page is drawn', async () => {
    const el = await asking();
    const task = taskFor(SRC)!;
    const form = formOf(el)!;
    const field = fieldOf(el);

    send(el, 'open-sesame');

    expect(task.passwords).toEqual(['open-sesame']);
    expect(field.value).toBe('');
    expect(el.hasAttribute('ready')).toBe(false);
    expect(form.isConnected).toBe(false);
    expect(rootOf(el).querySelector('.pdf-preview__loading')).not.toBeNull();

    task.open(new FakeDocument(2));
    await el.whenReady();
    expect(rootOf(el).querySelectorAll('.pdf-preview__page')).toHaveLength(2);
    expect(rootOf(el).innerHTML).not.toContain('open-sesame');
  });

  it('takes Enter in the field as Open', async () => {
    const el = await asking();
    send(el, 'open-sesame', 'enter');
    expect(taskFor(SRC)!.passwords).toEqual(['open-sesame']);
  });

  it('says a wrong one, marks the field, keeps the focus there, and asks again', async () => {
    const el = await asking();
    const task = taskFor(SRC)!;
    send(el, 'nope');
    void task.ask(2);
    await el.whenReady();

    expect(errorOf(el).textContent).toBe("That password didn't open it. Try again.");
    expect(errorOf(el).getAttribute('role')).toBe('alert');
    expect(fieldOf(el).getAttribute('aria-invalid')).toBe('true');
    expect(fieldOf(el).getAttribute('aria-describedby')).toBe(errorOf(el).id);
    expect(rootOf(el).activeElement).toBe(fieldOf(el));
    expect(fieldOf(el).value).toBe('');

    send(el, 'open-sesame');
    expect(task.passwords).toEqual(['nope', 'open-sesame']);
  });

  it('sends nothing for an empty field, and says so', async () => {
    const el = await asking();
    send(el, '');

    expect(taskFor(SRC)!.passwords).toEqual([]);
    expect(errorOf(el).textContent).toBe('Type the password first.');
    expect(rootOf(el).activeElement).toBe(fieldOf(el));
    expect(el.hasAttribute('ready')).toBe(true);
  });

  it('lets the task go for a new source while it asks, and forgets what was typed', async () => {
    const el = await asking();
    const task = taskFor(SRC)!;
    const form = formOf(el)!;
    const field = fieldOf(el);
    field.value = 'half-typ';

    el.setSource('/files/other.pdf', 'other.pdf');

    expect(task.destroyed).toBe(true);
    expect(form.isConnected).toBe(false);
    expect(field.value).toBe('');
  });

  it('keeps asking when it leaves the page and comes back, and opens nothing again', async () => {
    const el = await asking();
    el.remove();
    expect(el.hasAttribute('ready')).toBe(false);
    document.body.append(el);
    await el.whenReady();

    expect(formOf(el)?.isConnected).toBe(true);
    expect(taskFor(SRC)!.destroyed).toBe(false);
  });

  it('never gives the password to the error handler or the console', async () => {
    const reports: string[] = [];
    setErrorHandler((message, err) => reports.push(`${message} ${JSON.stringify(err)}`));
    const logged = vi.spyOn(console, 'error');
    const el = await asking();
    send(el, 'hunter2-trial');
    // pdf.js stops asking: it rejects with a PasswordException.
    taskFor(SRC)!.fail(pdfjsError('PasswordException', 'Incorrect Password'));
    await el.whenReady();

    expect(rootOf(el).textContent).toContain('This PDF needs a password.');
    expect(reports).toHaveLength(1);
    expect(reports.join(' ')).not.toContain('hunter2-trial');
    expect(logged.mock.calls.flat().join(' ')).not.toContain('hunter2-trial');
    logged.mockRestore();
  });
});
