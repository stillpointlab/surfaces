import { describe, expect, it } from 'vitest';

import { formatSampleIssue, parseSample, serializeSample, validateSample } from './parse';

describe('parseSample', () => {
  it('round-trips line content', () => {
    const source = 'one\ntwo\n';
    expect(serializeSample(parseSample(source))).toBe(source);
  });
});

describe('validateSample', () => {
  it('accepts ordinary text and reports each line starting with "!"', () => {
    expect(validateSample('one\ntwo')).toEqual([]);
    const issues = validateSample('ok\n!bad\n!worse');
    expect(issues.map((issue) => issue.line)).toEqual([2, 3]);
    expect(formatSampleIssue(issues[0])).toBe('Line 2: a line may not start with "!"');
  });
});
