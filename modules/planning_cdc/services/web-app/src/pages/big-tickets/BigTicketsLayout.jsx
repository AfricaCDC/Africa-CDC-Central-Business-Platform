import DashboardLayout from '@/components/layout/DashboardLayout';

const ROOT = [{ label: 'Reporting' }, { label: 'Big Tickets', path: '/big-tickets' }];

/**
 * App shell of the Big Tickets pages with their breadcrumbs.
 *
 * @param {{ crumb?: string, children: React.ReactNode }} props - crumb: last breadcrumb (ticket code, "New"...)
 * @returns {JSX.Element}
 * @example <BigTicketsLayout crumb="BT18">...</BigTicketsLayout>
 */
export default function BigTicketsLayout({ crumb, children }) {
  return <DashboardLayout breadcrumbs={crumb ? [...ROOT, { label: crumb }] : ROOT}>{children}</DashboardLayout>;
}
