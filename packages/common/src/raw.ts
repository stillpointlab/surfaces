// The raw view: a surface over a text format shows its source as text, on request
// (the "Raw Text" switch or the host's `view` attribute) or when its rich view
// cannot show the content. These are the pieces a format composes; the rules they
// serve are in the README's "Raw view" section and in contracts.ts.

import { lineBreakOf, withLineBreak } from './line-endings';

import type { SurfaceView, ViewChangeDetail, ViewChangeReason } from './contracts';

/** The switch's label in every editor that has a raw view. */
export const RAW_VIEW_LABEL = 'Raw Text';

/** The attribute a host sets, and the element reflects, to choose the view. */
export const VIEW_ATTRIBUTE = 'view';

/** The non-bubbling event an element dispatches each time its view changes. */
export const VIEW_CHANGE_EVENT = 'view-change';

/** The view an attribute value asks for: `"raw"` is raw, anything else rich. */
export function parseView(value: string | null): SurfaceView {
  return value === 'raw' ? 'raw' : 'rich';
}

/** An element's current view, kept in step with its `view` attribute. */
export interface ViewState {
  readonly current: SurfaceView;
  /**
   * True while the state itself writes the attribute, so the element's
   * `attributeChangedCallback` can tell its own reflection from a host request.
   */
  readonly reflecting: boolean;
  /** Move to `view`: reflect it, and dispatch `view-change` if it changed. */
  commit(view: SurfaceView, reason: ViewChangeReason): void;
  /** Write the current view back to the attribute (after refusing a host request). */
  reflect(): void;
}

/**
 * Track an element's view. The initial view comes from its `view` attribute. An
 * absent attribute stays absent while the view is rich, so markup the host did
 * not write is not rewritten.
 */
export function createViewState(host: HTMLElement): ViewState {
  let current = parseView(host.getAttribute(VIEW_ATTRIBUTE));
  let reflecting = false;

  const reflect = () => {
    const attribute = host.getAttribute(VIEW_ATTRIBUTE);
    if (attribute === current || (attribute === null && current === 'rich')) return;
    reflecting = true;
    try {
      host.setAttribute(VIEW_ATTRIBUTE, current);
    } finally {
      reflecting = false;
    }
  };

  return {
    get current() {
      return current;
    },
    get reflecting() {
      return reflecting;
    },
    commit(view, reason) {
      const changed = view !== current;
      current = view;
      reflect();
      if (!changed) return;
      host.dispatchEvent(
        new CustomEvent<ViewChangeDetail>(VIEW_CHANGE_EVENT, { detail: { view, reason } })
      );
    },
    reflect,
  };
}

/** What `createRawSource` mounts when the host registered `<code-editor>`. */
interface EmbeddedEditor extends HTMLElement {
  setContent(content: string): void;
  getContent(): string;
  whenReady?(): Promise<void>;
}

/** What `createRawView` mounts when the host registered `<code-preview>`. */
interface EmbeddedPreview extends HTMLElement {
  setContent(content: string): void;
  getContent?(): string;
  whenReady?(): Promise<void>;
}

export interface RawSourceOptions {
  value: string;
  /** A `<code-editor>` language name (`markdown`, `yaml`…); none for plain text. */
  language?: string;
  readonly?: boolean;
  /** The accessible name of the text area. */
  label: string;
  /** Called with the whole text after every user edit (never for `setValue`). */
  onInput: (text: string) => void;
}

/** An editable raw text surface. */
export interface RawSource {
  readonly element: HTMLElement;
  getValue(): string;
  /** Replace the text without calling `onInput`. */
  setValue(text: string): void;
  setReadonly(readonly: boolean): void;
  focus(): void;
  /** Resolves once the surface shows its text (an embedded `<code-editor>` loads lazily). */
  whenReady(): Promise<void>;
}

/**
 * The editable raw surface for an editor: `<code-editor>` when the host registered
 * it, else a `<textarea>`. Either way it is marked `data-spl-raw="source"`, honours
 * `readonly`, and reports user edits through `onInput`.
 */
