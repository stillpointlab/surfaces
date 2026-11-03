import { afterEach, describe, expect, it } from 'vitest';

import { RAW_VIEW_LABEL, VIEW_CHANGE_EVENT } from '../raw';

import { contentChanges, mount, settled } from './support';

import type { EditorElement, PreviewElement, ViewChangeDetail } from '../contracts';

export interface RawViewContractOptions<T extends PreviewElement = PreviewElement> {
  /** An editor has the "Raw Text" switch and an editable raw view; a preview neither. */
  kind: 'editor' | 'preview';
  /** Content the rich view shows. */
  content: string;
  /** A valid edit of `content`, typed in raw. Default: `content` plus a trailing newline. */
  editedContent?: string;
  /**
   * Type `text` into the raw view as a user would. Default: set the value of the
   * `<textarea data-spl-raw>` and dispatch `input`. Needed when the raw surface
   * is something else (a registered `<code-editor>`).
   */
  editRaw?: (el: T, text: string) => void | Promise<void>;
  /** Content the rich view cannot show; omit for a format whose content always parses. */
  invalidContent?: string;
  /** A second invalid text with different errors, to prove the notice follows the text. */
  otherInvalidContent?: string;
  /** Runs on each created element before it is connected. */
  prepare?: (el: T) => void;
}

/** The element's raw surface (`createRawSource` / `createRawView` mark it), if shown. */
export function rawSurface(el: HTMLElement): HTMLElement | null {
  return el.shadowRoot?.querySelector<HTMLElement>('[data-spl-raw]') ?? null;
}

/** The text the raw view shows. */
export function rawText(el: HTMLElement): string {
  const surface = rawSurface(el);
  if (!surface) throw new Error(`<${el.localName}> shows no raw view`);
  if (surface instanceof HTMLTextAreaElement) return surface.value;
  const embedded = surface as HTMLElement & { getContent?: () => string };
  if (typeof embedded.getContent === 'function') return embedded.getContent();
  return surface.textContent ?? '';
}

/** Collect `view-change` details from now on. */
export function viewChanges(el: HTMLElement): ViewChangeDetail[] {
  const seen: ViewChangeDetail[] = [];
  el.addEventListener(VIEW_CHANGE_EVENT, (event) => {
    seen.push((event as CustomEvent<ViewChangeDetail>).detail);
  });
  return seen;
}

/** The editor's "Raw Text" switch. */
export function rawSwitch(el: HTMLElement): HTMLButtonElement {
  const control = el.shadowRoot?.querySelector<HTMLButtonElement>(
    `.spl-switch[aria-label="${RAW_VIEW_LABEL}"]`
  );
  if (!control) throw new Error(`<${el.localName}> has no "${RAW_VIEW_LABEL}" switch`);
  return control;
}

function notice(el: HTMLElement): HTMLElement | null {
  return el.shadowRoot?.querySelector<HTMLElement>('.spl-notice') ?? null;
}

function defaultEditRaw(el: HTMLElement, text: string): void {
  const surface = rawSurface(el);
  if (!(surface instanceof HTMLTextAreaElement)) {
    throw new Error('the raw view is not a textarea; pass an editRaw hook');
  }
  surface.value = text;
  surface.dispatchEvent(new Event('input', { bubbles: true }));
}

const isRaw = (el: HTMLElement) => el.getAttribute('view') === 'raw';

/**
 * The raw view conformance suite for one tag: the `view` attribute and
 * `view-change` event, the "Raw Text" switch (editors), the content rules, read-only,
 * and the fallback for content the rich view cannot show. See the README's "Raw view".
 */
