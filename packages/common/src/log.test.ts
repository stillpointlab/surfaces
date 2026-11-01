import { afterEach, describe, expect, it, vi } from 'vitest';

import { report, reportError, setErrorHandler, setReporter } from './log';

describe('log', () => {
  afterEach(() => {
    setErrorHandler(null);
    setReporter(null);
    vi.restoreAllMocks();
  });

  it('reports errors to the console until a handler is set', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    reportError('failed', err);
    expect(consoleError).toHaveBeenCalledWith('failed', err);

    const handler = vi.fn();
    setErrorHandler(handler);
    reportError('again', err);
    expect(handler).toHaveBeenCalledWith('again', err);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('routes reports by level to the console until a reporter is set', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    report('plain');
    report('careful', { level: 'warn' });
    expect(info).toHaveBeenCalledWith('plain');
    expect(warn).toHaveBeenCalledWith('careful');

    const reporter = vi.fn();
    setReporter(reporter);
    report('routed', { level: 'error' });
    expect(reporter).toHaveBeenCalledWith('routed', { level: 'error' });
  });

  it('restores the console default when a handler is cleared', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setErrorHandler(vi.fn());
    setErrorHandler(null);
    reportError('back to console');
    expect(consoleError).toHaveBeenCalledWith('back to console', undefined);
  });
});
