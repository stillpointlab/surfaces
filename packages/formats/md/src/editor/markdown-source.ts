// A save keeps the text it did not change. The serializer writes Markdown its
// own way (one line per paragraph, `-` bullets, tight lists), so writing a whole
// document back rewrites every block, edited or not. Here the document remembers
// the text each top-level block was parsed from, and a block that is still the
// node it was parsed to is written back as that text, byte for byte. Only the
// blocks that changed go through the serializer.
//
// The unit is the top-level block: a paragraph, a heading, a whole list, a whole
// table. An edit inside a list rewrites that list, and nothing else.
//
// Two blocks that were not neighbours in the text can read differently once they
// are (two lists with a paragraph deleted between them join into one). So every
// place where the output puts text next to text it did not sit next to is parsed
// again and compared with the nodes it should give. If any differs, nothing is
// kept and the caller writes the document the old way.

import { lineBreakOf, withLineBreak } from '@stillpointlab/common-format';

import type { Token } from 'markdown-it';
import type { Node } from 'prosemirror-model';

/** One top-level block as it was written. */
interface SourceBlock {
  node: Node;
  /** The block's own lines, with the line break that ends them. */
  core: string;
  /** What follows, up to the next block: blank lines, and link reference definitions. */
  gap: string;
}

/** The text a body was parsed from, cut at its top-level blocks. */
export interface MarkdownSource {
  /** The line break the text uses. */
  eol: string;
  /** What comes before the first block. */
  preamble: string;
  blocks: readonly SourceBlock[];
  /** The whitespace the text ends with: its final newline, or none. */
  tail: string;
  /** Text between blocks that parsed to no node (link reference definitions), for parsing a part alone. */
  definitions: string;
}

/** What the serializer and the parser do for this module, so it knows neither. */
export interface SourceIo {
  /** The nodes written the serializer's way, with `\n` line breaks and no final newline. */
  write(nodes: readonly Node[]): string;
  /** A body's text as its top-level nodes. */
  read(text: string): readonly Node[];
}

/** The node each top-level token becomes, where this module knows; any other token is trusted. */
const TOKEN_NODE: Record<string, string> = {
  paragraph_open: 'paragraph',
  heading_open: 'heading',
  blockquote_open: 'blockquote',
  bullet_list_open: 'bullet_list',
  ordered_list_open: 'ordered_list',
  table_open: 'table',
  fence: 'code_block',
  code_block: 'code_block',
  hr: 'horizontal_rule',
};

/** The offset each line starts at. A line past the last starts at the text's end. */
function lineStarts(text: string): (line: number) => number {
  const starts = [0];
  const lineBreak = /\r\n|\r|\n/g;
  while (lineBreak.exec(text)) starts.push(lineBreak.lastIndex);
  return (line) => (line < starts.length ? starts[line] : text.length);
}

/**
 * The source of a body, from the tokens markdown-it made of `text` and the
 * top-level nodes they became. `null` when the two do not line up one to one,
 * and then nothing is kept: the document is written the serializer's way.
 */
export function buildSource(
  text: string,
  tokens: readonly Token[],
  nodes: readonly Node[]
): MarkdownSource | null {
  const tops = tokens.filter((token) => token.level === 0 && token.nesting >= 0 && token.map);
  if (tops.length === 0 || tops.length !== nodes.length) return null;

  const at = lineStarts(text);
  const blocks: SourceBlock[] = [];
  let definitions = '';
  let previousEnd = 0;
  for (let i = 0; i < tops.length; i++) {
    const token = tops[i];
    const expected = TOKEN_NODE[token.type];
    if (expected !== undefined && expected !== nodes[i].type.name) return null;
    const [start, end] = token.map!;
    const next = i + 1 < tops.length ? tops[i + 1].map![0] : Infinity;
    if (start < previousEnd || end < start || end > next) return null;
    previousEnd = end;
    const gap = text.slice(at(end), at(next));
    if (/\S/.test(gap)) definitions += gap;
    blocks.push({ node: nodes[i], core: text.slice(at(start), at(end)), gap });
  }
  const preamble = text.slice(0, at(tops[0].map![0]));
  if (/\S/.test(preamble)) definitions = preamble + definitions;

  return {
    eol: lineBreakOf(text),
    preamble,
    blocks,
    tail: text.slice(text.trimEnd().length),
    definitions,
  };
}

const same = (a: Node, b: Node): boolean => a === b || a.eq(b);

/** Past this many cells the middle is not compared block by block: it is all written anew. */
const ALIGN_LIMIT = 250_000;

/**
 * Which of `before` are still in `after`, as index pairs in order: the equal
 * blocks at each end, and the longest run of equal blocks between them. An
 * untouched block is the same object in both, so the ends cost one comparison a
 * block.
 */
