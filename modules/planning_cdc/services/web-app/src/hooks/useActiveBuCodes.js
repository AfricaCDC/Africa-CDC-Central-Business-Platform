import { useMemo } from 'react';
import { RBAC_ACTIONS, RBAC_SCOPES } from '@rbm/lib/rbac';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * BU codes a Business Unit view (Aggregates › PIRS, Budget) filters on, or
 * null for « every BU ». A BU picked in the BU selector always filters; on
 * « All my divisions » only a reader whose scope on `module` is all (M&E,
 * administrators) sees every BU, the others see their own units (D-20261105-06).
 *
 * @param {string} module - RBAC module read on the page, e.g. RBAC_MODULES.BUDGET
 * @returns {string[]|null} upper-cased codes, sorted; null = no filter
 * @example const codes = useActiveBuCodes(RBAC_MODULES.PIRS); // ['SDI'] or null
 */
export function useActiveBuCodes(module) {
  const { activeCode, activeCodes } = useActiveDivision();
  const { getScope } = usePermissions();
  const seesAll = getScope(module, RBAC_ACTIONS.READ) === RBAC_SCOPES.ALL;
  return useMemo(
    () => (activeCode || !seesAll ? [...activeCodes].sort() : null),
    [activeCode, activeCodes, seesAll],
  );
}
