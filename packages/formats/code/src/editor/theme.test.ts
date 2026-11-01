import { describe, expect, it } from 'vitest';

import {
  CODE_ACTIVE_LINE_BACKGROUND,
  CODE_SELECTION_BACKGROUND,
  codeEditorThemeSpec,
} from './theme';

describe('codeEditorTheme selection visibility', () => {
  it('uses a dedicated selection token with a visible standalone fallback', () => {
    expect(CODE_SELECTION_BACKGROUND).toContain('--spl-code-selection-bg');
    expect(CODE_SELECTION_BACKGROUND).toContain('rgba(88, 166, 255, 0.38)');
    expect(CODE_SELECTION_BACKGROUND).not.toContain('--spl-focus-ring');
  });

  it('targets the focused CodeMirror selection layer at base-theme specificity', () => {
    expect(
      codeEditorThemeSpec[
        '&.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground'
      ]
    ).toEqual({ backgroundColor: CODE_SELECTION_BACKGROUND });
  });

  it('keeps unfocused and native selections visible', () => {
    expect(
      codeEditorThemeSpec['&.cm-editor .cm-scroller > .cm-selectionLayer .cm-selectionBackground']
    ).toEqual({ backgroundColor: CODE_SELECTION_BACKGROUND });
    expect(codeEditorThemeSpec['::selection']).toEqual({
      backgroundColor: CODE_SELECTION_BACKGROUND,
    });
  });

  it('keeps search selection styling distinct from the primary selection', () => {
    expect(codeEditorThemeSpec['.cm-searchMatch.cm-searchMatch-selected'].backgroundColor).not.toBe(
      CODE_SELECTION_BACKGROUND
    );
  });

  it('keeps the active line translucent so it cannot cover the selection layer', () => {
    expect(CODE_ACTIVE_LINE_BACKGROUND).toContain('--spl-code-active-line-bg');
    expect(CODE_ACTIVE_LINE_BACKGROUND).toContain('rgba(88, 166, 255, 0.12)');
    expect(CODE_ACTIVE_LINE_BACKGROUND).not.toContain('--spl-background-muted');
    expect(codeEditorThemeSpec['.cm-activeLine']).toEqual({
      backgroundColor: CODE_ACTIVE_LINE_BACKGROUND,
    });
  });
});
