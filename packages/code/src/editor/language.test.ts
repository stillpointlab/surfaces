import { describe, expect, it } from 'vitest';

import { findLanguage } from './language';

describe('findLanguage', () => {
  it('resolves popular languages by name', () => {
    for (const name of ['python', 'javascript', 'json', 'html', 'css']) {
      expect(findLanguage(name), name).not.toBeNull();
    }
  });

  it('matches case-insensitively and via aliases', () => {
    expect(findLanguage('Python')).not.toBeNull();
    expect(findLanguage('TypeScript')).not.toBeNull();
    // "ts" is a registered alias/extension for TypeScript.
    expect(findLanguage('ts')).not.toBeNull();
  });

  it('returns null for unknown names', () => {
    expect(findLanguage('not-a-real-language')).toBeNull();
  });

  it('returns null for empty or missing input', () => {
    expect(findLanguage('')).toBeNull();
    expect(findLanguage(null)).toBeNull();
    expect(findLanguage(undefined)).toBeNull();
  });
});
