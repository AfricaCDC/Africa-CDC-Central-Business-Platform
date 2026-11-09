import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { loginUrlFor } from '@/utils/returnTo';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ActiveDivisionProvider } from './contexts/ActiveDivisionContext';
import { PlanningYearProvider } from './contexts/PlanningYearContext';
import ExecutionYearGate from './components/layout/ExecutionYearGate';
import { Toaster } from '@/components/ui/sonner';
import BackendStatusBanner from '@/components/shared/BackendStatusBanner';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

// Eager pages — kept in main chunk for fast first paint and to avoid
// a Suspense flicker on the initial landing route.
import LoginPage from './pages/LoginPage';
import MicrosoftCallbackPage from './pages/auth/MicrosoftCallbackPage';
import Dashboard from './pages/Dashboard';
import FocalDashboardPage from './pages/FocalDashboardPage';

// Lazy-loaded pages — every non-landing route is code-split via React.lazy.
// Per CLAUDE.md "Lazy loading is mandatory for every route."
const SearchResults = lazy(() => import('./pages/SearchResults'));

// Plan Hierarchy
const PlanOutcomePage = lazy(() => import('./pages/PlanOutcomePage'));
const PlanNodeDetail = lazy(() => import('./pages/PlanNodeDetail'));
const MyBroadActivitiesPage = lazy(() => import('./pages/MyBroadActivitiesPage'));
const MyWorkplanPage = lazy(() => import('./pages/MyWorkplanPage'));
const MyIndicatorsPage = lazy(() => import('./pages/MyIndicatorsPage'));
const MySpecificsPage = lazy(() => import('./pages/MySpecificsPage'));

