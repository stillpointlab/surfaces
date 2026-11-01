// Collapsed-chip editing UI for the frontmatter node. The chip shows a
// one-line summary of the block's top-level keys; clicking it (or pressing
// Enter while the node is selected) expands an editable raw-YAML region.
//
// The expansion state deliberately lives in PLUGIN state, not in the document:
// toggling dispatches a meta-only transaction, so `docChanged` stays false and
// hosts watching content-change never see a phantom edit. The plugin mirrors
// the state into a node decoration, which is what forces ProseMirror to call
// `update()` on the NodeView (a meta-only transaction alone would not); the
// NodeView returns false on a mode mismatch so it is rebuilt with or without a
// contentDOM. While collapsed there is no contentDOM at all — the cursor
// cannot land in hidden content, and arrowing into the block from the body
// yields a normal NodeSelection on the chip.
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';

export const frontmatterViewKey = new PluginKey<boolean>('frontmatterView');

const TOP_LEVEL_KEY = /^([A-Za-z0-9_$.-]+)\s*:/;
const SUMMARY_MAX = 48;

export interface FrontmatterSummary {
  text: string;
  /** True when the block has content but no recognizable top-level keys. */
  warning: boolean;
}

/**
 * Chip summary from a cheap line scan of the raw YAML — first `key: value`
 * pair plus a key count. Never parses YAML: the summary is display-only sugar
 * and must not be able to fail on a malformed block.
 */
export function frontmatterSummary(yaml: string): FrontmatterSummary {
  if (!yaml.trim()) return { text: 'empty', warning: false };

  const keys: string[] = [];
  let firstPair = '';
  for (const line of yaml.split('\n')) {
    const match = TOP_LEVEL_KEY.exec(line);
    if (!match) continue;
    keys.push(match[1]);
    if (!firstPair) firstPair = line.trim();
  }

  if (keys.length === 0) return { text: 'unrecognized YAML', warning: true };
  if (firstPair.length > SUMMARY_MAX) firstPair = `${firstPair.slice(0, SUMMARY_MAX - 1)}…`;
  return {
    text: keys.length > 1 ? `${firstPair} · ${keys.length} keys` : firstPair,
    warning: false,
  };
}

function isExpanded(view: EditorView): boolean {
  return frontmatterViewKey.getState(view.state) === true;
}

/**
 * Toggle the frontmatter region. Expanding places the cursor at the start of
 * the YAML text; collapsing moves a cursor that was inside the block to the
 * start of the body so it never sits in removed content.
 */
export function setFrontmatterExpanded(view: EditorView, expanded: boolean): void {
  const first = view.state.doc.firstChild;
  if (!first || first.type.name !== 'frontmatter') return;

  let tr = view.state.tr.setMeta(frontmatterViewKey, expanded);
  if (expanded) {
    tr = tr.setSelection(TextSelection.create(view.state.doc, 1));
  } else if (view.state.selection.from <= first.nodeSize) {
    tr = tr.setSelection(Selection.near(view.state.doc.resolve(first.nodeSize), 1));
  }
  view.dispatch(tr);
  view.focus();
}

