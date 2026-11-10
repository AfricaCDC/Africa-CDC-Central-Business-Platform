// ── Logframe presentational rows ──
//
// Dumb UI components for the Logframe Matrix table (extracted from LogframePage
// to keep the page container under the 250-line limit). No data fetching, no
// business logic — they render the rows they are handed.
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { RESULT_LEVEL } from '@rbm/lib/enums';

/**
 * Status dot for an indicator: green when both a means-of-verification and a
 * target are set, amber when only one is, grey when neither.
 *
 * @param {{ ind: { means_of_verification?: string, data_source?: string, overall_target?: string|number } }} props
 * @returns {JSX.Element}
 */
export function StatusDot({ ind }) {
    const hasMov = !!(ind.means_of_verification || ind.data_source);
    const hasTarget = !!(ind.overall_target);
    if (hasMov && hasTarget) return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" title="Complete indicator" />;
    if (hasTarget || hasMov) return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title="Partial data" />;
    return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="Missing data" />;
}

// Badge styling per row level. The "GOAL" key is the display badge for the
// summary row (impact/outcome rollup) — a presentation label, not an entity
// type, so RESULT_LEVEL has no GOAL member.
const LEVEL_STYLE = {
    GOAL: { bg: 'bg-[#9F2241]', text: 'text-white' },
    [RESULT_LEVEL.OUTPUT]: { bg: 'bg-[#1A5632]', text: 'text-white' },
};

/**
 * A single intervention-logic row of the logframe (goal or output) with its
 * indicators, means of verification and assumptions.
 *
 * @param {{ level: string, code?: string, narrative?: string, indicators?: Array<object>, assumptions?: string, isGoal?: boolean }} props
 * @returns {JSX.Element}
 */
export function LogframeRow({ level, code, narrative, indicators, assumptions, isGoal }) {
    const s = LEVEL_STYLE[level] || LEVEL_STYLE[RESULT_LEVEL.OUTPUT];

    return (
        <tr className="border-b border-gray-200 align-top">
            {/* Level badge */}
            <td className="px-3 py-3 w-[90px] border-r border-gray-200">
                <div className={`${s.bg} ${s.text} text-[9px] font-bold px-2 py-0.5 rounded text-center uppercase tracking-widest`}>
                    {level}
                </div>
                {code && (
                    <div className="text-[10px] font-mono text-gray-400 mt-1 text-center">{code}</div>
                )}
            </td>

            {/* Intervention logic */}
            <td className="px-4 py-3 border-r border-gray-200 w-[30%]">
                <p className={`text-[12px] ${isGoal ? 'font-semibold text-gray-900' : 'text-gray-800'} leading-relaxed`}>
                    {narrative}
                </p>
            </td>

            {/* Indicators (OVI) */}
            <td className="px-4 py-3 border-r border-gray-200 w-[30%]">
                {indicators && indicators.length > 0 ? (
                    <div className="space-y-2">
                        {indicators.map((ind) => (
                            <div key={ind.id} className="flex gap-2 items-start">
                                <StatusDot ind={ind} />
                                <div className="flex-1 min-w-0">
                                    <Link
                                        to={`/plan/node/${ind.id}`}
                                        className="text-[11px] text-[#1A5632] hover:underline leading-snug block"
                                    >
                                        <span className="font-mono text-gray-400 mr-1">{ind.indicator_code}</span>
                                        {ind.indicator_name}
                                    </Link>
                                    {(ind.baseline_value || ind.overall_target) && (
                                        <div className="flex gap-3 mt-0.5 text-[10px] text-gray-500">
                                            {ind.baseline_value && <span>Baseline: <strong>{ind.baseline_value}</strong></span>}
                                            {ind.overall_target && <span>Target: <strong className="text-[#1A5632]">{ind.overall_target}</strong></span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <span className="text-[11px] text-gray-300 italic">No indicators linked</span>
                )}
            </td>

            {/* Means of Verification */}
            <td className="px-4 py-3 border-r border-gray-200 w-[20%]">
                {indicators && indicators.length > 0 ? (
                    <div className="space-y-1.5">
                        {indicators.map((ind) => (
                            <div key={ind.id} className="text-[11px] text-gray-500 leading-snug">
                                {ind.means_of_verification || ind.data_source || (
                                    <span className="text-gray-300 italic">—</span>
                                )}
                            </div>
                        ))}
                    </div>
                ) : <span className="text-gray-300">—</span>}
            </td>

            {/* Assumptions & Risks */}
            <td className="px-4 py-3 w-[18%]">
                {assumptions ? (
                    <p className="text-[11px] text-gray-500 leading-snug">{assumptions}</p>
                ) : (
                    <span className="text-[10px] text-gray-200 italic">To be filled</span>
                )}
            </td>
        </tr>
    );
}

/**
 * Sub-row linking out to the activities that roll up under an output.
 *
 * @param {{ outputCode?: string, outputId: number|string }} props
 * @returns {JSX.Element}
 */
export function ActivitiesSection({ outputCode, outputId }) {
    return (
        <tr className="border-b border-gray-100 align-top bg-gray-50/40">
            <td className="px-3 py-2 border-r border-gray-200">
                <div className="bg-[#58595B] text-white text-[9px] font-bold px-2 py-0.5 rounded text-center uppercase tracking-widest">
                    ACTIVITIES
                </div>
            </td>
            <td colSpan={4} className="px-4 py-2">
                <Link
                    to={`/tasks?outcome=${outputId}`}
                    className="text-[11px] text-[#1A5632] hover:underline flex items-center gap-1"
                >
                    View activities for {outputCode}
                    <ExternalLink className="w-3 h-3" />
                </Link>
            </td>
        </tr>
    );
}
