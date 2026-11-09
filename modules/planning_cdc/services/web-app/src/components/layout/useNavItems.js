import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getNavForUser, BLOCKS } from './navConfig';
import { useViewableCountries } from '@/pages/country-workplan/hooks/useCountryWorkplanQueries';

/**
 * Nav groups for the logged-in user: the role tree from `navConfig`, with
 * items whose RBAC module the user cannot access removed (admins see all).
 * Shared by the desktop bar (MainNav) and the burger menu (MobileNav).
 *
 * @returns {Array<{section?: string, items: Array<object>}>}
 * @throws {never}
 * @example const navItems = useNavItems();
 */
/** Nav with the Country Workplan entry appended to the first group (once). */
function withCountryWorkplan(nav) {
    const item = BLOCKS.countryWorkplan;
    if (!nav.length || nav.some(g => g.items.some(i => i.path === item.path))) return nav;
    return [{ ...nav[0], items: [...nav[0].items, item] }, ...nav.slice(1)];
}

/** Nav with the User guides entry last, as a flat link, for every user. */
function withUserGuides(nav) {
    const item = BLOCKS.userGuides;
    if (nav.some(g => g.items.some(i => i.path === item.path))) return nav;
    return [...nav, { items: [item] }];
}

export default function useNavItems() {
    const { user } = useAuth();
    const { can, canAccessModule, isAdmin } = usePermissions();
    const rawNav = getNavForUser(user?.roles);
    // Country Workplan: only for a user who can see at least one country (D-20261028-01).
    const { data: countries = [] } = useViewableCountries(!!user);

    return useMemo(() => {
        const nav = withUserGuides(countries.length ? withCountryWorkplan(rawNav) : rawNav);
        if (isAdmin) return nav;
        // `action` items follow their route guard (e.g. Review Submissions needs quarterly_report:approve).
        const allowed = (item) => !item.module || (item.action ? can(item.module, item.action) : canAccessModule(item.module));
        // A menu keeps the children the user may open; an empty menu disappears.
        const filterItem = (item) => (item.children ? { ...item, children: item.children.filter(allowed) } : item);
        return nav.map(group => ({
            ...group,
            items: group.items.filter(allowed).map(filterItem).filter(item => !item.children || item.children.length),
        })).filter(group => group.items.length > 0);
    }, [rawNav, can, canAccessModule, isAdmin, countries.length]);
}
