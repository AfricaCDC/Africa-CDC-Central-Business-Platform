import { CalendarClock } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { withBase } from '@/utils/basePath';

/**
 * Blocks an execution screen when the selected fiscal year has not started.
 *
 * Planning and execution answer different questions. A user may prepare FY2027
 * a year ahead, but there is nothing to report on a year that has not begun,
 * and the server refuses those writes outright (403 FISCAL_YEAR_NOT_STARTED).
 *
 * Before this gate, execution screens stayed anchored on the year in progress
 * while the top nav read FY2027 — so the quarterly dashboard showed FY2026
 * reports to someone who believed they were looking at FY2027. Showing the
 * wrong year's data under the right year's label is worse than showing none.
 *
 * Wrapped at the route level rather than inside each page: one place to read,
 * one place to change, and no page can forget it.
 *
 * @param {{children: React.ReactNode}} props
 * @returns {JSX.Element}
 * @example <ProtectedRoute><ExecutionYearGate><QuarterlyDashboardPage /></ExecutionYearGate></ProtectedRoute>
 */
export default function ExecutionYearGate({ children }) {
  const { planningYear, reportableYear, isFuturePlan, setPlanningYear } = usePlanningYear();

  if (!isFuturePlan) return children;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/dashboard' }, { label: `FY${planningYear}` }]}>
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <CalendarClock size={28} className="text-[#9F6F12] mb-4" />
        <h1 className="text-[15px] font-semibold text-[#1A5632] mb-2">
          FY{planningYear} has not started
        </h1>
        <p className="text-[11px] text-[#58595B] max-w-md mb-1">
          This section is for reporting on work that has been carried out. FY{planningYear} is
          still being planned, so there is nothing to report on it yet.
        </p>
        <p className="text-[11px] text-[#58595B] max-w-md mb-6">
          You can keep building the FY{planningYear} workplan: activities, indicators and budgets
          are all open.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlanningYear(reportableYear)}
            className="px-3 py-1.5 text-[11px] text-white bg-[#1A5632] hover:bg-[#14442A] border border-[#1A5632]"
          >
            Switch to FY{reportableYear}
          </button>
          <a
            href={withBase('/my-workplan')}
            className="px-3 py-1.5 text-[11px] text-[#1A5632] border border-[#1A5632] hover:bg-[#F5F7FA]"
          >
            Go to the FY{planningYear} workplan
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
}
