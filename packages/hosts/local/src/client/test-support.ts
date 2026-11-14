/// <reference lib="dom" />

// Shared by the client's tests (jsdom): a `HostClient` over a folder in memory,
// and two small formats whose elements keep their content as text, so a test
// drives the page without a server, a real format or a network.

import { createFormatRegistry } from '@stillpointlab/common-format/format';

import type { HostClient, HostEvent } from './host-client';
import type { FolderNode, Result } from '@stillpointlab/common-format/app';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';
import type { FileStatus, PortChange } from '@stillpointlab/common-format/host';

/** A file whose content is not text: `get` refuses it as `HOST_NOT_TEXT`. */
export const BINARY = Symbol('binary');

export interface FakeHost extends HostClient {
  /** The files, by path; change them and `emit` to play a change on disk. */
  readonly disk: Map<string, string | typeof BINARY>;
  readonly versions: Map<string, string>;
  readonly gets: string[];
  readonly puts: PortChange[][];
  /** Answer the next `put` with this refusal instead of writing. */
  refuseNextPut?: { code: string; message: string };
  /** Hold every `put` until `releasePut()`. */
  holdPut: boolean;
  releasePut(): void;
  /** Folders listed with nothing under them, as a submodule is. */
  readonly separate: Set<string>;
  /** Answer the listing as cut. */
  truncated: boolean;
  /** Hold every `get` until `release()`. */
  hold: boolean;
  release(): void;
  emit(event: HostEvent): void;
  /** Write a file as something outside the page would, and say so. */
  writeOutside(path: string, text: string | null): void;
}

