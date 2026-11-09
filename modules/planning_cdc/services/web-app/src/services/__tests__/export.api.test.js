// ── export.api tests ──
//
// Regression coverage for the download helper. The original bug: revoking the
// object URL synchronously after click() made Chrome save a UUID with no
// extension. triggerDownload must (1) set the anchor's `download` to the
// Content-Disposition / fallback name, and (2) defer the revoke, not call it
// synchronously.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filenameFromDisposition, triggerDownload } from '../export.api';

describe('filenameFromDisposition', () => {
  it('should extract a quoted filename', () => {
    expect(filenameFromDisposition('attachment; filename="quarterly-report-2026-Q2.csv"', 'fb.csv'))
      .toBe('quarterly-report-2026-Q2.csv');
  });

  it('should decode a UTF-8 extended filename', () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%20report.xlsx", 'fb.xlsx'))
      .toBe('r report.xlsx');
  });

  it('should fall back when the header is absent', () => {
    expect(filenameFromDisposition(undefined, 'fallback.xlsx')).toBe('fallback.xlsx');
  });
});

describe('triggerDownload', () => {
  let createObjectURL;
  let revokeObjectURL;
  let clickSpy;
  let lastAnchor;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function noop() {
      lastAnchor = this;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    clickSpy.mockRestore();
  });

  it('should set the download name from Content-Disposition and click the anchor', () => {
    triggerDownload(
      { data: new Blob(['x']), headers: { 'content-disposition': 'attachment; filename="report.xlsx"' } },
      'fallback.xlsx',
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(lastAnchor.download).toBe('report.xlsx');
  });

  it('should use the fallback name when no Content-Disposition is present', () => {
    triggerDownload({ data: new Blob(['x']), headers: {} }, 'fallback.csv');
    expect(lastAnchor.download).toBe('fallback.csv');
  });

  it('should NOT revoke the object URL synchronously (deferred cleanup)', () => {
    triggerDownload({ data: new Blob(['x']), headers: {} }, 'fallback.csv');
    expect(revokeObjectURL).not.toHaveBeenCalled(); // would strip the filename in Chrome
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
