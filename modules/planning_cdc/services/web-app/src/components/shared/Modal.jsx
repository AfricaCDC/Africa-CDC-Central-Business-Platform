/**
 * Modal — the single generic dialog used across the web-app.
 *
 * Replaces every ad-hoc `<div class="fixed inset-0 bg-black/50 ...">`
 * modal shell scattered across pages with one flat, consistent
 * component. Every dialog in the app (confirmation, reject, form
 * wrappers, info boxes, etc.) should render through this component
 * so styling updates propagate everywhere.
 *
 * Design rules (CLAUDE.md): no rounded corners, no shadows, flat
 * borders only, Africa CDC green #1A5632 for the header.
 *
 * Features baked in:
 *   - Click outside → onClose
 *   - Escape key → onClose
 *   - Scroll locking on body while the modal is open
 *   - Optional footer slot (grey strip with top border) for actions
 *   - Optional close X (on by default)
 *   - `danger` flag swaps the header to red for destructive dialogs
 *   - `scrollable` switches the body to a scrollable flex child so
 *     long forms don't push the footer off-screen
 *
 * Props:
 *   open        bool                 — controls visibility (return null when closed)
 *   onClose     () => void           — called on escape / backdrop / X
 *   title       string | ReactNode   — header text (left side)
 *   icon        ReactNode            — optional icon next to the title
 *   children    ReactNode            — body content (rendered in px-5 py-4 by default)
 *   footer      ReactNode            — optional action row (usually Cancel + Confirm buttons)
 *   danger      bool                 — red header instead of green
 *   width       string               — tailwind max width token (default 'max-w-[440px]')
 *   showClose   bool                 — show the X button (default true)
 *   closeOnBackdrop bool             — allow click outside to dismiss (default true)
 *   scrollable  bool                 — make the body scrollable inside the max viewport
 *   bodyClassName string             — override the default padding on the body wrapper
 */

import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  danger = false,
  width = 'max-w-[440px]',
  showClose = true,
  closeOnBackdrop = true,
  scrollable = false,
  bodyClassName = 'px-5 py-4',
}) {
  // Dismiss on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock scroll on the body while the modal is open so the page behind
  // doesn't jitter when the user scrolls.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  const headerBg = danger ? 'bg-red-600' : 'bg-[#1A5632]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (closeOnBackdrop) onClose?.(); }}
    >
      <div
        className={`bg-white border border-gray-200 w-full ${width} ${scrollable ? 'max-h-[90vh] flex flex-col overflow-hidden' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header — flat, green/red, no rounding, small title */}
        <div className={`flex items-center gap-2 px-5 py-3 border-b border-gray-200 ${headerBg} text-white flex-shrink-0`}>
          {danger && !icon && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <h2 className="text-[13px] font-semibold flex-1 truncate">{title}</h2>
          {showClose && (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="text-white/70 hover:text-white flex-shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`${bodyClassName} ${scrollable ? 'flex-1 overflow-y-auto' : ''}`}>
          {children}
        </div>

        {/* Footer — only rendered if the caller provides one */}
        {footer && (
          <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Primary action button — green, filled, flat. Matches the
 * Africa CDC design system. Use inside Modal `footer` slot.
 */
export function ModalPrimaryButton({ children, onClick, disabled, type = 'button', danger = false, className = '' }) {
  const bg = danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A5632] hover:bg-[#14442A]';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] px-4 py-2 text-white ${bg} disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Secondary action button — outlined, grey. Usually the "Cancel" peer
 * to ModalPrimaryButton inside a Modal footer.
 */
export function ModalSecondaryButton({ children, onClick, disabled, type = 'button', className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
