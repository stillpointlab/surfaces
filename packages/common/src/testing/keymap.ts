import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { KEYMAP_MODE_ATTRIBUTE, KEYMAP_MODE_CHANGE_EVENT, parseKeymapMode } from '../keymap';

import { rawSurface } from './raw-view';
import { mount, settled } from './support';

import type { EditorElement, EditorKeymapMode, EditorKeymapModeResult } from '../contracts';

export interface KeymapModeContractOptions<T extends EditorElement = EditorElement> {
  /** Content the editor shows; the raw view holds it as text. */
  content: string;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

/** The `<code-editor>` stand-in `defineCodeEditorKeymapStub` defines. */
export interface CodeEditorKeymapStub extends HTMLElement {
  setContent(text: string): void;
  getContent(): string;
  whenReady(): Promise<void>;
  getKeymapMode(): EditorKeymapMode;
  setKeymapMode(mode: EditorKeymapMode): Promise<EditorKeymapModeResult>;
  /** The person picks `mode` on the editor's toolbar. */
  choose(mode: EditorKeymapMode): Promise<EditorKeymapModeResult>;
}

/**
 * Define a stand-in for code-format's `<code-editor>` (unless one is defined), with
 * its keymap behaviour: the `keymap-mode` attribute, `setKeymapMode` (Vim refused
 * while read-only), a `keymap-mode-change` on each change, and the drop to Normal
 * when it becomes read-only. The class is built here, not at module level, so
 * importing the testing entry needs no DOM.
 */
export function defineCodeEditorKeymapStub(): void {
  if (customElements.get('code-editor')) return;

  class Stub extends HTMLElement implements CodeEditorKeymapStub {
    static get observedAttributes(): string[] {
      return ['readonly', KEYMAP_MODE_ATTRIBUTE];
    }

    private text = '';
    private active: EditorKeymapMode = 'normal';

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      if (name === 'readonly' && value === 'true' && this.active !== 'normal') {
        void this.setKeymapMode('normal');
      } else if (name === KEYMAP_MODE_ATTRIBUTE && value !== this.active) {
        const mode = parseKeymapMode(value);
        if (mode) void this.setKeymapMode(mode);
      }
    }

    setContent(text: string): void {
      this.text = text;
    }

    getContent(): string {
      return this.text;
    }

    whenReady(): Promise<void> {
      return Promise.resolve();
    }

    getKeymapMode(): EditorKeymapMode {
      return this.active;
    }

    async setKeymapMode(mode: EditorKeymapMode): Promise<EditorKeymapModeResult> {
      if (mode !== 'normal' && this.getAttribute('readonly') === 'true') {
        return {
          requestedMode: mode,
          activeMode: this.active,
          status: 'unsupported',
          reason: 'readonly',
        };
      }
      const changed = mode !== this.active;
      this.active = mode;
      this.setAttribute(KEYMAP_MODE_ATTRIBUTE, mode);
      const result: EditorKeymapModeResult = {
        requestedMode: mode,
        activeMode: mode,
        status: 'applied',
      };
      if (changed) {
        this.dispatchEvent(new CustomEvent(KEYMAP_MODE_CHANGE_EVENT, { detail: result }));
      }
      return result;
    }

    choose(mode: EditorKeymapMode): Promise<EditorKeymapModeResult> {
      return this.setKeymapMode(mode);
    }
  }

  customElements.define('code-editor', Stub);
}

function keymapChanges(el: HTMLElement): EditorKeymapModeResult[] {
  const seen: EditorKeymapModeResult[] = [];
  el.addEventListener(KEYMAP_MODE_CHANGE_EVENT, (event) => {
    seen.push((event as CustomEvent<EditorKeymapModeResult>).detail);
  });
  return seen;
}

function embedded(el: HTMLElement): CodeEditorKeymapStub {
  const surface = rawSurface(el) as CodeEditorKeymapStub | null;
  if (surface?.localName !== 'code-editor' || typeof surface.choose !== 'function') {
    throw new Error(`<${el.localName}> shows no <code-editor> stand-in raw view`);
  }
  return surface;
}

/**
 * The keymap modes of an editor whose raw view edits text in `<code-editor>` (see
 * `createKeymapState`). It defines a `<code-editor>` stand-in part way through, so
 * it must run in a test file of its own, with nothing else defining `code-editor`.
 */
