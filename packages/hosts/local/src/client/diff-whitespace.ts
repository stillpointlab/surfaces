// Whitespace in the Changes view: the three ways `<code-diff>` treats it, and
// what the page says when the two sides differ in ways the view does not mark.
//
// `<code-diff>` reads each side into an editor, which keeps lines and not their
// endings, so a file that is CRLF where the last commit is LF shows no line as
// changed for that alone. Git may still count every line (it does unless the
// repository converts endings), so the page says the endings differ. No DOM.

import { words } from './words';

/** `compare` marks whitespace as any other change, `ignore` passes over it, `show` draws it. */
export type DiffWhitespace = 'compare' | 'ignore' | 'show';

export const DIFF_WHITESPACE: readonly DiffWhitespace[] = ['compare', 'ignore', 'show'];

/** The `<code-diff>` attributes for a mode. */
export function whitespaceAttributes(mode: DiffWhitespace): Record<string, string> {
  return {
    'ignore-whitespace': String(mode === 'ignore'),
    'show-whitespace': String(mode === 'show'),
  };
}

/** A text's line endings: `CRLF`, `LF`, both (`mixed`), or `null` for a text of one line. */
export function lineEndings(text: string): 'CRLF' | 'LF' | 'mixed' | null {
  const crlf = text.includes('\r\n');
  const lf = /(^|[^\r])\n/.test(text);
  return crlf && lf ? 'mixed' : crlf ? 'CRLF' : lf ? 'LF' : null;
}

const oneEnding = (text: string): string => text.replace(/\r\n?/g, '\n');
/** As `<code-diff>`'s "ignore whitespace" compares: no whitespace within a line. */
const noWhitespace = (text: string): string => text.replace(/[ \t\r\f\v]/g, '');

/**
 * What to say above the Changes view about whitespace, or `null`: the two sides
 * differ in line endings alone or in whitespace alone, or their endings differ
 * beside other changes. `head` is the last commit's text, `file` the file's.
 */
export function whitespaceNote(head: string, file: string): string | null {
  if (head === file) return null;
  const [was, now] = [lineEndings(head), lineEndings(file)];
  const endings = was !== null && now !== null && was !== now ? { was, now } : null;
  if (oneEnding(head) === oneEnding(file)) {
    return endings ? words.diff.endingsOnly(endings.now, endings.was) : null;
  }
  if (noWhitespace(head) === noWhitespace(file)) {
    return endings
      ? `${words.diff.whitespaceOnly} ${words.diff.endingsToo(endings.now, endings.was)}`
      : words.diff.whitespaceOnly;
  }
  return endings ? words.diff.endingsToo(endings.now, endings.was) : null;
}
