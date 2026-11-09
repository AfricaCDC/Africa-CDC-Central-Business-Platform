import { useLocation } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import TopNav from './TopNav';
import MainNav from './MainNav';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import usePageTracker from '@/hooks/usePageTracker';

/**
 * Minimal fallback for a navigation-zone crash. The page content lives in a
 * SIBLING boundary so it stays alive; we only need to keep the user from being
 * stranded, so we offer a reload (CLAUDE.md §10 — never a blank screen).
 *
 * @returns {JSX.Element}
 */
function NavZoneFallback() {
  return (
    <div className="bg-[#1A5632] text-white px-5 py-2.5 flex items-center justify-between" role="alert">
      <span className="text-[12px] text-white/90">The navigation bar failed to load.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-1.5 text-[12px] border border-white/30 px-3 py-1 hover:bg-white/10"
      >
        <RotateCw className="w-3.5 h-3.5" /> Reload
      </button>
    </div>
  );
}

/**
 * Page chrome shared by every authenticated screen — TopNav + MainNav +
 * scrollable main content area.
 *
 * Each zone is wrapped in its OWN error boundary (CLAUDE.md §10): a crash in
 * the navigation never blanks the page content, and a crash in the page
 * content never takes down the navigation the user needs to escape it. The
 * content boundary is keyed on the pathname so navigating away clears a prior
 * crash even when the same layout instance is reused across routes. Also tracks
 * page navigation via audit.
 *
 * @param {{children: React.ReactNode, breadcrumbs?: Array<{label: string, path?: string}>}} props
 * @returns {JSX.Element}
 */
export default function DashboardLayout({ children, breadcrumbs }) {
    usePageTracker();
    const location = useLocation();
    return (
        // Printed pages (e.g. the monthly digest) drop the navigation and the
        // fixed-height scroll area, so every page of the content prints.
        <div className="flex flex-col h-screen bg-[#F5F7FA] print:block print:h-auto print:bg-white">
            <div className="print:hidden">
                <ErrorBoundary zone="navigation" fallback={NavZoneFallback}>
                    <TopNav breadcrumbs={breadcrumbs} />
                    <MainNav />
                </ErrorBoundary>
            </div>
            <main className="flex-1 overflow-y-auto p-5 sm:p-6 scrollbar-thin print:overflow-visible print:p-0">
                <ErrorBoundary zone="content" resetKey={location.pathname}>
                    {children}
                </ErrorBoundary>
            </main>
            {/* A broken tour must never cover the page: its fallback is nothing. */}
            <ErrorBoundary zone="tour" fallback={() => null}>
                <OnboardingTour />
            </ErrorBoundary>
        </div>
    );
}