export function describeKeymapModeContract<T extends EditorElement = EditorElement>(
  tag: string,
  options: KeymapModeContractOptions<T>
): void {
  const { content, prepare } = options;

  async function mounted(setup?: (el: T) => void): Promise<T> {
    const el = mount<T>(tag, (e) => {
      prepare?.(e);
      setup?.(e);
    });
    el.setContent(content);
    await settled(el);
    return el;
  }

  const methods = (el: T) => {
    const { getSupportedKeymapModes, getKeymapMode, setKeymapMode } = el;
    if (!getSupportedKeymapModes || !getKeymapMode || !setKeymapMode) {
      throw new Error(`<${tag}> does not implement the keymap-mode methods`);
    }
    return {
      supported: () => getSupportedKeymapModes.call(el),
      mode: () => getKeymapMode.call(el),
      set: async (mode: EditorKeymapMode) => setKeymapMode.call(el, mode),
    };
  };

  describe(`<${tag}> keymap mode for raw text`, () => {
    afterEach(() => document.body.replaceChildren());

    describe('without <code-editor>', () => {
      beforeAll(() => {
        if (customElements.get('code-editor')) {
          throw new Error('describeKeymapModeContract needs a test file of its own');
        }
      });

      it('supports Normal only, and reflects it', async () => {
        const el = await mounted();
        const keymap = methods(el);
        const seen = keymapChanges(el);
        expect(el.getAttribute(KEYMAP_MODE_ATTRIBUTE)).toBe('normal');
        expect(keymap.supported()).toEqual(['normal']);

        const result = await keymap.set('vim');
        expect(result).toMatchObject({
          requestedMode: 'vim',
          activeMode: 'normal',
          status: 'unsupported',
        });
        expect(keymap.mode()).toBe('normal');
        expect(el.getAttribute(KEYMAP_MODE_ATTRIBUTE)).toBe('normal');
        expect(seen).toEqual([]);
      });
    });

    describe('with <code-editor>', () => {
      beforeAll(() => defineCodeEditorKeymapStub());

      it('records a mode set in the rich view and opens raw in it', async () => {
        const el = await mounted();
        const keymap = methods(el);
        const seen = keymapChanges(el);
        expect(keymap.supported()).toEqual(['normal', 'vim']);

        const result = await keymap.set('vim');
        expect(result).toEqual({ requestedMode: 'vim', activeMode: 'vim', status: 'applied' });
        expect(el.getAttribute(KEYMAP_MODE_ATTRIBUTE)).toBe('vim');
        expect(seen).toEqual([result]);

        el.setAttribute('view', 'raw');
        await settled(el);
        expect(embedded(el).getKeymapMode()).toBe('vim');
        expect(seen).toHaveLength(1);
      });

      it("reports a choice made on the raw view's own toolbar", async () => {
        const el = await mounted((e) => e.setAttribute('view', 'raw'));
        const seen = keymapChanges(el);

        await embedded(el).choose('vim');
        expect(methods(el).mode()).toBe('vim');
        expect(el.getAttribute(KEYMAP_MODE_ATTRIBUTE)).toBe('vim');
        expect(seen).toEqual([{ requestedMode: 'vim', activeMode: 'vim', status: 'applied' }]);
      });

      it('applies a mode set while raw shows to the embedded editor, with one event', async () => {
        const el = await mounted((e) => e.setAttribute('view', 'raw'));
        const seen = keymapChanges(el);

        const result = await methods(el).set('vim');
        expect(result.status).toBe('applied');
        expect(embedded(el).getKeymapMode()).toBe('vim');
        expect(seen).toEqual([result]);
      });

      it("follows the host's keymap-mode attribute and writes back an invalid one", async () => {
        const el = await mounted();
        el.setAttribute(KEYMAP_MODE_ATTRIBUTE, 'vim');
        await settled(el);
        expect(methods(el).mode()).toBe('vim');

        el.setAttribute(KEYMAP_MODE_ATTRIBUTE, 'emacs');
        await settled(el);
        expect(el.getAttribute(KEYMAP_MODE_ATTRIBUTE)).toBe('vim');
      });

      it('runs read-only raw text in Normal, keeping the mode for after', async () => {
        const el = await mounted((e) => e.setAttribute('view', 'raw'));
        const keymap = methods(el);
        await keymap.set('vim');
        const seen = keymapChanges(el);

        el.setAttribute('readonly', 'true');
        await settled(el);
        expect(embedded(el).getKeymapMode()).toBe('normal');
        expect(keymap.mode()).toBe('vim');
        expect(keymap.supported()).toEqual(['normal']);
        expect(await keymap.set('vim')).toMatchObject({
          status: 'unsupported',
          reason: 'readonly',
        });

        el.removeAttribute('readonly');
        await settled(el);
        expect(embedded(el).getKeymapMode()).toBe('vim');
        expect(seen).toEqual([]);
      });
    });
  });
}
