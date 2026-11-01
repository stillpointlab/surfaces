import { describe, expect, it } from 'vitest';

import { parseSample, serializeSample } from './parse';

describe('parseSample', () => {
  it('round-trips line content', () => {
    const source = 'one\ntwo\n';
    expect(serializeSample(parseSample(source))).toBe(source);
  });
});