class FrontmatterView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement | null = null;

  private node: ProseMirrorNode;
  private readonly view: EditorView;
  private readonly expanded: boolean;
  private readonly chip: HTMLButtonElement;
  private readonly summaryEl: HTMLSpanElement;

  constructor(node: ProseMirrorNode, view: EditorView) {
    this.node = node;
    this.view = view;
    this.expanded = isExpanded(view);

    this.dom = document.createElement('div');
    this.dom.className = 'md-frontmatter';
    this.dom.setAttribute('data-frontmatter', 'true');
    if (this.expanded) this.dom.classList.add('md-frontmatter-expanded');

    this.chip = document.createElement('button');
    this.chip.type = 'button';
    this.chip.className = 'md-frontmatter-chip';
    this.chip.contentEditable = 'false';
    this.chip.setAttribute('aria-expanded', String(this.expanded));
    this.chip.title = this.expanded ? 'Collapse frontmatter' : 'Expand frontmatter';

    const icon = document.createElement('span');
    icon.className = 'md-frontmatter-chip-icon';
    icon.textContent = this.expanded ? '▾' : '▸';

    const label = document.createElement('span');
    label.className = 'md-frontmatter-chip-label';
    label.textContent = 'frontmatter';

    this.summaryEl = document.createElement('span');
    this.summaryEl.className = 'md-frontmatter-chip-summary';

    this.chip.append(icon, label, this.summaryEl);
    // Keep the editor focused: a mousedown on the chip must not blur the view.
    this.chip.addEventListener('mousedown', (event) => event.preventDefault());
    this.chip.addEventListener('click', (event) => {
      event.preventDefault();
      setFrontmatterExpanded(this.view, !this.expanded);
    });
    this.dom.appendChild(this.chip);

    if (this.expanded) {
      const pre = document.createElement('pre');
      pre.className = 'md-frontmatter-content';
      const code = document.createElement('code');
      pre.appendChild(code);
      this.dom.appendChild(pre);
      this.contentDOM = code;
    }

    this.renderSummary();
  }

  update(node: ProseMirrorNode): boolean {
    if (node.type !== this.node.type) return false;
    // Mode changed → rebuild with/without a contentDOM.
    if (isExpanded(this.view) !== this.expanded) return false;
    this.node = node;
    this.renderSummary();
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof globalThis.Node && this.chip.contains(event.target);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    // ProseMirror must still observe the editable YAML text; everything else
    // (chip summary updates) is ours.
    if (
      this.contentDOM &&
      mutation.target instanceof globalThis.Node &&
      (mutation.target === this.contentDOM || this.contentDOM.contains(mutation.target))
    ) {
      return false;
    }
    return true;
  }

  private renderSummary(): void {
    const { text, warning } = frontmatterSummary(this.node.textContent);
    this.summaryEl.textContent = text;
    this.summaryEl.classList.toggle('md-frontmatter-chip-warning', warning);
  }
}

/**
 * Plugin owning the chip NodeView, the expansion state, and the keyboard
 * behavior around the block. Must be registered before the keymaps so its
 * handleKeyDown wins over joinBackward.
 */
export function frontmatterViewPlugin(): Plugin<boolean> {
  return new Plugin<boolean>({
    key: frontmatterViewKey,
    state: {
      init: () => false,
      apply(tr, value) {
        const meta: unknown = tr.getMeta(frontmatterViewKey);
        return typeof meta === 'boolean' ? meta : value;
      },
    },
    props: {
      nodeViews: {
        frontmatter: (node, view) => new FrontmatterView(node, view),
      },

      // The decoration mirrors the plugin state so a meta-only toggle still
      // changes something ProseMirror diffs — that is what triggers the
      // NodeView update/rebuild cycle.
      decorations(state) {
        if (frontmatterViewKey.getState(state) !== true) return null;
        const first = state.doc.firstChild;
        if (!first || first.type.name !== 'frontmatter') return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(0, first.nodeSize, { class: 'md-frontmatter-open' }),
        ]);
      },

      handleKeyDown(view, event) {
        const { state } = view;
        const first = state.doc.firstChild;
        if (!first || first.type.name !== 'frontmatter') return false;
        const selection = state.selection;

        // Backspace at the very start of the body must not join body text
        // into the metadata block. Deleting a selected (NodeSelection) block
        // is deliberate and stays allowed.
        if (
          event.key === 'Backspace' &&
          selection.empty &&
          selection.$from.depth > 0 &&
          selection.$from.parentOffset === 0 &&
          selection.$from.before(1) === first.nodeSize
        ) {
          return true;
        }

        if (
          event.key === 'Enter' &&
          !isExpanded(view) &&
          selection instanceof NodeSelection &&
          selection.node.type.name === 'frontmatter'
        ) {
          setFrontmatterExpanded(view, true);
          return true;
        }

        if (
          event.key === 'Escape' &&
          isExpanded(view) &&
          selection.$from.depth > 0 &&
          selection.$from.node(1).type.name === 'frontmatter'
        ) {
          setFrontmatterExpanded(view, false);
          return true;
        }

        return false;
      },
    },
  });
}
