import MarkdownIt from 'markdown-it';

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

/**
 * Render markdown to an HTML string. Output is NOT sanitized — callers must
 * sanitize before inserting into the DOM.
 */
export async function renderMarkdown(
  text: string,
  md: MarkdownIt = getMarkdownIt()
): Promise<string> {
  return md.render(text);
}

export type { default as MarkdownIt } from 'markdown-it';
