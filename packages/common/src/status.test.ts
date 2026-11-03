// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { createStatus, STATUS_MESSAGES } from './status';

describe('createStatus', () => {
  it('marks loading as a polite status', () => {
    const status = createStatus('loading', STATUS_MESSAGES.loading);
    expect(status.className).toBe('spl-status spl-status--loading');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Loading…');
  });

  it('marks an error as an alert', () => {
    const status = createStatus('error', STATUS_MESSAGES.editorFailed);
    expect(status.className).toBe('spl-status spl-status--error');
    expect(status.getAttribute('role')).toBe('alert');
  });

  it('gives an empty state no live role', () => {
    expect(createStatus('empty', 'Nothing here.').hasAttribute('role')).toBe(false);
  });
});
