// The format's core: everything isomorphic (Node + browser) about its content.
// Replace this with the real parser or document model.

export interface SampleDocument {
  lines: string[];
}

export function parseSample(content: string): SampleDocument {
  return { lines: content.split(/\r?\n/) };
}

export function serializeSample(document: SampleDocument): string {
  return document.lines.join('\n');
}
