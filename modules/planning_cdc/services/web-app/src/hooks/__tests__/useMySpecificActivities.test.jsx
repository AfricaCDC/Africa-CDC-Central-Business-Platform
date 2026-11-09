// ── Specific activities list: published rows + the user's own pending rows ──

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/api', () => ({ default: { get: vi.fn() } }));

import api from '@/services/api';
import { NODE_TYPES } from '@rbm/lib/enums';
import { useMySpecificActivities } from '../usePlanNodeQueries';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useMySpecificActivities', () => {
  it('should add the user drafts, in-review and rejected activities to the published list, once each', async () => {
    api.get.mockImplementation((url, { params } = {}) => {
      if (url === '/admin/division-codes') return Promise.resolve({ data: [] });
      if (params.node_type !== NODE_TYPES.SPECIFIC_ACTIVITY) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: params.mine === 'true'
          ? [{ id: 2, status: 'APPROVED' }, { id: 7, status: 'DRAFT' }, { id: 8, status: 'REJECTED' }]
          : [{ id: 1, status: 'APPROVED' }, { id: 2, status: 'APPROVED' }],
      });
    });
    const { result } = renderHook(() => useMySpecificActivities('2027'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.specifics.map((s) => s.id).sort()).toEqual([1, 2, 7, 8]);
    expect(api.get).toHaveBeenCalledWith('/plan-nodes', { params: { node_type: NODE_TYPES.SPECIFIC_ACTIVITY, fiscal_year: '2027', mine: 'true' } });
  });
});
