// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { formatYamlScalar } from './yaml';

// Context Manager's cases (inventory/roomWriter.test.ts), copied.
describe('formatYamlScalar', () => {
  it.each([
    ['Rancilio Silvia', 'Rancilio Silvia'],
    ['espresso-machine', 'espresso-machine'],
    [545, '545'],
    ['545', '"545"'],
    ['true', '"true"'],
    ['a: b', '"a: b"'],
    ['[list]', '"[list]"'],
    ['has # hash', '"has # hash"'],
    ['ends with space ', '"ends with space "'],
    ['', '""'],
    ['line\nbreak', '"line\\nbreak"'],
    ["it's fine", "it's fine"],
  ])('formats %j as %s', (value, expected) => {
    expect(formatYamlScalar(value)).toBe(expected);
  });

  it('formats booleans plain', () => {
    expect(formatYamlScalar(false)).toBe('false');
  });

  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
  });
});
