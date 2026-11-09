/**
 * @rbm/lib/html — ESM mirror of ./html.js. See that file for full docs.
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

/** @see html.js#escape */
export function escape(value) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

const TOKEN_RE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/** @see html.js#renderTemplate */
export function renderTemplate(src, vars) {
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

export default { escape, renderTemplate };
