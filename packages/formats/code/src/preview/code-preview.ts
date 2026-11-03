/// <reference lib="dom" />
import {
  createReadyGate,
  defineElement,
  type ReadyGate,
  reportError,
} from '@stillpointlab/common-format';

import { loadLanguage } from '../editor/language';
import { codeEditorTheme } from '../editor/theme';

import { previewStyles } from './preview.styles';

import type { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Compartment, EditorState } from '@codemirror/state';
import type { EditorView, lineNumbers } from '@codemirror/view';
import type { PreviewElement } from '@stillpointlab/common-format';

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
export class CodePreview extends HTMLElement implements PreviewElement {
  private view: EditorView | null = null;
  // Settled once the view exists with the current content and language.
  private readonly ready: ReadyGate = createReadyGate(this);
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
    const cycle = this.ready.begin();
    this.render();
    // Defer to the next tick so the shadow DOM is ready before we mount the view.
    setTimeout(() => this.loadView(cycle), 0);
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = null;
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    if (!this.view) return;
    if (name === 'language') {
      const cycle = this.ready.begin();
      void this.updateLanguage(newValue).then(() => this.ready.settle(cycle));
    }
  }

  private async loadView(cycle: number) {
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

      // A newer connection owns the element now; it loads and settles itself.
      if (!this.ready.isCurrent(cycle)) return;
      this._loading = false;
      this.render();

      setTimeout(() => this.initializeView(cycle), 0);
    } catch (err) {
      reportError('Failed to load code preview', err);
      if (!this.ready.isCurrent(cycle)) return;
      this._loading = false;
      this.render();
      this.ready.settle(cycle);
    }
  }

  private initializeView(cycle: number) {
    // Only the live connection builds; a stale one (moved or reconnected since)
    // stops here, and the live one settles even if a view is already in place.
    if (!this.ready.isCurrent(cycle) || !this.modules) return;
    if (this.view) {
      this.ready.settle(cycle);
      return;
    }

    const mount = this._shadowRoot.querySelector('.code-preview-content') as HTMLElement | null;
    if (!mount) {
      reportError('Code preview mount element not found');
      // Settle empty, as a failed import does, rather than strand whenReady().
      this.ready.settle(cycle);
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

    // Resolve the initial language (if any) once the view exists; the element
    // is ready once the grammar has been applied too.
    const language = this.getAttribute('language');
    void (language ? this.updateLanguage(language) : Promise.resolve()).then(() =>
      this.ready.settle(cycle)
    );
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

defineElement('code-preview', CodePreview);
