/// <reference lib="dom" />
import { loadLanguage } from '../editor/language';
import { reportError } from '../editor/log';
import { codeEditorTheme } from '../editor/theme';

import { diffStyles } from './diff.styles';
import { stripInlineWhitespace } from './whitespace';

import type { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { MergeView } from '@codemirror/merge';
import type { Compartment, EditorState } from '@codemirror/state';
import type { EditorView, lineNumbers, highlightWhitespace } from '@codemirror/view';

// The CodeMirror modules are dynamically imported on connect (see loadView), so
// this bag holds the constructors/values once they're available.
interface DiffModules {
  MergeView: typeof MergeView;
  diff: typeof import('@codemirror/merge').diff;
  Change: typeof import('@codemirror/merge').Change;
  EditorView: typeof EditorView;
  EditorState: typeof EditorState;
  Compartment: typeof Compartment;
  lineNumbers: typeof lineNumbers;
  highlightWhitespace: typeof highlightWhitespace;
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
  private wrapCompartmentA: Compartment | null = null;
  private wrapCompartmentB: Compartment | null = null;
  private wsCompartmentA: Compartment | null = null;
  private wsCompartmentB: Compartment | null = null;

  static get observedAttributes() {
    // `language` (highlighting); `wrap` (soft-wrap, default on) and `show-whitespace`
    // (render whitespace markers, default off) are live compartment swaps;
    // `ignore-whitespace` (default off) and `collapse-unchanged` (default on) change a
    // diff/MergeView constructor option, so they rebuild the view.
    return ['language', 'wrap', 'show-whitespace', 'ignore-whitespace', 'collapse-unchanged'];
  }

  /** A boolean attribute is "on" when present and not explicitly `"false"` (default off). */
  private boolAttr(name: string): boolean {
    return this.hasAttribute(name) && this.getAttribute(name) !== 'false';
  }

  /** Default-on boolean attribute: only an explicit `"false"` turns it off. */
  private boolAttrDefaultOn(name: string): boolean {
    return this.getAttribute(name) !== 'false';
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
    // Wrap + show-whitespace are live compartment swaps; ignore-whitespace and
    // collapse-unchanged change a constructor option, so they rebuild the view.
    else if (name === 'wrap') this.updateWrap();
    else if (name === 'show-whitespace') this.updateShowWhitespace();
    else if (name === 'ignore-whitespace' || name === 'collapse-unchanged') this.rebuildView();
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
        diff: mergeModule.diff,
        Change: mergeModule.Change,
        EditorView: viewModule.EditorView,
        lineNumbers: viewModule.lineNumbers,
        highlightWhitespace: viewModule.highlightWhitespace,
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
      diff,
      Change,
      EditorView,
      EditorState,
      Compartment,
      lineNumbers,
      highlightWhitespace,
      syntaxHighlighting,
      defaultHighlightStyle,
    } = this.modules;

    this.languageCompartmentA = new Compartment();
    this.languageCompartmentB = new Compartment();
    this.wrapCompartmentA = new Compartment();
    this.wrapCompartmentB = new Compartment();
    this.wsCompartmentA = new Compartment();
    this.wsCompartmentB = new Compartment();

    // Soft-wrap is on by default (best for a side-by-side diff — no horizontal scroll,
    // nothing hidden off-screen); opt out with `wrap="false"`. Held in a compartment so
    // the attribute can toggle it live.
    const wrapExtension = () => (this.boolAttrDefaultOn('wrap') ? EditorView.lineWrapping : []);
    // Render whitespace as markers when `show-whitespace` is on (default off); live.
    const wsExtension = () => (this.boolAttr('show-whitespace') ? highlightWhitespace() : []);

    // Shared read-only extensions per pane; the language/wrap/whitespace compartments differ.
    const sideExtensions = (
      languageCompartment: Compartment,
      wrapCompartment: Compartment,
      wsCompartment: Compartment
    ) => [
      lineNumbers(),
      codeEditorTheme(EditorView),
      syntaxHighlighting(defaultHighlightStyle),
      languageCompartment.of([]),
      wrapCompartment.of(wrapExtension()),
      wsCompartment.of(wsExtension()),
      // Permanently read-only — the diff has no editing surface.
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    // "Ignore whitespace": diff a whitespace-stripped copy of each side, then map the
    // offsets back onto the original text (MergeView has no native option for this, so
    // we go through its `diffConfig.override` hook). See whitespace.ts.
    const diffConfig = this.boolAttr('ignore-whitespace')
      ? {
          override: (a: string, b: string) => {
            const sa = stripInlineWhitespace(a);
            const sb = stripInlineWhitespace(b);
            return diff(sa.norm, sb.norm).map(
              (c) => new Change(sa.map[c.fromA], sa.map[c.toA], sb.map[c.fromB], sb.map[c.toB])
            );
          },
        }
      : undefined;

    this.view = new MergeView({
      a: {
        doc: this._left,
        extensions: sideExtensions(
          this.languageCompartmentA,
          this.wrapCompartmentA,
          this.wsCompartmentA
        ),
      },
      b: {
        doc: this._right,
        extensions: sideExtensions(
          this.languageCompartmentB,
          this.wrapCompartmentB,
          this.wsCompartmentB
        ),
      },
      parent: mount,
      // We mount inside the shadow root; unlike EditorView, MergeView does not
      // auto-detect it, so without this its CodeMirror styles inject into the global
      // document and shadow-DOM encapsulation hides them (editor renders blank). See
      // MergeView's `root` option ("only necessary if mounted in a shadow root").
      root: this._shadowRoot,
      orientation: 'a-b',
      highlightChanges: true,
      gutter: true,
      // Collapse long unchanged regions by default; `collapse-unchanged="false"` shows
      // the full file. (A constructor option — toggling it rebuilds the view.)
      collapseUnchanged: this.boolAttrDefaultOn('collapse-unchanged')
        ? { margin: 3, minSize: 4 }
        : undefined,
      diffConfig,
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

  /** Toggle soft-wrapping on both panes (live, via the wrap compartments). */
  private updateWrap() {
    if (!this.view || !this.wrapCompartmentA || !this.wrapCompartmentB || !this.modules) return;
    const extension = this.boolAttrDefaultOn('wrap') ? this.modules.EditorView.lineWrapping : [];
    this.view.a.dispatch({ effects: this.wrapCompartmentA.reconfigure(extension) });
    this.view.b.dispatch({ effects: this.wrapCompartmentB.reconfigure(extension) });
  }

  /** Toggle whitespace markers on both panes (live, via the whitespace compartments). */
  private updateShowWhitespace() {
    if (!this.view || !this.wsCompartmentA || !this.wsCompartmentB || !this.modules) return;
    const extension = this.boolAttr('show-whitespace') ? this.modules.highlightWhitespace() : [];
    this.view.a.dispatch({ effects: this.wsCompartmentA.reconfigure(extension) });
    this.view.b.dispatch({ effects: this.wsCompartmentB.reconfigure(extension) });
  }

  /**
   * Tear down and rebuild the MergeView from the current content + attributes. Used
   * when a setting that is a constructor option (not a reconfigurable compartment) —
   * e.g. `ignore-whitespace` — changes.
   */
  private rebuildView() {
    if (!this.view) return;
    this.view.destroy();
    this.view = null;
    this.initializeView();
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
