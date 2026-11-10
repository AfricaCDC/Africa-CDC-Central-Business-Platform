/**
 * Shared helpers for email templates. Extracting these keeps the per-template
 * render functions under the ESLint complexity cap (10) by moving the
 * `optional / fallback` branching out of the main function.
 */

const { escape } = require('@rbm/lib/html');

/**
 * Escape `value` if truthy, otherwise return `fallback` (no escape).
 *
 * @param {*} value
 * @param {string} [fallback]
 * @returns {string}
 */
function esc(value, fallback) {
  return value ? escape(value) : (fallback || '');
}

/**
 * Render `fn(escaped)` only when `value` is truthy. Used for conditional
 * HTML rows / paragraphs so the caller stays free of ternaries.
 *
 * @param {*} value
 * @param {(escapedValue: string) => string} fn
 * @returns {string}
 */
function when(value, fn) {
  if (!value) return '';
  return fn(escape(value));
}

/**
 * Pick the first truthy value. Used in place of chained `a || b || c` so
 * ESLint doesn't count each `||` as a branch in the caller.
 *
 * @param {...*} values
 * @returns {*}
 */
function firstOf(...values) {
  for (const v of values) {
    if (v) return v;
  }
  return values[values.length - 1];
}

/**
 * Resolve the app URL used by CTA buttons. Always escaped.
 *
 * @param {string} [override] — e.g. `data.dashboardUrl`.
 * @returns {string}
 */
function appUrl(override) {
  return escape(firstOf(override, process.env.APP_URL, 'http://localhost:5173'));
}

/**
 * One report as a stacked block: code, title, then a muted meta line. Used
 * instead of a multi-column table, which overflows the card on phones.
 *
 * @param {{code?: string, title?: string, meta?: Array<*>}} item — meta parts are joined with " · "
 * @returns {string} HTML
 * @example
 * itemBlock({ code: 'RefLab.5.4-3', title: 'Clusters', meta: ['2026 · Q3', 'Reference Laboratories'] });
 */
function itemBlock({ code, title, meta = [] }) {
  const metaLine = meta.filter((m) => m != null && m !== '').map((m) => escape(String(m))).join(' · ');
  return `
      <div style="border:1px solid #e5e7eb;border-left:3px solid #1A5632;padding:8px 12px;margin-top:8px;">
        <div style="font-family:monospace;font-size:11px;color:#1A5632;">${escape(code || '—')}</div>
        <div style="font-size:13px;margin-top:2px;word-wrap:break-word;">${escape(title || '')}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${metaLine}</div>
      </div>`;
}

/**
 * One label/value pair, label above value (single column). Replaces the
 * two-column key–value `<table>` that overflowed phone-width mail clients.
 * `valueHtml` must already be escaped.
 *
 * @param {string} label
 * @param {string} valueHtml
 * @returns {string} HTML
 * @example
 * kvRow('Period', 'Q3 2026');
 */
function kvRow(label, valueHtml) {
  return `
          <div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:600;color:#4a5568;text-transform:uppercase;letter-spacing:.3px;">${label}</div>
            <div style="font-size:13px;color:#1a202c;margin-top:2px;word-break:break-word;overflow-wrap:anywhere;">${valueHtml}</div>
          </div>`;
}

/**
 * Card around a list of {@link kvRow}s. Full width, never wider than its
 * parent.
 *
 * @param {string} rowsHtml — concatenated kvRow output
 * @returns {string} HTML
 * @example
 * kvList(kvRow('Report', 'X.1 — Title') + kvRow('Period', 'Q3 2026'));
 */
function kvList(rowsHtml) {
  return `
        <div style="border:1px solid #e2e8f0;border-bottom:0;margin:15px 0;width:100%;box-sizing:border-box;">${rowsHtml}
        </div>`;
}

/**
 * Approve / Reject buttons opening the « decide » page of the step
 * (D-20261105-10). The page asks to confirm (and a reason to reject), so a
 * link opened by a mail scanner decides nothing. Empty without a URL.
 *
 * @param {string} [decideUrl] — absolute `/decide/:stepId` link
 * @returns {string} HTML
 * @example decideButtons('https://pra.africacdc.org/decide/311');
 */
function decideButtons(decideUrl) {
  if (!decideUrl) return '';
  const url = escape(decideUrl);
  return `
        <p style="text-align:center; margin:20px 0 0;">
          <a href="${url}?d=approve" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600; margin:0 4px;">Approve</a>
          <a href="${url}?d=reject" style="display:inline-block; padding:9px 23px; border:1px solid #b91c1c; color:#b91c1c; text-decoration:none; font-size:13px; font-weight:600; margin:0 4px;">Reject</a>
        </p>`;
}

/**
 * Small « Decide » link under one item of a list. Empty without a URL.
 *
 * @param {string} [decideUrl]
 * @returns {string} HTML
 * @example decideLink('https://pra.africacdc.org/decide/311');
 */
function decideLink(decideUrl) {
  if (!decideUrl) return '';
  return `<div style="margin:2px 0 0 15px;font-size:11px;"><a href="${escape(decideUrl)}" style="color:#1A5632;">Approve or reject</a></div>`;
}

module.exports = { esc, when, firstOf, appUrl, itemBlock, kvRow, kvList, decideButtons, decideLink };