export function createRawSource(options: RawSourceOptions): RawSource {
  let readonly = options.readonly ?? false;
  // The text as set, or as last edited: what getValue() returns.
  let last = options.value;

  if (customElements.get('code-editor')) {
    const editor = document.createElement('code-editor') as EmbeddedEditor;
    editor.dataset.splRaw = 'source';
    editor.setAttribute('aria-label', options.label);
    if (options.language) editor.setAttribute('language', options.language);
    if (readonly) editor.setAttribute('readonly', 'true');
    editor.setContent(options.value);
    editor.addEventListener('content-change', (event) => {
      event.stopPropagation();
      if (readonly) return;
      last = editor.getContent();
      options.onInput(last);
    });
    return {
      element: editor,
      getValue: () => editor.getContent(),
      setValue: (text) => {
        last = text;
        editor.setContent(text);
      },
      setReadonly: (value) => {
        readonly = value;
        if (value) editor.setAttribute('readonly', 'true');
        else editor.removeAttribute('readonly');
      },
      focus: () => editor.focus(),
      whenReady: () => editor.whenReady?.() ?? Promise.resolve(),
    };
  }

  // A textarea's value always reports LF; edits are written back with the line
  // break of the text as set, and unedited text is returned as set.
  let lineBreak = lineBreakOf(options.value);
  const area = document.createElement('textarea');
  area.className = 'spl-raw-source';
  area.dataset.splRaw = 'source';
  area.setAttribute('aria-label', options.label);
  area.spellcheck = false;
  area.value = options.value;
  area.readOnly = readonly;
  area.addEventListener('input', (event) => {
    event.stopPropagation();
    if (readonly) {
      // A read-only textarea never changes on typing; undo a scripted change too.
      area.value = last;
      return;
    }
    last = withLineBreak(area.value, lineBreak);
    options.onInput(last);
  });
  return {
    element: area,
    getValue: () => last,
    setValue: (text) => {
      last = text;
      lineBreak = lineBreakOf(text);
      area.value = text;
    },
    setReadonly: (value) => {
      readonly = value;
      area.readOnly = value;
    },
    focus: () => area.focus(),
    whenReady: () => Promise.resolve(),
  };
}

export interface RawViewOptions {
  value: string;
  /** A `<code-preview>` language name; none for plain text. */
  language?: string;
  /** The accessible name of the source view. */
  label: string;
}

/** A read-only raw text view. */
export interface RawView {
  readonly element: HTMLElement;
  setValue(text: string): void;
  whenReady(): Promise<void>;
}

/**
 * The read-only raw view for a preview: `<code-preview>` when the host registered
 * it, else a `<pre>`. Marked `data-spl-raw="view"`.
 */
export function createRawView(options: RawViewOptions): RawView {
  if (customElements.get('code-preview')) {
    const preview = document.createElement('code-preview') as EmbeddedPreview;
    preview.dataset.splRaw = 'view';
    preview.setAttribute('aria-label', options.label);
    if (options.language) preview.setAttribute('language', options.language);
    preview.setContent(options.value);
    return {
      element: preview,
      setValue: (text) => preview.setContent(text),
      whenReady: () => preview.whenReady?.() ?? Promise.resolve(),
    };
  }

  const pre = document.createElement('pre');
  pre.className = 'spl-raw-view';
  pre.dataset.splRaw = 'view';
  pre.setAttribute('aria-label', options.label);
  pre.tabIndex = 0;
  pre.textContent = options.value;
  return {
    element: pre,
    setValue: (text) => {
      pre.textContent = text;
    },
    whenReady: () => Promise.resolve(),
  };
}

export interface NoticeOptions {
  tone: 'error' | 'warning' | 'info';
  title: string;
  /** One line per item, such as one parse error each (`path: message`). */
  items?: readonly string[];
  /**
   * How assistive technology hears it: `polite` (`role="status"`, the default)
   * or `assertive` (`role="alert"`), for errors raised by something the user just
   * did, such as a failed switch back to the rich view.
   */
  announce?: 'polite' | 'assertive';
}

/**
 * A notice above a surface: why it shows the raw text, or why it could not
 * switch back. `class="spl-notice spl-notice--<tone>"`, styled by
 * `@use 'common/src/styles/notice';`.
 */
export function createNotice(options: NoticeOptions): HTMLElement {
  const notice = document.createElement('div');
  notice.className = `spl-notice spl-notice--${options.tone}`;
  notice.setAttribute('role', options.announce === 'assertive' ? 'alert' : 'status');
  const title = document.createElement('p');
  title.className = 'spl-notice__title';
  title.textContent = options.title;
  notice.append(title);
  if (options.items && options.items.length > 0) {
    const list = document.createElement('ul');
    list.className = 'spl-notice__items';
    for (const text of options.items) {
      const item = document.createElement('li');
      item.textContent = text;
      list.append(item);
    }
    notice.append(list);
  }
  return notice;
}
