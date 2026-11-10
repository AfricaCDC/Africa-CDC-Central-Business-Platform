import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { budgetExecutionApi } from '@/services/budgetExecution.api';

const KEY = 'budget-execution';
// MIS figures change once a week: a few minutes of cache is plenty.
const STALE = 5 * 60_000;

/**
 * Totals and per-division execution for the user's scope (latest import of the year).
 *
 * @param {{ fiscal_year: string, division?: string }} params
 * @returns {import('@tanstack/react-query').UseQueryResult<{ fiscal_year: string, import: object|null, totals: object, divisions: object[] }>}
 * @example const { data } = useBudgetExecutionSummary({ fiscal_year: '2026' });
 */
export function useBudgetExecutionSummary(params) {
  return useQuery({
    queryKey: [KEY, 'summary', params],
    queryFn: async () => (await budgetExecutionApi.summary(params)).data,
    staleTime: STALE,
    placeholderData: keepPreviousData,
    enabled: !!params?.fiscal_year,
  });
}

/**
 * Broad activities with their execution.
 *
 * @param {{ fiscal_year: string, division?: string }} params
 * @returns {import('@tanstack/react-query').UseQueryResult<{ import: object|null, items: object[] }>}
 * @example const { data } = useBudgetExecutionActivities({ fiscal_year: '2026', division: 'EPR' });
 */
export function useBudgetExecutionActivities(params) {
  return useQuery({
    queryKey: [KEY, 'activities', params],
    queryFn: async () => (await budgetExecutionApi.activities(params)).data,
    staleTime: STALE,
    placeholderData: keepPreviousData,
    enabled: !!params?.fiscal_year,
  });
}

/**
 * One activity with its fund centers, funds and GL lines.
 *
 * @param {string|number|undefined} id
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<{ import: object, activity: object }>}
 * @example const { data } = useBudgetExecutionActivity(68, '2026');
 */
export function useBudgetExecutionActivity(id, fiscalYear) {
  return useQuery({
    queryKey: [KEY, 'detail', String(id), fiscalYear],
    queryFn: async () => (await budgetExecutionApi.activity(id, { fiscal_year: fiscalYear })).data,
    staleTime: STALE,
    enabled: !!id && !!fiscalYear,
  });
}

/**
 * Was the MIS export imported this week?
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<{ week_start: string, done: boolean, last_import: object|null }>}
 * @example const { data: status } = useImportStatus();
 */
export function useImportStatus() {
  return useQuery({ queryKey: [KEY, 'import-status'], queryFn: async () => (await budgetExecutionApi.importStatus()).data, staleTime: STALE });
}

/**
 * Imports of a year with their totals.
 *
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 * @example const { data: imports = [] } = useBudgetImports('2026');
 */
export function useBudgetImports(fiscalYear) {
  return useQuery({
    queryKey: [KEY, 'imports', fiscalYear],
    queryFn: async () => (await budgetExecutionApi.imports(fiscalYear)).data || [],
    staleTime: STALE,
    enabled: !!fiscalYear,
  });
}

/**
 * Fund centers of the latest import that no activity is linked to.
 *
 * @param {{ fiscal_year: string }} params
 * @returns {import('@tanstack/react-query').UseQueryResult<{ import: object|null, items: object[] }>}
 * @example const { data } = useUnlinkedFundCenters({ fiscal_year: '2026' });
 */
export function useUnlinkedFundCenters(params) {
  return useQuery({
    queryKey: [KEY, 'unlinked', params],
    queryFn: async () => (await budgetExecutionApi.unlinked(params)).data,
    staleTime: STALE,
    enabled: !!params?.fiscal_year,
  });
}

/**
 * Upload an MIS export (FormData: file, fiscal_year, as_of_date, notify).
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const upload = useImportMisExport(); await upload.mutateAsync(formData);
 */
export function useImportMisExport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (formData) => (await budgetExecutionApi.importExport(formData)).data, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}

/**
 * Delete an import.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const remove = useDeleteBudgetImport(); await remove.mutateAsync(3);
 */
export function useDeleteBudgetImport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id) => (await budgetExecutionApi.deleteImport(id)).data, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}

/**
 * Link a fund center to a broad activity.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const link = useLinkFundCenter(); await link.mutateAsync({ fund_center, plan_node_id, fiscal_year });
 */
export function useLinkFundCenter() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (payload) => (await budgetExecutionApi.link(payload)).data, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}
