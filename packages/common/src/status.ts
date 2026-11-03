// The placeholder an element shows while it loads, when it has nothing to show,
// or when it could not load. Styled by the `status` partial in common's styles
// (`@use 'common/src/styles/status';` in the element's stylesheet).

export type StatusKind = 'loading' | 'empty' | 'error';

/** Standard messages, so every element says the same thing in the same state. */
export const STATUS_MESSAGES = {
  loading: 'Loading…',
  editorFailed: "Couldn't load the editor.",
  previewFailed: "Couldn't load the preview.",
} as const;

/**
 * A status placeholder: `<div class="spl-status spl-status--<kind>">`. Loading is
 * announced politely (`role="status"`), an error assertively (`role="alert"`).
 */
export function createStatus(kind: StatusKind, message: string): HTMLElement {
  const status = document.createElement('div');
  status.className = `spl-status spl-status--${kind}`;
  if (kind === 'loading') status.setAttribute('role', 'status');
  if (kind === 'error') status.setAttribute('role', 'alert');
  status.textContent = message;
  return status;
}
