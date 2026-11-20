---
created: 2026-11-20T15:30:00-07:00
tags: [code, polish, common]
---

# A dialog keeps Tab inside it

`<modal-dialog>` traps focus while it is open, and the trap has holes. Found in Context Manager's
stage 7 while checking its dialogs in a browser; recorded here because the element lives here.

`trapFocus` (`packages/components/modal-dialog/src/modal-dialog.ts`) compares
`document.activeElement` with the first and last focusable elements it found. At the document,
focus inside a shadow root reads as the shadow's host, so:

- **Shift+Tab from the close button leaves the dialog.** The close button is inside the dialog's
  own shadow root and is the first focusable element. While it has focus,
  `document.activeElement` is the `<modal-dialog>` itself, which is not the button, so the wrap to
  the last element never happens. The comment on that line already says the shadow root's own
  `activeElement` could be read.
- **A slotted component hides what it holds.** The list of focusable elements is built with
  `querySelectorAll` over the shadow root and the light DOM. A slotted custom element with a
  shadow root of its own (an editor, a picker) contributes nothing from inside it, so the "last"
  element can be wrong and Tab from the real last one leaves the dialog.

What a fix needs:

- Read the focused element through the shadow roots (follow `activeElement` down from the
  document), and compare that.
- Decide how far to look for focusable elements inside slotted components, or trap by sentinels
  at the dialog's two ends, which needs no list at all.
- A test that opens a dialog with a slotted button, focuses the close button, and sends
  Shift+Tab; and one with a slotted element that has its own shadow root. The element's tests
  (`modal-dialog.test.ts`) have none for Tab today.

Context Manager uses this element for every confirmation and for the decision dialog, so the fix
reaches it at its next pin move.
