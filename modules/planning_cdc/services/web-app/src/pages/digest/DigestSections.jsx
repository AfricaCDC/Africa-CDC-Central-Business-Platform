import { Link } from 'react-router-dom';
import { STATUS_LABELS } from '@rbm/lib/enums';

const TH = 'px-3 py-1.5 text-left text-[10px] font-semibold uppercase text-gray-500';
const TD = 'px-3 py-1.5 text-[11px] text-gray-800';

function Card({ title, children }) {
  return (
    <section className="border border-gray-200 bg-white break-inside-avoid">
      <h2 className="border-b border-gray-100 px-4 py-2 text-[12px] font-semibold text-gray-900">{title}</h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function Counts({ rows, extra }) {
  if (!rows.length && !extra) return <p className="text-[11px] text-gray-500">None.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((r) => (
        <span key={r.status} className="border border-gray-200 px-2 py-1 text-[11px] text-gray-700">
          {STATUS_LABELS[r.status] || r.status} <strong className="text-gray-900">{r.count}</strong>
        </span>
      ))}
      {extra}
    </div>
  );
}

function ItemTable({ items, columns, empty }) {
  if (!items.length) return <p className="text-[11px] text-gray-500">{empty}</p>;
  return (
    <table className="w-full">
      <thead><tr>{columns.map((c) => <th key={c.label} className={TH}>{c.label}</th>)}</tr></thead>
      <tbody>
        {items.map((i) => (
          <tr key={`${i.type_label || ''}${i.code}${i.since || i.start_day || ''}`} className="border-t border-gray-50">
            {columns.map((c) => <td key={c.label} className={TD}>{c.render(i)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const itemLink = (i) => <Link to={`/plan/node/${i.link_id || i.id}`} className="font-mono text-[#1A5632] hover:underline">{i.code}</Link>;

function BudgetCard({ budget }) {
  if (!budget) return <Card title="Budget execution"><p className="text-[11px] text-gray-500">No budget execution imported for this year yet.</p></Card>;
  return (
    <Card title={`Budget execution (figures as at ${budget.as_of})`}>
      <ItemTable items={budget.units} empty="No budget code linked to the activities of these units."
        columns={[
          { label: 'BU', render: (u) => <span><strong>{u.code}</strong> {u.name}</span> },
          { label: 'Execution', render: (u) => `${u.execution_pct ?? 0} %` },
          { label: 'To look at', render: (u) => (u.flagged === 1 ? '1 activity' : u.flagged ? `${u.flagged} activities` : '') },
        ]} />
    </Card>
  );
}

/**
 * The sections of a directorate digest (D-20261105-15), print-ready.
 *
 * @param {{ digest: object }} props - GET /api/digest
 * @returns {JSX.Element}
 * @example <DigestSections digest={data} />
 */
export default function DigestSections({ digest: d }) {
  return (
    <div className="space-y-3">
      <Card title={`Specific activities ${d.fiscal_year}`}><Counts rows={d.specifics} /></Card>
      <Card title={`Waiting more than ${d.waiting_days} days for a decision: ${d.waiting.count}`}>
        <ItemTable items={d.waiting.items} empty="Nothing waits that long."
          columns={[
            { label: 'Item', render: (i) => i.type_label },
            { label: 'Code', render: itemLink },
            { label: 'Title', render: (i) => i.title },
            { label: 'BU', render: (i) => i.unit_code },
            { label: 'Since', render: (i) => i.since },
          ]} />
      </Card>
      <Card title={`High-risk activities: ${d.high_risk.count}`}>
        <ItemTable items={d.high_risk.items} empty="No high-risk activity."
          columns={[
            { label: 'Code', render: itemLink },
            { label: 'Title', render: (i) => i.title },
            { label: 'BU', render: (i) => i.unit_code },
            { label: 'Starts', render: (i) => i.start_day || '' },
          ]} />
      </Card>
      <Card title={`Activity reports ${d.quarter}`}>
        <Counts rows={d.activity_reports.by_status}
          extra={<span className="border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Not started <strong className="text-gray-900">{d.activity_reports.not_started}</strong></span>} />
      </Card>
      <Card title={`Indicator reports ${d.quarter}`}>
        <p className="mb-2 text-[11px] text-gray-600">{d.indicator_reports.owned} T3/T4 indicators owned by these units.</p>
        <Counts rows={d.indicator_reports.by_status} />
      </Card>
      <BudgetCard budget={d.budget} />
    </div>
  );
}
