import { expect } from 'vitest';

import { READY_ATTRIBUTE, READY_EVENT } from '../ready';

import type { ReadyElement } from '../contracts';

/** Create the element by tag; fails if it is not registered. */
export function create<T extends ReadyElement>(tag: string): T {
  expect(customElements.get(tag), `${tag} is not a registered custom element`).toBeDefined();
  return document.createElement(tag) as T;
}

/** Create, optionally prepare, and connect the element to the document body. */
export function mount<T extends ReadyElement>(tag: string, prepare?: (el: T) => void): T {
  const el = create<T>(tag);
  prepare?.(el);
  document.body.append(el);
  return el;
}

/** Assert the element is pending: no `ready` attribute. */
export function pending(el: ReadyElement): void {
  expect(el.hasAttribute(READY_ATTRIBUTE), 'expected the element to be pending').toBe(false);
}

/**
 * Await `whenReady()` and assert the settled state agrees with it: the `ready`
 * attribute is present and, when a counter is given, at least one `ready` event
 * was dispatched since it was attached.
 */
export async function settled(el: ReadyElement, events?: { count: number }): Promise<void> {
  await el.whenReady();
  expect(el.hasAttribute(READY_ATTRIBUTE), 'settled element must carry the ready attribute').toBe(
    true
  );
  if (events) expect(events.count, 'settling must dispatch a ready event').toBeGreaterThan(0);
}

/** Count `ready` events from now on. */
export function settledBy(el: ReadyElement): { count: number } {
  const counter = { count: 0 };
  el.addEventListener(READY_EVENT, () => {
    counter.count += 1;
  });
  return counter;
}

/** Collect `content-change` details from now on. */
export function contentChanges(el: HTMLElement): { details: unknown[] } {
  const seen = { details: [] as unknown[] };
  el.addEventListener('content-change', (event) => {
    seen.details.push((event as CustomEvent<unknown>).detail);
  });
  return seen;
}

/** The default "content reached the DOM" check: the shadow root has rendered something. */
export function defaultRendered(el: HTMLElement): void {
  expect(el.shadowRoot, 'contract elements render into an open shadow root').not.toBeNull();
  expect(
    el.shadowRoot!.querySelector(':not(style)'),
    'a settled element has rendered content in its shadow root'
  ).not.toBeNull();
}
