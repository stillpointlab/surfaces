export const FRONTMATTER_BLOCK_PATTERN = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface FrontmatterParts {
  raw: string;
  yaml: string;
  body: string;
}

export function splitFrontmatterBlock(source: string): FrontmatterParts | null {
  const match = FRONTMATTER_BLOCK_PATTERN.exec(source);
  if (!match) return null;

  return {
    raw: match[0],
    yaml: match[1] ?? '',
    body: source.slice(match[0].length),
  };
}
