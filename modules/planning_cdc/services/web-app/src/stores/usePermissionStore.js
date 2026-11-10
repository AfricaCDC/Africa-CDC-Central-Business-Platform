/**
 * Zustand store for dynamic RBAC permissions.
 *
 * Loaded once at login via load(). Cached 5 minutes client-side.
 * Deny-by-default: if loading fails, all can() calls return false.
 *
 * @example
 * import usePermissionStore from '@/stores/usePermissionStore';
 * const { can, getScope, canAccessModule } = usePermissionStore();
 * if (can('workplan', 'create')) { ... }
 */

import { create } from 'zustand';
import api from '@/services/api';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const usePermissionStore = create((set, get) => ({
  /** @type {Object<string, string>} e.g. { 'workplan.read': 'all', 'tasks.create': 'own' } */
  permissions: {},

  /** @type {string[]} module codes the user has any permission on */
  modules: [],

  /** @type {number|null} timestamp of last successful load */
  loadedAt: null,

  /** @type {boolean} */
  loading: false,

  /**
   * Fetch permissions from backend. Cached for 5 minutes.
   * Called on login, on /auth/me refresh, and on window focus.
   */
  load: async () => {
    const state = get();
    if (state.loading) return;
    if (state.loadedAt && Date.now() - state.loadedAt < CACHE_TTL) return;

    set({ loading: true });
    try {
      const { data } = await api.get('/auth/me/permissions');
      const payload = data.data || data;
      set({
        permissions: payload.permissions || {},
        modules: payload.modules || [],
        loadedAt: Date.now(),
        loading: false,
      });
    } catch {
      // Deny-by-default: keep empty permissions on failure
      set({ loading: false, loadedAt: Date.now() });
    }
  },

  /**
   * Force-refresh permissions (bypass cache).
   * Use after admin role changes.
   */
  refresh: async () => {
    set({ loadedAt: null });
    await get().load();
  },

  /**
   * Check if current user can perform action on module.
   *
   * @param {string} module - e.g. 'workplan'
   * @param {string} action - e.g. 'create'
   * @returns {boolean}
   */
  can: (module, action) => {
    const key = `${module}.${action}`;
    return key in get().permissions;
  },

  /**
   * Get the scope of a permission.
   *
   * @param {string} module
   * @param {string} action
   * @returns {string|null} 'own' | 'division' | 'all' | null
   */
  getScope: (module, action) => {
    const key = `${module}.${action}`;
    return get().permissions[key] || null;
  },

  /**
   * Check if user has any permission on a module.
   *
   * @param {string} module - e.g. 'users', 'workplan'
   * @returns {boolean}
   */
  canAccessModule: (module) => {
    return get().modules.includes(module);
  },

  /**
   * Clear all permission state. Called on logout.
   */
  clear: () => set({ permissions: {}, modules: [], loadedAt: null, loading: false }),
}));

export default usePermissionStore;
