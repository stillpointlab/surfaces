import { describe, expect, it, vi } from 'vitest';

import { createReadyGate, READY_ATTRIBUTE, READY_EVENT, type ReadyHost } from './ready';

function host(): ReadyHost & { attributes: Map<string, string>; events: string[] } {
  const attributes = new Map<string, string>();
  const events: string[] = [];
  return {
    attributes,
    events,
    setAttribute: (name, value) => void attributes.set(name, value),
    removeAttribute: (name) => void attributes.delete(name),
    dispatchEvent: (event) => {
      events.push(event.type);
      return true;
    },
  };
}

describe('createReadyGate', () => {
  it('starts pending, settles, and reflects the attribute and event', async () => {
    const h = host();
    const gate = createReadyGate(h);
    expect(gate.settled).toBe(false);
    expect(h.attributes.has(READY_ATTRIBUTE)).toBe(false);

    const seen = vi.fn();
    void gate.whenReady().then(seen);
    gate.settle();

    await Promise.resolve();
    expect(gate.settled).toBe(true);
    expect(h.attributes.get(READY_ATTRIBUTE)).toBe('');
    expect(h.events).toEqual([READY_EVENT]);
    expect(seen).toHaveBeenCalledOnce();
    await expect(gate.whenReady()).resolves.toBeUndefined();
  });

  it('ignores a settle from a superseded cycle', async () => {
    const h = host();
    const gate = createReadyGate(h);
    const first = gate.begin();
    const second = gate.begin();

    gate.settle(first);
    expect(gate.settled).toBe(false);

    const waited = gate.whenReady();
    gate.settle(second);
    await expect(waited).resolves.toBeUndefined();
    expect(h.events).toEqual([READY_EVENT]);
  });

  it('begin after settle removes the attribute and makes whenReady wait again', async () => {
    const h = host();
    const gate = createReadyGate(h);
    gate.settle();
    const token = gate.begin();

    expect(gate.settled).toBe(false);
    expect(h.attributes.has(READY_ATTRIBUTE)).toBe(false);
    const seen = vi.fn();
    void gate.whenReady().then(seen);
    await Promise.resolve();
    expect(seen).not.toHaveBeenCalled();

    gate.settle(token);
    await Promise.resolve();
    expect(seen).toHaveBeenCalledOnce();
    expect(h.events).toEqual([READY_EVENT, READY_EVENT]);
  });

  it('isCurrent is true only for the latest cycle', () => {
    const gate = createReadyGate(host());
    const first = gate.begin();
    expect(gate.isCurrent(first)).toBe(true);
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.settle(second);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it('settling while settled is a no-op', () => {
    const h = host();
    const gate = createReadyGate(h);
    gate.settle();
    gate.settle();
    expect(h.events).toEqual([READY_EVENT]);
  });

  it('a wait started before a disconnect resolves on the next settle', async () => {
    const h = host();
    const gate = createReadyGate(h);
    const waited = gate.whenReady();
    gate.begin(); // e.g. disconnect
    const token = gate.begin(); // e.g. reconnect + load
    gate.settle(token);
    await expect(waited).resolves.toBeUndefined();
  });
});
