// The format's core: everything isomorphic (Node + browser) about its content.
// Replace this with the real parser or document model.

export interface SampleDocument {
  lines: string[];
}

/** One reason the rich view cannot show the content. */
export interface SampleIssue {
  /** 1-based line number. */
  line: number;
  message: string;
}

export function parseSample(content: string): SampleDocument {
  return { lines: content.split(/\r?\n/) };
}

export function serializeSample(document: SampleDocument): string {
  return document.lines.join('\n');
}

/**
 * Why the rich view cannot show `content`; empty when it can. Replace this with the
 * real validation. The sample rejects lines starting with `!` so the template shows
 * the raw view's fallback: content that does not parse opens as raw text.
 */
export function validateSample(content: string): SampleIssue[] {
  return parseSample(content).lines.flatMap((text, index) =>
    text.startsWith('!') ? [{ line: index + 1, message: 'a line may not start with "!"' }] : []
  );
}

/** An issue as one line of a notice. */
export function formatSampleIssue(issue: SampleIssue): string {
  return `Line ${issue.line}: ${issue.message}`;
}
