// This component in the surfaces harness (`npm run dev`). A fixture fills the
// slots and sets the title; the Open control opens and closes the dialog, so the
// scrim, focus and Escape can be tried in both themes.
import '../src/modal-dialog';

import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { ModalDialog } from '../src/modal-dialog';

const TAG = 'modal-dialog';

function fill(elements: HarnessElements, title: string, html: string): void {
  const dialog = elements.extras[TAG] as ModalDialog;
  dialog.title = title;
  dialog.innerHTML = html;
}

const footer = `<div slot="footer"><button type="button">Cancel</button> <button type="button">Save</button></div>`;

export default {
  elements: { extra: [TAG] },
  controls: [
    {
      kind: 'toggle',
      label: 'Open',
      apply: (elements, on) => {
        (elements.extras[TAG] as ModalDialog).isOpen = on;
      },
    },
  ],
  fixtures: {
    'Default title': {
      content: '',
      apply: (elements) =>
        fill(
          elements,
          'Rename card',
          `<div slot="body"><label>Title <input data-autofocus value="Fix the board"></label></div>${footer}`
        ),
    },
    'Header slot': {
      content: '',
      apply: (elements) =>
        fill(
          elements,
          '',
          `<h2 slot="header" style="margin:0">A slotted <em>header</em></h2><div slot="body"><p>The title is unused.</p></div>${footer}`
        ),
    },
    'Long body': {
      content: '',
      apply: (elements) =>
        fill(
          elements,
          'A long body scrolls',
          `<div slot="body">${'<p>The body scrolls while the header and footer stay.</p>'.repeat(40)}</div>${footer}`
        ),
    },
    'Markup in the title': {
      content: '',
      apply: (elements) =>
        fill(
          elements,
          '<em>Not emphasised</em> is waiting on you',
          '<div slot="body"><p>The title shows its tags as text.</p></div>'
        ),
    },
  },
} satisfies HarnessFormat;
