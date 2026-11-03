// Small helpers every element module uses: registering the element, and reading
// a display option from a boolean attribute.

import { report } from './log';

/**
 * Register `constructor` as `<tag>` unless the tag is already taken, and return
 * the constructor that holds it. Loading an element module twice (two bundles, or
 * a test importing it again) is then harmless. A different constructor already
 * holding the tag means two copies of a package are loaded: the first one wins and
 * a warning is reported.
 */
export function defineElement(
  tag: string,
  constructor: CustomElementConstructor
): CustomElementConstructor {
  const existing = customElements.get(tag);
  if (!existing) {
    customElements.define(tag, constructor);
    return constructor;
  }
  if (existing !== constructor) {
    report(`<${tag}> is already registered by another copy of its package; keeping the first.`, {
      level: 'warn',
    });
  }
  return existing;
}

/**
 * Read a display option from a boolean attribute: on when present and not
 * `"false"`, so `wrap`, `wrap=""` and `wrap="true"` are on and `wrap="false"` is
 * off. Absent, it is `defaultOn` (false unless given). Contract attributes such as
 * `readonly` do not use this rule: they compare to an explicit value
 * (`readonly="true"`), as the README's "Attributes" note explains.
 */
export function booleanAttribute(
  el: Element,
  name: string,
  options: { defaultOn?: boolean } = {}
): boolean {
  const value = el.getAttribute(name);
  if (value === null) return options.defaultOn ?? false;
  return value !== 'false';
}
