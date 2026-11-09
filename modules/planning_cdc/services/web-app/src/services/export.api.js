// ── Export API service ──
// In-app authenticated report downloads (XLSX / CSV). All endpoints return a
// binary blob with a Content-Disposition filename. The backend gates each by
// the RBAC matrix (`<module>:export`) and applies row-level scope.
// Consumed by <ExportMenu> via the `triggerDownload` helper below.

import httpClient from './api';

export const exportApi = {
  /**
   * Download the canonical quarterly report (one row per indicator × division).
   *
   * @param {{ fiscalYear: string|number, quarter: string, format: 'xlsx'|'csv', division?: string }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  quarterlyReport: ({ fiscalYear, quarter, format, division }) =>
    httpClient.get('/reporting/exports/quarterly-report', {
      params: { fiscal_year: fiscalYear, quarter, format, division },
      responseType: 'blob',
    }),

  /**
   * Download the workplan (broad + specific activities with budgets).
   *
   * @param {{ fiscalYear: string|number, format: 'xlsx'|'csv', division?: string }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  workplan: ({ fiscalYear, format, division }) =>
    httpClient.get('/reporting/exports/workplan', {
      params: { fiscal_year: fiscalYear, format, division },
      responseType: 'blob',
    }),

  /**
   * Download the PIRS indicator reference sheet.
   *
   * @param {{ fiscalYear: string|number, format: 'xlsx'|'csv', division?: string }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  pirs: ({ fiscalYear, format, division }) =>
    httpClient.get('/reporting/exports/pirs', {
      params: { fiscal_year: fiscalYear, format, division },
      responseType: 'blob',
    }),

  /**
   * Download division activity (narrative) reports for a fiscal year / quarter.
   *
   * @param {{ fiscalYear: string|number, quarter?: string, format: 'xlsx'|'csv', division?: string }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  activityReport: ({ fiscalYear, quarter, format, division }) =>
    httpClient.get('/reporting/exports/activity-report', {
      params: { fiscal_year: fiscalYear, quarter, format, division },
      responseType: 'blob',
    }),

  /**
   * Download a donor-specific activity list, filtered by funding source / grant.
   *
   * @param {{ fiscalYear: string|number, fundingSource?: string, grant?: string, format: 'xlsx'|'csv', division?: string }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  donor: ({ fiscalYear, fundingSource, grant, format, division }) =>
    httpClient.get('/reporting/exports/donor', {
      params: { fiscal_year: fiscalYear, funding_source: fundingSource, grant, format, division },
      responseType: 'blob',
    }),

  /**
   * Download the division quarterly summary (indicator detail) as XLSX / CSV.
   *
   * @param {{ divisionCode: string, fiscalYear: string|number, quarter: string, format: 'xlsx'|'csv' }} params
   * @returns {Promise<import('axios').AxiosResponse<Blob>>}
   */
  divisionSummary: ({ divisionCode, fiscalYear, quarter, format }) =>
    httpClient.get(`/reporting/division-quarterly-reports/${divisionCode}/export`, {
      params: { fiscal_year: fiscalYear, quarter, format },
      responseType: 'blob',
    }),
};

/**
 * Extract the filename from a Content-Disposition header, falling back to a
 * supplied default when the header is absent (e.g. behind some proxies).
 *
 * @param {string} [disposition]
 * @param {string} fallback
 * @returns {string}
 */
export function filenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Turn an axios blob response into a browser download (anchor click).
 *
 * Chrome derives a blob download's filename SOLELY from the anchor's `download`
 * attribute (a `blob:` URL carries no Content-Disposition). Two things make
 * Chrome silently ignore it and save a blob-UUID with no extension — both fixed
 * here:
 *   1. Revoking the object URL too soon: a short delay (we used 1.5s) drops the
 *      filename even though the bytes still arrive. We now revoke after 40s,
 *      the FileSaver.js-proven margin.
 *   2. `rel="noopener"` on the anchor: it nudges Chrome to treat the click as a
 *      navigation rather than a download. Removed.
 * The blob is also re-wrapped with an explicit MIME type so the browser never
 * treats it as a navigable resource.
 *
 * @param {import('axios').AxiosResponse<Blob>} response
 * @param {string} fallbackName - used when no Content-Disposition is present
 * @returns {void}
 */
export function triggerDownload(response, fallbackName) {
  const name = filenameFromDisposition(response.headers?.['content-disposition'], fallbackName) || 'download';
  const type = response.headers?.['content-type'] || 'application/octet-stream';
  const raw = response.data;
  const blob = raw instanceof Blob ? raw : new Blob([raw], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Revoke long after the download has begun — short delays make Chrome drop
  // the filename and save a blob-UUID with no extension.
  setTimeout(() => {
    a.remove();
    window.URL.revokeObjectURL(url);
  }, 40000);
}
