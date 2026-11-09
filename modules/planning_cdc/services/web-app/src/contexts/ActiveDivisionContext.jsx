/* eslint-disable cdc-rbm/no-useeffect-fetch, no-unused-vars, react-hooks/exhaustive-deps --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * T-42..T-49 (TanStack Query migration). Do NOT add new violations; this pragma is a ceiling.
 */
/**
 * Active division selector shared across pages that filter data by
 * division (FocalDashboard, MyWorkplan, MyBroads, MyIndicators, etc.).
 *
 * - Fetches /me/divisions on mount to know the full scope of the user.
 * - Exposes `activeDivision` (null = "all my divisions" aggregated view).
 * - Persists the selection in localStorage so it survives a refresh.
 * - The top-nav DivisionSwitcher is the only UI that writes the value.
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';

const STORAGE_KEY = 'rbm.activeDivision';

const ActiveDivisionContext = createContext({
  divisions: [],
  directorates: [],
  activeDivision: null,
  setActiveDivision: () => {},
  loaded: false,
  activeCodes: new Set(),
});

export function ActiveDivisionProvider({ children }) {
  const { user } = useAuth();
  const [divisions, setDivisions] = useState([]);
  const [directorates, setDirectorates] = useState([]);
  const [activeCode, setActiveCode] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setLoaded(true); return; }
    api.get('/me/divisions')
      .then((r) => {
        const divs = Array.isArray(r.data?.divisions) ? r.data.divisions : [];
        const dirs = Array.isArray(r.data?.directorates) ? r.data.directorates : [];
        setDivisions(divs);
        setDirectorates(dirs);

        // Pick a sensible default:
        //   1. saved selection if still present in scope
        //   2. user.division_code if present in scope
        //   3. first directorate
        //   4. first division
        //   5. null → "all my divisions"
        const stored = localStorage.getItem(STORAGE_KEY);
        const has = (code) => divs.some((d) => d.code === code);
        let next = null;
        if (stored && has(stored)) next = stored;
        else if (user.division_code && has(user.division_code)) next = user.division_code;
        else if (divs.length === 1) next = divs[0].code;
        setActiveCode(next);
      })
      .catch(() => { setDivisions([]); setDirectorates([]); })
      .finally(() => setLoaded(true));
  }, [user?.id]);

  const setActiveDivision = (code) => {
    setActiveCode(code);
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  };

  // Resolve the active selection to a Set of codes (upper-cased) the
  // pages should filter against. Always expands through alias relations
  // in both directions — so selecting HRMD (alias_of=HR) matches data
  // stored under HR, and selecting HR matches data under HRMD too. A
  // directorate selection additionally expands to every child division
  // that chains to it.
  const activeCodes = useMemo(() => {
    const raw = new Set();
    if (!activeCode) {
      // "All my divisions" → every code in scope
      divisions.forEach((d) => raw.add(d.code));
    } else {
      raw.add(activeCode);
      const active = divisions.find((d) => d.code === activeCode);
      if (active && active.level_type === ORG_LEVEL_TYPES.DIRECTORATE) {
        divisions.forEach((d) => {
          if (d.code === activeCode) return;
          if (d.parent_code === activeCode) raw.add(d.code);
        });
      }
    }
    // Alias expansion: for every code in `raw`, add its alias siblings.
    // Walk until fixed point so A → B → C chains all resolve.
    let changed = true;
    while (changed) {
      changed = false;
      for (const code of Array.from(raw)) {
        const d = divisions.find((x) => x.code === code);
        if (!d) continue;
        if (d.alias_of && !raw.has(d.alias_of)) { raw.add(d.alias_of); changed = true; }
        // inbound: any division whose alias_of points at this one
        divisions.forEach((x) => {
          if (x.alias_of === code && !raw.has(x.code)) { raw.add(x.code); changed = true; }
        });
      }
    }
    // Normalise to upper-case for case-insensitive matching
    return new Set(Array.from(raw).map((c) => String(c).toUpperCase()));
  }, [activeCode, divisions]);

  const activeDivision = divisions.find((d) => d.code === activeCode) || null;

  const value = {
    divisions,
    directorates,
    activeDivision,
    activeCode,
    setActiveDivision,
    loaded,
    activeCodes,
  };

  return (
    <ActiveDivisionContext.Provider value={value}>
      {children}
    </ActiveDivisionContext.Provider>
  );
}

export function useActiveDivision() {
  return useContext(ActiveDivisionContext);
}
