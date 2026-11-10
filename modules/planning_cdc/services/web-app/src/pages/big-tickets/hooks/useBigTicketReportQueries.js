import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bigTicketsApi } from '@/services/bigTickets.api';

const KEY = 'big-tickets';
const STALE = 60_000;

/**
 * Report of a ticket for a quarter: ticket, report, pre-fill per line, and
 * whether the user can edit (ticket's business units, M&E) or review (M&E).
 *
 * @param {number|string|undefined} id
 * @param {string|undefined} quarter - Q1..Q4
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<{ ticket: object, report: object|null, prefill: object, can_edit: boolean, can_review: boolean }>}
 * @example const { data } = useBigTicketReport(29, 'Q3', '2026');
 */
export function useBigTicketReport(id, quarter, fiscalYear) {
  return useQuery({
    queryKey: [KEY, 'report', String(id), quarter, fiscalYear],
    queryFn: async () => (await bigTicketsApi.getReport(id, quarter, fiscalYear)).data,
    enabled: !!id && !!quarter && !!fiscalYear,
    staleTime: STALE,
  });
}

/**
 * Save (draft), submit, or correct (M&E) the report of a quarter.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const save = useSaveBigTicketReport(); await save.mutateAsync({ id, quarter, payload });
 */
export function useSaveBigTicketReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quarter, payload }) => (await bigTicketsApi.saveReport(id, quarter, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/**
 * M&E decision on a submitted report: approve, or return with a reason.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const decide = useDecideBigTicketReport(); await decide.mutateAsync({ id, quarter, fiscalYear, approve: true });
 */
export function useDecideBigTicketReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quarter, fiscalYear, approve, reason }) => (approve
      ? bigTicketsApi.approveReport(id, quarter, fiscalYear)
      : bigTicketsApi.rejectReport(id, quarter, fiscalYear, reason)).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
