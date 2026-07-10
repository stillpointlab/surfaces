/// <reference lib="dom" />
import { editorStyles } from './editor.styles';
import { loadEmacsKeymapExtension, loadVimKeymapExtension } from './keymap-loaders';
import { loadLanguage } from './language';
import { reportError } from './log';
import { codeEditorTheme } from './theme';

import type { Compartment, EditorState, Extension, Prec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { basicSetup } from 'codemirror';

export type EditorKeymapMode = 'normal' | 'vim' | 'emacs';
export type EditorKeymapModeStatus = 'applied' | 'unsupported';

export interface EditorKeymapModeResult {
  requestedMode: EditorKeymapMode;
  activeMode: EditorKeymapMode;
  status: EditorKeymapModeStatus;
  reason?: string;
}

export interface EditorKeymapModeChangeDetail extends EditorKeymapModeResult {}

const KEYMAP_MODES: readonly EditorKeymapMode[] = ['normal', 'vim', 'emacs'];
const SUPPORTED_KEYMAP_MODES: readonly EditorKeymapMode[] = ['normal', 'vim', 'emacs'];

const keymapModeLabels: Record<EditorKeymapMode, string> = {
  normal: 'Normal',
  vim: 'Vim',
  emacs: 'Emacs',
};

const parseKeymapMode = (value: string | null): EditorKeymapMode | null => {
  return KEYMAP_MODES.includes(value as EditorKeymapMode) ? (value as EditorKeymapMode) : null;
};

// The heavy CodeMirror modules are dynamically imported on connect (see loadEditor),
// so this bag holds the constructors/values once they're available.
interface EditorModules {
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  Prec: typeof Prec;
  basicSetup: typeof basicSetup;
}

/**
 * A CodeMirror-based code editor web component: `<code-editor>`. It mirrors the
 * `<md-editor>` contract so the host can drive either interchangeably —
 * `setContent`/`getContent` strings, a `content-change` CustomEvent on every edit,
 * and a `readonly` attribute — plus a `language` attribute that selects syntax
 * highlighting. `basicSetup` provides line numbers and sensible editing defaults.
 * `keymap-mode` is an extensible keyboard-mode selector; this foundation slice
 * supports normal mode and returns explicit unsupported results for future modes.
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
  private keymapModeCompartment: Compartment | null = null;
  private activeKeymapMode: EditorKeymapMode = 'normal';
  private vimKeymapExtension: Extension | null = null;
  private vimKeymapLoad: Promise<Extension> | null = null;
  private emacsKeymapExtension: Extension | null = null;
  private emacsKeymapLoad: Promise<Extension> | null = null;

  static get observedAttributes() {
    return ['readonly', 'language', 'keymap-mode'];
  }

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    if (!parseKeymapMode(this.getAttribute('keymap-mode'))) this.reflectKeymapMode();
    this.render();
    // Defer to the next tick so the shadow DOM is ready before we mount the view.
    setTimeout(() => this.loadEditor(), 0);
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;
    if (name === 'keymap-mode') {
      void this.applyKeymapModeFromAttribute(newValue);
      return;
    }
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
        Prec: stateModule.Prec,
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

    const { EditorView, EditorState, Compartment, Prec, basicSetup } = this.modules;

    this.languageCompartment = new Compartment();
    this.readonlyCompartment = new Compartment();
    this.keymapModeCompartment = new Compartment();
    const readonly = this.getAttribute('readonly') === 'true';
    if (readonly) {
      this.activeKeymapMode = 'normal';
      this.reflectKeymapMode();
    }

    const state = EditorState.create({
      doc: this._content,
      extensions: [
        basicSetup,
        codeEditorTheme(EditorView),
        this.languageCompartment.of([]),
        this.readonlyCompartment.of(this.readonlyExtensions(readonly)),
        Prec.highest(
          this.keymapModeCompartment.of(this.keymapModeExtensions(this.activeKeymapMode))
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.handleContentChange();
        }),
      ],
    });

    this.view = new EditorView({ state, parent: mount });

    // Resolve the initial language (if any) once the view exists.
    const language = this.getAttribute('language');
    if (language) void this.updateLanguage(language);
    void this.applyKeymapModeFromAttribute(this.getAttribute('keymap-mode'));
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
    if (readonly && this.activeKeymapMode !== 'normal') {
      void this.setKeymapMode('normal');
    }
    this.view.dispatch({
      effects: this.readonlyCompartment.reconfigure(this.readonlyExtensions(readonly)),
    });
    this.syncToolbar();
  }

  private keymapModeExtensions(mode: EditorKeymapMode): Extension {
    if (mode === 'vim') return this.vimKeymapExtension ?? [];
    if (mode === 'emacs') return [this.emacsShortcutOverrides(), this.emacsKeymapExtension ?? []];
    return [];
  }

  private emacsShortcutOverrides(): Extension {
    const { EditorView } = this.modules!;
    return EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (
          !event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.shiftKey ||
          event.key.toLowerCase() !== 'a'
        ) {
          return false;
        }
        const line = view.state.doc.lineAt(view.state.selection.main.head);
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
        return true;
      },
    });
  }

  private async loadKeymapModeExtension(mode: EditorKeymapMode): Promise<Extension> {
    if (mode === 'normal') return [];
    if (mode === 'vim') {
      this.vimKeymapLoad ??= loadVimKeymapExtension();
      this.vimKeymapExtension = await this.vimKeymapLoad;
      return this.vimKeymapExtension;
    }
    if (mode === 'emacs') {
      this.emacsKeymapLoad ??= loadEmacsKeymapExtension();
      this.emacsKeymapExtension = await this.emacsKeymapLoad;
      return this.emacsKeymapExtension;
    }
    return [];
  }

  getSupportedKeymapModes(): readonly EditorKeymapMode[] {
    return this.isReadOnly() ? ['normal'] : SUPPORTED_KEYMAP_MODES;
  }

  getKeymapMode(): EditorKeymapMode {
    return this.activeKeymapMode;
  }

  async setKeymapMode(mode: EditorKeymapMode | string): Promise<EditorKeymapModeResult> {
    const parsedMode = parseKeymapMode(mode);

    if (!parsedMode) {
      const result: EditorKeymapModeResult = {
        requestedMode: this.activeKeymapMode,
        activeMode: this.activeKeymapMode,
        status: 'unsupported',
        reason: 'invalid-mode',
      };
      this.reflectKeymapMode();
      return result;
    }

    const requestedMode = parsedMode;

    if (this.isReadOnly() && requestedMode !== 'normal') {
      const result: EditorKeymapModeResult = {
        requestedMode,
        activeMode: this.activeKeymapMode,
        status: 'unsupported',
        reason: 'readonly',
      };
      this.reflectKeymapMode();
      return result;
    }

    if (!SUPPORTED_KEYMAP_MODES.includes(requestedMode)) {
      const result: EditorKeymapModeResult = {
        requestedMode,
        activeMode: this.activeKeymapMode,
        status: 'unsupported',
        reason: 'not-supported',
      };
      this.reflectKeymapMode();
      return result;
    }

    try {
      await this.loadKeymapModeExtension(requestedMode);
    } catch (err) {
      if (requestedMode === 'vim') this.vimKeymapLoad = null;
      if (requestedMode === 'emacs') this.emacsKeymapLoad = null;
      reportError(`Failed to load ${requestedMode} keymap mode`, err);
      this.reflectKeymapMode();
      return {
        requestedMode,
        activeMode: this.activeKeymapMode,
        status: 'unsupported',
        reason: 'load-failed',
      };
    }

    const previousMode = this.activeKeymapMode;
    this.activeKeymapMode = requestedMode;
    this.reflectKeymapMode();
    this.reconfigureKeymapMode();
    this.syncToolbar();

    const result: EditorKeymapModeResult = {
      requestedMode,
      activeMode: this.activeKeymapMode,
      status: 'applied',
    };

    if (previousMode !== this.activeKeymapMode) {
      this.dispatchEvent(
        new CustomEvent<EditorKeymapModeChangeDetail>('keymap-mode-change', {
          detail: result,
        })
      );
    }

    return result;
  }

  private async applyKeymapModeFromAttribute(value: string | null) {
    const parsedMode = parseKeymapMode(value);
    if (!parsedMode) {
      this.reflectKeymapMode();
      return;
    }
    await this.setKeymapMode(parsedMode);
  }

  private reconfigureKeymapMode() {
    if (!this.view || !this.keymapModeCompartment) return;
    this.view.dispatch({
      effects: this.keymapModeCompartment.reconfigure(
        this.keymapModeExtensions(this.activeKeymapMode)
      ),
    });
  }

  private reflectKeymapMode() {
    if (this.getAttribute('keymap-mode') !== this.activeKeymapMode) {
      this.setAttribute('keymap-mode', this.activeKeymapMode);
    }
  }

  private isReadOnly(): boolean {
    return this.getAttribute('readonly') === 'true';
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

  private handleToolbarClick(event: Event) {
    const button = event.target instanceof HTMLElement ? event.target.closest('button') : null;
    const mode = parseKeymapMode(button?.getAttribute('data-keymap-mode') ?? null);
    if (!mode || button?.hasAttribute('disabled')) return;
    void this.setKeymapMode(mode);
    this.view?.focus();
  }

  private renderToolbar(): string {
    if (this._loading || this.isReadOnly()) return '';
    const supportedModes = new Set(this.getSupportedKeymapModes());

    return `
      <div class="code-editor-toolbar" aria-label="Editor keyboard mode">
        <div class="code-editor-keymap-toggle" role="group" aria-label="Keyboard mode">
          ${KEYMAP_MODES.map((mode) => {
            const selected = this.activeKeymapMode === mode;
            const supported = supportedModes.has(mode);
            return `<button
              type="button"
              class="code-editor-keymap-button${selected ? ' is-active' : ''}"
              data-keymap-mode="${mode}"
              aria-pressed="${selected ? 'true' : 'false'}"
              title="${supported ? `${keymapModeLabels[mode]} keyboard mode` : `${keymapModeLabels[mode]} keyboard mode is not supported yet`}"
              ${supported ? '' : 'disabled'}
            >${keymapModeLabels[mode]}</button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  private syncToolbar() {
    const existingToolbar = this._shadowRoot.querySelector('.code-editor-toolbar');
    existingToolbar?.remove();

    const toolbar = this.renderToolbar();
    if (!toolbar) return;

    const content = this._shadowRoot.querySelector('.code-editor-content, .code-editor-loading');
    content?.insertAdjacentHTML('beforebegin', toolbar);
    this.bindToolbarEvents();
  }

  private bindToolbarEvents() {
    this._shadowRoot
      .querySelector('.code-editor-toolbar')
      ?.addEventListener('click', (event) => this.handleToolbarClick(event));
  }

  private render() {
    const body = this._loading
      ? '<div class="code-editor-loading">Loading editor…</div>'
      : '<div class="code-editor-content"></div>';
    this._shadowRoot.innerHTML = `
      <style>${editorStyles}</style>
      <div class="code-editor-container">${this.renderToolbar()}${body}</div>
    `;
    this.bindToolbarEvents();
  }
}

customElements.define('code-editor', CodeEditor);
