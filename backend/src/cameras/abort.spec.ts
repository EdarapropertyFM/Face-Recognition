import { isAbort } from './abort';

describe('isAbort', () => {
  // These reach the stream endpoint constantly: every closed tile aborts one.
  it('recognises the shapes a cancelled fetch arrives as', () => {
    expect(isAbort(new DOMException('This operation was aborted', 'AbortError'))).toBe(true);
    expect(isAbort(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }))).toBe(true);
    expect(isAbort(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(true);
  });

  it('unwraps an abort carried as a cause', () => {
    const wrapped = new TypeError('fetch failed');
    (wrapped as { cause?: unknown }).cause = new DOMException('aborted', 'AbortError');
    expect(isAbort(wrapped)).toBe(true);
  });

  it('does NOT swallow a real upstream failure', () => {
    expect(isAbort(new Error('AI stream unavailable (502)'))).toBe(false);
    expect(isAbort(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe(false);
    expect(isAbort(null)).toBe(false);
    expect(isAbort('aborted')).toBe(false);
  });

  it('survives a self-referencing cause chain', () => {
    const loop = new Error('loop') as Error & { cause?: unknown };
    loop.cause = loop;
    expect(isAbort(loop)).toBe(false);
  });
});
