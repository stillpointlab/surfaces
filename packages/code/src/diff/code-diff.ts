/// <reference lib="dom" />
import { loadLanguage } from '../editor/language';
import { reportError } from '../editor/log';

import { diffStyles } from './diff.styles';

import type { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { MergeView } from '@codemirror/merge';
import type { Compartment, EditorState } from '@codemirror/state';
import type { EditorView, lineNumbers } from '@codemirror/view';

// The CodeMirror modules are dynamically imported on connect (see loadView), so
// this bag holds the constructors/values once they're available.
interface DiffModules {
  MergeView: typeof MergeView;
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  lineNumbers: typeof lineNumbers;
  syntaxHighlighting: typeof syntaxHighlighting;
  defaultHighlightStyle: typeof defaultHighlightStyle;
}

/** The two documents to compare. `left` is the base (red removals), `right` the current (green additions). */
export interface DiffContents {
  left: string;
  right: string;
}

/**
 * A read-only, side-by-side diff view: `<code-diff>` — the diff companion to
 * `<code-editor>`/`<code-preview>`. Built on CodeMirror's `@codemirror/merge`
 * `MergeView`: two panes (left = base, right = current) with per-chunk red/green
 * highlighting, a center divider gutter, and collapsed unchanged regions. Like
 * `<code-preview>` it omits the editor's `basicSetup` and is permanently read-only,
 * keeping only line numbers + syntax highlighting, so the diff page loads lean.
 *
 * It diffs the raw text of each side; markdown is compared as source (with
 * `language="markdown"` highlighting), so one element serves every content type.
 */
export class CodeDiff extends HTMLElement {
  private view: MergeView | null = null;
  // Buffers the two sides set before the lazy-loaded view exists, and mirrors the
  // live docs afterwards (same lifecycle handling as <code-preview>).
  private _left = '';
  private _right = '';
  private _loading = true;
  private _shadowRoot: ShadowRoot;
  private modules: DiffModules | null = null;
  private languageCompartmentA: Compartment | null = null;
  private languageCompartmentB: Compartment | null = null;

  static get observedAttributes() {
    return ['language'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Defer to the next tick so the shadow DOM is ready before we mount the view.
    setTimeout(() => this.loadView(), 0);
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = null;
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (!this.view) return;
    if (name === 'language') void this.updateLanguage(newValue);
  }

  private async loadView() {
    try {
      const [mergeModule, viewModule, stateModule, languageModule] = await Promise.all([
        import('@codemirror/merge'),
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/language'),
      ]);

      this.modules = {
        MergeView: mergeModule.MergeView,
        EditorView: viewModule.EditorView,
        lineNumbers: viewModule.lineNumbers,
        EditorState: stateModule.EditorState,
        Compartment: stateModule.Compartment,
        syntaxHighlighting: languageModule.syntaxHighlighting,
        defaultHighlightStyle: languageModule.defaultHighlightStyle,
      };

      this._loading = false;
      this.render();

      setTimeout(() => this.initializeView(), 0);
    } catch (err) {
      reportError('Failed to load code diff', err);
      this._loading = false;
      this.render();
    }
  }

  private initializeView() {
    // Guard against double initialization (e.g. rapid connect/disconnect).
    if (this.view || !this.modules) return;

    const mount = this._shadowRoot.querySelector('.code-diff-content') as HTMLElement | null;
    if (!mount) {
      reportError('Code diff mount element not found');
      return;
    }

    const {
      MergeView,
      EditorView,
      EditorState,
      Compartment,
      lineNumbers,
      syntaxHighlighting,
      defaultHighlightStyle,
    } = this.modules;

    this.languageCompartmentA = new Compartment();
    this.languageCompartmentB = new Compartment();

    // Shared read-only extension set for each pane; only the language compartment differs.
    const sideExtensions = (languageCompartment: Compartment) => [
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle),
      languageCompartment.of([]),
      // Permanently read-only — the diff has no editing surface.
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    this.view = new MergeView({
      a: { doc: this._left, extensions: sideExtensions(this.languageCompartmentA) },
      b: { doc: this._right, extensions: sideExtensions(this.languageCompartmentB) },
      parent: mount,
      orientation: 'a-b',
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });

    // Resolve the initial language (if any) once the view exists.
    const language = this.getAttribute('language');
    if (language) void this.updateLanguage(language);
  }

  private async updateLanguage(name: string | null) {
    if (!this.view || !this.languageCompartmentA || !this.languageCompartmentB) return;
    const extension = await loadLanguage(name);
    // The view may have been torn down while awaiting the grammar.
    if (!this.view || !this.languageCompartmentA || !this.languageCompartmentB) return;
    this.view.a.dispatch({ effects: this.languageCompartmentA.reconfigure(extension) });
    this.view.b.dispatch({ effects: this.languageCompartmentB.reconfigure(extension) });
  }

  /**
   * Set both sides of the diff. Buffered until the lazy view exists, then applied
   * by replacing each pane's doc — the MergeView recomputes the chunks/highlights.
   */
  setContents({ left, right }: DiffContents) {
    this._left = left;
    this._right = right;
    if (this.view) {
      this.view.a.dispatch({
        changes: { from: 0, to: this.view.a.state.doc.length, insert: left },
      });
      this.view.b.dispatch({
        changes: { from: 0, to: this.view.b.state.doc.length, insert: right },
      });
    }
  }

  /** The displayed text of both sides (live docs once the view exists, else buffered). */
  getContents(): DiffContents {
    if (this.view) {
      return { left: this.view.a.state.doc.toString(), right: this.view.b.state.doc.toString() };
    }
    return { left: this._left, right: this._right };
  }

  private render() {
    const body = this._loading
      ? '<div class="code-diff-loading">Loading…</div>'
      : '<div class="code-diff-content"></div>';
    this._shadowRoot.innerHTML = `
      <style>${diffStyles}</style>
      <div class="code-diff-container">${body}</div>
    `;
  }
}

customElements.define('code-diff', CodeDiff);
