/// <reference lib="dom" />
import { loadLanguage } from '../editor/language';
import { reportError } from '../editor/log';
import { codeEditorTheme } from '../editor/theme';

import { previewStyles } from './preview.styles';

import type { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Compartment, EditorState } from '@codemirror/state';
import type { EditorView, lineNumbers } from '@codemirror/view';

// The CodeMirror modules are dynamically imported on connect (see loadView), so
// this bag holds the constructors/values once they're available.
interface PreviewModules {
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  lineNumbers: typeof lineNumbers;
  syntaxHighlighting: typeof syntaxHighlighting;
  defaultHighlightStyle: typeof defaultHighlightStyle;
}

/**
 * A read-only, syntax-highlighted code view: `<code-preview>` — the lightweight
 * companion to `<code-editor>`. It implements only the minimal Preview contract
 * (`setContent`) plus a `language` attribute that selects highlighting. Unlike the
 * editor it omits CodeMirror's `basicSetup` (history, keymaps, autocomplete,
 * search, bracket matching…), keeping only line numbers + syntax highlighting and
 * a permanently read-only state, so preview-only pages load far less.
 */
export class CodePreview extends HTMLElement {
  private view: EditorView | null = null;
  // Buffers content set before the lazy-loaded view exists, and mirrors the live
  // doc afterwards (same lifecycle handling as <code-editor>).
  private _content = '';
  private _loading = true;
  private _shadowRoot: ShadowRoot;
  private modules: PreviewModules | null = null;
  private languageCompartment: Compartment | null = null;

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
      const [viewModule, stateModule, languageModule] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/language'),
      ]);

      this.modules = {
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
      reportError('Failed to load code preview', err);
      this._loading = false;
      this.render();
    }
  }

  private initializeView() {
    // Guard against double initialization (e.g. rapid connect/disconnect).
    if (this.view || !this.modules) return;

    const mount = this._shadowRoot.querySelector('.code-preview-content') as HTMLElement | null;
    if (!mount) {
      reportError('Code preview mount element not found');
      return;
    }

    const {
      EditorView,
      EditorState,
      Compartment,
      lineNumbers,
      syntaxHighlighting,
      defaultHighlightStyle,
    } = this.modules;

    this.languageCompartment = new Compartment();

    const state = EditorState.create({
      doc: this._content,
      extensions: [
        lineNumbers(),
        codeEditorTheme(EditorView),
        syntaxHighlighting(defaultHighlightStyle),
        this.languageCompartment.of([]),
        // Permanently read-only — there is no editing surface to reconfigure.
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });

    this.view = new EditorView({ state, parent: mount });

    // Resolve the initial language (if any) once the view exists.
    const language = this.getAttribute('language');
    if (language) void this.updateLanguage(language);
  }

  private async updateLanguage(name: string | null) {
    if (!this.view || !this.languageCompartment) return;
    const extension = await loadLanguage(name);
    // The view may have been torn down while awaiting the grammar.
    if (!this.view || !this.languageCompartment) return;
    this.view.dispatch({ effects: this.languageCompartment.reconfigure(extension) });
  }

  /** Set the code to display. Buffered until the lazy view exists, then applied. */
  setContent(content: string) {
    this._content = content;
    if (this.view) {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: content },
      });
    }
  }

  /** The displayed text (live doc once the view exists, else the buffered value). */
  getContent(): string {
    if (this.view) return this.view.state.doc.toString();
    return this._content;
  }

  private render() {
    const body = this._loading
      ? '<div class="code-preview-loading">Loading…</div>'
      : '<div class="code-preview-content"></div>';
    this._shadowRoot.innerHTML = `
      <style>${previewStyles}</style>
      <div class="code-preview-container">${body}</div>
    `;
  }
}

customElements.define('code-preview', CodePreview);
