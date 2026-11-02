// This format in the surfaces harness (`npm run dev`). The fixtures are the
// edge cases the tests know about, each applied through the sheet-specific
// setters (presentation options, `.sheet` documents, call-site overrides).
import '../src/editor';
import '../src/grid';
import '../src/preview';

import { parseSheetDocument } from '../src/document';

import type { HarnessElements, HarnessFormat } from '../../../../tooling/harness/types';
import type { SheetEditor } from '../src/editor';
import type { SheetGrid } from '../src/grid';
import type { SheetPresentation } from '../src/presentation';
import type { SheetPreview } from '../src/preview';

const regular = [
  'Name,Description,Value',
  '"Coffee, beans","Line one',
  'continues here",12',
  'Tea,"A ""quoted"" note"',
].join('\r\n');

const overLimitFormatDocument = [
  '---',
  'sheet: stillpoint/v1',
  'presentation:',
  '  formats:',
  ...Array.from({ length: 4097 }, () => ['    - range: A1', '      bold: true']).flat(),
  '---',
  'Over limit',
].join('\n');

interface SheetFixture {
  source: string;
  presentation?: SheetPresentation;
  documentSource?: string;
  documentOverride?: SheetPresentation | null;
}

const sheetFixtures: Record<string, SheetFixture> = {
  'Empty virtual A1': { source: '' },
  'Ragged rows': { source: 'A\nB,C,D\nE,F' },
  'BOM + LF + final newline': { source: '﻿Name,Value\nCoffee,12\n' },
  'Quoted and ragged': { source: regular },
  'Clipboard literal values': {
    source: [
      'Label,Tab,Multiline,Quote,Formula,HTML',
      'Source,"contains\ta tab","line one\nline two","say ""hello""",=SUM(A1),<b>literal</b>',
    ].join('\n'),
  },
  'Columns beyond Z': {
    source: Array.from({ length: 30 }, (_, index) => `Column ${index + 1}`).join(','),
  },
  '1,001 rows': {
    source: Array.from({ length: 1001 }, (_, index) => `${index},Item ${index}`).join('\n'),
  },
  'Malformed CSV': { source: '"Unclosed quoted field' },
  'Over 256 KiB': { source: 'x'.repeat(256 * 1024 + 1) },
  '1,000-row insertion cap': {
    source: Array.from({ length: 1000 }, (_, index) => `Row ${index + 1}`).join('\n'),
  },
  '256-column insertion cap': {
    source: Array.from({ length: 256 }, (_, index) => `C${index + 1}`).join(','),
  },
  'Horizontal merge': {
    source: 'Header A,Header B,Header C\nWide value,,Tail\nOne,Two,Three',
    presentation: { merges: [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 2 }] },
  },
  'Vertical merge': {
    source: 'Header A,Header B\nTall value,One\n,Two',
    presentation: { merges: [{ startRow: 1, endRow: 3, startColumn: 0, endColumn: 1 }] },
  },
  'Rectangle merge': {
    source: 'Header A,Header B,Header C\nRectangle,,Tail\n,,Other',
    presentation: { merges: [{ startRow: 1, endRow: 3, startColumn: 0, endColumn: 2 }] },
  },
  'Promoted-header group': {
    source: 'Grouped heading,,Other\nOne,Two,Three',
    presentation: { merges: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 }] },
  },
  'Rejected merge fallback': {
    source: 'Header A,Header B\nVisible,Would be hidden',
    presentation: { merges: [{ startRow: 1, endRow: 2, startColumn: 0, endColumn: 2 }] },
  },
  '.sheet default CSV format': {
    source: '',
    documentSource:
      '---\nsheet: stillpoint/v1\npresentation:\n  merges:\n    - range: A1:B1\n---\nEmbedded merge,\nOne,Two',
  },
  '.sheet explicit CSV format': {
    source: '',
    documentSource:
      '---\nsheet: stillpoint/v1\nformat: csv\npresentation:\n  merges:\n    - range: A2:A3\n---\nHeader A,Header B\nTall value,One\n,Two',
  },
  '.sheet call-site replacement': {
    source: '',
    documentSource:
      '---\nsheet: stillpoint/v1\npresentation:\n  merges:\n    - range: A1:B1\n---\nHeader A,\nReplacement,One\n,Two',
    documentOverride: { merges: [{ startRow: 1, endRow: 3, startColumn: 0, endColumn: 1 }] },
  },
  '.sheet invalid contextual merge': {
    source: '',
    documentSource:
      '---\nsheet: stillpoint/v1\npresentation:\n  merges:\n    - range: A2:B2\n---\nHeader A,Header B\nVisible,Would be hidden',
  },
  '.sheet overlapping/mixed formatting': {
    source: '',
    documentSource: [
      '---',
      'sheet: stillpoint/v1',
      'presentation:',
      '  formats:',
      '    - range: A1:C3',
      '      bold: true',
      '      italic: true',
      '    - range: B1:B3',
      '      bold: false',
      '      strikethrough: true',
      '  alignments:',
      '    - range: A1:C3',
      '      horizontal: center',
      '    - range: C1:C3',
      '      horizontal: right',
      '---',
      'Bold italic,Italic strike,Right',
      'Select across,Mixed states,Right',
      'All emphasis,Except bold,Right',
    ].join('\n'),
  },
  '.sheet all alignments': {
    source: '',
    documentSource: [
      '---',
      'sheet: stillpoint/v1',
      'presentation:',
      '  alignments:',
      '    - range: A1',
      '      horizontal: left',
      '      vertical: top',
      '    - range: B1',
      '      horizontal: center',
      '      vertical: middle',
      '    - range: C1',
      '      horizontal: right',
      '      vertical: bottom',
      '---',
      'Left top,Center middle,Right bottom',
    ].join('\n'),
  },
  '.sheet value formatting': {
    source: '',
    documentSource: [
      '---',
      'sheet: stillpoint/v1',
      'presentation:',
      '  valueFormats:',
      '    - range: B1:B2',
      '      kind: number',
      '      decimalPlaces: 2',
      '    - range: B2',
      '      kind: number',
      '      decimalPlaces: 4',
      '    - range: C1:C2',
      '      kind: currency',
      '      currency: USD',
      '      decimalPlaces: 2',
      '    - range: C2',
      '      kind: currency',
      '      currency: CAD',
      '      decimalPlaces: 3',
      '    - range: D1:D2',
      '      kind: percent',
      '      decimalPlaces: 2',
      '    - range: E1:E2',
      '      kind: date',
      '    - range: F1:F2',
      '      kind: time',
      '    - range: G1:G2',
      '      kind: datetime',
      '    - range: H1:H2',
      '      kind: currency',
      '      currency: USD',
      '      decimalPlaces: 2',
      '---',
      'Automatic,Number,Currency,Percent,Date,Time,Date time,Invalid stays raw',
      '1234.5,1e-2,12.345,0.125,2026-08-10,14:05,2.625,0012',
    ].join('\n'),
  },
  '.sheet merged alignment': {
    source: '',
    documentSource: [
      '---',
      'sheet: stillpoint/v1',
      'presentation:',
      '  merges:',
      '    - range: A1:C2',
      '  formats:',
      '    - range: A1:C2',
      '      bold: true',
      '  alignments:',
      '    - range: A1:C2',
      '      horizontal: center',
      '      vertical: bottom',
      '---',
      'Merged heading,,',
      ',,',
      'One,Two,Three',
    ].join('\n'),
  },
  '.sheet ragged formatted slots': {
    source: '',
    documentSource: [
      '---',
      'sheet: stillpoint/v1',
      'presentation:',
      '  formats:',
      '    - range: A1:C1',
      '      italic: true',
      '  alignments:',
      '    - range: B1:C1',
      '      horizontal: right',
      '---',
      'Only stored A',
      'Wide,row,establishes bounds',
    ].join('\n'),
  },
  '.sheet malformed formatting': {
    source: '',
    documentSource:
      '---\nsheet: stillpoint/v1\npresentation:\n  formats:\n    - range: A1\n      bold: yes\n---\nMalformed',
  },
  '.sheet over-limit formatting': { source: '', documentSource: overLimitFormatDocument },
};

