// Markup that escapes by default. Elements build HTML with the `html` tagged
// template and set it with `render`. Every interpolated value is escaped unless it
// is markup the same template built, so building HTML from data needs no call to
// remember. There is deliberately no way to mark a plain string as safe: markup
// that must not be escaped belongs in the template's literal parts.
//
//   render(this, html`<li class="${kind}">${title}</li>`);
//
// What escaping does not make safe, so data must never reach these positions:
// - attribute names, and attribute values without quotes around them;
// - the inside of <script> and <style> (set a stylesheet as `textContent`);
// - a URL's scheme: escaping does not stop `javascript:`. An `href` built from
//   data comes from code that builds the URL itself (a host's link builder, an
//   `encodeURIComponent`ed slug), never from a data string as it is.
//
// DOM-free apart from `render`, which touches only the target it is given.

// Only this module holds the key, so only `html` can make a `SafeHtml`.
const KEY = Symbol('SafeHtml');

/** Markup built by `html`. Only `html` can make one. */
class SafeHtml {
  readonly #markup: string;

  constructor(key: symbol, markup: string) {
    if (key !== KEY) throw new TypeError('SafeHtml is made by html``, never directly.');
    this.#markup = markup;
  }

  static is(value: unknown): value is SafeHtml {
    return typeof value === 'object' && value !== null && #markup in value;
  }

  toString(): string {
    return this.#markup;
  }
}

export type { SafeHtml };

/** What `html` accepts between `${` and `}`. */
export type HtmlValue =
  SafeHtml | string | number | bigint | boolean | null | undefined | readonly HtmlValue[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape `&`, `<`, `>`, `"` and `'`, which makes text safe as element content and
 * inside a quoted attribute value. Works in Node.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function piece(value: HtmlValue): string {
  if (SafeHtml.is(value)) return value.toString();
  if (Array.isArray(value)) return value.map(piece).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

/**
 * Build markup. Each value is handled by type: a `SafeHtml` goes in as it is; an
 * array item by item, by these same rules; `null`, `undefined` and `false` add
 * nothing; anything else is converted with `String()` and escaped.
 */
export function html(strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml {
  let markup = strings[0] ?? '';
  for (let index = 0; index < values.length; index++) {
    markup += piece(values[index]) + (strings[index + 1] ?? '');
  }
  return new SafeHtml(KEY, markup);
}

/** Whether `value` is markup built by `html`. */
export function isSafeHtml(value: unknown): value is SafeHtml {
  return SafeHtml.is(value);
}

/**
 * Replace `target`'s children with `content`. The one place elements set markup;
 * anything but a `SafeHtml` is refused, so a plain string cannot slip through.
 */
export function render(target: Element | ShadowRoot, content: SafeHtml): void {
  if (!SafeHtml.is(content)) {
    throw new TypeError('render() takes markup built by html``, not a string.');
  }
  target.innerHTML = content.toString();
}
