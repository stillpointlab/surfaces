// What a format's `dev/fixtures.ts` exports so the harness can mount it. The
// harness drives elements only through the contracts in `common`; anything a
// format wants beyond them (an extra element, an attribute, a second setter) it
// does itself in a fixture's or the module's `apply`, or in a control.
import type { EditorElement, PreviewElement } from '@stillpointlab/common-format';

/** The mounted elements, by role. Extras are keyed by tag. */
export interface HarnessElements {
  editor: EditorElement | null;
  preview: PreviewElement | null;
  extras: Record<string, HTMLElement>;
}

export interface HarnessFixture {
  /** The source shown in the readback pane and given to the default `apply`. */
  content: string;
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
  /** Tags to mount: an editor, a preview, and any extra elements, each optional. */
  elements: { editor?: string; preview?: string; extra?: readonly string[] };
  /** Named fixtures; a string is content for the default `apply`. */
  fixtures: Record<string, string | HarnessFixture>;
  /** How to apply a plain-string fixture. Default: `setContent` on every element that has it. */
  apply?: (elements: HarnessElements, content: string) => void;
  /** Format-specific controls rendered beside the common ones. */
  controls?: readonly HarnessControl[];
  /** Mirror editor edits into the preview with `setContent` (default true). */
  mirror?: boolean;
}
