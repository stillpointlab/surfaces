import MarkdownIt from 'markdown-it';

import {
  FRONTMATTER_BLOCK_PATTERN,
  frontMatterPlugin,
  renderFrontmatterPanel,
  splitFrontmatterBlock,
} from './frontmatter';

import type { FrontmatterRenderMode } from './frontmatter';

export type MarkdownItPlugin = (md: MarkdownIt) => void;

export interface CreateMarkdownItOptions {
  /** Extra markdown-it plugins to apply (e.g. a host-specific citation plugin). */
  plugins?: MarkdownItPlugin[];
}

/**
 * Create a markdown-it instance configured for this editor: CommonMark + GFM
 * strikethrough + tables, with linkify/typographer/breaks. Citation or other
 * host-specific syntax is added via `options.plugins`.
 */
export function createMarkdownIt(options: CreateMarkdownItOptions = {}): MarkdownIt {
  const md = MarkdownIt('commonmark', {
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
  });

  md.enable('strikethrough');
  md.enable('table');
  md.use(frontMatterPlugin);

  for (const plugin of options.plugins ?? []) {
    md.use(plugin);
  }

  return md;
}

let sharedMarkdownIt: MarkdownIt | null = null;

/** Memoized default markdown-it instance (no extra plugins). */
export function getMarkdownIt(): MarkdownIt {
  if (!sharedMarkdownIt) {
    sharedMarkdownIt = createMarkdownIt();
  }
  return sharedMarkdownIt;
}

export interface RenderMarkdownOptions {
  /** markdown-it instance to render with (defaults to the shared instance). */
  md?: MarkdownIt;
  /**
   * Treatment of a leading frontmatter block: 'hidden' (default) omits it
   * from the output; 'panel' renders a metadata panel above the body.
   */
  frontmatter?: FrontmatterRenderMode;
}

function isMarkdownIt(value: unknown): value is MarkdownIt {
  return typeof (value as MarkdownIt | undefined)?.render === 'function';
}

/**
 * Render markdown to an HTML string. Output is NOT sanitized - callers must
 * sanitize before inserting into the DOM.
 *
 * The second argument accepts either a markdown-it instance (legacy
 * positional form) or an options object.
 */
export async function renderMarkdown(
  text: string,
  mdOrOptions: MarkdownIt | RenderMarkdownOptions = {}
): Promise<string> {
  const options = isMarkdownIt(mdOrOptions) ? { md: mdOrOptions } : mdOrOptions;
  const md = options.md ?? getMarkdownIt();

  if (options.frontmatter === 'panel') {
    // Split at the text level rather than via the tokenizer so panel mode
    // works with ANY markdown-it instance a host supplies, including ones
    // without the front_matter rule.
    const { raw, body } = splitFrontmatterBlock(text);
    if (raw) {
      const inner = FRONTMATTER_BLOCK_PATTERN.exec(raw)?.[1] ?? '';
      return renderFrontmatterPanel(inner) + md.render(body);
    }
  }

  return md.render(text);
}

export type { default as MarkdownIt } from 'markdown-it';
