/**
 * Shared <Button> primitive — single source of truth for action buttons.
 *
 * CHARTER §4 design tokens (non-negotiable):
 *   - Flat 1px borders, no rounded corners, no shadows
 *   - Africa CDC green primary (#1A5632) / hover (#14442A)
 *   - Font sizes: text-[9px] tiny, text-[10px] labels, text-[11px] body, text-[12px] links
 *
 * Variants:
 *   - primary   — filled green (default action: Submit, Save, Apply, Create)
 *   - secondary — outlined gray (Cancel, Close, Expand all)
 *   - ghost     — text-only (in-row actions, link-style controls)
 *   - danger    — outlined red (Delete, Remove, Clear filters)
 *   - inverse   — translucent white-on-color (page-header CTAs sitting INSIDE
 *                 colored section banners). RESERVED for that case — never
 *                 use on white page backgrounds; pick `primary` instead.
 *
 * Sizes (CHARTER §4: text-[11px] = body, text-[12px] = links):
 *   - xs — text-[10px] px-2  py-1     (compact toolbar / table cell)
 *   - sm — text-[11px] px-3 py-1.5    (default — in-row + toolbar pairs)
 *   - md — text-[11px] px-4 py-2      (form-footer + modal-footer pairs;
 *                                       body-text size with wider padding)
 *   - lg — text-[12px] px-4 py-2      (banner / hero CTAs that need
 *                                       link-text size; reserved for
 *                                       prominent inverse-on-color usage)
 */
import { forwardRef } from 'react';

const VARIANT_CLASSES = {
  primary:
    'bg-[#1A5632] text-white border border-[#1A5632] hover:bg-[#14442A] hover:border-[#14442A] disabled:opacity-50',
  secondary:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50',
  ghost:
    'bg-transparent text-gray-600 border border-transparent hover:text-[#1A5632] hover:bg-gray-50 disabled:opacity-50',
  danger:
    'bg-white text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50',
  inverse:
    'bg-white/15 text-white border border-white/30 hover:bg-white/25 disabled:opacity-50',
};

const SIZE_CLASSES = {
  xs: 'text-[10px] px-2 py-1 gap-1',
  sm: 'text-[11px] px-3 py-1.5 gap-1.5',
  md: 'text-[11px] px-4 py-2 gap-2',
  lg: 'text-[12px] px-4 py-2 gap-2',
};

const BASE =
  'inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-[#1A5632]';

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'inverse'} [props.variant='primary']
 * @param {'xs'|'sm'|'md'|'lg'} [props.size='sm']
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 * @example
 *   <Button variant="primary" size="sm" onClick={handleCreate}>
 *     <Plus className="w-3 h-3" /> Nouvelle activité
 *   </Button>
 */
export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'sm', type = 'button', className = '', children, ...rest },
  ref,
) {
  const variantCls = VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary;
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm;
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${variantCls} ${sizeCls} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