function applySheet(elements: HarnessElements, fixture: SheetFixture): void {
  const editor = elements.editor as SheetEditor | null;
  const preview = elements.preview as SheetPreview | null;
  const grid = elements.extras['sheet-grid'] as SheetGrid | undefined;
  grid?.setAttribute('header-row', '');

  if (fixture.documentSource !== undefined) {
    const parsed = parseSheetDocument(fixture.documentSource);
    const options = { presentation: fixture.documentOverride };
    if (parsed.ok) {
      preview?.setDocument(parsed.document, options);
      grid?.setDocument(parsed.document, options);
    } else {
      preview?.setContent('');
      grid?.setContent('');
    }
    editor?.setDocumentSource(fixture.documentSource, options);
    return;
  }
  const options = { presentation: fixture.presentation };
  preview?.setContent(fixture.source, options);
  grid?.setContent(fixture.source, options);
  editor?.setContent(fixture.source, options);
}

export default {
  elements: { editor: 'sheet-editor', preview: 'sheet-preview', extra: ['sheet-grid'] },
  // The preview is driven with the same presentation as the editor by each
  // fixture; a plain setContent mirror would drop it.
  mirror: false,
  fixtures: Object.fromEntries(
    Object.entries(sheetFixtures).map(([name, fixture]) => [
      name,
      {
        content: fixture.documentSource ?? fixture.source,
        apply: (elements: HarnessElements) => applySheet(elements, fixture),
      },
    ])
  ),
} satisfies HarnessFormat;
