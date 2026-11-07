import { afterEach, describe, expect, it } from 'vitest';

import { APP_OP_EVENT, fail } from '../app';

import { mount, settled } from './support';

import type { AppElement, AppOpDetail } from '../app';

export interface AppElementContractOptions<State, T extends AppElement<State> = AppElement<State>> {
  /** A state the element can render. */
  state: State;
  /** Make the element ask for exactly one op, as a user action would. */
  trigger: (el: T) => void | Promise<void>;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

/** Collect the `app-op` events raised under `document` from now on. */
function collectOps(): { events: CustomEvent<AppOpDetail>[]; stop: () => void } {
  const events: CustomEvent<AppOpDetail>[] = [];
  const listener = (event: Event): void => {
    events.push(event as CustomEvent<AppOpDetail>);
  };
  document.addEventListener(APP_OP_EVENT, listener);
  return { events, stop: () => document.removeEventListener(APP_OP_EVENT, listener) };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The `AppElement` conformance suite for one tag. */
export function describeAppElementContract<State, T extends AppElement<State> = AppElement<State>>(
  tag: string,
  options: AppElementContractOptions<State, T>
): void {
  const { state, trigger, prepare } = options;

  describe(`<${tag}> app element contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('settles once it has state', async () => {
      const el = mount<T>(tag, prepare);
      el.setState(state);
      await settled(el);
    });

    it('renders its state without asking for an op', async () => {
      const ops = collectOps();
      const el = mount<T>(tag, prepare);
      el.setState(state);
      await settled(el);
      ops.stop();

      expect(ops.events).toHaveLength(0);
      const rendered = (el.shadowRoot ?? el).childNodes.length;
      expect(rendered, 'setState must render something').toBeGreaterThan(0);
    });

    it('asks for an op with a bubbling, composed, cancelable app-op event', async () => {
      const el = mount<T>(tag, prepare);
      el.setState(state);
      await settled(el);

      const ops = collectOps();
      await trigger(el);
      ops.stop();

      expect(ops.events).toHaveLength(1);
      const [event] = ops.events;
      expect(event.bubbles && event.composed && event.cancelable).toBe(true);
      expect(typeof (event.detail.op as { type?: unknown }).type).toBe('string');
      expect(typeof event.detail.respond).toBe('function');
    });

    it('keeps working when nothing answers its op', async () => {
      const el = mount<T>(tag, prepare);
      el.setState(state);
      await settled(el);

      await trigger(el);
      await tick();
      expect(el.isConnected).toBe(true);
      el.setState(state);
      await settled(el);
    });

    it('takes a refusal from its host and keeps working', async () => {
      const el = mount<T>(tag, prepare);
      el.setState(state);
      await settled(el);

      const claim = (event: Event): void => {
        event.preventDefault();
        (event as CustomEvent<AppOpDetail>).detail.respond(fail('TEST_REFUSED', 'Refused'));
      };
      document.addEventListener(APP_OP_EVENT, claim);
      try {
        await trigger(el);
        await tick();
      } finally {
        document.removeEventListener(APP_OP_EVENT, claim);
      }
      el.setState(state);
      await settled(el);
    });
  });
}