export function fakeHost(files: Record<string, string | typeof BINARY>): FakeHost {
  const disk = new Map(Object.entries(files));
  const versions = new Map<string, string>();
  let next = 0;
  const stamp = (path: string) => versions.set(path, `v${++next}`);
  for (const path of disk.keys()) stamp(path);
  const listeners = new Set<(event: HostEvent) => void>();
  let held: (() => void)[] = [];
  let heldPuts: (() => void)[] = [];

  const host: FakeHost = {
    disk,
    versions,
    gets: [],
    puts: [],
    hold: false,
    holdPut: false,
    separate: new Set(),
    truncated: false,
    release() {
      const waiting = held;
      held = [];
      for (const go of waiting) go();
    },
    releasePut() {
      const waiting = heldPuts;
      heldPuts = [];
      for (const go of waiting) go();
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    writeOutside(path, text) {
      if (text === null) disk.delete(path);
      else {
        disk.set(path, text);
        stamp(path);
      }
      host.emit({ type: 'changed', paths: [path] });
    },
    async root() {
      return { name: 'served', id: 'root-1' };
    },
    async list() {
      const nodes: FolderNode[] = [];
      const folders = new Set<string>();
      for (const path of disk.keys()) {
        nodes.push({ path, type: 'blob' });
        for (let cut = path.indexOf('/'); cut > 0; cut = path.indexOf('/', cut + 1)) {
          folders.add(path.slice(0, cut));
        }
      }
      for (const path of host.separate) folders.add(path);
      for (const path of folders) nodes.push({ path, type: 'tree' });
      return { nodes, truncated: host.truncated };
    },
    async get(path): Promise<Result<{ text: string; version: string }>> {
      host.gets.push(path);
      if (host.hold) await new Promise<void>((go) => held.push(go));
      if (path.startsWith('../')) {
        return { ok: false, code: 'HOST_PATH_OUTSIDE_ROOT', message: 'outside' };
      }
      const text = disk.get(path);
      if (text === undefined) return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
      if (text === BINARY) return { ok: false, code: 'HOST_NOT_TEXT', message: 'not text' };
      return { ok: true, text, version: versions.get(path)! };
    },
    urlFor: (path) => `/api/raw?path=${encodeURIComponent(path)}`,
    async put(changes) {
      host.puts.push([...changes]);
      if (host.holdPut) await new Promise<void>((go) => heldPuts.push(go));
      if (host.refuseNextPut) {
        const refusal = host.refuseNextPut;
        host.refuseNextPut = undefined;
        return { ok: false, ...refusal };
      }
      const named = new Set<string>();
      for (const change of changes) {
        for (const path of change.kind === 'move' ? [change.from, change.path] : [change.path]) {
          if (named.has(path)) return { ok: false, code: 'HOST_BAD_REQUEST', message: 'twice' };
          named.add(path);
        }
      }
      for (const change of changes) {
        const exists = disk.has(change.path);
        const source = change.kind === 'move' ? change.from : change.path;
        if ((change.kind === 'write' || change.kind === 'delete') && !exists) {
          return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
        }
        if (change.kind === 'move' && !disk.has(source)) {
          return { ok: false, code: 'HOST_FILE_NOT_FOUND', message: 'none' };
        }
        if ((change.kind === 'create' || change.kind === 'move') && exists) {
          return { ok: false, code: 'HOST_PATH_EXISTS', message: 'exists' };
        }
        if (change.base !== undefined && change.base !== versions.get(source)) {
          return { ok: false, code: 'HOST_FILE_CHANGED', message: 'changed' };
        }
      }
      const answer: Record<string, string> = {};
      for (const change of changes) {
        if (change.kind === 'delete') {
          disk.delete(change.path);
          versions.delete(change.path);
        } else if (change.kind === 'move') {
          // Without content, the bytes and so the version move as they are.
          disk.set(change.path, disk.get(change.from)!);
          versions.set(change.path, versions.get(change.from)!);
          disk.delete(change.from);
          versions.delete(change.from);
          answer[change.path] = versions.get(change.path)!;
        } else {
          disk.set(change.path, change.content);
          stamp(change.path);
          answer[change.path] = versions.get(change.path)!;
        }
      }
      // The server reports its own writes too, and here before the write's answer.
      const paths = changes.flatMap((c) => (c.kind === 'move' ? [c.from, c.path] : [c.path]));
      queueMicrotask(() => host.emit({ type: 'changed', paths }));
      return { ok: true, versions: answer };
    },
    async status(): Promise<Record<string, FileStatus>> {
      return {};
    },
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return host;
}

/** A preview that keeps its text. */
export class FakePreview extends HTMLElement {
  content = '';
  setContent(content: string): void {
    this.content = content;
    this.textContent = content;
  }
  async whenReady(): Promise<void> {}
}

/** An editor that keeps its text; `type` is a person's edit. */
export class FakeEditor extends FakePreview {
  getContent(): string {
    return this.content;
  }
  override focus(): void {
    this.dataset.focused = 'true';
  }
  type(text: string): void {
    this.setContent(this.content + text);
    this.dispatchEvent(new CustomEvent('content-change', { detail: { content: this.content } }));
  }
}

/** A preview that takes a URL. */
export class FakeImage extends HTMLElement {
  async whenReady(): Promise<void> {}
}

if (!customElements.get('fake-preview')) customElements.define('fake-preview', FakePreview);
if (!customElements.get('fake-editor')) customElements.define('fake-editor', FakeEditor);
if (!customElements.get('fake-image')) customElements.define('fake-image', FakeImage);

export const textFormat: FormatDescriptor = {
  id: 'text',
  opens: ['.md', '.txt'],
  needs: 'text',
  preview: { tag: 'fake-preview', load: async () => undefined },
  editor: { tag: 'fake-editor', load: async () => undefined },
  apply(element, file) {
    (element as FakePreview).setContent(file.text ?? '');
  },
};

export const picFormat: FormatDescriptor = {
  id: 'pic',
  opens: ['.png'],
  needs: 'url',
  preview: { tag: 'fake-image', load: async () => undefined },
  apply(element, file) {
    element.setAttribute('src', file.url ?? '');
  },
};

export const fakeRegistry = () =>
  createFormatRegistry([textFormat, picFormat], { fallback: textFormat });
