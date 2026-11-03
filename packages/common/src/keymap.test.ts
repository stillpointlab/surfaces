// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createKeymapState, parseKeymapMode } from './keymap';
import { createRawSource } from './raw';
import { defineCodeEditorKeymapStub } from './testing/keymap';

import type { EditorKeymapModeResult } from './contracts';
import type { CodeEditorKeymapStub } from './testing/keymap';

const changes = (el: HTMLElement) => {
  const seen: EditorKeymapModeResult[] = [];
  el.addEventListener('keymap-mode-change', (event) => {
    seen.push((event as CustomEvent<EditorKeymapModeResult>).detail);
  });
  return seen;
};

describe('parseKeymapMode', () => {
  it('reads normal and vim, and nothing else', () => {
    expect(parseKeymapMode('normal')).toBe('normal');
    expect(parseKeymapMode('vim')).toBe('vim');
    expect(parseKeymapMode('emacs')).toBeNull();
    expect(parseKeymapMode(null)).toBeNull();
  });
});

// Order matters: the custom element registry is shared by the file's tests.
describe('createKeymapState without <code-editor>', () => {
  it('supports Normal only and reflects it on connect', async () => {
    const host = document.createElement('div');
    const keymap = createKeymapState(host);
    keymap.connected();
    expect(host.getAttribute('keymap-mode')).toBe('normal');
    expect(keymap.supportedModes()).toEqual(['normal']);
    expect(await keymap.set('vim', null)).toMatchObject({
      status: 'unsupported',
      reason: 'not-supported',
    });
  });

  it('leaves a valid attribute alone on connect and writes back an invalid one', () => {
    const host = document.createElement('div');
    const keymap = createKeymapState(host);
    host.setAttribute('keymap-mode', 'normal');
    keymap.connected();
    expect(host.getAttribute('keymap-mode')).toBe('normal');
    host.setAttribute('keymap-mode', 'emacs');
    keymap.attributeChanged('emacs', null);
    expect(host.getAttribute('keymap-mode')).toBe('normal');
  });

  it('gives a textarea raw source Normal keys only', async () => {
    const source = createRawSource({ value: 'a', label: 'Source', onInput: vi.fn() });
    expect(await source.setKeymapMode('normal')).toMatchObject({ status: 'applied' });
    expect(await source.setKeymapMode('vim')).toMatchObject({ status: 'unsupported' });
  });
});

describe('with <code-editor> defined', () => {
  it('records a mode with no surface, once, and refuses Vim while read-only', async () => {
    defineCodeEditorKeymapStub();
    const host = document.createElement('div');
    const keymap = createKeymapState(host);
    const seen = changes(host);
    expect(keymap.supportedModes()).toEqual(['normal', 'vim']);

    const result = await keymap.set('vim', null);
    await keymap.set('vim', null);
    expect(keymap.mode).toBe('vim');
    expect(host.getAttribute('keymap-mode')).toBe('vim');
    expect(seen).toEqual([result]);

    host.setAttribute('readonly', 'true');
    expect(keymap.supportedModes()).toEqual(['normal']);
    expect(await keymap.set('vim', null)).toMatchObject({ reason: 'readonly' });
    expect(await keymap.set('normal', null)).toMatchObject({ status: 'applied' });
  });

  it('opens the embedded editor in the mode and reports choices made on it', async () => {
    const onKeymapModeChange = vi.fn();
    const source = createRawSource({
      value: 'a',
      label: 'Source',
      onInput: vi.fn(),
      keymapMode: 'vim',
      onKeymapModeChange,
    });
    const editor = source.element as CodeEditorKeymapStub;
    expect(editor.getKeymapMode()).toBe('vim');

    await editor.choose('normal');
    expect(onKeymapModeChange).toHaveBeenCalledWith({
      requestedMode: 'normal',
      activeMode: 'normal',
      status: 'applied',
    });
  });

  it('does not report the drop to Normal that read-only forces, and restores the mode after', async () => {
    const onKeymapModeChange = vi.fn();
    const source = createRawSource({
      value: 'a',
      label: 'Source',
      onInput: vi.fn(),
      keymapMode: 'vim',
      onKeymapModeChange,
    });
    const editor = source.element as CodeEditorKeymapStub;

    source.setReadonly(true);
    await Promise.resolve();
    expect(editor.getKeymapMode()).toBe('normal');
    expect(onKeymapModeChange).not.toHaveBeenCalled();

    source.setReadonly(false);
    await Promise.resolve();
    expect(editor.getKeymapMode()).toBe('vim');
  });

  it('forwards a mode to the surface and records it from the result', async () => {
    const host = document.createElement('div');
    const keymap = createKeymapState(host);
    const seen = changes(host);
    const source = createRawSource({
      value: 'a',
      label: 'Source',
      onInput: vi.fn(),
      ...keymap.rawSourceOptions(),
    });

    const result = await keymap.set('vim', source);
    expect((source.element as CodeEditorKeymapStub).getKeymapMode()).toBe('vim');
    expect(keymap.mode).toBe('vim');
    expect(seen).toEqual([result]);
  });
});
