// What the serializer writes for a list and for a paragraph's line breaks, where
// a formatter (Prettier) would otherwise change the file: a blank line after an
// item that has one inside it, and no line of spaces alone.
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';

import { getMarkdownParser, getMarkdownSerializer } from './prosemirror-markdown';
import { getSchema } from './prosemirror-schema';

import type { Node } from 'prosemirror-model';

const parser = getMarkdownParser();
const serializer = getMarkdownSerializer();
const schema = getSchema();

/** `text` with `find` replaced by `replace` as typing does it, written back with its source. */
function typed(text: string, find: string, replace: string): string {
  const { doc, source } = parser.parseWithSource(text);
  let at = -1;
  doc.descendants((node, pos) => {
    if (at === -1 && node.isText && node.text!.includes(find)) at = pos + node.text!.indexOf(find);
  });
  expect(at).not.toBe(-1);
  const state = EditorState.create({ doc, schema });
  return serializer.serialize(
    state.apply(state.tr.insertText(replace, at, at + find.length)).doc,
    source
  );
}

/** A document of these blocks, written whole. */
const written = (...blocks: Node[]): string =>
  serializer.serialize(schema.nodes.doc.create(null, blocks));
const { nodes } = schema;
const paragraph = (text?: string): Node =>
  nodes.paragraph.create(null, text === undefined ? [] : schema.text(text));
const item = (...blocks: Node[]): Node => nodes.list_item.create(null, blocks);
const bullets = (...items: Node[]): Node => nodes.bullet_list.create(null, items);

describe('a list an edit rewrites', () => {
  const CARD = [
    '- [ ] Build it.',
    '- [ ] A scratch repository:',
    '',
    '  ```sh',
    '  git init -q',
    '  ```',
    '',
    '- [ ] Open the address.',
    '',
  ].join('\n');

  it('keeps the blank line after an item that ends in a code block', () => {
    expect(typed(CARD, '[ ] Build', '[x] Build')).toBe(CARD.replace('[ ] Build', '[x] Build'));
  });

  it('reads back as the same blocks', () => {
    const after = typed(CARD, '[ ] Build', '[x] Build');
    expect(parser.parse(after).toJSON()).toEqual(
      parser.parse(CARD.replace('[ ] Build', '[x] Build')).toJSON()
    );
  });

  it('puts a blank line after an item with a second paragraph, a quote or a code block', () => {
    expect(
      written(bullets(item(paragraph('one'), paragraph('more')), item(paragraph('two'))))
    ).toBe('- one\n\n  more\n\n- two');
    expect(
      written(
        bullets(
          item(paragraph('one'), nodes.blockquote.create(null, paragraph('said'))),
          item(paragraph('two'))
        )
      )
    ).toBe('- one\n\n  > said\n\n- two');
    expect(
      written(
        nodes.ordered_list.create(null, [
          item(paragraph('one'), nodes.code_block.create(null, schema.text('code'))),
          item(paragraph('two')),
        ])
      )
    ).toBe('1. one\n\n   ```\n   code\n   ```\n\n2. two');
  });

  it('writes the other items of that list as close as before', () => {
    expect(
      written(
        bullets(
          item(paragraph('a')),
          item(paragraph('b'), paragraph('more')),
          item(paragraph('c')),
          item(paragraph('d'))
        )
      )
    ).toBe('- a\n- b\n\n  more\n\n- c\n- d');
  });

  it('leaves a list tight whose items hold a list under their text, or an empty paragraph', () => {
    expect(
      written(
        bullets(item(paragraph('one'), bullets(item(paragraph('under')))), item(paragraph('two')))
      )
    ).toBe('- one\n  - under\n- two');
    expect(written(bullets(item(paragraph('one'), paragraph()), item(paragraph('two'))))).toBe(
      '- one\n- two'
    );
  });

  it('does the same in a list under an item', () => {
    expect(
      written(
        bullets(
          item(
            paragraph('top'),
            bullets(item(paragraph('one'), paragraph('more')), item(paragraph('two')))
          ),
          item(paragraph('next'))
        )
      )
    ).toBe('- top\n  - one\n\n    more\n\n  - two\n- next');
  });
});

describe('a line break in a paragraph’s text', () => {
  // Pasted text may hold a line break; the serializer starts each line of a
  // text with its block's indent, and a line of that indent alone is a line of
  // spaces.
  const lines = (text: string): string[] => text.split('\n');

  it('at the end of a list item’s text leaves no line of spaces', () => {
    const out = written(
      bullets(item(paragraph('one')), item(paragraph('two\n'))),
      paragraph('after')
    );
    expect(out).toBe('- one\n- two\n\nafter');
    expect(lines(out).filter((line) => line !== '' && line.trim() === '')).toEqual([]);
  });

  it('twice in a row inside an item is a blank line, not a line of spaces', () => {
    expect(written(bullets(item(paragraph('one\n\nmore'))))).toBe('- one\n\n  more');
  });

  it('in a quote keeps the quote’s mark and drops the space after it', () => {
    expect(written(nodes.blockquote.create(null, paragraph('one\n\nmore\n')))).toBe(
      '> one\n>\n> more'
    );
  });

  it('inside the text is written as it was', () => {
    expect(written(paragraph('one\ntwo'))).toBe('one\ntwo');
    expect(written(bullets(item(paragraph('one\ntwo'))))).toBe('- one\n  two');
  });

  it('leaves a code block’s lines of spaces alone', () => {
    expect(
      written(
        bullets(item(paragraph('one'), nodes.code_block.create(null, schema.text('a\n  \nb'))))
      )
    ).toBe('- one\n\n  ```\n  a\n    \n  b\n  ```');
  });
});
