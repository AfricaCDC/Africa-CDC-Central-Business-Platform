import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo } from 'react';
import { ROLES } from '@rbm/lib/roles';
import usePermissionStore from '@/stores/usePermissionStore';

/**
 * usePermissions hook — checks the logged-in user's permissions.
 *
 * Supports two calling styles for `can()`:
 *   can('workplan', 'create')     — new two-arg style (module + action)
 *   can('plans.create')           — legacy single-string style
 *
 * Returns:
 *  - can(moduleOrPerm, action?) => boolean
 *  - canAny(...permissions) => boolean
 *  - getScope(module, action) => 'own' | 'division' | 'all' | null
 *  - canAccessModule(module) => boolean
 *  - hasRole(roleCode) => boolean
 *  - isAdmin => boolean
 *  - permissions => object or string[]
 *  - roles => string[]
 */
export function usePermissions() {
  const { user } = useAuth();
  const store = usePermissionStore();

  // Load permissions on mount if user is authenticated
  useEffect(() => {
    if (user?.id && !store.loadedAt) {
      store.load();
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const roles = user?.roles || [];
    const isAdmin = roles.includes(ROLES.SYSTEM_ADMIN);
    const storeReady = !!store.loadedAt;

    // Legacy fallback: old user.permissions flat array
    const legacyPerms = user?.permissions || [];
    const legacySet = new Set(Array.isArray(legacyPerms) ? legacyPerms : Object.keys(legacyPerms));

    return {
      /**
       * Check if user has permission.
       * Two-arg: can('workplan', 'create')
       * One-arg: can('plans.create')  (legacy)
       */
      can: (moduleOrPerm, action) => {
        if (isAdmin) return true;
        if (storeReady) {
          if (action) return store.can(moduleOrPerm, action);
          return moduleOrPerm in store.permissions;
        }
        // Fallback to legacy
        const key = action ? `${moduleOrPerm}.${action}` : moduleOrPerm;
        return legacySet.has(key);
      },

      /**
       * Check if user has any of the given permissions.
       * canAny('plans.create', 'plans.edit')
       */
      canAny: (...perms) => {
        if (isAdmin) return true;
        if (storeReady) return perms.some(p => p in store.permissions);
        return perms.some(p => legacySet.has(p));
      },

      /**
       * Get the scope for a permission.
       * getScope('workplan', 'read') => 'all' | 'division' | 'own' | null
       */
      getScope: (module, action) => {
        if (isAdmin) return 'all';
        if (storeReady) return store.getScope(module, action);
        return null;
      },

      /**
       * Check if user can access a module (has any permission on it).
       * canAccessModule('users') => false for FOCAL_PERSON
       */
      canAccessModule: (module) => {
        if (isAdmin) return true;
        if (storeReady) return store.canAccessModule(module);
        return true; // permissive fallback before store loads
      },

      hasRole: (role) => roles.includes(role),
      isAdmin,
      permissions: storeReady ? store.permissions : legacyPerms,
      roles,
    };
  }, [user, store.permissions, store.loadedAt, store.loading]);
}
