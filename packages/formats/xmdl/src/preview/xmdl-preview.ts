import {
  createNotice,
  createRawView,
  createReadyGate,
  createViewState,
  defineElement,
  parseView,
  type RawView,
  type ReadyGate,
} from '@stillpointlab/common-format';

import { parseXmdl } from '../parser/parse';

import { previewStyles } from './preview.styles';

import type {
  ParsedXmdlDocument,
  XmdlConditionalReference,
  XmdlParam,
  XmdlParseError,
  XmdlWarning,
} from '../parser/types';
import type { PreviewElement } from '@stillpointlab/common-format';

/**
 * A read-only view of an XMDL template. Implements PreviewElement and the raw view
 * convention: `view="raw"` shows the template source, and a template that does not
 * parse shows its source with the errors until a valid one arrives.
 */
export class XmdlPreview extends HTMLElement implements PreviewElement {
  private content = '';
  // Rendering is synchronous: settled whenever connected and rendered; in raw,
  // once the raw view (a lazy <code-preview> when registered) is ready.
  private readonly ready: ReadyGate = createReadyGate(this);
  private readonly viewState = createViewState(this);
  // True while showing raw only because the template does not parse.
  private fallback = false;
  private raw: RawView | null = null;

  static get observedAttributes(): string[] {
    return ['view'];
  }

  attributeChangedCallback(_name: string, _oldValue: string | null, newValue: string | null): void {
    if (this.viewState.reflecting) return;
    const view = parseView(newValue);
    // The rendered view cannot show an invalid template; refuse and keep the source.
    if (view === 'rich' && !parseXmdl(this.content).ok) {
      this.viewState.reflect();
      return;
    }
    this.fallback = false;
    this.viewState.commit(view, 'host');
    this.render();
  }

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  disconnectedCallback(): void {
    this.ready.begin();
  }

  whenReady(): Promise<void> {
    return this.ready.whenReady();
  }

  setContent(content: string): void {
    this.content = content;
    const valid = parseXmdl(content).ok;
    if (!valid && this.viewState.current === 'rich') {
      this.fallback = true;
      this.viewState.commit('raw', 'fallback');
    } else if (valid && this.fallback) {
      // A preview's fallback is not sticky: nobody can fix the text here.
      this.fallback = false;
      this.viewState.commit('rich', 'fallback');
    }
    this.raw?.setValue(content);
    this.render();
  }

  private render(): void {
    if (!this.shadowRoot) return;

    const result = parseXmdl(this.content);

    this.shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = previewStyles;

    const wrapper = document.createElement('section');
    wrapper.className = 'xmdl-preview';
    wrapper.setAttribute('aria-label', 'XMDL template preview');

    if (this.viewState.current === 'raw') {
      if (!result.ok) {
        wrapper.append(
          createNotice({
            tone: 'error',
            title: 'This template could not be read; showing the raw text.',
            items: result.errors.map(formatDiagnostic),
          })
        );
      }
      this.raw ??= createRawView({ value: this.content, language: 'yaml', label: 'XMDL source' });
      wrapper.append(this.raw.element);
    } else if (result.ok) {
      this.raw = null;
      wrapper.append(
        renderHeader(result.document),
        renderWarnings(result.warnings),
        renderParams(result.document.params),
        renderValidation(result.document),
        renderBodyPreview(result.document)
      );
    }

    this.shadowRoot.append(style, wrapper);
    if (!this.isConnected) return;
    const surface = this.raw;
    if (!surface) {
      this.ready.settle();
      return;
    }
    const cycle = this.ready.begin();
    void surface.whenReady().then(() => this.ready.settle(cycle));
  }
}

function renderHeader(xmdl: ParsedXmdlDocument): HTMLElement {
  const header = document.createElement('header');
  header.className = 'xmdl-preview__header';

  const title = document.createElement('h2');
  title.className = 'xmdl-preview__title';
  title.textContent = xmdl.title;

  const meta = document.createElement('dl');
  meta.className = 'xmdl-preview__meta';
  appendMeta(meta, 'Version', xmdl.version);
  appendMeta(meta, 'Output', xmdl.outputFileType);
  if (xmdl.outputContextType) appendMeta(meta, 'Context', xmdl.outputContextType);

  header.append(title, meta);
  return header;
}

