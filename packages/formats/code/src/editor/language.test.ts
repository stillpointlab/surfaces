import { describe, expect, it } from 'vitest';

import { findLanguage } from './language';

describe('findLanguage', () => {
  it('resolves popular languages by name', async () => {
    for (const name of ['python', 'javascript', 'json', 'html', 'css']) {
      expect(await findLanguage(name), name).not.toBeNull();
    }
  });

  it('matches case-insensitively and via aliases', async () => {
    expect(await findLanguage('Python')).not.toBeNull();
    expect(await findLanguage('TypeScript')).not.toBeNull();
    // "ts" is a registered alias/extension for TypeScript.
    expect(await findLanguage('ts')).not.toBeNull();
  });

  it('returns null for unknown names', async () => {
    expect(await findLanguage('not-a-real-language')).toBeNull();
  });

  it('returns null for empty or missing input', async () => {
    expect(await findLanguage('')).toBeNull();
    expect(await findLanguage(null)).toBeNull();
    expect(await findLanguage(undefined)).toBeNull();
  });
});
