/// <reference lib="dom" />
import { editorStyles } from './editor.styles';
import { loadLanguage } from './language';
import { reportError } from './log';
import { codeEditorTheme } from './theme';

import type { Compartment, EditorState, Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { basicSetup } from 'codemirror';

// The heavy CodeMirror modules are dynamically imported on connect (see loadEditor),
// so this bag holds the constructors/values once they're available.
interface EditorModules {
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  basicSetup: typeof basicSetup;
}

/**
 * A CodeMirror-based code editor web component: `<code-editor>`. It mirrors the
 * `<md-editor>` contract so the host can drive either interchangeably —
 * `setContent`/`getContent` strings, a `content-change` CustomEvent on every edit,
 * and a `readonly` attribute — plus a `language` attribute that selects syntax
 * highlighting. `basicSetup` provides line numbers and sensible editing defaults.
 */
export class CodeEditor extends HTMLElement {
  private view: EditorView | null = null;
  // Buffers content set before the lazy-loaded view exists, and mirrors the live
  // doc afterwards, so getContent()/setContent() work at any point in the lifecycle.
  private _content = '';
  private _loading = true;
  private _shadowRoot: ShadowRoot;
  private modules: EditorModules | null = null;
  private languageCompartment: Compartment | null = null;
  private readonlyCompartment: Compartment | null = null;

  static get observedAttributes() {
    return ['readonly', 'language'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    // Defer to the next tick so the shadow DOM is ready before we mount the view.
    setTimeout(() => this.loadEditor(), 0);
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = null;
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (!this.view) return;
    if (name === 'readonly') {
      this.updateReadOnlyState(newValue === 'true');
    } else if (name === 'language') {
      void this.updateLanguage(newValue);
    }
  }

  private async loadEditor() {
    try {
      const [viewModule, stateModule, codemirrorModule] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('codemirror'),
      ]);

      this.modules = {
        EditorView: viewModule.EditorView,
        EditorState: stateModule.EditorState,
        Compartment: stateModule.Compartment,
        basicSetup: codemirrorModule.basicSetup,
      };

      this._loading = false;
      this.render();

      setTimeout(() => this.initializeEditor(), 0);
    } catch (err) {
      reportError('Failed to load code editor', err);
      this._loading = false;
      this.render();
    }
  }

  private initializeEditor() {
    // Guard against double initialization (e.g. rapid connect/disconnect).
    if (this.view || !this.modules) return;

    const mount = this._shadowRoot.querySelector('.code-editor-content') as HTMLElement | null;
    if (!mount) {
      reportError('Code editor mount element not found');
      return;
    }

    const { EditorView, EditorState, Compartment, basicSetup } = this.modules;

    this.languageCompartment = new Compartment();
    this.readonlyCompartment = new Compartment();
    const readonly = this.getAttribute('readonly') === 'true';

    const state = EditorState.create({
      doc: this._content,
      extensions: [
        basicSetup,
        codeEditorTheme(EditorView),
        this.languageCompartment.of([]),
        this.readonlyCompartment.of(this.readonlyExtensions(readonly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.handleContentChange();
        }),
      ],
    });

    this.view = new EditorView({ state, parent: mount });

    // Resolve the initial language (if any) once the view exists.
    const language = this.getAttribute('language');
    if (language) void this.updateLanguage(language);
  }

  private readonlyExtensions(readonly: boolean): Extension {
    const { EditorState, EditorView } = this.modules!;
    return [EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly)];
  }

  private handleContentChange() {
    if (!this.view) return;
    const content = this.view.state.doc.toString();
    this._content = content;
    this.dispatchEvent(new CustomEvent('content-change', { detail: { content } }));
  }

  private updateReadOnlyState(readonly: boolean) {
    if (!this.view || !this.readonlyCompartment) return;
    this.view.dispatch({
      effects: this.readonlyCompartment.reconfigure(this.readonlyExtensions(readonly)),
    });
  }

  private async updateLanguage(name: string | null) {
    if (!this.view || !this.languageCompartment) return;
    const extension = await loadLanguage(name);
    // The view may have been torn down while awaiting the grammar.
    if (!this.view || !this.languageCompartment) return;
    this.view.dispatch({ effects: this.languageCompartment.reconfigure(extension) });
  }

  getContent(): string {
    if (this.view) return this.view.state.doc.toString();
    return this._content;
  }

  setContent(content: string) {
    this._content = content;
    if (this.view) {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: content },
      });
    }
  }

  override focus() {
    this.view?.focus();
  }

  private render() {
    const body = this._loading
      ? '<div class="code-editor-loading">Loading editor…</div>'
      : '<div class="code-editor-content"></div>';
    this._shadowRoot.innerHTML = `
      <style>${editorStyles}</style>
      <div class="code-editor-container">${body}</div>
    `;
  }
}

customElements.define('code-editor', CodeEditor);