function renderWarnings(warnings: XmdlWarning[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'xmdl-preview__messages';
  section.setAttribute('aria-label', 'XMDL warnings');

  if (warnings.length === 0) {
    section.hidden = true;
    return section;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Warnings';
  const list = document.createElement('ul');
  for (const warning of warnings) {
    const item = document.createElement('li');
    item.textContent = formatDiagnostic(warning);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function renderParams(params: XmdlParam[]): HTMLElement {
  const section = document.createElement('details');
  section.className = 'xmdl-preview__section';
  section.open = true;
  section.setAttribute('aria-labelledby', 'xmdl-preview-params-title');

  const summary = document.createElement('summary');
  summary.className = 'xmdl-preview__section-summary';

  const heading = document.createElement('h3');
  heading.id = 'xmdl-preview-params-title';
  heading.textContent = 'Params';
  summary.append(heading);

  if (params.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'xmdl-preview__empty';
    empty.textContent = 'No params declared.';
    section.append(summary, empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'xmdl-preview__params';
  for (const param of params) {
    const item = document.createElement('li');
    item.className = 'xmdl-preview__param';

    const name = document.createElement('code');
    name.className = 'xmdl-preview__param-name';
    name.textContent = param.name;

    const badges = document.createElement('span');
    badges.className = 'xmdl-preview__badges';
    badges.append(createBadge(param.type), createBadge(param.required ? 'required' : 'optional'));

    const summary = document.createElement('div');
    summary.className = 'xmdl-preview__param-summary';
    summary.append(name, badges);
    item.append(summary);

    if (param.description) {
      const description = document.createElement('p');
      description.className = 'xmdl-preview__description';
      description.textContent = param.description;
      item.append(description);
    }

    if (param.values && param.values.length > 0) {
      const values = document.createElement('p');
      values.className = 'xmdl-preview__description';
      values.textContent = `Options: ${param.values.join(', ')}`;
      item.append(values);
    }

    list.append(item);
  }

  section.append(summary, list);
  return section;
}

function renderValidation(xmdl: ParsedXmdlDocument): HTMLElement {
  const section = document.createElement('section');
  section.className = 'xmdl-preview__section';
  section.setAttribute('aria-label', 'Validation');

  if (!xmdl.validation?.outputSchemaRef) {
    section.hidden = true;
    return section;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Validation';

  const value = document.createElement('code');
  value.className = 'xmdl-preview__schema';
  value.textContent = xmdl.validation.outputSchemaRef;

  section.append(heading, value);
  return section;
}

function renderBodyPreview(xmdl: ParsedXmdlDocument): HTMLElement {
  const section = document.createElement('section');
  section.className = 'xmdl-preview__section';
  section.setAttribute('aria-labelledby', 'xmdl-preview-body-title');

  const heading = document.createElement('h3');
  heading.id = 'xmdl-preview-body-title';
  heading.textContent = 'Template Body';

  const body = document.createElement('pre');
  body.className = 'xmdl-preview__body';
  body.setAttribute('aria-label', 'Template body with unresolved slots marked');
  appendMarkedBody(body, xmdl.body, xmdl.conditionals);

  section.append(heading, body);
  return section;
}

defineElement('xmdl-preview', XmdlPreview);

function appendMeta(list: HTMLDListElement, label: string, value: string): void {
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  list.append(term, detail);
}

function createBadge(label: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'xmdl-preview__badge';
  badge.textContent = label;
  return badge;
}

function appendMarkedBody(
  target: HTMLElement,
  source: string,
  conditionals: XmdlConditionalReference[]
): void {
  const conditionalByStart = new Map(
    conditionals.map((conditional) => [conditional.start, conditional])
  );
  const tokenPattern = /{{\s*([^{}]+?)\s*}}/g;
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const expression = match[1].trim();
    const start = match.index ?? 0;
    const end = start + token.length;
    appendText(target, source.slice(cursor, start));

    const marker = document.createElement('span');
    marker.textContent = token;

    if (expression.startsWith('#if ')) {
      const conditional = conditionalByStart.get(start);
      marker.className = 'xmdl-preview__token xmdl-preview__token--conditional';
      marker.setAttribute(
        'aria-label',
        `Conditional start for ${conditional?.name ?? expression.slice(4).trim()}`
      );
    } else if (expression === '/if') {
      marker.className = 'xmdl-preview__token xmdl-preview__token--conditional';
      marker.setAttribute('aria-label', 'Conditional end');
    } else {
      marker.className = 'xmdl-preview__token xmdl-preview__token--placeholder';
      marker.setAttribute('aria-label', `Template slot ${expression}`);
    }

    target.append(marker);
    cursor = end;
  }

  appendText(target, source.slice(cursor));
}

function appendText(target: HTMLElement, text: string): void {
  if (text.length > 0) target.append(document.createTextNode(text));
}

function formatDiagnostic(diagnostic: XmdlParseError | XmdlWarning): string {
  return diagnostic.path ? `${diagnostic.path}: ${diagnostic.message}` : diagnostic.message;
}
