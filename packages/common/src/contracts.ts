// The structural contracts a host drives a surface through. A format's elements
// implement these; the host types its element handles with them and never
// depends on a concrete class. They were pinned in Context Manager's
// `src/client/types/components.d.ts` (ADR-0009) and now live with the formats.

/**
 * What every surface element can say about itself: whether it is ready.
 *
 * Ready has *settled* semantics: the element is hydrated (its lazy engine, if
 * any, loaded and its view built) and the most recent content it was given has
 * reached its DOM. A later `setContent` (or `setSource`, `setContents`) starts a
 * new cycle, so `await el.whenReady()` right after a set resolves once that set
 * is visible. Synchronous elements resolve as soon as they are connected and
 * rendered. The state is reflected as a boolean `ready` attribute (present when
 * settled, absent while pending, so `tag[ready]` selects settled elements) and
 * announced by a non-bubbling `ready` event each time the element settles.
 * Disconnecting makes the element pending again until it is reconnected and
 * rendered. A host must never wait for readiness before its first `setContent`:
 * content set early is buffered and shows as soon as the element can.
 */
export interface ReadyElement extends HTMLElement {
  whenReady(): Promise<void>;
}

/**
 * A read-only preview element: it takes string content and renders it. This is
 * the subset the host drives when it only needs to display content, not edit it.
 */
export interface PreviewElement extends ReadyElement {
  setContent(content: string): void;
}

/** A preview-only element for binary media addressed by URL (`<image-preview>`). */
export interface ImagePreviewElement extends ReadyElement {
  setSource(src: string, alt?: string): void;
}

export type EditorKeymapMode = 'normal' | 'vim';

export type EditorKeymapModeStatus = 'applied' | 'unsupported';

export interface EditorKeymapModeResult {
  requestedMode: EditorKeymapMode;
  activeMode: EditorKeymapMode;
  status: EditorKeymapModeStatus;
  reason?: string;
}

/**
 * An editor element, so a host page can drive any editor interchangeably. Editors
 * expose string content in and out and emit a `content-change` CustomEvent
 * (detail: `{ content: string }`) on every user edit, and never for `setContent`;
 * the host listens through the inherited `addEventListener`. A `readonly="true"`
 * attribute disables editing. Keymap-mode methods are optional: an editor that
 * does not support a requested mode can omit them or return an explicit
 * unsupported result. The editor contract extends the preview one: an editor can
 * do everything a preview can, plus read back and focus.
 */
export interface EditorElement extends PreviewElement {
  getContent(): string;
  focus(): void;
  getSupportedKeymapModes?(): readonly EditorKeymapMode[];
  getKeymapMode?(): EditorKeymapMode;
  setKeymapMode?(mode: EditorKeymapMode): EditorKeymapModeResult | Promise<EditorKeymapModeResult>;
}

/** Which view a text surface shows: its rendered (rich) view or its source as text. */
export type SurfaceView = 'rich' | 'raw';

/** Why a surface changed view: its own switch, an automatic fallback, or the host's `view` attribute. */
export type ViewChangeReason = 'user' | 'fallback' | 'host';

/** The detail of a `view-change` event. */
export interface ViewChangeDetail {
  view: SurfaceView;
  reason: ViewChangeReason;
}

/*
 * The raw view capability (optional, like the keymap-mode methods). A preview or
 * editor over a text format that supports it observes a `view` attribute
 * (`"rich"` or `"raw"`; absent or anything else means rich), reflects its current
 * view to that attribute, and dispatches a non-bubbling `view-change`
 * `CustomEvent<ViewChangeDetail>` each time the view changes. There is no `view`
 * property: the attribute is the API. The rules (switching never changes the
 * text, a failed switch back stays raw with the current errors, content the rich
 * view cannot show opens raw, `readonly` never changes the view) are in the
 * README's "Raw view" section and proved by `describeRawViewContract`.
 */

/**
 * A read-only side-by-side diff element (`<code-diff>`): it takes two strings
 * (left = base, right = current) and renders a highlighted diff.
 */
export interface DiffElement extends ReadyElement {
  setContents(contents: { left: string; right: string }): void;
}
