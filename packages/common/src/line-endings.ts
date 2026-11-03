// Text surfaces return the text with the line endings it was given. CodeMirror
// joins lines with "\n" and a textarea's `value` always reports "\n", so a surface
// records the first line break of the text it was set and writes edited text
// back with it. Text with mixed line endings comes back with the first one
// throughout once it has been edited; unedited text is returned as set.

/** The text's first line break (`\r\n`, `\n` or `\r`), or `\n` when it has none. */
export function lineBreakOf(text: string): string {
  return /\r\n|\r|\n/.exec(text)?.[0] ?? '\n';
}

/** `text` with every line break (`\r\n`, `\n` or `\r`) written as `lineBreak`. */
export function withLineBreak(text: string, lineBreak: string): string {
  return text.replace(/\r\n|\r|\n/g, lineBreak);
}
