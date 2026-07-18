import { parseXmdl } from '../parser/parse';
import { renderXmdl } from '../render/render';

import { editorStyles } from './editor.styles';

import type { ParsedXmdlDocument, XmdlBindingValue, XmdlParam } from '../parser/types';

type EditorMode = 'apply' | 'raw';
type DecisionState = 'pending' | 'applied' | 'skipped';

interface ParamDecision {
  state: DecisionState;
  value?: XmdlBindingValue;
}

interface RawEditorElement extends HTMLElement {
  setContent?: (content: string) => void;
  getContent?: () => string;
}

export interface XmdlApplyEventDetail {
  output: string;
  outputFileType: ParsedXmdlDocument['outputFileType'];
  title: string;
  outputContextType?: string;
  validation?: ParsedXmdlDocument['validation'];
}

export class XmdlApplyEvent extends CustomEvent<XmdlApplyEventDetail> {
  constructor(detail: XmdlApplyEventDetail) {
    super('xmdl-apply', { bubbles: true, detail });
  }
}

export class XmdlEditor extends HTMLElement {
  private content = '';
  private mode: EditorMode = 'apply';
  private activeIndex = 0;
  private decisions = new Map<string, ParamDecision>();
  private paramTypes = new Map<string, XmdlParam['type']>();
  private activeParamName?: string;
  private rawEditor?: RawEditorElement | HTMLTextAreaElement;

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  setContent(content: string): void {
    if (content === this.content) {
      this.render();
      return;
    }
    this.content = content;
    this.resetApplyState();
    this.render();
  }

  getContent(): string {
    if (this.mode === 'raw') {
      return this.readRawEditorContent();
    }
    return this.content;
  }

  focus(): void {
    const focusTarget = this.shadowRoot?.querySelector<HTMLElement>(
      '.xmdl-editor__slot-control textarea, .xmdl-editor__slot-control input, .xmdl-editor__slot-control select, .xmdl-editor__source, code-editor',
    );
    focusTarget?.focus();
  }

  private render(): void {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = editorStyles;

    const wrapper = document.createElement('section');
    wrapper.className = `xmdl-editor xmdl-editor--${this.mode}`;
    wrapper.setAttribute('aria-label', 'XMDL editor');

    if (this.mode === 'raw') {
      wrapper.append(this.renderRawToolbar(), this.renderRawEditor());
    } else {
      wrapper.append(this.renderApplySurface());
    }

    this.shadowRoot.append(style, wrapper);
    this.focusActiveControl();
  }

  private renderApplySurface(): HTMLElement {
    const result = parseXmdl(this.content);
    if (!result.ok) {
      const container = document.createElement('div');
      container.className = 'xmdl-editor__apply';
      container.append(this.renderApplyToolbar(undefined), this.renderParseErrors(result.errors));
      return container;
    }

    this.ensureDecisions(result.document.params);
    this.activeIndex = clampIndex(this.activeIndex, result.document.params.length);

    const container = document.createElement('div');
    container.className = 'xmdl-editor__apply';
    container.append(
      this.renderApplyToolbar(result.document),
      this.renderTemplateHeader(result.document),
      this.renderSlotPanel(result.document),
      this.renderOutputPreview(result.document),
    );
    return container;
  }

  private renderTemplateHeader(xmdl: ParsedXmdlDocument): HTMLElement {
    const header = document.createElement('header');
    header.className = 'xmdl-editor__template-header';

    const title = document.createElement('h1');
    title.textContent = xmdl.title;

    const meta = document.createElement('p');
    meta.textContent = `${xmdl.version} · ${xmdl.outputFileType}`;

    header.append(title, meta);
    return header;
  }

  private renderApplyToolbar(xmdl: ParsedXmdlDocument | undefined): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'xmdl-editor__toolbar';
    toolbar.setAttribute('role', 'toolbar');

    const previousButton = button('Previous', () => {
      if (!xmdl) return;
      this.activeIndex = wrapIndex(this.activeIndex - 1, xmdl.params.length);
      this.render();
    });
    previousButton.disabled = !xmdl || xmdl.params.length === 0;

    const nextButton = button('Next', () => {
      if (!xmdl) return;
      this.activeIndex = wrapIndex(this.activeIndex + 1, xmdl.params.length);
      this.render();
    });
    nextButton.disabled = !xmdl || xmdl.params.length === 0;

    const progress = document.createElement('span');
    progress.className = 'xmdl-editor__progress';
    progress.textContent = xmdl
      ? `${this.completedCount(xmdl.params)} of ${xmdl.params.length} Applied`
      : '0 of 0 Applied';

