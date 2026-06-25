import { describe, expect, it } from 'vitest';

import { buildTableNode } from './prosemirror-editor';
import { getSchema } from './prosemirror-schema';

const schema = getSchema();

describe('buildTableNode', () => {
  it('builds a table with the requested number of rows and columns', () => {
    const table = buildTableNode(schema, 4, 3);

    expect(table.type.name).toBe('table');
    expect(table.childCount).toBe(4); // rows

    table.forEach((row) => {
      expect(row.type.name).toBe('table_row');
      expect(row.childCount).toBe(3); // cells per row
    });
  });

  it('uses header cells for the first row and regular cells elsewhere', () => {
    const table = buildTableNode(schema, 3, 2);

    const firstRow = table.child(0);
    firstRow.forEach((cell) => expect(cell.type.name).toBe('table_header'));

    for (let i = 1; i < table.childCount; i++) {
      table.child(i).forEach((cell) => expect(cell.type.name).toBe('table_cell'));
    }
  });

  it('fills each cell with an empty paragraph', () => {
    const table = buildTableNode(schema, 2, 2);
    table.forEach((row) =>
      row.forEach((cell) => {
        expect(cell.childCount).toBe(1);
        expect(cell.child(0).type.name).toBe('paragraph');
      })
    );
  });
});
