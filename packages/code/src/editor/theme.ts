import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export function codeEditorTheme(EditorViewCtor: typeof EditorView): Extension {
  return EditorViewCtor.theme(
    {
      '&': {
        backgroundColor: 'var(--spl-background-primary, #ffffff)',
        color: 'var(--spl-text-primary, #24292f)',
      },
      '.cm-content': {
        caretColor: 'var(--spl-text-primary, #24292f)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--spl-text-primary, #24292f)',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--spl-text-primary, #24292f)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--spl-focus-ring, rgba(88, 166, 255, 0.24))',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--spl-background-secondary, #f6f8fa)',
        borderRightColor: 'var(--spl-border-color, #d0d7de)',
        color: 'var(--spl-text-muted, #57606a)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--spl-background-muted, #f6f8fa)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--spl-background-hover, #eaeef2)',
        color: 'var(--spl-text-primary, #24292f)',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        color: 'var(--spl-text-muted, #57606a)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--spl-background-secondary, #f6f8fa)',
        borderColor: 'var(--spl-border-color, #d0d7de)',
        color: 'var(--spl-text-primary, #24292f)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--spl-warning-bg, #fff3cd)',
        outlineColor: 'var(--spl-warning-color, #856404)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--spl-focus-ring, rgba(88, 166, 255, 0.24))',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--spl-surface-overlay, #ffffff)',
        borderColor: 'var(--spl-border-color, #d0d7de)',
        color: 'var(--spl-text-primary, #24292f)',
      },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--spl-primary-blue, #0066cc)',
        color: '#ffffff',
      },
      '.cm-mergeView': {
        backgroundColor: 'var(--spl-background-primary, #ffffff)',
      },
      '.cm-mergeViewEditor': {
        backgroundColor: 'var(--spl-background-primary, #ffffff)',
      },
      '.cm-deletedChunk': {
        backgroundColor: 'var(--spl-error-bg-subtle, rgba(220, 53, 69, 0.08))',
      },
      '.cm-insertedChunk': {
        backgroundColor: 'rgba(46, 160, 67, 0.14)',
      },
      '.cm-changedLine': {
        backgroundColor: 'var(--spl-background-muted, #f6f8fa)',
      },
      '.cm-deletedLine': {
        backgroundColor: 'var(--spl-error-bg-subtle, rgba(220, 53, 69, 0.08))',
      },
      '.cm-insertedLine': {
        backgroundColor: 'rgba(46, 160, 67, 0.14)',
      },
    }
  );
}
