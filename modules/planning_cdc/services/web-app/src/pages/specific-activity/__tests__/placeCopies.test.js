// ── One activity per place (D-20261028-01) ──

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/planNodes.api', () => ({
  planNodesApi: { createSpecific: vi.fn(), submitSpecific: vi.fn() },
}));

import { planNodesApi } from '@/services/planNodes.api';
import { titleForPlace, createPlaceCopies } from '../placeCopies';

beforeEach(() => {
  vi.clearAllMocks();
  planNodesApi.createSpecific.mockImplementation((p) => Promise.resolve({ data: { id: p.location === 'Uganda' ? 11 : 12, ...p } }));
  planNodesApi.submitSpecific.mockResolvedValue({});
});

describe('titleForPlace', () => {
  it('should append the place once', () => {
    expect(titleForPlace('Deployment mission', 'Rwanda')).toBe('Deployment mission — Rwanda');
    expect(titleForPlace('Deployment mission — Rwanda', 'Rwanda')).toBe('Deployment mission — Rwanda');
  });
});

describe('createPlaceCopies', () => {
  it('should create one activity per place with its own budget and cost lines', async () => {
    const savePlanning = vi.fn().mockResolvedValue();
    const payloadFor = (place) => ({ title: 'Deployment mission', budget_main: place === 'Uganda' ? 500 : 800 });
    const { created, failed } = await createPlaceCopies({ payloadFor, places: ['Uganda', 'Rwanda'], savePlanning, submit: false });
    expect(failed).toEqual([]);
    expect(created).toHaveLength(2);
    expect(planNodesApi.createSpecific).toHaveBeenCalledWith({ title: 'Deployment mission — Uganda', budget_main: 500, location: 'Uganda' });
    expect(planNodesApi.createSpecific).toHaveBeenCalledWith({ title: 'Deployment mission — Rwanda', budget_main: 800, location: 'Rwanda' });
    expect(savePlanning).toHaveBeenCalledWith(11, 'Uganda');
    expect(planNodesApi.submitSpecific).not.toHaveBeenCalled();
  });

  it('should submit the copies when the main activity is submitted', async () => {
    await createPlaceCopies({ payloadFor: () => ({ title: 'T' }), places: ['Uganda'], savePlanning: vi.fn().mockResolvedValue(), submit: true });
    expect(planNodesApi.submitSpecific).toHaveBeenCalledWith(11);
  });

  it('should report a place that failed and carry on with the others', async () => {
    planNodesApi.createSpecific.mockRejectedValueOnce({ response: { data: { message: 'No permission' } } });
    const { created, failed } = await createPlaceCopies({
      payloadFor: () => ({ title: 'T' }), places: ['Uganda', 'Rwanda'], savePlanning: vi.fn().mockResolvedValue(), submit: false,
    });
    expect(failed).toEqual([{ place: 'Uganda', message: 'No permission' }]);
    expect(created).toHaveLength(1);
  });
});
