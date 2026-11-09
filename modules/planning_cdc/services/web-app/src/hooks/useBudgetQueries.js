import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../services/budget.api';

const NS = 'budget';
const STALE = 60_000;

/** Budget codes list for BudgetBasePage. */
export function useBudgetCodes(fiscalYear) {
  return useQuery({
    queryKey: [NS, 'codes', fiscalYear],
    queryFn: async () => {
      const res = await budgetApi.getCodes({ fiscal_year: fiscalYear });
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: STALE,
  });
}

function byBusinessUnit(codes) {
  const byBuMap = {};
  codes.forEach(c => {
    const bu = c.division_name || 'Unknown';
    if (!byBuMap[bu]) byBuMap[bu] = { bu_code: bu, total_amount: 0, line_count: 0 };
    byBuMap[bu].total_amount += Number(c.amount || 0) + Number(c.technical_assistance || 0);
    byBuMap[bu].line_count++;
  });
  return Object.values(byBuMap);
}

function toFundingOverview(sum, codes) {
  const t = sum.totals || {};
  const main = t.total_main || 0;
  return {
    totals: {
      total_amount: main + (t.total_ta || 0),
      total_main: main,
      total_ta: t.total_ta || 0,
      total_approved: main,
      total_gap: t.total_gap || 0,
      line_count: t.total_codes || 0,
    },
    byBu: byBusinessUnit(codes),
    byFund: (sum.by_fund || []).map(f => ({ fund_description: f.fund_description, total_amount: f.total, line_count: f.count })),
    codes,
  };
}

/**
 * Summary + codes for FundingPage, shaped into byBu / byFund.
 *
 * @param {string} fiscalYear
 * @param {string[]|null} [divisionCodes] - BU codes to keep (null = every BU)
 * @returns {import('@tanstack/react-query').UseQueryResult}
 * @example useFundingOverview('2027', ['SDI'])
 */
export function useFundingOverview(fiscalYear, divisionCodes = null) {
  // null = every BU; [] = a reader with no unit, who sees nothing.
  const params = { fiscal_year: fiscalYear, ...(divisionCodes && { division: divisionCodes.join(',') }) };
  return useQuery({
    queryKey: [NS, 'funding', fiscalYear, divisionCodes],
    queryFn: async () => {
      const noUnit = divisionCodes && !divisionCodes.length;
      const [sumR, linesR] = noUnit ? [{ data: {} }, { data: [] }] : await Promise.all([
        budgetApi.getSummary(params),
        budgetApi.getCodes(params),
      ]);
      return toFundingOverview(sumR.data || {}, Array.isArray(linesR.data) ? linesR.data : []);
    },
    staleTime: STALE,
  });
}

/** Inline-edit a budget code (optimistic cache patch). */
export function useUpdateBudgetCode(fiscalYear) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => budgetApi.updateCode(id, data),
    onSuccess: (res, { id }) => {
      const updated = res.data;
      qc.setQueryData([NS, 'codes', fiscalYear], (old) => {
        if (!Array.isArray(old)) return old;
        return old.map(c => (c.id === id ? { ...c, ...updated } : c));
      });
      qc.invalidateQueries({ queryKey: [NS, 'funding'] }); // Budget Overview totals
    },
  });
}

/** Delete a budget code (remove from cache). */
export function useDeleteBudgetCode(fiscalYear) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => budgetApi.deleteCode(id),
    onSuccess: (_res, id) => {
      qc.setQueryData([NS, 'codes', fiscalYear], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter(c => c.id !== id);
      });
      qc.invalidateQueries({ queryKey: [NS, 'funding'] }); // Budget Overview totals
    },
  });
}