// Planning
const AMERTPage = lazy(() => import('./pages/AMERTPage'));
const ImpactPage = lazy(() => import('./pages/ImpactPage'));
const OutcomePage = lazy(() => import('./pages/OutcomePage'));
const ShortTermOutcomePage = lazy(() => import('./pages/ShortTermOutcomePage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const WorkplanPage = lazy(() => import('./pages/WorkplanPage'));
const GanttWorkplan = lazy(() => import('./pages/GanttWorkplan'));
const FundingPage = lazy(() => import('./pages/FundingPage'));
const BudgetBasePage = lazy(() => import('./pages/BudgetBasePage'));

// PIRS
const PIRSPage = lazy(() => import('./pages/PIRSPage'));
const LogframePage = lazy(() => import('./pages/LogframePage'));
const SpecificActivityPage = lazy(() => import('./pages/SpecificActivityPage'));

// M&E

// Reporting
const QuarterlyDashboardPage = lazy(() => import('./pages/reporting/QuarterlyDashboardPage'));
const DivisionQuarterlySummaryPage = lazy(() => import('./pages/reporting/DivisionQuarterlySummaryPage'));
const DonorsPage = lazy(() => import('./pages/donors/DonorsPage'));
const DonorDetailPage = lazy(() => import('./pages/donors/DonorDetailPage'));

// Strategy / Portfolio

// Reference
const StrategicPlanPage = lazy(() => import('./pages/StrategicPlanPage'));
const MemberStatesPage = lazy(() => import('./pages/MemberStatesPage'));
const PartnersPage = lazy(() => import('./pages/PartnersPage'));
const OrgStructurePage = lazy(() => import('./pages/OrgStructurePage'));
const OrgDivisionDetail = lazy(() => import('./pages/OrgDivisionDetail'));

// Workplan Detail

// Admin
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const UserGuidesPage = lazy(() => import('./pages/UserGuidesPage'));
const OutOfOfficePage = lazy(() => import('./pages/out-of-office/OutOfOfficePage'));
const DataHealthPage = lazy(() => import('./pages/data-health/DataHealthPage'));
const AdoptionPage = lazy(() => import('./pages/admin/adoption/AdoptionPage'));
const DigestPage = lazy(() => import('./pages/digest/DigestPage'));
const DecidePage = lazy(() => import('./pages/decide/DecidePage'));
const WorkflowTemplatesPage = lazy(() => import('./pages/admin/WorkflowTemplatesPage'));
const WorkflowTemplateDetailPage = lazy(() => import('./pages/admin/WorkflowTemplateDetailPage'));
const RbacPermissionsPage = lazy(() => import('./pages/admin/RbacPermissionsPage'));
const ApiKeysPage = lazy(() => import('./pages/admin/ApiKeysPage'));
const NotificationsAdminPage = lazy(() => import('./pages/admin/notifications/NotificationsAdminPage'));
const NotificationSubscriptionFormPage = lazy(() => import('./pages/admin/notifications/NotificationSubscriptionFormPage'));
const NotificationTestSendPage = lazy(() => import('./pages/admin/notifications/TestSendPage'));
const NotificationOutboxPage = lazy(() => import('./pages/admin/notifications/OutboxPage'));

// Governance
const GovernanceInbox = lazy(() => import('./pages/GovernanceInbox'));
const AuditLog = lazy(() => import('./pages/AuditLog'));

// Approvals (contributor report chain — spec §9.1)
const MyApprovalInboxPage = lazy(() => import('./pages/approvals/MyApprovalInboxPage'));
const ApprovalReviewPage = lazy(() => import('./pages/approvals/ApprovalReviewPage'));

const SpecificActivityFormPage = lazy(() => import('./pages/SpecificActivityFormPage'));
const IndicatorFormPage = lazy(() => import('./pages/IndicatorFormPage'));

// Reporting Interface
const DivisionActivityReportPage = lazy(() => import('./pages/reporting/DivisionActivityReportPage'));
const ActivityReportPage = lazy(() => import('./pages/reporting/ActivityReportPage'));
const ActivityReportFormPage = lazy(() => import('./pages/reporting/ActivityReportFormPage'));
const QuarterlyReportFormPage = lazy(() => import('./pages/reporting/QuarterlyReportFormPage'));
const ReviewSubmissionsPage = lazy(() => import('./pages/ReviewSubmissionsPage'));
const BigTicketsPage = lazy(() => import('./pages/big-tickets/list/BigTicketsPage'));
const BigTicketDetailPage = lazy(() => import('./pages/big-tickets/detail/BigTicketDetailPage'));
const BigTicketFormPage = lazy(() => import('./pages/big-tickets/form/BigTicketFormPage'));
const BigTicketReportPage = lazy(() => import('./pages/big-tickets/report/BigTicketReportPage'));
const BudgetImportsPage = lazy(() => import('./pages/budget-execution/imports/BudgetImportsPage'));
const UnlinkedFundCentersPage = lazy(() => import('./pages/budget-execution/unlinked/UnlinkedFundCentersPage'));
const IndicatorMappingPage = lazy(() => import('./pages/indicator-mapping/IndicatorMappingPage'));
const CountryWorkplanPage = lazy(() => import('./pages/country-workplan/CountryWorkplanPage'));
const IndicatorContributionsPage = lazy(() => import('./pages/IndicatorContributionsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

import { usePermissions } from '@/hooks/usePermissions';
import usePermissionStore from '@/stores/usePermissionStore';
import { BASE_PREFIX } from '@/utils/basePath';

/**
 * Shared loader shown while a lazy chunk is being fetched.
 * Matches the existing AuthProvider loading style (green spinner on white).
 *
 * @returns {JSX.Element}
 */
const RouteFallback = () => (
    <div className="flex items-center justify-center h-screen bg-[#F5F7FA]">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-[#348F41] rounded-full animate-spin" />
    </div>
);

/**
 * Route guard driven by the dynamic RBAC matrix (no hardcoded role arrays).
 * Nav-admins (audit-log access) bypass every guard; reviewer-only routes require
 * `quarterly_report:approve`; reporter-allowed routes accept any authenticated
 * user. Anyone else is redirected to /report or /login.
 *
 * SYSTEM_ADMIN passes instantly; for all other users we wait for the permission
 * store to load before deciding, so a nav-admin/reviewer is never briefly
 * bounced to /report on a cold load.
 *
 * @param {{children: JSX.Element, reporterAllowed?: boolean, reviewerAllowed?: boolean}} props
 * @returns {JSX.Element}
 */
const ProtectedRoute = ({ children, reporterAllowed, reviewerAllowed }) => {
    const { user, loading } = useAuth();
    const { can, isAdmin } = usePermissions();
    const permsLoaded = usePermissionStore((s) => !!s.loadedAt);
    const location = useLocation();

    if (loading) return <RouteFallback />;
    if (!user) return <Navigate to={loginUrlFor(location)} />; // back here after sign-in (D-20261105-10)
    if (!isAdmin && !permsLoaded) return <RouteFallback />;

    if (can('audit_log', 'read')) return children; // nav-admin → bypass
    if (reviewerAllowed) {
        return can('quarterly_report', 'approve') ? children : <Navigate to="/report" />;
    }
    if (!reporterAllowed) return <Navigate to="/report" />;
    return children;
};

/**
 * Default landing redirect. Sends nav-admins (audit-log access) to /dashboard and
 * everyone else to /report, routing unauthenticated users to /login. Waits for the
 * permission store before deciding (except SYSTEM_ADMIN, who resolves instantly).
 *
 * @returns {JSX.Element|null}
 */
/**
 * Old detail pages of an activity, an indicator or an outcome now live on the
 * plan item page (D-20261016-03, D-20261106-13). Keeps old links working.
 */
function PlanNodeRedirect() {
    const [id] = Object.values(useParams());
    return <Navigate to={`/plan/node/${id}`} replace />;
}

const SmartRedirect = () => {
    const { user, loading } = useAuth();
    const { can, isAdmin } = usePermissions();
    const permsLoaded = usePermissionStore((s) => !!s.loadedAt);
    if (loading) return null;
    if (!user) return <Navigate to="/login" />;
    if (!isAdmin && !permsLoaded) return null;
    return <Navigate to={can('audit_log', 'read') ? '/dashboard' : '/report'} />;
};

/**
 * Wraps the routed content in an error boundary that auto-resets on navigation.
 * A render crash or a stale-bundle chunk-load failure shows a recoverable
 * fallback instead of a blank screen; changing the pathname clears a prior
 * error so the next page renders cleanly (CLAUDE.md §10).
 *
 * @param {{children: JSX.Element}} props
 * @returns {JSX.Element}
 */
const RoutedContent = ({ children }) => {
    const location = useLocation();
    return (
        <ErrorBoundary zone="page" resetKey={location.pathname}>
            {children}
        </ErrorBoundary>
    );
};

/**
 * Top-level application component. Wires up the router, the auth provider,
 * the toast container and all lazy-loaded routes for the web app.
 *
 * @returns {JSX.Element}
 */
function App() {
    return (
        <Router basename={BASE_PREFIX}>
            <AuthProvider>
                <PlanningYearProvider>
                <ActiveDivisionProvider>
                <Toaster />
                <BackendStatusBanner />
                <RoutedContent>
                <Suspense fallback={<RouteFallback />}>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        {/* No password (D-20261107-03): old reset links land on the sign-in page. */}
                        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
                        <Route path="/reset-password" element={<Navigate to="/login" replace />} />
                        <Route path="/auth/microsoft/callback" element={<MicrosoftCallbackPage />} />

                        {/* Core */}
                        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="/search" element={<ProtectedRoute><SearchResults /></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute reporterAllowed><ProfilePage /></ProtectedRoute>} />
                        {/* Not /guides: that is the folder of the PDFs (public/guides/). */}
                        <Route path="/user-guides" element={<ProtectedRoute reporterAllowed><UserGuidesPage /></ProtectedRoute>} />
                        {/* Approvals that do not stall: delegation, decide from the email (D-20261105-09, -10) */}
                        <Route path="/out-of-office" element={<ProtectedRoute reporterAllowed><OutOfOfficePage /></ProtectedRoute>} />
                        <Route path="/decide/:stepId" element={<ProtectedRoute reporterAllowed><DecidePage /></ProtectedRoute>} />

                        {/* Plan Hierarchy */}
                        <Route path="/plan/outcome" element={<ProtectedRoute><PlanOutcomePage /></ProtectedRoute>} />
                        <Route path="/plan/node/:id" element={<ProtectedRoute reporterAllowed><PlanNodeDetail /></ProtectedRoute>} />

                        {/* Planning — admin only */}
                        <Route path="/amert" element={<ProtectedRoute reporterAllowed><AMERTPage /></ProtectedRoute>} />
                        <Route path="/amert/:id" element={<Navigate to="/amert" replace />} />
                        <Route path="/impact" element={<ProtectedRoute><ImpactPage /></ProtectedRoute>} />
                        <Route path="/outcome" element={<ProtectedRoute><OutcomePage /></ProtectedRoute>} />
                        <Route path="/short-term-outcome" element={<ProtectedRoute><ShortTermOutcomePage /></ProtectedRoute>} />
                        <Route path="/short-term-output" element={<Navigate to="/short-term-outcome" replace />} />
                        <Route path="/activities" element={<ProtectedRoute><ActivityPage /></ProtectedRoute>} />
                        <Route path="/workplan" element={<ProtectedRoute><WorkplanPage /></ProtectedRoute>} />
                        <Route path="/gantt" element={<ProtectedRoute><GanttWorkplan /></ProtectedRoute>} />
                        <Route path="/budget" element={<ProtectedRoute reporterAllowed><FundingPage /></ProtectedRoute>} />
                        <Route path="/budget-base" element={<ProtectedRoute><BudgetBasePage /></ProtectedRoute>} />
                        <Route path="/budget-lines/:id" element={<Navigate to="/budget" replace />} />
                        <Route path="/tasks/:id" element={<PlanNodeRedirect />} />

                        {/* Logframe — admin only */}
                        <Route path="/logframe" element={<ProtectedRoute><LogframePage /></ProtectedRoute>} />
                        <Route path="/tasks" element={<ProtectedRoute><SpecificActivityPage /></ProtectedRoute>} />
                        <Route path="/tasks/:id/edit" element={<ProtectedRoute><SpecificActivityFormPage /></ProtectedRoute>} />

                        {/* PIRS — admin only */}
                        <Route path="/pirs" element={<ProtectedRoute reporterAllowed><PIRSPage /></ProtectedRoute>} />
                        <Route path="/pirs/completion" element={<Navigate to="/pirs" />} />
                        <Route path="/pirs/mapping" element={<ProtectedRoute><IndicatorMappingPage /></ProtectedRoute>} />
                        <Route path="/pirs/contributions" element={<ProtectedRoute><IndicatorContributionsPage /></ProtectedRoute>} />
                        <Route path="/pirs/:indicatorId" element={<PlanNodeRedirect />} />
                        <Route path="/results" element={<Navigate to="/pirs" />} />
                        <Route path="/results/:resultId" element={<PlanNodeRedirect />} />
                        <Route path="/outcome/:outcomeId" element={<PlanNodeRedirect />} />

                        {/* M&E */}
                        <Route path="/itt" element={<Navigate to="/pirs" replace />} />
                        <Route path="/review-submissions" element={<ProtectedRoute reviewerAllowed><ExecutionYearGate><ReviewSubmissionsPage /></ExecutionYearGate></ProtectedRoute>} />
                        {/* Big Tickets — read for every role, managing gated in the pages (D-20261015-02) */}
                        <Route path="/big-tickets" element={<ProtectedRoute reporterAllowed><BigTicketsPage /></ProtectedRoute>} />
                        <Route path="/big-tickets/new" element={<ProtectedRoute reporterAllowed><BigTicketFormPage /></ProtectedRoute>} />
                        <Route path="/big-tickets/:id" element={<ProtectedRoute reporterAllowed><BigTicketDetailPage /></ProtectedRoute>} />
                        <Route path="/big-tickets/:id/edit" element={<ProtectedRoute reporterAllowed><BigTicketFormPage /></ProtectedRoute>} />
                        <Route path="/big-tickets/:id/report/:quarter" element={<ProtectedRoute reporterAllowed><BigTicketReportPage /></ProtectedRoute>} />
                        <Route path="/budget-execution" element={<Navigate to="/" replace />} />
                        <Route path="/budget-execution/activities/:id" element={<PlanNodeRedirect />} />
                        <Route path="/budget-execution/imports" element={<ProtectedRoute reporterAllowed><BudgetImportsPage /></ProtectedRoute>} />
                        <Route path="/budget-execution/unlinked" element={<ProtectedRoute reporterAllowed><UnlinkedFundCentersPage /></ProtectedRoute>} />
                        <Route path="/review-submissions/:actualId" element={<Navigate to="/review-submissions" replace />} />

                        {/* Reporting */}
                        <Route path="/report" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><FocalDashboardPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/my-broads" element={<ProtectedRoute reporterAllowed><MyBroadActivitiesPage /></ProtectedRoute>} />
                        <Route path="/my-workplan" element={<ProtectedRoute reporterAllowed><MyWorkplanPage /></ProtectedRoute>} />
                        <Route path="/my-indicators" element={<ProtectedRoute reporterAllowed><MyIndicatorsPage /></ProtectedRoute>} />
                        <Route path="/country-workplan" element={<ProtectedRoute reporterAllowed><CountryWorkplanPage /></ProtectedRoute>} />
                        <Route path="/my-specifics" element={<ProtectedRoute reporterAllowed><MySpecificsPage /></ProtectedRoute>} />
                        <Route path="/my-specifics/new" element={<ProtectedRoute reporterAllowed><SpecificActivityFormPage /></ProtectedRoute>} />
                        <Route path="/my-specifics/:id/edit" element={<ProtectedRoute reporterAllowed><SpecificActivityFormPage /></ProtectedRoute>} />
                        <Route path="/pirs/new" element={<ProtectedRoute><IndicatorFormPage /></ProtectedRoute>} />
                        <Route path="/pirs/:id/edit" element={<ProtectedRoute><IndicatorFormPage /></ProtectedRoute>} />
                        <Route path="/report-old" element={<Navigate to="/report" replace />} />
                        <Route path="/division-reports" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><DivisionActivityReportPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/activity-report" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><ActivityReportPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/activity-report/:activityId" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><ActivityReportFormPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/activity-report/:activityId/new" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><ActivityReportFormPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/activity-report/:activityId/report/:reportId" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><ActivityReportFormPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/quarterly-report/:indicatorId" element={<ProtectedRoute reporterAllowed><QuarterlyReportFormPage /></ProtectedRoute>} />
                        <Route path="/my-outcomes" element={<Navigate to="/outcome" replace />} />
                        <Route path="/reporting/quarterly" element={<Navigate to="/reporting/quarterly-dashboard" replace />} />
                        <Route path="/reporting/quarterly-dashboard" element={<ProtectedRoute><ExecutionYearGate><QuarterlyDashboardPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/reporting/division-summary" element={<ProtectedRoute reporterAllowed><ExecutionYearGate><DivisionQuarterlySummaryPage /></ExecutionYearGate></ProtectedRoute>} />
                        <Route path="/reporting/donors" element={<ProtectedRoute><DonorsPage /></ProtectedRoute>} />
                        <Route path="/reporting/donors/:sourceId" element={<ProtectedRoute><DonorDetailPage /></ProtectedRoute>} />

                        {/* Reference */}
                        <Route path="/reference/strategic-plan" element={<ProtectedRoute><StrategicPlanPage /></ProtectedRoute>} />
                        <Route path="/reference/member-states" element={<ProtectedRoute><MemberStatesPage /></ProtectedRoute>} />
                        <Route path="/reference/partners" element={<ProtectedRoute><PartnersPage /></ProtectedRoute>} />
                        <Route path="/reference/org" element={<ProtectedRoute><OrgStructurePage /></ProtectedRoute>} />
                        <Route path="/reference/org/:code" element={<ProtectedRoute><OrgDivisionDetail /></ProtectedRoute>} />

                        {/* Governance */}
                        <Route path="/governance/inbox" element={<ProtectedRoute><GovernanceInbox /></ProtectedRoute>} />
                        <Route path="/governance/audit" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />

                        {/* Approvals — contributor report chain (spec §9.1) */}
                        <Route path="/approvals/inbox" element={<ProtectedRoute reviewerAllowed><MyApprovalInboxPage /></ProtectedRoute>} />
                        <Route path="/approvals/:instanceId" element={<ProtectedRoute reviewerAllowed><ApprovalReviewPage /></ProtectedRoute>} />

                        {/* Admin */}
                        <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
                        <Route path="/admin/settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />
                        <Route path="/admin/data-health" element={<ProtectedRoute reporterAllowed><DataHealthPage /></ProtectedRoute>} />
                        <Route path="/admin/adoption" element={<ProtectedRoute><AdoptionPage /></ProtectedRoute>} />
                        <Route path="/digest" element={<ProtectedRoute reporterAllowed><DigestPage /></ProtectedRoute>} />
                        <Route path="/admin/workflows" element={<ProtectedRoute><WorkflowTemplatesPage /></ProtectedRoute>} />
                        <Route path="/admin/workflows/:id" element={<ProtectedRoute><WorkflowTemplateDetailPage /></ProtectedRoute>} />
                        <Route path="/admin/rbac" element={<ProtectedRoute><RbacPermissionsPage /></ProtectedRoute>} />
                        <Route path="/admin/api-keys" element={<ProtectedRoute><ApiKeysPage /></ProtectedRoute>} />
                        <Route path="/admin/notifications" element={<ProtectedRoute><NotificationsAdminPage /></ProtectedRoute>} />
                        <Route path="/admin/notifications/subscriptions/new" element={<ProtectedRoute><NotificationSubscriptionFormPage /></ProtectedRoute>} />
                        <Route path="/admin/notifications/subscriptions/:id/edit" element={<ProtectedRoute><NotificationSubscriptionFormPage /></ProtectedRoute>} />
                        <Route path="/admin/notifications/test-send" element={<ProtectedRoute><NotificationTestSendPage /></ProtectedRoute>} />
                        <Route path="/admin/notifications/outbox" element={<ProtectedRoute><NotificationOutboxPage /></ProtectedRoute>} />

                        {/* Strategy / Portfolio */}
                        <Route path="/strategy" element={<Navigate to="/amert" replace />} />
                        <Route path="/strategy/plans/:id" element={<Navigate to="/amert" replace />} />
                        <Route path="/strategy/programs/:id" element={<Navigate to="/amert" replace />} />

                        {/* Redirects */}
                        <Route path="/" element={<SmartRedirect />} />
                        <Route path="/admin" element={<Navigate to="/admin/users" />} />
                        <Route path="/funding" element={<Navigate to="/budget" />} />
                        <Route path="/portfolio" element={<Navigate to="/amert" />} />
                        <Route path="/projects/:id" element={<Navigate to="/amert" replace />} />
                        <Route path="/reports" element={<Navigate to="/reporting/quarterly-dashboard" replace />} />
                        <Route path="/reporting" element={<Navigate to="/reporting/quarterly-dashboard" replace />} />

                        {/* Catch-all: any unmatched URL shows a 404 page, never a blank screen (CLAUDE.md §10) */}
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Suspense>
                </RoutedContent>
                </ActiveDivisionProvider>
                </PlanningYearProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;
