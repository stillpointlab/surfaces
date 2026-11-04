// Raw YAML-frontmatter block splitting, shared by md and the tasks app: no YAML
// parsing, byte-exact, DOM-free. Both read the same delimiters, so the pattern
// lives once, here.

/**
 * Opening `---` line at byte 0, lazy content, then the first line that is
 * exactly `---` (trailing spaces tolerated, then newline or EOF). The content
 * group is optional so an empty block (`---\n---\n`) matches.
 */
export const FRONTMATTER_BLOCK_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Split a document into its raw frontmatter block (delimiters included, ''
 * when absent) and the body. `raw + body` is always byte-identical to the
 * input — the guarantee byte-stable round-trips are built on.
 */
export function splitFrontmatterBlock(md: string): { raw: string; body: string } {
  const match = FRONTMATTER_BLOCK_PATTERN.exec(md);
  if (!match) return { raw: '', body: md };
  return { raw: match[0], body: md.slice(match[0].length) };
}
