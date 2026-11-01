import type { ParsedXmdlDocument, XmdlBindingValue, XmdlBindings } from '../parser/types';

const TEMPLATE_TOKEN_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export function renderXmdl(document: ParsedXmdlDocument, bindings: XmdlBindings = {}): string {
  return renderSection(document.body, document, bindings);
}

function renderSection(body: string, document: ParsedXmdlDocument, bindings: XmdlBindings): string {
  let output = '';
  let cursor = 0;

  for (const match of body.matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const token = match[0];
    const expression = match[1].trim();
    const start = match.index ?? 0;
    const end = start + token.length;

    // A recursive conditional render advances past its closing token. matchAll still
    // yields the tokens inside that consumed range, so ignore them in this frame.
    if (start < cursor) continue;

    if (expression.startsWith('#if ')) {
      const name = expression.slice(4).trim();
      const close = findMatchingClose(body, end);
      if (!close) {
        output += body.slice(cursor);
        cursor = body.length;
        break;
      }

      output += body.slice(cursor, start);
      if (isTruthyBinding(bindings[name])) {
        output += renderSection(body.slice(end, close.start), document, bindings);
      }
      cursor = close.end;
      continue;
    }

    if (expression === '/if') {
      output += body.slice(cursor, start);
      cursor = end;
      continue;
    }

    output += body.slice(cursor, start);
    output += formatBinding(bindings[expression], document.outputFileType);
    cursor = end;
  }

  output += body.slice(cursor);
  return output;
}

function findMatchingClose(body: string, startAt: number): { start: number; end: number } | null {
  TEMPLATE_TOKEN_PATTERN.lastIndex = 0;
  let depth = 1;

  for (const match of body.slice(startAt).matchAll(TEMPLATE_TOKEN_PATTERN)) {
    const expression = match[1].trim();
    const start = startAt + (match.index ?? 0);
    const end = start + match[0].length;

    if (expression.startsWith('#if ')) depth += 1;
    else if (expression === '/if') {
      depth -= 1;
      if (depth === 0) return { start, end };
    }
  }

  return null;
}

function formatBinding(
  value: XmdlBindingValue,
  outputFileType: ParsedXmdlDocument['outputFileType'],
): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (outputFileType === 'xml') return escapeXml(text);
  return text;
}

function isTruthyBinding(value: XmdlBindingValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
