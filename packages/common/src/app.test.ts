// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  answerOps,
  APP_OP_EVENT,
  createReadyGate,
  fail,
  ok,
  placeNewFiles,
  requestOp,
} from './app';
import { describeAppElementContract } from './testing/app-element';

import type { AppElement, AppOpDetail, Result } from './app';

type SampleOps = {
  rename: { op: { path: string; title: string }; reply: { title: string } };
  ping: { op: object; reply: object };
};

describe('placeNewFiles', () => {
  const files = [
    { path: 'inventory/inventory.yaml' },
    { path: 'inventory/rooms/kitchen.yaml' },
    { path: 'inventory/rooms/garage.yaml' },
  ];

  it('answers every file, in order, when nothing is in the way', () => {
    expect(placeNewFiles(files, { taken: ['README.md', 'inventory/notes.md'] })).toEqual({
      ok: true,
      files,
    });
  });

  it('answers a file already taken', () => {
    expect(placeNewFiles(files, { taken: ['inventory/rooms/garage.yaml'] })).toEqual({
      ok: false,
      path: 'inventory/rooms/garage.yaml',
    });
  });

  it('answers a parent folder that is a file, before the files themselves', () => {
    expect(
      placeNewFiles(files, { taken: ['inventory/rooms/garage.yaml', 'inventory/rooms'] })
    ).toEqual({ ok: false, path: 'inventory/rooms' });
    expect(placeNewFiles(files, { taken: ['inventory'] })).toEqual({
      ok: false,
      path: 'inventory',
    });
  });

  it('skips reusable files, and still refuses a reusable parent folder', () => {
    const leftovers = ['inventory/inventory.yaml', 'inventory/rooms/kitchen.yaml'];
    expect(placeNewFiles(files, { taken: leftovers, reusable: leftovers })).toEqual({
      ok: true,
      files: [{ path: 'inventory/rooms/garage.yaml' }],
    });
    expect(placeNewFiles(files, { taken: ['inventory'], reusable: ['inventory'] })).toEqual({
      ok: false,
      path: 'inventory',
    });
  });
});

describe('ok and fail', () => {
  it('builds a success with its fields beside ok', () => {
    expect(ok()).toEqual({ ok: true });
    expect(ok({ content: 'x' })).toEqual({ ok: true, content: 'x' });
  });

  it('builds a failure, with details only when given', () => {
    expect(fail('CODE', 'message')).toEqual({ ok: false, code: 'CODE', message: 'message' });
    expect(fail('CODE', 'message', [{ path: ['a'] }])).toEqual({
      ok: false,
      code: 'CODE',
      message: 'message',
      details: [{ path: ['a'] }],
    });
  });
});

describe('requestOp and answerOps', () => {
  const el = (): HTMLElement => document.body.appendChild(document.createElement('div'));
  afterEach(() => document.body.replaceChildren());

  it('resolves to OP_UNHANDLED when nothing claims the op', async () => {
    const result = await requestOp<SampleOps, 'ping'>(el(), { type: 'ping' });
    expect(result).toMatchObject({ ok: false, code: 'OP_UNHANDLED' });
  });

  it('resolves to the answer of the host that claims it, from an ancestor', async () => {
    const stop = answerOps<SampleOps>(document.body, (op) =>
      op.type === 'rename' ? ok({ title: op.title.toUpperCase() }) : ok()
    );
    const result = await requestOp<SampleOps, 'rename'>(el(), {
      type: 'rename',
      path: 'a.md',
      title: 'x',
    });
    stop();
    expect(result).toEqual({ ok: true, title: 'X' });
  });

  it('passes a refusal through unchanged', async () => {
    const stop = answerOps<SampleOps>(document.body, () => fail('NOPE', 'Not today'));
    const result = await requestOp<SampleOps, 'ping'>(el(), { type: 'ping' });
    stop();
    expect(result).toEqual({ ok: false, code: 'NOPE', message: 'Not today' });
  });

  it('turns a thrown or rejected answer into OP_FAILED', async () => {
    const target = el();
    let stop = answerOps<SampleOps>(target, () => {
      throw new Error('boom');
    });
    expect(await requestOp<SampleOps, 'ping'>(target, { type: 'ping' })).toMatchObject({
      ok: false,
      code: 'OP_FAILED',
      message: 'boom',
    });
    stop();
    stop = answerOps<SampleOps>(target, () => Promise.reject(new Error('later')));
    expect(await requestOp<SampleOps, 'ping'>(target, { type: 'ping' })).toMatchObject({
      code: 'OP_FAILED',
      message: 'later',
    });
    stop();
  });

  it('stops answering once disposed', async () => {
    const target = el();
    const stop = answerOps<SampleOps>(target, () => ok());
    stop();
    expect(await requestOp<SampleOps, 'ping'>(target, { type: 'ping' })).toMatchObject({
      code: 'OP_UNHANDLED',
    });
  });

  it('counts only the first answer', async () => {
    const target = el();
    const claim = (event: Event): void => {
      event.preventDefault();
      const { respond } = (event as CustomEvent<AppOpDetail>).detail;
      respond(ok({ first: true }));
      respond(ok({ second: true }));
    };
    target.addEventListener(APP_OP_EVENT, claim);
    const result = await requestOp<SampleOps, 'ping'>(target, { type: 'ping' });
    expect(result).toEqual({ ok: true, first: true });
  });

  it('raises a bubbling, composed, cancelable event carrying the op', () => {
    const target = el();
    let seen: Event | null = null;
    document.addEventListener(APP_OP_EVENT, (event) => (seen = event), { once: true });
    void requestOp<SampleOps, 'ping'>(target, { type: 'ping' });
    expect(seen).not.toBeNull();
    const event = seen! as CustomEvent<AppOpDetail>;
    expect([event.bubbles, event.composed, event.cancelable]).toEqual([true, true, true]);
    expect(event.detail.op).toEqual({ type: 'ping' });
  });
});

// A minimal app element: renders its state's title, and asks to rename on click.
class SampleApp extends HTMLElement implements AppElement<{ title: string }> {
  private readonly gate = createReadyGate(this);
  private heading = '';
  last: Result<{ title: string }> | null = null;

  whenReady(): Promise<void> {
    return this.gate.whenReady();
  }

  connectedCallback(): void {
    this.addEventListener('click', this.rename);
  }

  disconnectedCallback(): void {
    this.removeEventListener('click', this.rename);
    this.gate.begin();
  }

  setState(state: { title: string }): void {
    this.heading = state.title;
    this.textContent = this.heading;
    this.gate.settle();
  }

  private rename = (): void => {
    void requestOp<SampleOps, 'rename'>(this, {
      type: 'rename',
      path: 'card.md',
      title: `${this.heading}!`,
    }).then((result) => {
      this.last = result;
      if (result.ok) this.setState({ title: result.title });
    });
  };
}
customElements.define('spl-sample-app', SampleApp);

describeAppElementContract<{ title: string }, SampleApp>('spl-sample-app', {
  state: { title: 'Card' },
  trigger: (el) => el.click(),
});
