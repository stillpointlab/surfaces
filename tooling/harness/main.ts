// The surfaces harness: one page that mounts any format from its
// `dev/fixtures.ts` (see types.ts) and gives it the chrome every format wants:
// editor beside preview, a fixture picker, read-only, narrow panes, light and
// dark with the shared tokens, source readback, ready badges and an event log.
import type { HarnessControl, HarnessElements, HarnessFixture, HarnessFormat } from './types';

declare const __HARNESS_DEFAULT_FORMAT__: string;

type FormatModule = { default: HarnessFormat };

// Every format with a fixtures module, loaded only when selected.
const modules = import.meta.glob<FormatModule>('../../packages/formats/*/dev/fixtures.ts');
const formats = new Map<string, () => Promise<FormatModule>>();
for (const [path, load] of Object.entries(modules)) {
  const name = /packages\/formats\/([^/]+)\/dev\/fixtures\.ts$/.exec(path)?.[1];
  if (name) formats.set(name, load);
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`harness: #${id} missing`);
  return el as T;
};

const formatSelect = $<HTMLSelectElement>('format');
const fixtureSelect = $<HTMLSelectElement>('fixture');
const controlsHost = $<HTMLElement>('controls');
const readonlyToggle = $<HTMLInputElement>('readonly');
const rawToggle = $<HTMLInputElement>('raw');
const narrowToggle = $<HTMLInputElement>('narrow');
const darkToggle = $<HTMLInputElement>('dark');
const editorPane = $<HTMLElement>('editor-pane');
const previewPane = $<HTMLElement>('preview-pane');
const extrasHost = $<HTMLElement>('extras');
const sourceOut = $<HTMLElement>('source');
const eventsOut = $<HTMLOListElement>('events');

const WATCHED_EVENTS = [
  'ready',
  'content-change',
  'keymap-mode-change',
  'md-preview-rendered',
  'xmdl-apply',
  'view-change',
] as const;

let current: { name: string; format: HarnessFormat; elements: HarnessElements } | null = null;
let observers: MutationObserver[] = [];

