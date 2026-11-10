// ── useDismissDispute (activity ownership disputes) ──
//
// D-20260818-01: POST /reporting/activity-reports is create-only, so the old
// "post a DRAFT and let the upsert flip the NA row" dismissal now inserts a
// junk draft and leaves the dispute standing. The hook must call the dedicated
// admin endpoint instead — and keep filtering the row out of the merged
// disputes cache by (id, dispute_type).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { STATUSES } from '@rbm/lib/enums';

vi.mock('../../../services/reviewSubmissions.api', () => ({
  reviewSubmissionsApi: {
    dismissActivityDispute: vi.fn().mockResolvedValue({ data: { deleted: 1 } }),
    createActivityReport: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import { reviewSubmissionsApi } from '../../../services/reviewSubmissions.api';
import { useDismissDispute } from '../hooks/useReviewSubmissionsQueries';

const DISPUTES_KEY = ['review-activity-reports', STATUSES.NOT_APPLICABLE];

// eslint-disable-next-line no-restricted-syntax -- page-local dispute_type tag mirroring the hook fixture, not an ENTITY_TYPES reference
const ACTIVITY = 'ACTIVITY';
// eslint-disable-next-line no-restricted-syntax -- same page-local tag, see above
const INDICATOR = 'INDICATOR';

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

let queryClient;

beforeEach(() => {
  vi.clearAllMocks();
  reviewSubmissionsApi.dismissActivityDispute.mockResolvedValue({ data: { deleted: 1 } });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe('useDismissDispute', () => {
  it('should call the dedicated dismiss endpoint with the plan_node_id', async () => {
    const { result } = renderHook(() => useDismissDispute(), { wrapper: makeWrapper(queryClient) });

    await result.current.mutateAsync({ row: { id: 9, plan_node_id: 42, dispute_type: ACTIVITY, quarter: 'Q3', fiscal_year: '2026' } });

    expect(reviewSubmissionsApi.dismissActivityDispute).toHaveBeenCalledWith(42);
  });

  it('should NOT create an activity report (create-only POST would insert a junk draft)', async () => {
    const { result } = renderHook(() => useDismissDispute(), { wrapper: makeWrapper(queryClient) });

    await result.current.mutateAsync({ row: { id: 9, plan_node_id: 42, dispute_type: ACTIVITY, quarter: 'Q3', fiscal_year: '2026' } });

    expect(reviewSubmissionsApi.createActivityReport).not.toHaveBeenCalled();
  });

  it('should filter the dismissed row out of the cache by (id, dispute_type)', async () => {
    // An activity row and an indicator row can share an id — the two tables are
    // independent sequences — so only the matching pair must be removed.
    queryClient.setQueryData(DISPUTES_KEY, [
      { id: 9, plan_node_id: 42, dispute_type: ACTIVITY },
      { id: 9, plan_node_id: 77, dispute_type: INDICATOR },
    ]);
    const { result } = renderHook(() => useDismissDispute(), { wrapper: makeWrapper(queryClient) });

    await result.current.mutateAsync({ row: { id: 9, plan_node_id: 42, dispute_type: ACTIVITY } });

    await waitFor(() => expect(queryClient.getQueryData(DISPUTES_KEY)).toEqual([
      { id: 9, plan_node_id: 77, dispute_type: INDICATOR },
    ]));
  });

  it('should surface a failing dismissal instead of clearing the cache', async () => {
    reviewSubmissionsApi.dismissActivityDispute.mockRejectedValueOnce(new Error('Forbidden'));
    queryClient.setQueryData(DISPUTES_KEY, [{ id: 9, plan_node_id: 42, dispute_type: ACTIVITY }]);
    const { result } = renderHook(() => useDismissDispute(), { wrapper: makeWrapper(queryClient) });

    await expect(
      result.current.mutateAsync({ row: { id: 9, plan_node_id: 42, dispute_type: ACTIVITY } }),
    ).rejects.toThrow('Forbidden');
    expect(queryClient.getQueryData(DISPUTES_KEY)).toHaveLength(1);
  });
});
