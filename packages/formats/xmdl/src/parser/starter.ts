import { stringify } from 'yaml';

const DEFAULT_TITLE = 'Untitled Template';

/** Build a minimal, parse-valid XMDL document for a newly created template. */
export function createXmdlStarter(title: string): string {
  const normalizedTitle =
    title
      .trim()
      .replace(/\.xmdl$/i, '')
      .trim() || DEFAULT_TITLE;
  const frontmatter = stringify({
    title: normalizedTitle,
    version: '0.1.0',
    outputFileType: 'markdown',
    params: [],
  });

  return `---\n${frontmatter}---\n# Template output\n`;
}
