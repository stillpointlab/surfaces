import { afterEach, describe, expect, it } from 'vitest';

import { selectedMarkdownSource } from './source-selection';

const selectNodeContents = (node: Node): Selection => {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection();
  if (!selection) throw new Error('Selection unavailable');
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
};

afterEach(() => {
  document.body.innerHTML = '';
  document.getSelection()?.removeAllRanges();
});

describe('selectedMarkdownSource', () => {
  it('returns the source block for a selected rendered heading', () => {
    const source = '# Title\n\nParagraph **bold** text';
    document.body.innerHTML =
      '<div id="root"><h1>Title</h1><p>Paragraph <strong>bold</strong> text</p></div>';
    const root = document.getElementById('root')!;
    const selection = selectNodeContents(root.querySelector('h1')!);

    expect(selectedMarkdownSource({ selection, root, source })).toBe('# Title');
  });

  it('returns the selected contiguous source range across rendered blocks', () => {
    const source = '# Title\n\nParagraph **bold** text\n\n- One';
    document.body.innerHTML =
      '<div id="root"><h1>Title</h1><p>Paragraph <strong>bold</strong> text</p><ul><li>One</li></ul></div>';
    const root = document.getElementById('root')!;
    const range = document.createRange();
    range.setStartBefore(root.querySelector('h1')!);
    range.setEndAfter(root.querySelector('p')!);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedMarkdownSource({ selection, root, source })).toBe(
      '# Title\n\nParagraph **bold** text'
    );
  });

  it('clips a multi-block selection that starts midway through the first block', () => {
    const source = 'First paragraph text\n\nSecond paragraph text';
    document.body.innerHTML =
      '<div id="root"><p>First paragraph text</p><p>Second paragraph text</p></div>';
    const root = document.getElementById('root')!;
    const firstText = root.querySelector('p')!.firstChild!;
    const secondParagraph = root.querySelectorAll('p')[1];
    const range = document.createRange();
    range.setStart(firstText, 'First '.length);
    range.setEndAfter(secondParagraph);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedMarkdownSource({ selection, root, source })).toBe(
      'paragraph text\n\nSecond paragraph text'
    );
  });

  it('clips a multi-block selection that ends midway through the last block', () => {
    const source = 'First paragraph text\n\nSecond paragraph text';
    document.body.innerHTML =
      '<div id="root"><p>First paragraph text</p><p>Second paragraph text</p></div>';
    const root = document.getElementById('root')!;
    const firstParagraph = root.querySelector('p')!;
    const secondText = root.querySelectorAll('p')[1].firstChild!;
    const range = document.createRange();
    range.setStartBefore(firstParagraph);
    range.setEnd(secondText, 'Second'.length);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedMarkdownSource({ selection, root, source })).toBe(
      'First paragraph text\n\nSecond'
    );
  });

  it('clips a pretty-rendered list selection to the visible text boundaries', () => {
    const source =
      '* Core Principles\n  * Structural overview of the framework\n  * Governing principle\n* Core Definitions\n  * Glossary of terms\n  * Expanded definitions';
    document.body.innerHTML = `
      <div id="root">
        <ul>
          <li>Core Principles</li>
          <li>Structural overview of the framework</li>
          <li>Governing principle</li>
          <li>Core Definitions</li>
          <li>Glossary of terms</li>
          <li>Expanded definitions</li>
        </ul>
      </div>
    `;
    const root = document.getElementById('root')!;
    const list = root.querySelector('ul')!;
    const firstText = list.querySelector('li')!.firstChild!;
    const lastText = list.querySelectorAll('li')[5].firstChild!;
    const range = document.createRange();
    range.setStart(firstText, 'Core Pri'.length);
    range.setEnd(lastText, 'Expanded definitio'.length);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedMarkdownSource({ selection, root, source })).toBe(
      'nciples\n  * Structural overview of the framework\n  * Governing principle\n* Core Definitions\n  * Glossary of terms\n  * Expanded definitio'
    );
  });

  it('returns only the selected source range within a rendered block', () => {
    const source = 'Paragraph **bold** text';
    document.body.innerHTML = '<div id="root"><p>Paragraph <strong>bold</strong> text</p></div>';
    const root = document.getElementById('root')!;
    const boldText = root.querySelector('strong')!.firstChild!;
    const range = document.createRange();
    range.setStart(boldText, 0);
    range.setEnd(boldText, 4);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectedMarkdownSource({ selection, root, source })).toBe('bold');
  });
});
