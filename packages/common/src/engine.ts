// Two small functions for elements that load a heavy engine (ProseMirror,
// CodeMirror) on demand. They are composed by the element, not inherited: the
// element keeps its fields, its render(), the code that builds its view, and its
// teardown. See the README's "Lazy engines" section.

import type { ReadyGate } from './ready';

/**
 * Wrap a dynamic import so it runs once and every caller (every instance of the
 * element) shares the result. A rejected load is forgotten, so the next caller,
 * typically the next connection, tries again.
 */
export function createLazyLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

/** What `hydrate` runs for one connection. */
export interface HydrateSteps<T> {
  /** Load the engine; usually the element's `createLazyLoader` function. */
  load: () => Promise<T>;
  /**
   * Build the view from the loaded engine. Runs only while this connection is the
   * live one. May be async: the element counts as ready once it resolves.
   */
  build: (engine: T, cycle: number) => void | Promise<void>;
  /** Report and render the failure state; called when `load` or `build` throws. */
  fail: (error: unknown) => void;
}

/**
 * Hydrate one connection: begin a ready cycle, load the engine, and build the
 * view if the connection is still live, then settle. If the element was moved or
 * reconnected meanwhile, a newer cycle owns it and this one stops without
 * building, failing or settling. A failed load or a throwing build calls `fail`
 * and still settles, so `whenReady()` never hangs. Returns the cycle token.
 */
export function hydrate<T>(gate: ReadyGate, steps: HydrateSteps<T>): number {
  const cycle = gate.begin();
  void (async () => {
    try {
      const engine = await steps.load();
      if (!gate.isCurrent(cycle)) return;
      await steps.build(engine, cycle);
    } catch (error) {
      if (!gate.isCurrent(cycle)) return;
      steps.fail(error);
    }
    gate.settle(cycle);
  })();
  return cycle;
}
