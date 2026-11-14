// The descriptor suite over the `./format` entry alone, so the suite sees the tags
// as importing it left them: one sample for each setter `apply` chooses.
import { describeFormatDescriptor } from '@stillpointlab/common-format/testing';
import { describe, expect, it } from 'vitest';

import { sheetFormat } from './format';

const csv = 'Name,Value\nCoffee,12\n';
const document = [
  '---',
  'sheet: stillpoint/v1',
  'presentation:',
  '  merges:',
  '    - range: A1:B1',
  '---',
  'Heading,',
  'One,Two',
].join('\n');

describeFormatDescriptor(sheetFormat, [
  { path: 'data/table.csv', text: csv },
  { path: 'reports/Summary.SHEET', text: document },
]);

describe('sheetFormat.apply', () => {
  const stand = () => {
    const calls: string[] = [];
    const element = Object.assign(globalThis.document.createElement('div'), {
      setContent: (text: string) => calls.push(`content:${text}`),
      setDocumentSource: (text: string) => calls.push(`document:${text}`),
    });
    return { element, calls };
  };

  it('hands a .sheet file to setDocumentSource', () => {
    const { element, calls } = stand();
    sheetFormat.apply(element, { path: 'a/b.sheet', text: document });
    expect(calls).toEqual([`document:${document}`]);
  });

  it('hands anything else to setContent', () => {
    const { element, calls } = stand();
    sheetFormat.apply(element, { path: 'a/b.csv', text: csv });
    expect(calls).toEqual([`content:${csv}`]);
  });
});
