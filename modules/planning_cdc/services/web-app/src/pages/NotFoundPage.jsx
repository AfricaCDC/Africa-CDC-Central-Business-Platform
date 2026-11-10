import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * Catch-all 404 page for any unmatched route. Rendered standalone (no
 * DashboardLayout, no auth/permission hooks) so it shows reliably regardless
 * of auth state — a mistyped URL or a dead link must never resolve to a blank
 * white screen (CLAUDE.md §10). Links back to `/`, which the SmartRedirect
 * routes to the right landing page for the current user.
 *
 * @returns {JSX.Element}
 * @example
 * <Route path="*" element={<NotFoundPage />} />
 */
export default function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#F5F7FA] px-6">
      <div className="bg-white border border-gray-200 px-8 py-10 max-w-md w-full text-center">
        <Compass className="w-9 h-9 text-[#1A5632] mx-auto mb-4" />
        <div className="text-[28px] font-bold text-[#1A5632] leading-none">404</div>
        <h1 className="text-[15px] font-semibold text-gray-800 mt-3">Page not found</h1>
        <p className="text-[12px] text-gray-500 mt-2">
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[12px] px-4 py-2 hover:bg-[#14492a]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
