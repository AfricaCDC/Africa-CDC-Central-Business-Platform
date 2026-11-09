/**
 * @rbm/lib/formatters — ESM source.
 *
 * Mirror of ./formatters.js (CJS) for frontend bundlers. Both files MUST
 * stay in lockstep — see ./formatters.js for the canonical jsdoc.
 */

export function fmtBudget(value, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  const currency = options.currency || 'USD';
  const n = Number(value || 0);
  if (!n || Number.isNaN(n)) return fallback;
  if (options.compact) return fmtBudgetCompact(n, fallback);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtBudgetCompact(value, fallback) {
  const fb = fallback != null ? fallback : '—';
  const n = Number(value || 0);
  if (!n || Number.isNaN(n)) return fb;
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toLocaleString('en-US');
}

export function fmtDate(value, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  if (value == null || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const format = options.format || 'short';
  switch (format) {
    case 'monthYear':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    case 'medium':
      return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    case 'long':
      return date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    case 'short':
    default:
      return date.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
  }
}

export function fmtDateRange(start, end, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  const format = options.format || 'monthYear';
  const left = start ? fmtDate(start, { format, fallback: '' }) : '';
  const right = end ? fmtDate(end, { format, fallback: '' }) : '';
  if (!left && !right) return fallback;
  if (!right) return left;
  if (!left) return right;
  if (left === right) return left;
  return `${left} — ${right}`;
}

export function fmtMonth(value, opts) {
  return fmtDate(value, { format: 'monthYear', fallback: (opts && opts.fallback) || '—' });
}

export function fmtValue(value, uom, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const display = n % 1 === 0 ? n : n.toFixed(options.precision != null ? options.precision : 1);
  if (uom && uom.display_format) {
    return uom.display_format.replace('{value}', display);
  }
  if (uom && uom.label) {
    return `${display} ${uom.label}`;
  }
  return String(display);
}

export function fmtPercent(value, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  const precision = options.precision != null ? options.precision : 0;
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return `${n.toFixed(precision)}%`;
}

export function fmtNumber(value, opts) {
  const options = opts || {};
  const fallback = options.fallback != null ? options.fallback : '—';
  const precision = options.precision != null ? options.precision : 0;
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function timeAgo(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export default {
  fmtBudget, fmtBudgetCompact, fmtDate, fmtDateRange, fmtMonth,
  fmtValue, fmtPercent, fmtNumber, timeAgo,
};
