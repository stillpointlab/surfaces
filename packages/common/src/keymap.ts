// Keymap modes for an editor whose raw view edits text in a <code-editor>. The
// mode is the editor's: it is recorded while the rich view shows, the raw view
// opens in it, and a choice made on the embedded editor's own toolbar comes back
// to the editor as its `keymap-mode` attribute and `keymap-mode-change` event, so
// a host stores one preference for every editor. The rich views' keys never
// change. Read-only raw text runs in Normal without changing the recorded mode.
//
// A helper the element calls from its contract methods, not a base class:
//
//   private readonly keymap = createKeymapState(this);
//   getKeymapMode() { return this.keymap.mode; }
//   setKeymapMode(mode) { return this.keymap.set(mode, this.raw); }
//   createRawSource({ …, ...this.keymap.rawSourceOptions() });

import { isReadonly } from './toolbar';

import type { EditorKeymapMode, EditorKeymapModeResult } from './contracts';
import type { RawSource, RawSourceOptions } from './raw';

export const KEYMAP_MODE_ATTRIBUTE = 'keymap-mode';
export const KEYMAP_MODE_CHANGE_EVENT = 'keymap-mode-change';

const KEYMAP_MODES: readonly EditorKeymapMode[] = ['normal', 'vim'];
const NORMAL_ONLY: readonly EditorKeymapMode[] = ['normal'];

/** The mode a `keymap-mode` value names, or null for anything else. */
export function parseKeymapMode(value: string | null | undefined): EditorKeymapMode | null {
  return KEYMAP_MODES.includes(value as EditorKeymapMode) ? (value as EditorKeymapMode) : null;
}

export interface KeymapState {
  /** The recorded mode, which the raw view runs in unless read-only. */
  readonly mode: EditorKeymapMode;
  /** Normal and Vim while `<code-editor>` is defined and the element is editable; else Normal. */
  supportedModes(): readonly EditorKeymapMode[];
  /** `setKeymapMode`: record `mode`, and apply it to `surface` (the raw source shown, if any). */
  set(mode: EditorKeymapMode | string, surface: RawSource | null): Promise<EditorKeymapModeResult>;
  /** From `attributeChangedCallback`: apply a host's `keymap-mode`, or write back an invalid one. */
  attributeChanged(value: string | null, surface: RawSource | null): void;
  /** From `connectedCallback`: reflect the mode when the attribute is absent or invalid. */
  connected(): void;
  /** The `createRawSource` options that open the raw view in the mode and report choices made there. */
  rawSourceOptions(): Pick<RawSourceOptions, 'keymapMode' | 'onKeymapModeChange'>;
}

export function createKeymapState(host: HTMLElement): KeymapState {
  let mode: EditorKeymapMode = 'normal';
  let reflecting = false;

  const reflect = (): void => {
    if (host.getAttribute(KEYMAP_MODE_ATTRIBUTE) === mode) return;
    reflecting = true;
    try {
      host.setAttribute(KEYMAP_MODE_ATTRIBUTE, mode);
    } finally {
      reflecting = false;
    }
  };

  const commit = (next: EditorKeymapMode, detail: EditorKeymapModeResult): void => {
    const changed = next !== mode;
    mode = next;
    reflect();
    if (changed) host.dispatchEvent(new CustomEvent(KEYMAP_MODE_CHANGE_EVENT, { detail }));
  };

  const unsupported = (requestedMode: EditorKeymapMode, reason: string): EditorKeymapModeResult => {
    reflect();
    return { requestedMode, activeMode: mode, status: 'unsupported', reason };
  };

  const supportedModes = (): readonly EditorKeymapMode[] =>
    !isReadonly(host) && customElements.get('code-editor') ? KEYMAP_MODES : NORMAL_ONLY;

  const set = async (
    value: EditorKeymapMode | string,
    surface: RawSource | null
  ): Promise<EditorKeymapModeResult> => {
    const requested = parseKeymapMode(value);
    if (!requested) return unsupported(mode, 'invalid-mode');
    if (requested !== 'normal' && isReadonly(host)) return unsupported(requested, 'readonly');
    if (!supportedModes().includes(requested)) return unsupported(requested, 'not-supported');
    if (surface) {
      // The embedded editor reports its change through rawSourceOptions' callback.
      const result = await surface.setKeymapMode(requested);
      if (result.status === 'applied') commit(result.activeMode, result);
      else reflect();
      return result;
    }
    const result: EditorKeymapModeResult = {
      requestedMode: requested,
      activeMode: requested,
      status: 'applied',
    };
    commit(requested, result);
    return result;
  };

  return {
    get mode() {
      return mode;
    },
    supportedModes,
    set,
    attributeChanged(value, surface) {
      if (reflecting) return;
      void set(value ?? '', surface);
    },
    connected() {
      if (!parseKeymapMode(host.getAttribute(KEYMAP_MODE_ATTRIBUTE))) reflect();
    },
    rawSourceOptions: () => ({
      keymapMode: mode,
      onKeymapModeChange: (detail) => commit(detail.activeMode, detail),
    }),
  };
}