    const status = document.createElement('span');
    status.className = 'xmdl-editor__status';
    status.dataset.complete = xmdl && this.isComplete(xmdl) ? 'true' : 'false';
    status.textContent = xmdl && this.isComplete(xmdl) ? 'Complete' : 'Incomplete';

    const applyButton = button('Apply Template', () => {
      if (!xmdl || !this.isComplete(xmdl)) return;
      this.dispatchApplyEvent(xmdl);
    });
    applyButton.className = 'xmdl-editor__apply-button';
    applyButton.disabled = !xmdl || !this.isComplete(xmdl) || !isApplyOutputSupported(xmdl);
    applyButton.title = applyButton.disabled
      ? isApplyOutputSupported(xmdl) || !xmdl
        ? 'Fill in template to apply'
        : 'Apply supports Markdown and XML outputs for MVP'
      : 'Apply template';

    toolbar.append(
      previousButton,
      nextButton,
      progress,
      status,
      applyButton,
      toolbarSpacer(),
      this.renderModeToggle(),
    );
    return toolbar;
  }

  private renderRawToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'xmdl-editor__toolbar xmdl-editor__toolbar--raw';
    toolbar.setAttribute('role', 'toolbar');

    toolbar.append(toolbarSpacer(), this.renderModeToggle());
    return toolbar;
  }

  private renderModeToggle(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'xmdl-editor__toolbar-group xmdl-editor__mode-group';

    const label = document.createElement('label');
    label.className = 'xmdl-editor__toggle-label';
    label.textContent = 'Apply Mode';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'xmdl-editor__mode-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', this.mode === 'apply' ? 'true' : 'false');
    toggle.setAttribute('aria-label', 'Apply Mode');
    toggle.title = this.mode === 'apply' ? 'Edit template source' : 'Return to apply mode';

    const knob = document.createElement('span');
    knob.className = 'xmdl-editor__mode-toggle-knob';
    toggle.append(knob);

    toggle.addEventListener('click', () => {
      if (this.mode === 'apply') {
        this.captureActiveParamName();
        this.mode = 'raw';
        this.render();
        return;
      }
      this.content = this.readRawEditorContent();
      const reconciliation = this.reconcileApplyState(this.content);
      if (
        reconciliation.lossyNames.length > 0 &&
        !window.confirm(applyResetConfirmation(reconciliation.lossyNames))
      ) {
        return;
      }
      for (const name of reconciliation.incompatibleNames) {
        this.decisions.delete(name);
        this.paramTypes.delete(name);
      }
      if (reconciliation.document && this.activeParamName) {
        const nextIndex = reconciliation.document.params.findIndex(
          (param) => param.name === this.activeParamName,
        );
        if (nextIndex >= 0) this.activeIndex = nextIndex;
      }
      this.mode = 'apply';
      this.render();
    });

    group.append(label, toggle);
    return group;
  }

  private renderRawEditor(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'xmdl-editor__raw';

    if (customElements.get('code-editor')) {
      const editor = document.createElement('code-editor') as RawEditorElement;
      editor.setAttribute('language', 'yaml');
      editor.setContent?.(this.content);
      editor.addEventListener('content-change', () => this.handleRawContentChange(editor));
      container.append(editor);
      this.rawEditor = editor;
      return container;
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'xmdl-editor__source';
    textarea.value = this.content;
    textarea.setAttribute('aria-label', 'XMDL source');
    textarea.addEventListener('input', () => this.handleRawContentChange(textarea));
    container.append(textarea);
    this.rawEditor = textarea;
    return container;
  }

  private renderParseErrors(errors: Array<{ message: string; path?: string }>): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'xmdl-editor__errors';

    const heading = document.createElement('h2');
    heading.textContent = 'Invalid XMDL';
    const list = document.createElement('ul');
    for (const error of errors) {
      const item = document.createElement('li');
      item.textContent = error.path ? `${error.path}: ${error.message}` : error.message;
      list.append(item);
    }

    panel.append(heading, list);
    return panel;
  }

  private renderSlotPanel(xmdl: ParsedXmdlDocument): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'xmdl-editor__slot-panel';
    panel.setAttribute('aria-label', 'Template slot editor');

    if (xmdl.params.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'xmdl-editor__empty';
      empty.textContent = 'No params declared.';
      panel.append(empty);
      return panel;
    }

    const param = xmdl.params[this.activeIndex];
    const decision = this.getDecision(param);

    const header = document.createElement('div');
    header.className = 'xmdl-editor__slot-header';

    const title = document.createElement('h2');
    title.textContent = param.name;
    const meta = document.createElement('span');
    meta.className = 'xmdl-editor__slot-meta';
    meta.textContent = `${param.type} · ${param.required ? 'required' : 'optional'} · ${decision.state}`;
    header.append(title, meta);

    const description = document.createElement('p');
    description.className = 'xmdl-editor__description';
    description.textContent = param.description ?? 'No description provided.';

    const control = document.createElement('div');
    control.className = 'xmdl-editor__slot-control';
    control.append(...this.renderParamControl(param, decision));

    panel.append(header, description, control);
    return panel;
  }

  private renderParamControl(param: XmdlParam, decision: ParamDecision): HTMLElement[] {
    if (param.type === 'bool') {
      return [
        button('Include', () => this.applyDecision(param, true)),
        button('Skip', () => this.skipDecision(param, false)),
      ];
    }

    const applyButton = button('Apply', () => undefined);
    const controls: HTMLElement[] = [];
    let input: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement;

    if (param.type === 'enum') {
      const select = document.createElement('select');
      for (const value of param.values ?? []) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
      select.value =
        typeof decision.value === 'string' ? decision.value : (param.values?.[0] ?? '');
      input = select;
    } else if (param.type === 'number') {
      const numberInput = document.createElement('input');
      numberInput.type = 'number';
      numberInput.value = typeof decision.value === 'number' ? String(decision.value) : '';
      input = numberInput;
    } else if (param.type === 'date') {
      const dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.value = typeof decision.value === 'string' ? decision.value : '';
      input = dateInput;
    } else {
      const text = document.createElement('textarea');
      text.rows = 6;
      text.value = typeof decision.value === 'string' ? decision.value : '';
      input = text;
    }

    input.setAttribute('aria-label', `Value for ${param.name}`);
    input.addEventListener('input', () => {
      this.decisions.set(param.name, {
        state: 'pending',
        value: coerceInputValue(param, input.value),
      });
      applyButton.disabled = !canApplyInput(param, input.value);
    });

    applyButton.disabled = !canApplyInput(param, input.value);
    applyButton.addEventListener('click', () => {
      this.applyDecision(param, coerceInputValue(param, input.value));
    });

    controls.push(input, applyButton);
    if (!param.required) {
      controls.push(button('Skip', () => this.skipDecision(param)));
    }

    return controls;
  }

  private renderOutputPreview(xmdl: ParsedXmdlDocument): HTMLElement {
    const section = document.createElement('section');
    section.className = 'xmdl-editor__output';

    const heading = document.createElement('h2');
    heading.textContent = 'Output Preview';

    const output = document.createElement('pre');
    output.className = 'xmdl-editor__output-body';
    output.textContent = renderXmdl(xmdl, this.bindingsFor(xmdl.params));

    section.append(heading, output);
    return section;
  }

  private handleRawContentChange(editor: RawEditorElement | HTMLTextAreaElement): void {
    this.content = readEditorContent(editor);
    this.dispatchEvent(new CustomEvent('content-change', { bubbles: true }));
  }

  private readRawEditorContent(): string {
    return this.rawEditor ? readEditorContent(this.rawEditor) : this.content;
  }

  private ensureDecisions(params: XmdlParam[]): void {
    const names = new Set(params.map((param) => param.name));
    for (const param of params) {
      if (!this.decisions.has(param.name)) {
        this.decisions.set(param.name, { state: 'pending', value: defaultValueFor(param) });
      }
      this.paramTypes.set(param.name, param.type);
    }
    for (const name of this.decisions.keys()) {
      if (!names.has(name)) {
        this.decisions.delete(name);
        this.paramTypes.delete(name);
      }
    }
  }

  private getDecision(param: XmdlParam): ParamDecision {
    const decision = this.decisions.get(param.name);
    if (decision) return decision;
    const next = { state: 'pending' as const, value: defaultValueFor(param) };
    this.decisions.set(param.name, next);
    return next;
  }

  private applyDecision(param: XmdlParam, value: XmdlBindingValue): void {
    this.decisions.set(param.name, { state: 'applied', value });
    this.render();
  }

  private skipDecision(param: XmdlParam, value?: XmdlBindingValue): void {
    this.decisions.set(param.name, { state: 'skipped', value });
    this.render();
  }

  private bindingsFor(params: XmdlParam[]): Record<string, XmdlBindingValue> {
    const bindings: Record<string, XmdlBindingValue> = {};
    for (const param of params) {
      const decision = this.getDecision(param);
      if (decision.state === 'applied') bindings[param.name] = decision.value;
      if (param.type === 'bool' && decision.state === 'skipped') bindings[param.name] = false;
    }
    return bindings;
  }

  private completedCount(params: XmdlParam[]): number {
    return params.filter((param) => this.getDecision(param).state !== 'pending').length;
  }

  private isComplete(xmdl: ParsedXmdlDocument): boolean {
    return xmdl.params.every((param) => {
      const decision = this.getDecision(param);
      return param.required ? decision.state === 'applied' : decision.state !== 'pending';
    });
  }

  private dispatchApplyEvent(xmdl: ParsedXmdlDocument): void {
    this.dispatchEvent(
      new XmdlApplyEvent({
        output: renderXmdl(xmdl, this.bindingsFor(xmdl.params)),
        outputFileType: xmdl.outputFileType,
        title: xmdl.title,
        outputContextType: xmdl.outputContextType,
        validation: xmdl.validation,
      }),
    );
  }

  private resetApplyState(): void {
    this.decisions.clear();
    this.paramTypes.clear();
    this.activeIndex = 0;
    this.activeParamName = undefined;
  }

  private captureActiveParamName(): void {
    const result = parseXmdl(this.content);
    if (result.ok) {
      this.activeParamName = result.document.params[this.activeIndex]?.name;
    }
  }

  private reconcileApplyState(content: string): {
    document?: ParsedXmdlDocument;
    incompatibleNames: string[];
    lossyNames: string[];
  } {
    const result = parseXmdl(content);
    if (!result.ok) return { incompatibleNames: [], lossyNames: [] };

    const nextTypes = new Map(result.document.params.map((param) => [param.name, param.type]));
    const incompatibleNames = [...this.decisions.keys()].filter(
      (name) => !nextTypes.has(name) || nextTypes.get(name) !== this.paramTypes.get(name),
    );
    const lossyNames = incompatibleNames.filter((name) => hasUserWork(this.decisions.get(name)));

    return { document: result.document, incompatibleNames, lossyNames };
  }

  private focusActiveControl(): void {
    if (this.mode !== 'apply') return;
    window.setTimeout(() => {
      this.shadowRoot
        ?.querySelector<HTMLElement>(
          '.xmdl-editor__slot-control textarea, .xmdl-editor__slot-control input, .xmdl-editor__slot-control select',
        )
        ?.focus();
    }, 0);
  }
}

