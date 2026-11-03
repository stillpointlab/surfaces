// Small, stateless helpers every editor toolbar uses. Each format builds its own
// toolbar and owns its commands; these give every toolbar the same keyboard
// behaviour, dismissal and readonly handling. See the README's "Toolbars" section.

import { report } from './log';

const NEXT_KEYS: Record<string, 'previous' | 'next' | 'first' | 'last'> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  Home: 'first',
  End: 'last',
};

/**
 * Give `target` the toolbar's single tab stop (`tabIndex` 0) and every other item
 * `tabIndex` -1. With no usable `preferred` item (missing, disabled or not in
 * `items`), the first enabled item gets it. Returns the item that holds it.
 */
export function setToolbarTabStop(
  items: readonly HTMLElement[],
  preferred?: HTMLElement | null
): HTMLElement | null {
  const enabled = items.filter((item) => !isDisabled(item));
  const stop = preferred && enabled.includes(preferred) ? preferred : (enabled[0] ?? null);
  for (const item of items) item.tabIndex = item === stop ? 0 : -1;
  return stop;
}

/**
 * Move focus within a toolbar for ArrowLeft / ArrowRight (wrapping), Home and End
 * over the enabled `items`, in order. Prevents the key's default, moves the tab
 * stop, focuses the target and returns it. Any other key returns null untouched.
 */
export function moveToolbarFocus(
  event: KeyboardEvent,
  items: readonly HTMLElement[]
): HTMLElement | null {
  const direction = NEXT_KEYS[event.key];
  if (!direction) return null;
  const enabled = items.filter((item) => !isDisabled(item));
  if (enabled.length === 0) return null;
  event.preventDefault();

  const from = enabled.findIndex(
    (item) => item === event.target || item.contains(event.target as Node)
  );
  const last = enabled.length - 1;
  const index =
    direction === 'first'
      ? 0
      : direction === 'last'
        ? last
        : direction === 'next'
          ? from < 0 || from === last
            ? 0
            : from + 1
          : from <= 0
            ? last
            : from - 1;
  const target = enabled[index];
  setToolbarTabStop(items, target);
  target.focus();
  return target;
}

/** Why `dismissOnOutside` closed. */
export type DismissReason = 'outside' | 'escape';

/**
 * Close a popover or menu when a pointer goes down outside it, or on Escape.
 * `inside` is the element that counts as inside (usually the popover's menu
 * element), or a function returning every such element at the time of the event
 * (for example the open menu and its trigger). It listens on the document in the
 * capture phase and uses `composedPath()`, so it works across shadow roots.
 * Returns a dispose function for `disconnectedCallback`.
 */
export function dismissOnOutside(
  inside: Element | (() => Iterable<Element | null | undefined>),
  options: {
    isOpen: () => boolean;
    close: (reason: DismissReason) => void;
    /** Also close on Escape. Default true; pass false when the element handles Escape itself. */
    escape?: boolean;
  }
): () => void {
  const insideElements = () => (typeof inside === 'function' ? [...inside()] : [inside]);
  const onPointerDown = (event: Event) => {
    if (!options.isOpen()) return;
    const path = event.composedPath();
    if (insideElements().some((element) => element && path.includes(element))) return;
    options.close('outside');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !options.isOpen()) return;
    options.close('escape');
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  if (options.escape !== false) document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

/** The contract's readonly: `readonly="true"`, and nothing else (see "Attributes"). */
export function isReadonly(el: Element): boolean {
  return el.getAttribute('readonly') === 'true';
}

/**
 * Reflect read-only state as `aria-readonly` on `target`, the element's editing
 * root. By default the state is the element's `readonly` attribute; an element
 * that is read-only for other reasons too passes its own answer.
 */
export function reflectReadonly(
  el: Element,
  target: Element | null | undefined,
  readonly: boolean = isReadonly(el)
): void {
  if (!target) {
    report(`<${el.localName}> has no editing root to mark aria-readonly`, { level: 'warn' });
    return;
  }
  target.setAttribute('aria-readonly', readonly ? 'true' : 'false');
}

function isDisabled(item: HTMLElement): boolean {
  return (
    (item as HTMLButtonElement).disabled === true || item.getAttribute('aria-disabled') === 'true'
  );
}
