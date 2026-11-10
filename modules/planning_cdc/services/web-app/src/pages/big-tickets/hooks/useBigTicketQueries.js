import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { bigTicketsApi } from '@/services/bigTickets.api';

const KEY = 'big-tickets';
const LIST_STALE = 2 * 60_000;
const SEARCH_STALE = 5 * 60_000;

/**
 * Big Tickets of a year with the report of a quarter.
 *
 * @param {{ fiscal_year: string, quarter?: string, pillar_id?: string, lead?: string, progress?: string, q?: string }} params
 * @returns {import('@tanstack/react-query').UseQueryResult<{ fiscal_year: string, quarter: string, items: object[] }>}
 * @example const { data } = useBigTickets({ fiscal_year: '2026' });
 */
export function useBigTickets(params) {
  return useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: async () => (await bigTicketsApi.list(params)).data,
    staleTime: LIST_STALE,
    placeholderData: keepPreviousData,
  });
}

/**
 * One ticket: contributors, lines with the target of the year, reports of the year.
 *
 * @param {number|string|undefined} id
 * @param {string} fiscalYear
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 * @example const { data: ticket } = useBigTicket(id, '2026');
 */
export function useBigTicket(id, fiscalYear) {
  return useQuery({
    queryKey: [KEY, 'detail', String(id), fiscalYear],
    queryFn: async () => (await bigTicketsApi.getById(id, fiscalYear)).data,
    enabled: !!id && !!fiscalYear,
    staleTime: LIST_STALE,
    placeholderData: keepPreviousData,
  });
}

/**
 * Indicators of a year matching `q`, to link a line.
 *
 * @param {string} fiscalYear
 * @param {string} q
 * @returns {import('@tanstack/react-query').UseQueryResult<Array<{ id: number, code: string, title: string }>>}
 * @example const { data: options = [] } = useIndicatorOptions('2026', 'KM');
 */
export function useIndicatorOptions(fiscalYear, q) {
  return useQuery({
    queryKey: [KEY, 'indicator-options', fiscalYear, q],
    queryFn: async () => (await bigTicketsApi.indicatorOptions(fiscalYear, q)).data || [],
    enabled: !!fiscalYear,
    staleTime: SEARCH_STALE,
    placeholderData: keepPreviousData,
  });
}

/**
 * Create a ticket. Resolves to `{ id }`.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const create = useCreateBigTicket(); await create.mutateAsync(payload);
 */
export function useCreateBigTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (payload) => (await bigTicketsApi.create(payload)).data, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}

/**
 * Update a ticket and the targets of `payload.fiscal_year`.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const update = useUpdateBigTicket(); await update.mutateAsync({ id, payload });
 */
export function useUpdateBigTicket() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, payload }) => (await bigTicketsApi.update(id, payload)).data, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}

/**
 * Delete a ticket with its lines and reports.
 * @returns {import('@tanstack/react-query').UseMutationResult}
 * @example const remove = useDeleteBigTicket(); await remove.mutateAsync(id);
 */
export function useDeleteBigTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => (await bigTicketsApi.remove(id)).data,
    onSuccess: (_data, id) => {
      // Drop the deleted ticket first: refetching it would only 404.
      qc.removeQueries({ queryKey: [KEY, 'detail', String(id)] });
      return qc.invalidateQueries({ queryKey: [KEY, 'list'] });
    },
  });
}
