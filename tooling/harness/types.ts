// What a format's `dev/fixtures.ts` exports so the harness can mount it. The
// harness drives elements only through the contracts in `common` and a format's
// descriptor; anything a format wants beyond them (an extra element, a call-site
// option) it does itself in a fixture's or the module's `apply`, or in a control.
import type { EditorElement, PreviewElement } from '@stillpointlab/common-format';
import type { FormatDescriptor } from '@stillpointlab/common-format/format';

/** The mounted elements, by role. Extras are keyed by tag. */
export interface HarnessElements {
  editor: EditorElement | null;
  preview: PreviewElement | null;
  extras: Record<string, HTMLElement>;
}

export interface HarnessFixture {
  /** The source shown in the readback pane and given to the default `apply`. */
  content: string;
  /**
   * The file the content stands for, for a format's descriptor: its `apply` reads
   * attributes from the path (the code language, a `.sheet` document). Default: the
   * fixture's name plus the format's first extension.
   */
  path?: string;
  /** Drive the elements for this fixture instead of the module or harness default. */
  apply?: (elements: HarnessElements, content: string) => void;
}

export type HarnessControl =
  | {
      kind: 'toggle';
      label: string;
      initial?: boolean;
      apply: (elements: HarnessElements, on: boolean) => void;
    }
  | {
      kind: 'select';
      label: string;
      options: readonly string[];
      initial?: string;
      apply: (elements: HarnessElements, value: string) => void;
    };

export interface HarnessFormat {
  /**
   * The format's descriptor, from its `./format` entry. With it, the harness takes
   * the editor and preview tags from the descriptor, loads them through it, and
   * applies a fixture with the descriptor's `apply`.
   */
  format?: FormatDescriptor;
  /**
   * Tags to mount: an editor, a preview, and any extra elements, each optional.
   * With `format`, only `extra` is read. Components and apps name theirs here.
   */
  elements?: { editor?: string; preview?: string; extra?: readonly string[] };
  /** Named fixtures; a string is content for the default `apply`. A fixture's own `apply` wins. */
  fixtures: Record<string, string | HarnessFixture>;
  /**
   * How to apply a fixture without an `apply` of its own. Default: with `format`, the
   * descriptor's `apply` on the editor and preview under the fixture's path, and
   * `setContent` on each extra that has it; without, `setContent` on every element
   * that has it.
   */
  apply?: (elements: HarnessElements, content: string) => void;
  /** Format-specific controls rendered beside the common ones. */
  controls?: readonly HarnessControl[];
  /** Mirror editor edits into the preview with `setContent` (default true). */
  mirror?: boolean;
}
