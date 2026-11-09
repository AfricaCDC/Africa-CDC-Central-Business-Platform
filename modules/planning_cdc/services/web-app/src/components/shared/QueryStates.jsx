import { Loader2, AlertTriangle, Inbox, RotateCw } from 'lucide-react';

/**
 * Layout-agnostic React Query state components. Unlike `ReportingStates`
 * (which wrap a full `DashboardLayout`), these render *inside* a page's
 * existing layout/body so any list or detail page can show consistent
 * loading / error / empty states (CLAUDE.md §6 — "All states must be handled").
 *
 * Usage in a container:
 *   if (isLoading) return <LoadingState />;
 *   if (isError)   return <ErrorState onRetry={refetch} />;
 *   if (!rows.length) return <EmptyState title="No activities yet" />;
 */

/**
 * Centered spinner for the loading state.
 *
 * @param {{ className?: string }} [props]
 * @returns {JSX.Element}
 */
export function LoadingState({ className = '' }) {
  return (
    <div className={`flex items-center justify-center h-40 ${className}`}>
      <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
    </div>
  );
}

/**
 * Error state with a retry action. Never shows a raw API error object — the
 * caller may pass a human-readable `message`, otherwise a safe default is used.
 *
 * @param {{ message?: string, onRetry?: () => void }} [props]
 * @returns {JSX.Element}
 * @example
 * <ErrorState onRetry={refetch} />
 */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="bg-white border border-gray-200 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="w-9 h-9 text-[#1A5632] mx-auto mb-3" />
      <h2 className="text-[14px] font-semibold text-gray-800">Couldn&apos;t load this content</h2>
      <p className="text-[12px] text-gray-500 mt-1 max-w-sm mx-auto">
        {message || 'Something went wrong while loading. Please try again.'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[12px] px-4 py-2 hover:bg-[#14492a]"
        >
          <RotateCw className="w-3.5 h-3.5" /> Try again
        </button>
      )}
    </div>
  );
}

/**
 * Empty state with optional context and call-to-action.
 *
 * @param {{ title?: string, hint?: string, action?: JSX.Element }} [props]
 * @returns {JSX.Element}
 */
export function EmptyState({ title = 'Nothing to show yet', hint, action }) {
  return (
    <div className="bg-white border border-gray-200 px-6 py-12 text-center">
      <Inbox className="w-9 h-9 text-gray-300 mx-auto mb-3" />
      <h2 className="text-[14px] font-semibold text-gray-700">{title}</h2>
      {hint && <p className="text-[12px] text-gray-400 mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