export function alignBlocks(before: readonly Node[], after: readonly Node[]): [number, number][] {
  const pairs: [number, number][] = [];
  let head = 0;
  while (head < before.length && head < after.length && same(before[head], after[head])) {
    pairs.push([head, head]);
    head++;
  }
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    same(before[before.length - 1 - tail], after[after.length - 1 - tail])
  ) {
    tail++;
  }

  const rows = before.length - head - tail;
  const columns = after.length - head - tail;
  if (rows > 0 && columns > 0 && rows * columns <= ALIGN_LIMIT) {
    // The longest common run, by the usual table: `length[r][c]` is the longest
    // from row r and column c onward.
    const width = columns + 1;
    const length = new Uint32Array((rows + 1) * width);
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = columns - 1; c >= 0; c--) {
        length[r * width + c] = same(before[head + r], after[head + c])
          ? length[(r + 1) * width + c + 1] + 1
          : Math.max(length[(r + 1) * width + c], length[r * width + c + 1]);
      }
    }
    let r = 0;
    let c = 0;
    while (r < rows && c < columns) {
      if (same(before[head + r], after[head + c])) {
        pairs.push([head + r, head + c]);
        r++;
        c++;
      } else if (length[(r + 1) * width + c] >= length[r * width + c + 1]) {
        r++;
      } else {
        c++;
      }
    }
  }

  for (let i = tail; i > 0; i--) pairs.push([before.length - i, after.length - i]);
  return pairs;
}

/** One stretch of the output, and the nodes it has to read back as. */
interface Piece {
  /** The index of the block kept, or -1 for text written anew or carried along. */
  kept: number;
  nodes: readonly Node[];
  start: number;
  end: number;
  /** Whether it follows the piece before it as it did in the text it came from. */
  joined: boolean;
}

/** The blank lines a stretch of text starts with. */
const LEADING_BLANK_LINES = /^(?:[ \t]*(?:\r\n|\r|\n))+/;

/** How many line breaks end `text`, counting a blank line's spaces as nothing: 0, 1, or 2 for more. */
function breaksAtEnd(text: string): number {
  const end = withLineBreak(text.slice(-256), '\n');
  return /\n[ \t]*\n[ \t]*$/.test(end) ? 2 : /\n[ \t]*$/.test(end) ? 1 : 0;
}

/**
 * `nodes` as Markdown, with every block that is still in `source` written as the
 * text it came from. `null` when the kept text would not read back as these
 * nodes; the caller then writes the document whole.
 */
export function writeKeepingSource(
  nodes: readonly Node[],
  source: MarkdownSource,
  io: SourceIo
): string | null {
  const { blocks, eol } = source;
  const pairs = alignBlocks(
    blocks.map((block) => block.node),
    nodes
  );

  let out = source.preamble;
  const pieces: Piece[] = [];
  /** End the output with a blank line, so the next piece starts a block of its own. */
  const separate = (): void => {
    if (out === '') return;
    for (let breaks = breaksAtEnd(out); breaks < 2; breaks++) out += eol;
  };
  const add = (text: string, kept: number, read: readonly Node[]): void => {
    const last = pieces[pieces.length - 1];
    const joined = kept >= 0 && (last ? last.kept === kept - 1 && last.kept >= 0 : kept === 0);
    if (!joined) separate();
    const start = out.length;
    out += text;
    pieces.push({ kept, nodes: read, start, end: out.length, joined });
  };

  let block = 0;
  let node = 0;
  for (const [keptBlock, keptNode] of [...pairs, [blocks.length, nodes.length]]) {
    // What changed or arrived since the last kept block, written anew.
    if (keptNode > node) {
      const written = withLineBreak(io.write(nodes.slice(node, keptNode)), eol);
      if (written !== '') add(written, -1, io.read(written));
    }
    // A block that went takes its lines with it, but not a definition that
    // followed it: a link elsewhere may still point there.
    for (; block < keptBlock; block++) {
      const gap = blocks[block].gap.replace(LEADING_BLANK_LINES, '');
      if (/\S/.test(gap)) add(gap, -1, []);
    }
    if (keptBlock < blocks.length) {
      add(blocks[keptBlock].core + blocks[keptBlock].gap, keptBlock, [blocks[keptBlock].node]);
    }
    block = keptBlock + 1;
    node = keptNode + 1;
  }

  // Every stretch of pieces that did not sit together before is read again.
  for (let first = 0; first < pieces.length;) {
    let last = first;
    while (last + 1 < pieces.length && !pieces[last + 1].joined) last++;
    if (last > first) {
      const expected = pieces.slice(first, last + 1).flatMap((piece) => piece.nodes);
      const text = out.slice(pieces[first].start, pieces[last].end);
      const read = io.read(`${text}${eol}${eol}${source.definitions}`);
      if (read.length !== expected.length) return null;
      for (let i = 0; i < read.length; i++) if (!same(read[i], expected[i])) return null;
    }
    last++;
    first = last;
  }

  // The text ends as it did: with its final newline, or without.
  const final = pieces[pieces.length - 1];
  if (final && final.kept === blocks.length - 1) return out;
  const trimmed = out.trimEnd();
  return trimmed === '' ? '' : trimmed + source.tail;
}

/** The document written whole, with the line breaks and the ending the text had. */
export function writeWhole(written: string, source: MarkdownSource): string {
  const trimmed = withLineBreak(written, source.eol).trimEnd();
  return trimmed === '' ? '' : trimmed + source.tail;
}
