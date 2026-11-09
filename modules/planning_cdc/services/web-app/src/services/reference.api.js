// ── Reference API service ──
// Read-only suggestion lists for free-text comboboxes (funding sources, grants).
// All URLs live here (CHARTER §8) — never inline in hooks/components.

import httpClient from './api';

export const referenceApi = {
  /**
   * Suggestion values for a reference type (curated ∪ already-used).
   *
   * @param {string} type - a REFERENCE_TYPES value ('FUNDING_SOURCE' | 'GRANT')
   * @returns {Promise<import('axios').AxiosResponse<{ success: boolean, data: string[] }>>}
   */
  values: (type) => httpClient.get('/reference/values', { params: { type } }),
};