function log(line: string): void {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} ${line}`;
  eventsOut.prepend(item);
  while (eventsOut.children.length > 40) eventsOut.lastElementChild?.remove();
}

function watchReady(el: HTMLElement, badge: HTMLElement | null): void {
  if (!badge) return;
  const update = () => {
    const ready = el.hasAttribute('ready');
    badge.dataset.ready = String(ready);
    badge.textContent = ready ? 'ready' : 'pending';
  };
  const observer = new MutationObserver(update);
  observer.observe(el, { attributes: true, attributeFilter: ['ready'] });
  observers.push(observer);
  update();
}

function wire(el: HTMLElement, tag: string): void {
  for (const type of WATCHED_EVENTS) {
    el.addEventListener(type, (event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      let summary = '';
      if (detail && typeof detail === 'object' && 'content' in detail) {
        summary = ` (${String((detail as { content: unknown }).content).length} chars)`;
      } else if (detail && typeof detail === 'object' && 'reason' in detail) {
        const { view, reason } = detail as { view: string; reason: string };
        summary = ` (${view}, ${reason})`;
      }
      log(`${tag} ${type}${summary}`);
    });
  }
}

function updateSource(): void {
  const editor = current?.elements.editor;
  sourceOut.textContent = editor ? editor.getContent() : '';
}

function defaultApply(elements: HarnessElements, content: string): void {
  const targets = [elements.editor, elements.preview, ...Object.values(elements.extras)];
  for (const el of targets) {
    if (el && 'setContent' in el && typeof el.setContent === 'function') {
      (el as { setContent(content: string): void }).setContent(content);
    }
  }
}

function applyFixture(name: string): void {
  if (!current) return;
  const { format, elements } = current;
  const raw = format.fixtures[name];
  if (raw === undefined) return;
  const fixture: HarnessFixture = typeof raw === 'string' ? { content: raw } : raw;
  const apply = fixture.apply ?? format.apply ?? defaultApply;
  apply(elements, fixture.content);
  updateSource();
  const url = new URL(location.href);
  url.searchParams.set('format', current.name);
  url.searchParams.set('fixture', name);
  history.replaceState(null, '', url);
}

function renderControls(controls: readonly HarnessControl[], elements: HarnessElements): void {
  controlsHost.replaceChildren();
  for (const control of controls) {
    const label = document.createElement('label');
    if (control.kind === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = control.initial ?? false;
      input.addEventListener('change', () => control.apply(elements, input.checked));
      label.append(input, ` ${control.label}`);
      control.apply(elements, input.checked);
    } else {
      const select = document.createElement('select');
      for (const option of control.options) select.add(new Option(option, option));
      select.value = control.initial ?? control.options[0] ?? '';
      select.addEventListener('change', () => control.apply(elements, select.value));
      label.append(`${control.label} `, select);
      control.apply(elements, select.value);
    }
    controlsHost.append(label);
  }
}

function mountExtra(tag: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'extra';
  const heading = document.createElement('h3');
  heading.textContent = `<${tag}> `;
  const badge = document.createElement('span');
  badge.className = 'status';
  heading.append(badge);
  const pane = document.createElement('div');
  pane.className = 'pane';
  const el = document.createElement(tag);
  // Listen before connecting: a synchronous element settles on connect.
  watchReady(el, badge);
  wire(el, tag);
  pane.append(el);
  block.append(heading, pane);
  extrasHost.append(block);
  return el;
}

async function selectFormat(name: string, fixtureName?: string): Promise<void> {
  const load = formats.get(name);
  if (!load) return;
  const { default: format } = await load();

  for (const observer of observers) observer.disconnect();
  observers = [];
  editorPane.replaceChildren();
  previewPane.replaceChildren();
  extrasHost.replaceChildren();
  eventsOut.replaceChildren();

  const elements: HarnessElements = { editor: null, preview: null, extras: {} };
  const { editor: editorTag, preview: previewTag, extra = [] } = format.elements;

  if (editorTag) {
    const el = document.createElement(editorTag) as HarnessElements['editor'];
    if (el) {
      elements.editor = el;
      // Listen before connecting: a synchronous element settles on connect.
      watchReady(el, document.querySelector('.status[data-role="editor"]'));
      wire(el, editorTag);
      // The control follows the editor's view: its own switch, a fallback, or a refusal.
      const viewObserver = new MutationObserver(() => {
        rawToggle.checked = el.getAttribute('view') === 'raw';
      });
      viewObserver.observe(el, { attributes: true, attributeFilter: ['view'] });
      observers.push(viewObserver);
      el.addEventListener('content-change', () => {
        updateSource();
        if (format.mirror !== false && elements.preview) {
          elements.preview.setContent(el.getContent());
        }
      });
      editorPane.append(el);
    }
  }
  $('editor-block').hidden = !editorTag;
  $('source-block').hidden = !editorTag;

  if (previewTag) {
    const el = document.createElement(previewTag) as HarnessElements['preview'];
    if (el) {
      elements.preview = el;
      watchReady(el, document.querySelector('.status[data-role="preview"]'));
      wire(el, previewTag);
      previewPane.append(el);
    }
  }
  $('preview-block').hidden = !previewTag;

  for (const tag of extra) elements.extras[tag] = mountExtra(tag);
  $('extras-block').hidden = extra.length === 0;

  current = { name, format, elements };
  formatSelect.value = name;

  fixtureSelect.replaceChildren();
  for (const fixture of Object.keys(format.fixtures)) {
    fixtureSelect.add(new Option(fixture, fixture));
  }
  renderControls(format.controls ?? [], elements);
  applyReadonly();
  if (rawToggle.checked) applyRaw();

  const first = fixtureName && format.fixtures[fixtureName] ? fixtureName : fixtureSelect.value;
  fixtureSelect.value = first;
  applyFixture(first);
}

/** The Raw control: ask the editor and preview for their raw view, or the rich one. */
function applyRaw(): void {
  const targets = [current?.elements.editor, current?.elements.preview];
  for (const el of targets) {
    if (!el) continue;
    if (rawToggle.checked) el.setAttribute('view', 'raw');
    else if (el.hasAttribute('view')) el.setAttribute('view', 'rich');
  }
}

function applyReadonly(): void {
  const editor = current?.elements.editor;
  if (!editor) return;
  if (readonlyToggle.checked) editor.setAttribute('readonly', 'true');
  else editor.removeAttribute('readonly');
}

for (const name of [...formats.keys()].sort()) formatSelect.add(new Option(name, name));
formatSelect.addEventListener('change', () => void selectFormat(formatSelect.value));
fixtureSelect.addEventListener('change', () => applyFixture(fixtureSelect.value));
readonlyToggle.addEventListener('change', applyReadonly);
rawToggle.addEventListener('change', applyRaw);
narrowToggle.addEventListener('change', () => {
  for (const pane of document.querySelectorAll('.pane')) {
    pane.classList.toggle('narrow', narrowToggle.checked);
  }
});
darkToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark', darkToggle.checked);
});

const params = new URLSearchParams(location.search);
// Raw views use <code-editor> and <code-preview> when they are registered, as a
// host such as Context Manager does; `?raw=plain` leaves them out to show the
// textarea and <pre> fallbacks.
if (params.get('raw') !== 'plain') {
  await Promise.all([
    import('../../packages/formats/code/src/editor'),
    import('../../packages/formats/code/src/preview'),
  ]);
}
const requested = params.get('format') ?? __HARNESS_DEFAULT_FORMAT__;
const initial = formats.has(requested) ? requested : [...formats.keys()].sort()[0];
if (initial) void selectFormat(initial, params.get('fixture') ?? undefined);
else log('no format has a dev/fixtures.ts yet');
