import { getMarkdownIt, type MarkdownIt } from './core';

interface SourceBlockRange {
  start: number;
  end: number;
}

export interface MarkdownSourceSelectionOptions {
  selection: Selection;
  root: HTMLElement;
  source: string;
  markdownIt?: MarkdownIt;
}

const SOURCE_START_ATTR = 'data-md-source-start';
const SOURCE_END_ATTR = 'data-md-source-end';

function lineStartOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function sourceBlockRanges(source: string, md: MarkdownIt): SourceBlockRange[] {
  const starts = lineStartOffsets(source);
  const tokens = md.parse(source, {});
  const ranges: SourceBlockRange[] = [];

  for (const token of tokens) {
    if (!token.map) continue;
    const isTopLevelOpen = token.level === 0 && token.nesting === 1;
    const isTopLevelLeaf = token.level === 0 && token.nesting === 0 && token.type !== 'inline';
    if (!isTopLevelOpen && !isTopLevelLeaf) continue;

    const [startLine, endLine] = token.map;
    ranges.push({
      start: starts[startLine] ?? 0,
      end: starts[endLine] ?? source.length,
    });
  }

  return ranges;
}

function renderedBlocks(root: HTMLElement): HTMLElement[] {
  const contentRoot = root.matches('.ProseMirror')
    ? root
    : ((root.querySelector('.ProseMirror') as HTMLElement | null) ?? root);

  return Array.from(contentRoot.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== 'STYLE'
  );
}

function annotateSourceBlocks(root: HTMLElement, source: string, md: MarkdownIt): void {
  const ranges = sourceBlockRanges(source, md);
  const blocks = renderedBlocks(root);
  const count = Math.min(ranges.length, blocks.length);

  for (const block of blocks) {
    block.removeAttribute(SOURCE_START_ATTR);
    block.removeAttribute(SOURCE_END_ATTR);
  }

  for (let i = 0; i < count; i++) {
    blocks[i].setAttribute(SOURCE_START_ATTR, String(ranges[i].start));
    blocks[i].setAttribute(SOURCE_END_ATTR, String(ranges[i].end));
  }
}

function asElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function closestMappedBlock(node: Node | null, root: HTMLElement): HTMLElement | null {
  let current = asElement(node);
  while (current) {
    if (
      current instanceof HTMLElement &&
      current.hasAttribute(SOURCE_START_ATTR) &&
      current.hasAttribute(SOURCE_END_ATTR)
    ) {
      return current;
    }
    if (current === root) return null;
    current = current.parentElement;
  }
  return null;
}

function rangeIntersects(range: Range, element: HTMLElement): boolean {
  try {
    return range.intersectsNode(element);
  } catch {
    return false;
  }
}

function selectionIntersectsRoot(selection: Selection, root: HTMLElement): boolean {
  for (let i = 0; i < selection.rangeCount; i++) {
    if (rangeIntersects(selection.getRangeAt(i), root)) return true;
  }
  return false;
}

function mappedBlocksInSelection(selection: Selection, root: HTMLElement): HTMLElement[] {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(`[${SOURCE_START_ATTR}]`));
  const selected: HTMLElement[] = [];

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    for (const block of blocks) {
      if (rangeIntersects(range, block) && !selected.includes(block)) {
        selected.push(block);
      }
    }
  }

  return selected;
}

function offset(block: HTMLElement, attr: string): number | null {
  const value = Number.parseInt(block.getAttribute(attr) ?? '', 10);
  return Number.isNaN(value) ? null : value;
}

function boundaryTextOffset(block: HTMLElement, node: Node, boundaryOffset: number): number | null {
  if (!block.contains(node)) return null;

  const range = block.ownerDocument.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, boundaryOffset);
  return range.toString().length;
}

