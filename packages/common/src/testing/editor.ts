import { afterEach, describe, expect, it } from 'vitest';

import { describePreviewContract, type PreviewContractOptions } from './preview';
import { contentChanges, create, mount, settled } from './support';

import type { EditorElement, EditorKeymapMode, EditorKeymapModeResult } from '../contracts';

export interface EditorContractOptions<
  T extends EditorElement = EditorElement,
> extends PreviewContractOptions<T> {
  /** Perform one user edit that changes the content (events, clicks, typing). */
  edit: (el: T) => void | Promise<void>;
  /** What `getContent()` returns for `content` once hydrated; defaults to `content`. */
  roundTrip?: string;
  /**
   * Whether `readonly="true"` blocks `edit`. Default true; a format that does not
   * yet honour the attribute passes false and says why.
   */
  readonly?: boolean;
  /**
   * Whether `focus()` lands inside the element in this environment. Default true.
   * jsdom cannot focus some engines' editable surfaces; pass false and say why.
   */
  focus?: boolean;
}

/** The `EditorElement` conformance suite for one tag (includes the preview suite). */
export function describeEditorContract<T extends EditorElement = EditorElement>(
  tag: string,
  options: EditorContractOptions<T>
): void {
  const { content, edit, prepare } = options;
  const roundTrip = options.roundTrip ?? content;
  const altContent = options.altContent ?? `${content}\nmore`;

  describePreviewContract<T>(tag, options);

  describe(`<${tag}> editor contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('reads back content before connect and after settling', async () => {
      const el = create<T>(tag);
      prepare?.(el);
      el.setContent(content);
      expect(el.getContent()).toBe(content);

      document.body.append(el);
      await settled(el);
      expect(el.getContent()).toBe(roundTrip);
    });

    it('reads back a later set after settling', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(content);
      await settled(el);

      el.setContent(altContent);
      await settled(el);
      expect(el.getContent()).toBe(altContent);
    });

    it('does not emit content-change for setContent', async () => {
      const el = mount<T>(tag, prepare);
      const seen = contentChanges(el);
      el.setContent(content);
      await settled(el);
      el.setContent(altContent);
      await settled(el);

      expect(seen.details).toEqual([]);
    });

    it('emits content-change with the new content on a user edit', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(content);
      await settled(el);
      const seen = contentChanges(el);

      await edit(el);
      await settled(el);

      expect(seen.details.length).toBeGreaterThan(0);
      const last = seen.details[seen.details.length - 1] as { content?: unknown };
      expect(last).toEqual({ content: el.getContent() });
      expect(el.getContent()).not.toBe(roundTrip);
    });

    if (options.readonly !== false) {
      it('blocks user edits while readonly="true"', async () => {
        const el = mount<T>(tag, (e) => {
          prepare?.(e);
          e.setAttribute('readonly', 'true');
        });
        el.setContent(content);
        await settled(el);
        const seen = contentChanges(el);

        await edit(el);
        await settled(el);

        expect(seen.details).toEqual([]);
        expect(el.getContent()).toBe(roundTrip);
      });
    }

    if (options.focus !== false) {
      it('focus() moves focus into the element', async () => {
        const el = mount<T>(tag, prepare);
        el.setContent(content);
        await settled(el);

        el.focus();

        expect(document.activeElement).toBe(el);
        expect(el.shadowRoot?.activeElement).not.toBeNull();
      });
    }

    it('reports keymap modes consistently when it supports them', async () => {
      const el = mount<T>(tag, prepare);
      el.setContent(content);
      await settled(el);
      if (!el.getSupportedKeymapModes || !el.getKeymapMode || !el.setKeymapMode) {
        expect(el.getSupportedKeymapModes ?? el.getKeymapMode ?? el.setKeymapMode).toBeUndefined();
        return;
      }

      const supported = el.getSupportedKeymapModes();
      expect(supported).toContain('normal');
      expect(supported).toContain(el.getKeymapMode());

      const unsupported = await el.setKeymapMode('no-such-mode' as EditorKeymapMode);
      expect(unsupported.status).toBe('unsupported');
      expect(supported).toContain(unsupported.activeMode);

      for (const mode of supported) {
        const changes: EditorKeymapModeResult[] = [];
        const listener = (event: Event) => {
          changes.push((event as CustomEvent<EditorKeymapModeResult>).detail);
        };
        el.addEventListener('keymap-mode-change', listener);
        const before = el.getKeymapMode();

        const result = await el.setKeymapMode(mode);
        await settled(el);

        expect(result).toMatchObject({ requestedMode: mode, activeMode: mode, status: 'applied' });
        expect(el.getKeymapMode()).toBe(mode);
        if (before !== mode) expect(changes).toEqual([result]);
        else expect(changes).toEqual([]);
        el.removeEventListener('keymap-mode-change', listener);
      }
    });
  });
}
