/// <reference lib="dom" />
import {
  createLazyLoader,
  createReadyGate,
  createStatus,
  defineElement,
  hydrate,
  type ReadyGate,
  reportError,
  STATUS_MESSAGES,
} from '@stillpointlab/common-format';

import { loadLanguage } from '../editor/language';
import { codeEditorTheme } from '../editor/theme';

import { previewStyles } from './preview.styles';

import type { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Compartment, EditorState } from '@codemirror/state';
import type { EditorView, lineNumbers } from '@codemirror/view';
import type { PreviewElement } from '@stillpointlab/common-format';

// The CodeMirror modules are dynamically imported on connect (see loadEngine), so
// this bag holds the constructors/values once they're available.
interface PreviewModules {
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  lineNumbers: typeof lineNumbers;
  syntaxHighlighting: typeof syntaxHighlighting;
  defaultHighlightStyle: typeof defaultHighlightStyle;
}

// The engine's modules: imported on first connect and shared by every instance.
const loadEngine = createLazyLoader(async (): Promise<PreviewModules> => {
  const [viewModule, stateModule, languageModule] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/state'),
    import('@codemirror/language'),
  ]);
  return {
    EditorView: viewModule.EditorView,
    lineNumbers: viewModule.lineNumbers,
    EditorState: stateModule.EditorState,
    Compartment: stateModule.Compartment,
    syntaxHighlighting: languageModule.syntaxHighlighting,
    defaultHighlightStyle: languageModule.defaultHighlightStyle,
  };
});

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
  // Loading until the engine arrives; failed if it could not load.
  private phase: 'loading' | 'loaded' | 'failed' = 'loading';
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
    // A failed load is retried on the next connection.
    if (this.phase === 'failed') this.phase = 'loading';
    this.render();
    this.hydrateView();
  }

  /** Load the engine (shared, once) and build this connection's view. */
  private hydrateView() {
    hydrate(this.ready, {
      load: loadEngine,
      build: (modules) => this.buildView(modules),
      fail: (error) => {
        reportError('Failed to load code preview', error);
        this.phase = 'failed';
        this.render();
      },
    });
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

  private buildView(modules: PreviewModules): Promise<void> | void {
    this.modules = modules;
    if (this.phase !== 'loaded') {
      this.phase = 'loaded';
      this.render();
    }

    const mount = this._shadowRoot.querySelector('.code-preview-content') as HTMLElement | null;
    if (!mount) {
      throw new Error('Code preview mount element not found');
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
    return language ? this.updateLanguage(language) : undefined;
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
    const body = this.phase === 'loaded' ? '<div class="code-preview-content"></div>' : '';
    this._shadowRoot.innerHTML = `
      <style>${previewStyles}</style>
      <div class="code-preview-container">${body}</div>
    `;
    if (this.phase !== 'loaded') {
      this._shadowRoot.querySelector('.code-preview-container')?.append(this.status());
    }
  }

  /** The placeholder shown while loading, or after the engine failed to load. */
  private status(): HTMLElement {
    return this.phase === 'failed'
      ? createStatus('error', STATUS_MESSAGES.previewFailed)
      : createStatus('loading', STATUS_MESSAGES.loading);
  }
}

defineElement('code-preview', CodePreview);
