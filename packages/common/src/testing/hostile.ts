// Hostile-state testing: fill an element's state with strings that would become
// markup if any of them reached the DOM unescaped, render it, and check that none
// did. The payload breaks out of a double- or single-quoted attribute (adding a
// `data-hostile-attr` attribute) and then opens an element (`<img data-hostile>`)
// whose error handler sets `globalThis.__hostile` in a real browser.
//
//   const state = hostile(fixtureState, { except: ['mode', 'type'] });
//   element.setState(state);
//   await element.whenReady();
//   expectNoHostileMarkup(element);
//
// Neither function imports vitest, so the pair works under any runner.

/** What `hostile` appends to every string. */
export const HOSTILE_PAYLOAD = `"' data-hostile-attr="x"><img data-hostile src="x" onerror="globalThis.__hostile=1">`;

export interface HostileOptions {
  /**
   * Property names whose string values stay as they are: discriminants such as a
   * schema's `mode` or a field's `type`, which an element switches on, so a
   * hostile value would only render a fallback and test less.
   */
  except?: readonly string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function poison(value: unknown, except: ReadonlySet<string>, key: string | undefined): unknown {
  if (typeof value === 'string') {
    return key !== undefined && except.has(key) ? value : `${value}${HOSTILE_PAYLOAD}`;
  }
  // Array items keep the array's key, so `except` covers a list of discriminants too.
  if (Array.isArray(value)) return value.map((item) => poison(item, except, key));
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [name, item] of Object.entries(value)) copy[name] = poison(item, except, name);
    return copy;
  }
  return value;
}

/**
 * A deep copy of `state` with `HOSTILE_PAYLOAD` appended to every string, at any
 * depth in plain objects and arrays. Object keys stay as they are, since keys are
 * field ids and paths an element looks things up by. The input is not changed.
 */
export function hostile<T>(state: T, options: HostileOptions = {}): T {
  return poison(state, new Set(options.except ?? []), undefined) as T;
}

function* elementsIn(root: ParentNode): Generator<Element> {
  for (const element of root.querySelectorAll('*')) {
    yield element;
    if (element.shadowRoot) yield* elementsIn(element.shadowRoot);
  }
}

/**
 * Throw when `root`, or any open shadow root inside it, holds markup the payload
 * made: an element with `data-hostile`, any element with a `data-hostile-attr`
 * attribute, or `globalThis.__hostile` set by the payload's error handler.
 */
export function expectNoHostileMarkup(root: ParentNode): void {
  const found: string[] = [];
  if (root instanceof Element && root.hasAttribute('data-hostile-attr')) {
    found.push(`<${root.localName}> (the root) has a data-hostile-attr attribute`);
  }
  for (const element of elementsIn(root)) {
    if (element.hasAttribute('data-hostile')) found.push(`<${element.localName} data-hostile>`);
    if (element.hasAttribute('data-hostile-attr')) {
      found.push(`<${element.localName}> has a data-hostile-attr attribute`);
    }
  }
  if ((globalThis as { __hostile?: unknown }).__hostile !== undefined) {
    found.push('globalThis.__hostile was set');
  }
  if (found.length > 0) {
    throw new Error(`Hostile strings became markup:\n- ${found.join('\n- ')}`);
  }
}
