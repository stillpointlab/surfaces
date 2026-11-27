// Which sentence a document's failure gets, from the error pdf.js gave for it.
import { describe, expect, it } from 'vitest';

import { pdfjsError } from '../testing/fake-pdfjs';

import { failureOf } from './failure';

describe('failureOf', () => {
  it.each([
    ['ResponseException', undefined, 'load'],
    ['UnknownErrorException', 'TypeError: Failed to fetch', 'load'],
    ['UnknownErrorException', 'TypeError: NetworkError when attempting to fetch resource.', 'load'],
    ['UnknownErrorException', 'FormatError: Bad FCHECK in flate stream', 'read'],
    ['UnknownErrorException', undefined, 'read'],
    ['InvalidPDFException', undefined, 'read'],
    ['PasswordException', undefined, 'password'],
    ['Error', undefined, 'load'],
  ] as const)('takes %s (%s) as %s', (name, details, failure) => {
    expect(failureOf(pdfjsError(name, name, details))).toBe(failure);
  });

  it('takes what is not an error as one that did not arrive', () => {
    expect(failureOf(undefined)).toBe('load');
    expect(failureOf('gone')).toBe('load');
  });
});
