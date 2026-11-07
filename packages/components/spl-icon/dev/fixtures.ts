// This component in the surfaces harness (`npm run dev`). The controls pick the
// glyph, size and padding; the one fixture exists because the harness needs one.
import '../src/spl-icon';

import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';

const TAG = 'spl-icon';

const ICONS = [
  'dots-vertical',
  'back-arrow',
  'edit-pencil',
  'gear',
  'profile',
  'ai-model',
  'plus-circle',
  'trash',
  'logout',
  'more-horizontal',
  'close',
  'task',
  'inventory',
  'folder',
  'document',
  'copy',
  'download',
  'mail',
  'bold',
  'italic',
  'strikethrough',
  'code',
  'code-block',
  'quote',
  'list-bulleted',
  'list-numbered',
  'link',
  'table',
  'chevron-down',
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
] as const;

const icon = (elements: HarnessElements): HTMLElement => elements.extras[TAG];

/** `default` removes the attribute, leaving the stylesheet default. */
function setOrRemove(el: HTMLElement, name: string, value: string): void {
  if (value === 'default') el.removeAttribute(name);
  else el.setAttribute(name, value);
}

export default {
  elements: { extra: [TAG] },
  controls: [
    {
      kind: 'select',
      label: 'Icon',
      options: ICONS,
      apply: (elements, value) => icon(elements).setAttribute('icon-name', value),
    },
    {
      kind: 'select',
      label: 'Size',
      options: ['default', 'small', 'large'],
      apply: (elements, value) => setOrRemove(icon(elements), 'data-size', value),
    },
    {
      kind: 'select',
      label: 'Padding',
      options: ['default', 'none', 'small', 'large'],
      apply: (elements, value) => setOrRemove(icon(elements), 'data-padding', value),
    },
  ],
  fixtures: {
    Icon: { content: '', apply: () => {} },
  },
} satisfies HarnessFormat;