if (!customElements.get('xmdl-editor')) {
  customElements.define('xmdl-editor', XmdlEditor);
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

function toolbarSpacer(): HTMLDivElement {
  const spacer = document.createElement('div');
  spacer.className = 'xmdl-editor__toolbar-spacer';
  return spacer;
}

function readEditorContent(editor: RawEditorElement | HTMLTextAreaElement): string {
  if ('getContent' in editor && typeof editor.getContent === 'function') return editor.getContent();
  if ('value' in editor) return editor.value;
  return '';
}

function defaultValueFor(param: XmdlParam): XmdlBindingValue {
  if (param.default instanceof Date) return param.default;
  if (
    typeof param.default === 'string' ||
    typeof param.default === 'number' ||
    typeof param.default === 'boolean'
  ) {
    return param.default;
  }
  if (param.type === 'enum') return param.values?.[0];
  return undefined;
}

function canApplyInput(param: XmdlParam, value: string): boolean {
  if (param.required && value.trim().length === 0) return false;
  if (param.type === 'number' && value.trim().length > 0) return Number.isFinite(Number(value));
  return true;
}

function coerceInputValue(param: XmdlParam, value: string): XmdlBindingValue {
  if (param.type === 'number') return value.trim().length === 0 ? undefined : Number(value);
  return value;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return length - 1;
  if (index >= length) return 0;
  return index;
}

function isApplyOutputSupported(xmdl: ParsedXmdlDocument | undefined): boolean {
  return xmdl?.outputFileType === 'markdown' || xmdl?.outputFileType === 'xml';
}

function hasUserWork(decision: ParamDecision | undefined): boolean {
  if (!decision) return false;
  if (decision.state !== 'pending') return true;
  if (typeof decision.value === 'string') return decision.value.trim().length > 0;
  return decision.value !== undefined;
}

function applyResetConfirmation(names: string[]): string {
  const params = names.map((name) => `“${name}”`).join(', ');
  return `Returning to Apply mode will reset your work for ${params} because the parameters changed. Continue?`;
}
