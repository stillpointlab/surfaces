/// <reference lib="dom" />

import {
  createNotice,
  createKeymapState,
  createRawSource,
  createReadyGate,
  createSwitch,
  createViewState,
  defineElement,
  isReadonly,
  moveToolbarFocus,
  parseView,
  RAW_VIEW_LABEL,
  type RawSource,
  type ReadyGate,
  setToolbarTabStop,
  type SurfaceView,
  type ViewChangeReason,
} from '@stillpointlab/common-format';

import { formatSampleIssue, validateSample } from '../core/parse';

import { editorStyles } from './editor.styles';

import type {
  EditorElement,
  EditorKeymapMode,
  EditorKeymapModeResult,
} from '@stillpointlab/common-format';

/**
 * Interactive editor over one good's content. Implements the host's EditorElement
 * (string content in and out, `content-change` on every edit, focus) and the raw
 * view capability: a "Raw Text" switch, the `view` attribute and `view-change`
 * event, and a fallback to raw text for content the rich view cannot show. The
 * sample's rich view is a plain textarea; a real format renders something richer.
 */
export class SampleEditor extends HTMLElement implements EditorElement {
  private readonly root: ShadowRoot;
  private readonly area: HTMLTextAreaElement;
  private readonly body: HTMLDivElement;
  private readonly rawSwitch;
  // Settled whenever connected and rendered; in raw, once the raw surface is ready.
  private readonly ready: ReadyGate = createReadyGate(this);
  private readonly viewState = createViewState(this);
  private text = '';
  private raw: RawSource | null = null;
  private notice: HTMLElement | null = null;
  // The keyboard mode of the raw view's <code-editor>, which the host can set and store.
  private readonly keymap = createKeymapState(this);

  static get observedAttributes(): string[] {
    return ['readonly', 'view', 'keymap-mode'];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = editorStyles;

    const toolbar = document.createElement('div');
    toolbar.className = 'sample-editor__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Sample tools');
    const label = document.createElement('span');
    label.className = 'sample-editor__switch-label';
    label.textContent = RAW_VIEW_LABEL;
    this.rawSwitch = createSwitch({
      label: RAW_VIEW_LABEL,
      onToggle: (raw) => {
        this.requestView(raw ? 'raw' : 'rich', 'user');
        // The switch follows the view, which a failed switch back leaves raw.
        return false;
      },
    });
    toolbar.append(label, this.rawSwitch.element);
    setToolbarTabStop([this.rawSwitch.element]);
    toolbar.addEventListener('keydown', (event) =>
      moveToolbarFocus(event, [this.rawSwitch.element])
    );

    this.area = document.createElement('textarea');
    this.area.className = 'sample-editor';
    this.area.setAttribute('aria-label', 'Sample');
    this.area.addEventListener('input', () => this.edited(this.area.value));

    this.body = document.createElement('div');
    this.body.className = 'sample-editor__body';
    this.root.append(style, toolbar, this.body);
  }

  connectedCallback(): void {
    this.keymap.connected();
    this.render();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (name === 'readonly') {
      this.area.readOnly = isReadonly(this);
      this.raw?.setReadonly(isReadonly(this));
    } else if (name === 'view' && !this.viewState.reflecting) {
      this.requestView(parseView(newValue), 'host');
    } else if (name === 'keymap-mode') {
      this.keymap.attributeChanged(newValue, this.raw);
    }
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.text = content;
    const issues = validateSample(content);
    if (issues.length > 0 && this.viewState.current === 'rich') {
      this.viewState.commit('raw', 'fallback');
    }
    this.notice =
      issues.length > 0
        ? createNotice({
            tone: 'error',
            title: 'This content cannot be shown as a sample; showing the raw text.',
            items: issues.map(formatSampleIssue),
          })
        : null;
    if (this.raw) this.raw.setValue(content);
    this.render();
  }

  getContent(): string {
    return this.text;
  }

  getSupportedKeymapModes(): readonly EditorKeymapMode[] {
    return this.keymap.supportedModes();
  }

  /** The mode the raw view runs in (Normal while read-only); the rich view's keys never change. */
  getKeymapMode(): EditorKeymapMode {
    return this.keymap.mode;
  }

  setKeymapMode(mode: EditorKeymapMode): Promise<EditorKeymapModeResult> {
    return this.keymap.set(mode, this.raw);
  }

  focus(): void {
    (this.raw ?? this.area).focus();
  }

  /** Move to `view`, or stay raw with the current errors if the text does not parse. */
  private requestView(view: SurfaceView, reason: ViewChangeReason): void {
    if (view === 'rich') {
      const issues = validateSample(this.text);
      if (issues.length > 0) {
        this.notice = createNotice({
          tone: 'error',
          title: 'The text still cannot be shown as a sample.',
          items: issues.map(formatSampleIssue),
          announce: 'assertive',
        });
        this.viewState.reflect();
        this.render();
        return;
      }
      this.notice = null;
    }
    this.viewState.commit(view, reason);
    this.render();
  }

  private edited(text: string): void {
    this.text = text;
    this.dispatchEvent(new CustomEvent('content-change', { detail: { content: text } }));
  }

  private render(): void {
    const raw = this.viewState.current === 'raw';
    this.rawSwitch.setChecked(raw);
    if (raw) {
      this.raw ??= createRawSource({
        value: this.text,
        label: 'Sample source',
        readonly: isReadonly(this),
        onInput: (text) => this.edited(text),
        ...this.keymap.rawSourceOptions(),
      });
      if (this.raw.element.parentNode === this.body) {
        // Raw already shows: replace what is around the text, never the text itself,
        // so an embedded <code-editor> keeps its view, cursor and history.
        for (const child of [...this.body.children]) {
          if (child !== this.raw.element) child.remove();
        }
        if (this.notice) this.raw.element.before(this.notice);
      } else {
        this.body.replaceChildren(...(this.notice ? [this.notice] : []), this.raw.element);
      }
    } else {
      this.raw = null;
      this.area.value = this.text;
      this.area.readOnly = isReadonly(this);
      this.body.replaceChildren(this.area);
    }
    if (!this.isConnected) return;
    const cycle = this.ready.begin();
    void (this.raw?.whenReady() ?? Promise.resolve()).then(() => this.ready.settle(cycle));
  }
}

defineElement('sample-editor', SampleEditor);