function sourceOffsetsForRenderedTextRange(
  block: HTMLElement,
  source: string,
  renderedStart: number,
  renderedEnd: number
): SourceBlockRange | null {
  const sourceStart = offset(block, SOURCE_START_ATTR);
  const sourceEnd = offset(block, SOURCE_END_ATTR);
  if (sourceStart === null || sourceEnd === null) return null;

  const rendered = block.textContent ?? '';
  const raw = source.slice(sourceStart, sourceEnd).trimEnd();
  const rawEnd = sourceStart + raw.length;
  if (renderedStart <= 0 && renderedEnd >= rendered.length) {
    return { start: sourceStart, end: rawEnd };
  }
  if (renderedStart >= renderedEnd) return null;

  const renderedToSourceRanges: SourceBlockRange[] = [];
  let renderedIndex = 0;

  for (
    let sourceIndex = 0;
    sourceIndex < raw.length && renderedIndex < rendered.length;
    sourceIndex++
  ) {
    const renderedChar = rendered[renderedIndex];
    const sourceChar = raw[sourceIndex];

    if (sourceChar === renderedChar) {
      renderedToSourceRanges[renderedIndex] = {
        start: sourceStart + sourceIndex,
        end: sourceStart + sourceIndex + 1,
      };
      renderedIndex++;
      continue;
    }

    while (renderedIndex < rendered.length && /\s/.test(rendered[renderedIndex])) {
      renderedToSourceRanges[renderedIndex] = {
        start: sourceStart + sourceIndex,
        end: sourceStart + sourceIndex,
      };
      renderedIndex++;
    }
  }

  while (renderedIndex < rendered.length && /\s/.test(rendered[renderedIndex])) {
    renderedToSourceRanges[renderedIndex] = { start: rawEnd, end: rawEnd };
    renderedIndex++;
  }

  const sourceOffsetForRenderedBoundary = (renderedOffset: number): number | null => {
    if (renderedOffset <= 0) return sourceStart;
    if (renderedOffset >= rendered.length) return rawEnd;

    return renderedToSourceRanges[renderedOffset]?.start ?? null;
  };

  const sourceOffsetAfterRenderedCharacter = (renderedOffset: number): number | null => {
    if (renderedOffset <= 0) return sourceStart;
    if (renderedOffset >= rendered.length) return rawEnd;

    return renderedToSourceRanges[renderedOffset - 1]?.end ?? null;
  };

  const start = sourceOffsetForRenderedBoundary(renderedStart);
  const end =
    renderedEnd >= rendered.length ? rawEnd : sourceOffsetAfterRenderedCharacter(renderedEnd);
  if (start === null || end === null) return null;

  return { start, end };
}

function sourceSliceForRenderedTextRange(
  block: HTMLElement,
  source: string,
  renderedStart: number,
  renderedEnd: number
): string | null {
  const range = sourceOffsetsForRenderedTextRange(block, source, renderedStart, renderedEnd);
  return range ? source.slice(range.start, range.end) : null;
}

export function selectedMarkdownSource({
  selection,
  root,
  source,
  markdownIt = getMarkdownIt(),
}: MarkdownSourceSelectionOptions): string | null {
  if (selection.isCollapsed || !selectionIntersectsRoot(selection, root)) return null;

  annotateSourceBlocks(root, source, markdownIt);

  const blocks = mappedBlocksInSelection(selection, root);
  if (blocks.length === 0) return null;

  if (blocks.length === 1 && selection.rangeCount === 1) {
    const range = selection.getRangeAt(0);
    const block = blocks[0];
    const renderedStart = boundaryTextOffset(block, range.startContainer, range.startOffset);
    const renderedEnd = boundaryTextOffset(block, range.endContainer, range.endOffset);
    if (renderedStart !== null && renderedEnd !== null) {
      const sourceSlice = sourceSliceForRenderedTextRange(
        block,
        source,
        renderedStart,
        renderedEnd
      );
      if (sourceSlice !== null) return sourceSlice;
    }
  }

  if (selection.rangeCount === 1) {
    const range = selection.getRangeAt(0);
    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    const firstBlockStart =
      firstBlock === closestMappedBlock(range.startContainer, root)
        ? boundaryTextOffset(firstBlock, range.startContainer, range.startOffset)
        : 0;
    const lastBlockEnd =
      lastBlock === closestMappedBlock(range.endContainer, root)
        ? boundaryTextOffset(lastBlock, range.endContainer, range.endOffset)
        : (lastBlock.textContent?.length ?? 0);

    if (firstBlockStart !== null && lastBlockEnd !== null) {
      const firstBounds = sourceOffsetsForRenderedTextRange(
        firstBlock,
        source,
        firstBlockStart,
        firstBlock.textContent?.length ?? firstBlockStart
      );
      const lastBounds = sourceOffsetsForRenderedTextRange(lastBlock, source, 0, lastBlockEnd);

      if (firstBounds && lastBounds && firstBounds.start < lastBounds.end) {
        return source.slice(firstBounds.start, lastBounds.end).trimEnd();
      }
    }
  }

  const starts = blocks.map((block) => offset(block, SOURCE_START_ATTR)).filter((v) => v !== null);
  const ends = blocks.map((block) => offset(block, SOURCE_END_ATTR)).filter((v) => v !== null);
  if (starts.length === 0 || ends.length === 0) return null;

  const start = Math.min(...starts);
  const end = Math.max(...ends);
  return source.slice(start, end).trimEnd();
}