export function describeRawViewContract<T extends PreviewElement = PreviewElement>(
  tag: string,
  options: RawViewContractOptions<T>
): void {
  const { kind, content, prepare, invalidContent, otherInvalidContent } = options;
  const edited = options.editedContent ?? `${content}\n`;
  const editRaw = options.editRaw ?? ((el: T, text: string) => defaultEditRaw(el, text));

  async function mounted(text = content, setup?: (el: T) => void): Promise<T> {
    const el = mount<T>(tag, (e) => {
      prepare?.(e);
      setup?.(e);
    });
    el.setContent(text);
    await settled(el);
    return el;
  }

  describe(`<${tag}> raw view contract`, () => {
    afterEach(() => document.body.replaceChildren());

    it('shows the rich view unless asked', async () => {
      const el = await mounted();
      expect(isRaw(el)).toBe(false);
      expect(rawSurface(el)).toBeNull();
    });

    it("follows the host's view attribute, keeping the text", async () => {
      const el = await mounted();
      const seen = viewChanges(el);

      el.setAttribute('view', 'raw');
      await settled(el);
      expect(seen).toEqual([{ view: 'raw', reason: 'host' }]);
      expect(rawText(el)).toBe(content);

      el.setAttribute('view', 'rich');
      await settled(el);
      expect(seen.at(-1)).toEqual({ view: 'rich', reason: 'host' });
      expect(rawSurface(el)).toBeNull();
      if (kind === 'editor') {
        expect((el as unknown as EditorElement).getContent()).toBe(content);
      }
    });

    it('starts in raw when the attribute is set before connect', async () => {
      const el = await mounted(content, (e) => e.setAttribute('view', 'raw'));
      expect(isRaw(el)).toBe(true);
      expect(rawText(el)).toBe(content);
    });

    if (kind === 'editor') {
      it('switches with the "Raw Text" switch and never changes the text', async () => {
        const el = (await mounted()) as unknown as T & EditorElement;
        const seen = viewChanges(el);
        expect(rawSwitch(el).getAttribute('aria-checked')).toBe('false');

        rawSwitch(el).click();
        await settled(el);
        expect(seen).toEqual([{ view: 'raw', reason: 'user' }]);
        expect(el.getAttribute('view')).toBe('raw');
        expect(rawSwitch(el).getAttribute('aria-checked')).toBe('true');
        expect(el.getContent()).toBe(content);
        expect(rawText(el)).toBe(content);

        rawSwitch(el).click();
        await settled(el);
        expect(seen.at(-1)).toEqual({ view: 'rich', reason: 'user' });
        expect(el.getContent()).toBe(content);
      });

      it('reports each raw edit once and keeps it verbatim', async () => {
        const el = (await mounted(content, (e) => e.setAttribute('view', 'raw'))) as unknown as T &
          EditorElement;
        const changes = contentChanges(el);

        await editRaw(el, edited);
        expect(changes.details).toEqual([{ content: edited }]);
        expect(el.getContent()).toBe(edited);

        rawSwitch(el).click();
        await settled(el);
        expect(isRaw(el)).toBe(false);
        expect(changes.details).toHaveLength(1);
        expect(el.getContent()).toBe(edited);
      });

      it('stays in raw when content is set there', async () => {
        const el = (await mounted(content, (e) => e.setAttribute('view', 'raw'))) as unknown as T &
          EditorElement;
        const changes = contentChanges(el);
        el.setContent(edited);
        await settled(el);
        expect(isRaw(el)).toBe(true);
        expect(rawText(el)).toBe(edited);
        expect(el.getContent()).toBe(edited);
        expect(changes.details).toEqual([]);
      });

      it('keeps its view when read-only, and both views are uneditable', async () => {
        const el = (await mounted(content, (e) =>
          e.setAttribute('readonly', 'true')
        )) as unknown as T & EditorElement;
        expect(isRaw(el)).toBe(false);
        expect(rawSwitch(el).disabled).toBe(false);

        rawSwitch(el).click();
        await settled(el);
        expect(isRaw(el)).toBe(true);
        const changes = contentChanges(el);
        await editRaw(el, edited);
        expect(changes.details).toEqual([]);
        expect(el.getContent()).toBe(content);

        el.removeAttribute('readonly');
        await settled(el);
        expect(isRaw(el)).toBe(true);
        el.setAttribute('readonly', 'true');
        await settled(el);
        expect(isRaw(el)).toBe(true);
      });
    }

    if (invalidContent !== undefined) {
      it('opens content the rich view cannot show in raw, with a notice', async () => {
        const el = mount<T>(tag, prepare);
        await settled(el);
        const seen = viewChanges(el);

        el.setContent(invalidContent);
        await settled(el);
        expect(isRaw(el)).toBe(true);
        expect(seen).toEqual([{ view: 'raw', reason: 'fallback' }]);
        expect(rawText(el)).toBe(invalidContent);
        expect(notice(el)?.textContent?.trim()).toBeTruthy();
      });

      if (kind === 'editor') {
        it('stays in raw with the current errors until the text parses', async () => {
          const el = mount<T>(tag, prepare) as unknown as T & EditorElement;
          el.setContent(invalidContent);
          await settled(el);
          const seen = viewChanges(el);
          const first = notice(el)?.textContent;

          if (otherInvalidContent !== undefined) await editRaw(el, otherInvalidContent);
          rawSwitch(el).click();
          await settled(el);
          expect(isRaw(el)).toBe(true);
          expect(seen).toEqual([]);
          expect(notice(el)?.getAttribute('role')).toBe('alert');
          if (otherInvalidContent !== undefined) {
            expect(notice(el)?.textContent).not.toBe(first);
          }

          // Fixing the text does not switch back by itself; the switch then works.
          await editRaw(el, content);
          await settled(el);
          expect(isRaw(el)).toBe(true);
          rawSwitch(el).click();
          await settled(el);
          expect(isRaw(el)).toBe(false);
          expect(seen).toEqual([{ view: 'rich', reason: 'user' }]);
          expect(el.getContent()).toBe(content);
        });

        it('refuses a host request for rich while the text does not parse', async () => {
          const el = mount<T>(tag, prepare);
          el.setContent(invalidContent);
          await settled(el);
          el.setAttribute('view', 'rich');
          await settled(el);
          expect(el.getAttribute('view')).toBe('raw');
          expect(rawText(el)).toBe(invalidContent);
        });
      } else {
        it('returns to the rendered view when valid content arrives', async () => {
          const el = mount<T>(tag, prepare);
          el.setContent(invalidContent);
          await settled(el);
          const seen = viewChanges(el);
          el.setContent(content);
          await settled(el);
          expect(isRaw(el)).toBe(false);
          expect(seen).toEqual([{ view: 'rich', reason: 'fallback' }]);
          expect(notice(el)).toBeNull();
        });
      }
    }
  });
}
