import type MarkdownIt from 'markdown-it';

/**
 * Raw YAML-frontmatter block splitting — no YAML parsing, byte-exact. This is
 * the shared delimiter contract with the Context Manager app (its
 * `src/shared/utils/frontmatterBlock.ts` and server-side task frontmatter
 * services use the same pattern), so the two must not drift.
 *
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

const DELIMITER_LINE = /^---[ \t]*$/;

/**
 * How a leading frontmatter block appears in rendered output: 'hidden' omits
 * it entirely (reader-facing default); 'panel' renders a small metadata panel
 * above the body.
 */
export type FrontmatterRenderMode = 'hidden' | 'panel';

const KEY_VALUE_LINE = /^([A-Za-z0-9_$.-]+)[ \t]*:[ \t]*(.*)$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip matching double quotes from a display value (display-only sugar). */
function displayValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not a valid JSON string — show it as written.
    }
  }
  return value;
}

/**
 * Metadata-panel HTML for a block's inner YAML. A flat map (every non-empty
 * line a top-level `key: value` pair) renders as definition rows; anything
 * else — nested YAML, syntax errors — falls back to the raw text. Never
 * parses YAML, so it cannot fail on a malformed block. Output is
 * sanitizer-friendly: plain div/span/dl/dt/dd/pre with classes, all
 * YAML-derived strings escaped.
 */
export function renderFrontmatterPanel(yaml: string): string {
  const label = '<span class="md-frontmatter-panel-label">frontmatter</span>';
  const lines = yaml.split('\n').filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return `<div class="md-frontmatter-panel md-frontmatter-panel-empty">${label}</div>\n`;
  }

  const pairs: [string, string][] = [];
  for (const line of lines) {
    const match = KEY_VALUE_LINE.exec(line);
    if (!match) {
      const raw = escapeHtml(yaml.trim());
      return `<div class="md-frontmatter-panel md-frontmatter-panel-fallback">${label}<pre class="md-frontmatter-panel-raw">${raw}</pre></div>\n`;
    }
    pairs.push([match[1], displayValue(match[2])]);
  }

  const rows = pairs
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
  return `<div class="md-frontmatter-panel">${label}<dl class="md-frontmatter-panel-grid">${rows}</dl></div>\n`;
}

/**
 * markdown-it plugin: tokenize a leading frontmatter block as a single
 * `front_matter` leaf token so it never reaches the hr/setext-heading rules
 * (which would corrupt `---\ncolumn: briefed\n---` into `<hr>` +
 * `<h2>column: briefed</h2>`). Only a terminated block starting at line 0 of
 * the document qualifies — anything else is left to the normal rules, matching
 * FRONTMATTER_BLOCK_PATTERN.
 *
 * The default renderer emits nothing for the token (frontmatter is metadata,
 * not content); preview surfaces can install their own renderer rule.
 */
export function frontMatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before('table', 'front_matter', (state, startLine, endLine, silent) => {
    // Only the very top of the document, never inside blockquotes/lists.
    if (startLine !== 0 || state.blkIndent !== 0) return false;
    if (state.parentType !== 'root') return false;

    const line = (n: number): string => state.src.slice(state.bMarks[n], state.eMarks[n]);
    if (!DELIMITER_LINE.test(line(startLine))) return false;

    let closingLine = -1;
    for (let n = startLine + 1; n < endLine; n++) {
      if (state.tShift[n] <= 0 && DELIMITER_LINE.test(line(n))) {
        closingLine = n;
        break;
      }
    }
    // Unterminated block → not frontmatter (matches the regex contract).
    if (closingLine === -1) return false;

    if (silent) return true;

    const token = state.push('front_matter', '', 0);
    token.content =
      closingLine > startLine + 1
        ? state.src.slice(state.bMarks[startLine + 1], state.eMarks[closingLine - 1])
        : '';
    token.map = [startLine, closingLine + 1];
    token.markup = '---';
    token.hidden = false;

    state.line = closingLine + 1;
    return true;
  });

  md.renderer.rules.front_matter = () => '';
}
