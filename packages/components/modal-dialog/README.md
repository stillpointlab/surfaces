# @stillpointlab/modal-dialog-component

The `<modal-dialog>` element: a scrim, a dialog with header, body and footer slots, a focus trap, and
Escape to close. It renders nothing until it is open.

```ts
import '@stillpointlab/modal-dialog-component';
```

```html
<modal-dialog id="rename" title="Rename card">
  <div slot="body"><input data-autofocus /></div>
  <div slot="footer"><button>Save</button></div>
</modal-dialog>
```

```ts
import type { ModalDialog } from '@stillpointlab/modal-dialog-component';

document.querySelector<ModalDialog>('#rename')?.open();
```

## Attributes

| Attribute                | Meaning                                            |
| ------------------------ | -------------------------------------------------- |
| `title`                  | The default header text. Rendered as text.         |
| `is-open`                | Present while open. `open()` and `close()` set it. |
| `close-on-overlay-click` | A click on the scrim closes the dialog.            |

## Properties and methods

- `isOpen` and `title` reflect their attributes.
- `open()` and `close()`. Closing returns focus to the element that had it when `open()` ran.
- `dispatchNotification(message, type)` raises the `notification` event.

## Slots

| Slot     | Holds                                        |
| -------- | -------------------------------------------- |
| `header` | Replaces the default title.                  |
| `body`   | The content. It scrolls when it is too tall. |
| `footer` | Usually the buttons.                         |

Opening focuses `[data-autofocus]` or `[autofocus]` in the slotted content, then the first focusable
slotted control, then the close button. A page should use `data-autofocus`: before the element is
defined, its content is ordinary in-flow DOM, and native `autofocus` would scroll the page to it.

## Events

All bubble and are composed.

| Event          | When                                                         |
| -------------- | ------------------------------------------------------------ |
| `modal-opened` | The dialog opened.                                           |
| `modal-closed` | The dialog closed.                                           |
| `notification` | `dispatchNotification` ran; `detail` is `{ message, type }`. |

## Tokens

`--spl-overlay-scrim`, `--spl-overlay-shadow`, `--spl-surface-overlay`, `--spl-text-primary`,
`--spl-text-muted`, `--spl-background-hover`, `--spl-primary-blue`. See Theming in the
[root README](../../../README.md#theming).

While the element is undefined its slotted content is visible in the page. A host hides it with
`modal-dialog:not(:defined) { display: none; }`.
