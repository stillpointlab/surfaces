// The ready gate behind every surface element's `whenReady()` (see contracts.ts).
//
// "Ready" has settled semantics: the element is hydrated (any lazy engine loaded,
// any view built) *and* the most recent content it was given has reached its DOM.
// A synchronous element settles on connect and again after every set; an
// asynchronous one begins a cycle when it starts loading or rendering and settles
// when that work lands. The gate reflects the state as a boolean `ready`
// attribute on the host and dispatches a `ready` event each time it settles, so a
// host can `await el.whenReady()`, select `tag[ready]`, or listen.
//
// Cycles carry a token: `begin()` returns one, and `settle(token)` is ignored when
// a newer cycle has begun since, so a superseded render or a torn-down view never
// settles the element early. `settle()` with no token settles unconditionally
// (for synchronous work). Disconnecting is `begin()` too: a detached element is
// not ready until it is connected and rendered again. `isCurrent(token)` lets an
// asynchronous continuation ask whether its cycle is still the live one, so work
// for a superseded connection stops instead of building or settling.

/** The attribute present on a settled element and absent while it is pending. */
export const READY_ATTRIBUTE = 'ready';

/** The event dispatched (non-bubbling) each time the element settles. */
export const READY_EVENT = 'ready';

/** What the gate needs from its element. */
export interface ReadyHost {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  dispatchEvent(event: Event): boolean;
}

export interface ReadyGate {
  /** True between a settle and the next begin. */
  readonly settled: boolean;
  /** Resolves once settled; immediately if already settled. One promise per wait. */
  whenReady(): Promise<void>;
  /**
   * Start (or restart) a pending cycle and return its token. Call before any
   * asynchronous work whose result must be in the DOM for the element to count
   * as ready, and on disconnect.
   */
  begin(): number;
  /**
   * Mark the element settled. With a token, only if that cycle is still the
   * current one; without, unconditionally. Idempotent while settled.
   */
  settle(token?: number): void;
  /** True when `token` is the cycle the latest `begin()` returned. */
  isCurrent(token: number): boolean;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

export function createReadyGate(host: ReadyHost): ReadyGate {
  let settled = false;
  let cycle = 0;
  let waiting: Deferred | null = null;

  const deferred = (): Deferred => {
    if (!waiting) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      waiting = { promise, resolve };
    }
    return waiting;
  };

  return {
    get settled() {
      return settled;
    },
    whenReady() {
      return settled ? Promise.resolve() : deferred().promise;
    },
    begin() {
      cycle += 1;
      if (settled) {
        settled = false;
        host.removeAttribute(READY_ATTRIBUTE);
      }
      return cycle;
    },
    settle(token?: number) {
      if (token !== undefined && token !== cycle) return;
      if (settled) return;
      settled = true;
      host.setAttribute(READY_ATTRIBUTE, '');
      const resolved = waiting;
      waiting = null;
      resolved?.resolve();
      host.dispatchEvent(new Event(READY_EVENT));
    },
    isCurrent(token: number) {
      return token === cycle;
    },
  };
}
