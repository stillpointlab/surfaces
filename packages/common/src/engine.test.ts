import { describe, expect, it, vi } from 'vitest';

import { createLazyLoader, hydrate } from './engine';
import { createReadyGate, type ReadyHost } from './ready';

const host = (): ReadyHost => ({
  setAttribute: () => undefined,
  removeAttribute: () => undefined,
  dispatchEvent: () => true,
});

/** Let queued promise continuations run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLazyLoader', () => {
  it('runs the load once and shares the result', async () => {
    const load = vi.fn(async () => ({ engine: true }));
    const loader = createLazyLoader(load);

    const [a, b] = await Promise.all([loader(), loader()]);
    expect(await loader()).toBe(a);
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledOnce();
  });

  it('forgets a rejected load so the next call retries', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('engine');
    const loader = createLazyLoader(load);

    await expect(loader()).rejects.toThrow('offline');
    await expect(loader()).resolves.toBe('engine');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('hydrate', () => {
  it('builds and then settles the live cycle', async () => {
    const gate = createReadyGate(host());
    const build = vi.fn();
    const cycle = hydrate(gate, { load: async () => 'engine', build, fail: vi.fn() });

    expect(gate.settled).toBe(false);
    await gate.whenReady();
    expect(build).toHaveBeenCalledWith('engine', cycle);
  });

  it('waits for an async build before settling', async () => {
    const gate = createReadyGate(host());
    let finish!: () => void;
    const built = new Promise<void>((resolve) => (finish = resolve));
    hydrate(gate, { load: async () => 'engine', build: () => built, fail: vi.fn() });

    await flush();
    expect(gate.settled).toBe(false);
    finish();
    await gate.whenReady();
    expect(gate.settled).toBe(true);
  });

  it('a superseded cycle neither builds, fails nor settles', async () => {
    const gate = createReadyGate(host());
    let release!: (value: string) => void;
    const slow = new Promise<string>((resolve) => (release = resolve));
    const build = vi.fn();
    const fail = vi.fn();
    hydrate(gate, { load: () => slow, build, fail });

    const newer = gate.begin(); // the element moved or reconnected
    release('engine');
    await flush();

    expect(build).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(gate.settled).toBe(false);
    gate.settle(newer);
    expect(gate.settled).toBe(true);
  });

  it('a superseded failure is not reported', async () => {
    const gate = createReadyGate(host());
    let reject!: (error: Error) => void;
    const slow = new Promise<string>((_, no) => (reject = no));
    const fail = vi.fn();
    hydrate(gate, { load: () => slow, build: vi.fn(), fail });

    gate.begin();
    reject(new Error('offline'));
    await flush();
    expect(fail).not.toHaveBeenCalled();
  });

  it('a failed load calls fail and settles', async () => {
    const gate = createReadyGate(host());
    const error = new Error('offline');
    const build = vi.fn();
    const fail = vi.fn();
    hydrate(gate, { load: () => Promise.reject(error), build, fail });

    await gate.whenReady();
    expect(fail).toHaveBeenCalledWith(error);
    expect(build).not.toHaveBeenCalled();
  });

  it('a throwing build calls fail and settles', async () => {
    const gate = createReadyGate(host());
    const error = new Error('no mount');
    const fail = vi.fn();
    hydrate(gate, {
      load: async () => 'engine',
      build: () => {
        throw error;
      },
      fail,
    });

    await gate.whenReady();
    expect(fail).toHaveBeenCalledWith(error);
  });
});
