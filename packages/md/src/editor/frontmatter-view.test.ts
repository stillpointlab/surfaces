import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';

import {
  frontmatterSummary,
  frontmatterViewKey,
  frontmatterViewPlugin,
  setFrontmatterExpanded,
} from './frontmatter-view';
import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';

const parser = getMarkdownParser();
const serializer = getMarkdownSerializer();

const SAMPLE = '---\ncolumn: briefed\ntitle: "Doc"\n---\n\n# Title\n\nBody text.';

let view: EditorView | null = null;

const createView = (markdown: string, trackDocChanged?: boolean[]): EditorView => {
  const place = document.createElement('div');
  document.body.appendChild(place);
  view = new EditorView(place, {
    state: EditorState.create({
      doc: parser.parse(markdown),
      plugins: [frontmatterViewPlugin(), keymap(baseKeymap)],
    }),
    dispatchTransaction(tr) {
      trackDocChanged?.push(tr.docChanged);
      view!.updateState(view!.state.apply(tr));
    },
  });
  return view;
};

const keydown = (v: EditorView, key: string): void => {
  v.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

const chip = (v: EditorView): HTMLButtonElement => {
  const el = v.dom.querySelector<HTMLButtonElement>('.md-frontmatter-chip');
  if (!el) throw new Error('chip not rendered');
  return el;
};

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = '';
});

describe('frontmatterSummary', () => {
  it('shows the first pair and the key count', () => {
    expect(frontmatterSummary('column: briefed\ntitle: "Doc"')).toEqual({
      text: 'column: briefed · 2 keys',
      warning: false,
    });
  });

  it('shows a single pair without a count', () => {
    expect(frontmatterSummary('column: briefed')).toEqual({
      text: 'column: briefed',
      warning: false,
    });
  });

  it('ignores indented (nested) keys in the count', () => {
    expect(frontmatterSummary('meta:\n  nested: 1\ncolumn: done').text).toBe('meta: · 2 keys');
  });

  it('reports an empty block', () => {
    expect(frontmatterSummary('  \n')).toEqual({ text: 'empty', warning: false });
  });

  it('flags content with no recognizable keys', () => {
    expect(frontmatterSummary('{{{ not yaml')).toEqual({
      text: 'unrecognized YAML',
      warning: true,
    });
  });

  it('truncates a long first pair', () => {
    const summary = frontmatterSummary(`title: ${'x'.repeat(80)}`);
    expect(summary.text.length).toBeLessThanOrEqual(48);
    expect(summary.text.endsWith('…')).toBe(true);
  });
});

describe('FrontmatterView', () => {
  it('renders a collapsed chip by default, with no editable content', () => {
    const v = createView(SAMPLE);

    const button = chip(v);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain('frontmatter');
    expect(button.textContent).toContain('column: briefed · 2 keys');
    expect(v.dom.querySelector('.md-frontmatter-content')).toBeNull();
    expect(frontmatterViewKey.getState(v.state)).toBe(false);
  });

  it('expands to an editable raw-YAML region on chip click', () => {
    const v = createView(SAMPLE);

    chip(v).click();

    const content = v.dom.querySelector('.md-frontmatter-content');
    expect(content).not.toBeNull();
    expect(content!.textContent).toBe('column: briefed\ntitle: "Doc"');
    expect(chip(v).getAttribute('aria-expanded')).toBe('true');
    expect(frontmatterViewKey.getState(v.state)).toBe(true);
  });

  it('collapses back to the chip on a second click', () => {
    const v = createView(SAMPLE);

    chip(v).click();
    chip(v).click();

    expect(v.dom.querySelector('.md-frontmatter-content')).toBeNull();
    expect(chip(v).getAttribute('aria-expanded')).toBe('false');
  });

  it('toggling never marks the document as changed', () => {
    const docChanged: boolean[] = [];
    const v = createView(SAMPLE, docChanged);

    chip(v).click();
    chip(v).click();

    expect(docChanged.length).toBeGreaterThan(0);
    expect(docChanged.every((changed) => !changed)).toBe(true);
  });

  it('moves the cursor out of the block when collapsing', () => {
    const v = createView(SAMPLE);

    setFrontmatterExpanded(v, true);
    expect(v.state.selection.from).toBe(1); // inside the YAML region
    setFrontmatterExpanded(v, false);

    expect(v.state.selection.from).toBeGreaterThanOrEqual(v.state.doc.firstChild!.nodeSize);
  });

  it('reflects edits in the chip summary and serializes them canonically', () => {
    const v = createView(SAMPLE);

    setFrontmatterExpanded(v, true);
    const fm = v.state.doc.firstChild!;
    // Replace the YAML text: content spans positions 1..1+size.
    v.dispatch(v.state.tr.insertText('column: done', 1, 1 + fm.content.size));
    setFrontmatterExpanded(v, false);

    expect(chip(v).textContent).toContain('column: done');
    expect(serializer.serialize(v.state.doc)).toBe(
      '---\ncolumn: done\n---\n\n# Title\n\nBody text.'
    );
  });

  it('round-trips byte-identically with the chip UI active', () => {
    const v = createView(SAMPLE);
    chip(v).click();

    expect(serializer.serialize(v.state.doc)).toBe(SAMPLE);
  });

  it('shows a warning summary for unrecognizable YAML', () => {
    const v = createView('---\n{{{ not yaml\n---\n\nBody text.');

    const summary = chip(v).querySelector('.md-frontmatter-chip-summary')!;
    expect(summary.textContent).toBe('unrecognized YAML');
    expect(summary.classList.contains('md-frontmatter-chip-warning')).toBe(true);
  });
});

describe('keyboard behavior', () => {
  it('backspace at the start of the body does not merge it into the frontmatter', () => {
    const v = createView(SAMPLE);
    const fm = v.state.doc.firstChild!;
    const bodyStart = fm.nodeSize + 1; // first position inside the heading
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, bodyStart)));

    keydown(v, 'Backspace');

    expect(v.state.doc.firstChild!.type.name).toBe('frontmatter');
    expect(v.state.doc.firstChild!.textContent).toBe('column: briefed\ntitle: "Doc"');
    expect(v.state.doc.child(1).textContent).toBe('Title');
  });

  it('backspace elsewhere in the body still joins blocks (control)', () => {
    const v = createView('---\na: 1\n---\n\nOne\n\nTwo');
    // Cursor at the start of the "Two" paragraph.
    const twoStart = v.state.doc.content.size - 'Two'.length - 1;
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, twoStart)));

    keydown(v, 'Backspace');

    expect(v.state.doc.textContent).toContain('OneTwo');
  });

  it('Enter on a selected collapsed block expands it', () => {
    const v = createView(SAMPLE);
    v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, 0)));

    keydown(v, 'Enter');

    expect(frontmatterViewKey.getState(v.state)).toBe(true);
    expect(v.dom.querySelector('.md-frontmatter-content')).not.toBeNull();
  });

  it('Escape inside the expanded region collapses it', () => {
    const v = createView(SAMPLE);
    setFrontmatterExpanded(v, true);

    keydown(v, 'Escape');

    expect(frontmatterViewKey.getState(v.state)).toBe(false);
    expect(v.state.selection.from).toBeGreaterThanOrEqual(v.state.doc.firstChild!.nodeSize);
  });

  it('deliberate deletion of the selected block still works', () => {
    const v = createView(SAMPLE);
    v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, 0)));

    keydown(v, 'Backspace');

    expect(v.state.doc.firstChild!.type.name).toBe('heading');
    expect(serializer.serialize(v.state.doc)).toBe('# Title\n\nBody text.');
  });
});
