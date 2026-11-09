/**
 * @rbm/lib/html — HTML escaping + safe template rendering for email and PDF
 * templates. Centralizes the escape logic so every template consumer is
 * protected by default (master-plan CSP-04).
 *
 * Rules:
 *   - `escape(str)` replaces `& < > " ' ` /` with HTML entities.
 *   - `renderTemplate(src, vars)` replaces `{{ key }}` with
 *     `escape(vars[key])`. Keys prefixed with `raw:` are inserted VERBATIM
 *     (caller guarantees safety — use sparingly, e.g. pre-rendered HTML).
 *   - Unknown keys render as empty string (never leave `{{foo}}` in output).
 */

const ESCAPE_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '/': '&#47;',
});

const ESCAPE_RE = /[&<>"'`/]/g;

/**
 * HTML-escape a single value. Non-string inputs are coerced via `String()`.
 * `null` and `undefined` become an empty string.
 *
 * @param {*} value
 * @returns {string}
 * @example
 *   escape('<b>hi</b>') // => '&lt;b&gt;hi&lt;&#47;b&gt;'
 */
function escape(value) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

const TOKEN_RE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/**
 * Render a `{{ key }}` template string with automatic HTML escaping.
 *
 * @param {string} src — template source.
 * @param {Record<string, *>} [vars] — variable bindings. Values are escaped
 *   unless the key is prefixed with `raw:` in the template.
 * @returns {string}
 * @throws {TypeError} when `src` is not a string.
 * @example
 *   renderTemplate('Hello {{ name }}', { name: '<b>Lenny</b>' });
 *   // => 'Hello &lt;b&gt;Lenny&lt;&#47;b&gt;'
 *
 *   // Explicit raw passthrough (caller certifies safety):
 *   renderTemplate('{{ raw:footer }}', { footer: '<hr>' });
 *   // => '<hr>'
 */
function renderTemplate(src, vars) {
  if (typeof src !== 'string') {
    throw new TypeError('renderTemplate: src must be a string');
  }
  const bindings = vars || {};
  return src.replace(TOKEN_RE, (_match, token) => {
    const raw = token.startsWith('raw:');
    const key = raw ? token.slice(4).trim() : token;
    const value = bindings[key];
    if (value == null) return '';
    return raw ? String(value) : escape(value);
  });
}

module.exports = { escape, renderTemplate };
