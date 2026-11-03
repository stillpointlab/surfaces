// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  createNotice,
  createRawSource,
  createRawView,
  createViewState,
  parseView,
  VIEW_CHANGE_EVENT,
} from './raw';

import type { ViewChangeDetail } from './contracts';

const viewChanges = (el: HTMLElement) => {
  const seen: ViewChangeDetail[] = [];
  el.addEventListener(VIEW_CHANGE_EVENT, (event) =>
    seen.push((event as CustomEvent<ViewChangeDetail>).detail)
  );
  return seen;
};

describe('parseView', () => {
  it('reads "raw" as raw and anything else as rich', () => {
    expect(parseView('raw')).toBe('raw');
    expect(parseView('rich')).toBe('rich');
    expect(parseView(null)).toBe('rich');
    expect(parseView('RAW')).toBe('rich');
  });
});

describe('createViewState', () => {
  it('starts from the attribute and leaves an absent one absent', () => {
    const host = document.createElement('div');
    const state = createViewState(host);
    expect(state.current).toBe('rich');
    state.reflect();
    expect(host.hasAttribute('view')).toBe(false);

    const raw = document.createElement('div');
    raw.setAttribute('view', 'raw');
    expect(createViewState(raw).current).toBe('raw');
  });

  it('reflects a change and dispatches view-change once, with the reason', () => {
    const host = document.createElement('div');
    const seen = viewChanges(host);
    const state = createViewState(host);

    state.commit('raw', 'user');
    state.commit('raw', 'user');
    expect(host.getAttribute('view')).toBe('raw');
    expect(seen).toEqual([{ view: 'raw', reason: 'user' }]);

    state.commit('rich', 'host');
    expect(host.getAttribute('view')).toBe('rich');
    expect(seen.at(-1)).toEqual({ view: 'rich', reason: 'host' });
  });

  it('marks its own writes so an attribute callback can ignore them', () => {
    const host = document.createElement('div');
    const state = createViewState(host);
    const during: boolean[] = [];
    const setAttribute = host.setAttribute.bind(host);
    vi.spyOn(host, 'setAttribute').mockImplementation((name, value) => {
      during.push(state.reflecting);
      setAttribute(name, value);
    });
    state.commit('raw', 'user');
    expect(during).toEqual([true]);
    expect(state.reflecting).toBe(false);
  });

  it('writes the current view back after a refused request', () => {
    const host = document.createElement('div');
    const state = createViewState(host);
    state.commit('raw', 'fallback');
    host.setAttribute('view', 'rich'); // the host asks; the element refuses
    state.reflect();
    expect(host.getAttribute('view')).toBe('raw');
  });
});

describe('createRawSource without <code-editor>', () => {
  it('is a labelled textarea that reports user edits', () => {
    const onInput = vi.fn();
    const source = createRawSource({ value: 'a', label: 'Source', onInput });
    const area = source.element as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.dataset.splRaw).toBe('source');
    expect(area.getAttribute('aria-label')).toBe('Source');

    area.value = 'ab';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('ab');
    expect(source.getValue()).toBe('ab');

    source.setValue('set');
    expect(area.value).toBe('set');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it('ignores edits while read-only and keeps the input inside the surface', () => {
    const onInput = vi.fn();
    const source = createRawSource({ value: 'a', label: 'Source', readonly: true, onInput });
    const area = source.element as HTMLTextAreaElement;
    const outside = vi.fn();
    const parent = document.createElement('div');
    parent.addEventListener('input', outside);
    parent.append(area);
    expect(area.readOnly).toBe(true);

    area.value = 'changed';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).not.toHaveBeenCalled();
    expect(area.value).toBe('a');
    expect(outside).not.toHaveBeenCalled();

    source.setReadonly(false);
    area.value = 'b';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).toHaveBeenCalledWith('b');
  });
});

describe('createRawView without <code-preview>', () => {
  it('is a focusable, labelled <pre>', async () => {
    const view = createRawView({ value: 'x\ny', label: 'Source' });
    expect(view.element.tagName).toBe('PRE');
    expect(view.element.dataset.splRaw).toBe('view');
    expect(view.element.textContent).toBe('x\ny');
    expect(view.element.tabIndex).toBe(0);
    view.setValue('z');
    expect(view.element.textContent).toBe('z');
    await expect(view.whenReady()).resolves.toBeUndefined();
  });
});

describe('createNotice', () => {
  it('renders a polite notice with its items', () => {
    const notice = createNotice({ tone: 'error', title: 'Invalid', items: ['a: b', 'c'] });
    expect(notice.className).toBe('spl-notice spl-notice--error');
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.querySelector('.spl-notice__title')?.textContent).toBe('Invalid');
    expect([...notice.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a: b', 'c']);
  });

  it('is an alert when assertive, and has no list without items', () => {
    const notice = createNotice({ tone: 'warning', title: 'Still invalid', announce: 'assertive' });
    expect(notice.getAttribute('role')).toBe('alert');
    expect(notice.querySelector('ul')).toBeNull();
  });
});

describe('with the host registering <code-editor> and <code-preview>', () => {
  class CodeEditorStub extends HTMLElement {
    value = '';
    setContent(text: string) {
      this.value = text;
    }
    getContent() {
      return this.value;
    }
    whenReady() {
      return Promise.resolve();
    }
    type(text: string) {
      this.value = text;
      this.dispatchEvent(new CustomEvent('content-change', { detail: { content: text } }));
    }
  }
  class CodePreviewStub extends HTMLElement {
    value = '';
    setContent(text: string) {
      this.value = text;
    }
  }

  it('createRawSource mounts <code-editor> with the language and forwards readonly', async () => {
    customElements.define('code-editor', CodeEditorStub);
    const onInput = vi.fn();
    const source = createRawSource({ value: 'a', language: 'yaml', label: 'Source', onInput });
    const editor = source.element as CodeEditorStub;
    expect(editor.localName).toBe('code-editor');
    expect(editor.getAttribute('language')).toBe('yaml');
    expect(editor.dataset.splRaw).toBe('source');
    expect(editor.value).toBe('a');

    editor.type('ab');
    expect(onInput).toHaveBeenCalledWith('ab');

    source.setReadonly(true);
    expect(editor.getAttribute('readonly')).toBe('true');
    editor.type('ignored');
    expect(onInput).toHaveBeenCalledOnce();
    source.setReadonly(false);
    expect(editor.hasAttribute('readonly')).toBe(false);
    await expect(source.whenReady()).resolves.toBeUndefined();
  });

  it('createRawView mounts <code-preview> with the language', () => {
    customElements.define('code-preview', CodePreviewStub);
    const view = createRawView({ value: 'q', language: 'markdown', label: 'Source' });
    const preview = view.element as CodePreviewStub;
    expect(preview.localName).toBe('code-preview');
    expect(preview.getAttribute('language')).toBe('markdown');
    expect(preview.value).toBe('q');
    view.setValue('r');
    expect(preview.value).toBe('r');
  });
});
