import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/myTasks.api', () => ({ myTasksApi: { list: vi.fn() } }));

import { myTasksApi } from '@/services/myTasks.api';
import { useMyTasks } from '../useMyTasks';

const wrapper = ({ children }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => vi.clearAllMocks());

describe('useMyTasks', () => {
  it('should return the tasks of /me/tasks', async () => {
    myTasksApi.list.mockResolvedValue({ data: { tasks: [{ id: 'a', title: 'Approve 2 activities', count: 2 }] } });
    const { result } = renderHook(() => useMyTasks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'a', title: 'Approve 2 activities', count: 2 }]);
  });

  it('should return an empty list when the answer has no tasks', async () => {
    myTasksApi.list.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useMyTasks(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
