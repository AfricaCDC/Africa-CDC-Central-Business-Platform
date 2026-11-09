import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useLogframeData } from '@/hooks/usePlanNodeQueries';
import { Loader2, Printer, Info } from 'lucide-react';
import { RESULT_LEVEL } from '@rbm/lib/enums';
import { LogframeRow, ActivitiesSection } from './logframe/LogframeRows';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

// "GOAL" is the logframe's display badge for the summary row (impact/outcome
// rollup). It is a presentation label, not an entity type — RESULT_LEVEL has no
// GOAL member — so the P-31 entity-string rule does not apply here.
// eslint-disable-next-line no-restricted-syntax -- presentation badge label, not an ENTITY_TYPE (CHARTER §11)
const GOAL_LEVEL = 'GOAL';

/**
 * Page that renders the AMERT log frame as a printable table for the active
 * fiscal year, with rows for each tier of the results hierarchy.
 *
 * @returns {JSX.Element}
 */
export default function LogframePage() {
    const printRef = useRef();
    const { planningYear: fiscalYear } = usePlanningYear();
    const { data: raw, isLoading: loading } = useLogframeData(fiscalYear);

    const rows = useMemo(() => {
        if (!raw) return [];
        // useFullPlanData returns { impact, t1, areas, t2, t3, t4, ... }. The
        // outcome indicators that hang under an OUTCOME_AREA live across tiers
        // 2-4, so the per-area indicator list is the union of t2/t3/t4.
        const { impact, t1 = [], areas = [], t2 = [], t3 = [], t4 = [] } = raw;
        const allInds = [...t2, ...t3, ...t4];

        const mapInd = (i) => ({
            id: i.id,
            indicator_code: i.code,
            indicator_name: i.title,
            baseline_value: i.baseline_numeric ?? '—',
            overall_target: i.target_y1_numeric ?? '—',
            data_source: i.uom?.label || null,
            means_of_verification: null,
        });

        const goalRow = impact ? {
            level: RESULT_LEVEL.OUTCOME,
            code: 'OC',
            narrative: impact.title,
            indicators: t1.map(mapInd),
            assumptions: [],
        } : null;

        const outputRows = areas
            .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
            .map(area => ({
                level: RESULT_LEVEL.OUTPUT,
                id: area.id,
                code: area.code,
                narrative: area.title,
                indicators: allInds.filter(i => i.parent_id === area.id).map(mapInd),
                assumptions: [],
            }));

        return [goalRow, ...outputRows].filter(Boolean);
    }, [raw]);

    const handlePrint = () => window.print();

    const goalRow = rows.find(r => r.level === RESULT_LEVEL.OUTCOME);
    const outputRows = rows.filter(r => r.level === RESULT_LEVEL.OUTPUT);

    const totalIndicators = rows.reduce((acc, r) => acc + (r.indicators?.length || 0), 0);
    const completeIndicators = rows.reduce((acc, r) => {
        return acc + (r.indicators || []).filter(i => (i.means_of_verification || i.data_source) && i.overall_target).length;
    }, 0);
    const completionPct = totalIndicators > 0 ? Math.round((completeIndicators / totalIndicators) * 100) : 0;

    return (
        <DashboardLayout title="Logframe Matrix">
            <div className="space-y-4">

                {/* Header bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
                    <div>
                        <h1 className="text-[15px] font-semibold text-gray-900">Logframe Matrix</h1>
                        <p className="text-[12px] text-gray-400 mt-0.5">
                            Planning document — Intervention logic, indicators, MoV and assumptions
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Completion indicator */}
                        {!loading && totalIndicators > 0 && (
                            <div className="text-[11px] text-gray-500 border border-gray-200 rounded px-3 py-1.5 flex items-center gap-2">
                                <div className="flex gap-1 items-center">
                                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                    <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                                </div>
                                <span>{completeIndicators}/{totalIndicators} complete indicators ({completionPct}%)</span>
                            </div>
                        )}
                        <button
                            onClick={handlePrint}
                            className="h-8 px-3 text-[12px] font-medium border border-gray-200 rounded-md hover:bg-gray-50 flex items-center gap-1.5 text-gray-600"
                        >
                            <Printer className="w-3.5 h-3.5" /> Print
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-gray-200 rounded-lg text-[13px] text-gray-400">
                        Aucun résultat défini.
                    </div>
                ) : (
                    <div ref={printRef} className="bg-white rounded-lg border border-gray-200 overflow-hidden">

                        {/* Document title */}
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Africa CDC · Strategic Plan</p>
                                <h2 className="text-[14px] font-bold text-gray-900">Logframe Matrix — FY2026</h2>
                                {goalRow && (
                                    <p className="text-[12px] text-gray-500 mt-0.5 max-w-2xl">{goalRow.narrative}</p>
                                )}
                            </div>
                            <div className="text-right text-[10px] text-gray-400">
                                <div>{outputRows.length} Outputs</div>
                                <div>{totalIndicators} Indicators</div>
                                <div className="mt-1 font-semibold text-gray-600">FY2026</div>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="px-6 py-2 border-b border-gray-100 bg-white flex items-center gap-4 text-[10px] text-gray-400 print:hidden">
                            <span className="font-semibold text-gray-500">Legend:</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Complete (MoV + Target)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Partial data</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Missing data</span>
                            <span className="flex items-center gap-1 ml-auto"><Info className="w-3 h-3" /> Click an indicator to view its PIRS sheet</span>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[900px]">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                                        <th className="px-3 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 w-[90px]">Level</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 w-[30%]">Intervention Logic</th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 w-[30%]">
                                            Objectively Verifiable Indicators (OVI)
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-200 w-[20%]">
                                            Means of Verification (MoV)
                                        </th>
                                        <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest w-[18%]">
                                            Assumptions & Risks
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* GOAL row */}
                                    {goalRow && (
                                        <LogframeRow
                                            level={GOAL_LEVEL}
                                            code={goalRow.code}
                                            narrative={goalRow.narrative}
                                            indicators={goalRow.indicators}
                                            assumptions={null}
                                            isGoal
                                        />
                                    )}

                                    {/* OUTPUTS — each with its own indicators */}
                                    {outputRows.map((out) => (
                                        <React.Fragment key={out.id}>
                                            <LogframeRow
                                                level={RESULT_LEVEL.OUTPUT}
                                                code={out.code}
                                                narrative={out.narrative}
                                                indicators={out.indicators}
                                                assumptions={null}
                                                isGoal={false}
                                            />
                                            <ActivitiesSection outputCode={out.code} outputId={out.id} />
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                            <span>Africa CDC — Results-Based Management Platform</span>
                            <span>Generated on {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                        </div>
                    </div>
                )}

                {/* Info box */}
                {!loading && rows.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-[12px] text-blue-700 flex gap-3 items-start print:hidden">
                        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <strong>Assumptions column empty?</strong> Assumptions are the external conditions required for the intervention logic to hold.
                            They can be added in each result's detail page (via <Link to="/outcome" className="underline">Outcomes</Link> or <Link to="/impact" className="underline">Impacts</Link>).
                        </div>
                    </div>
                )}
            </div>

            {/* Print styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print\\:hidden { display: none !important; }
                    #root > div { background: white; }
                }
            `}</style>
        </DashboardLayout>
    );
}
