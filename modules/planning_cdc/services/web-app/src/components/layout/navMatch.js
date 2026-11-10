/**
 * Whether a nav item matches the current path (`exact` items match only themselves).
 *
 * @param {{path: string, exact?: boolean}} item
 * @param {string} pathname
 * @returns {boolean}
 * @example isItemActive({ path: '/admin' }, '/admin/users'); // true
 */
export function isItemActive(item, pathname) {
    if (item.exact) return pathname === item.path;
    return pathname === item.path || pathname.startsWith(item.path + '/');
}

/**
 * Whether any item (or child) of a nav group matches the current path.
 *
 * @param {{items: Array<object>}} group
 * @param {string} pathname
 * @returns {boolean}
 * @example isSectionActive({ items: [{ path: '/pirs' }] }, '/pirs/12'); // true
 */
export function isSectionActive(group, pathname) {
    return group.items.some(item => {
        if (item.children) return item.children.some(c => pathname === c.path || pathname.startsWith(c.path + '/'));
        return isItemActive(item, pathname);
    });
}

/**
 * Flatten the role-filtered nav groups into what the menus render: a plain
 * link, or a titled section of links. Same rules as the desktop bar.
 *
 * @param {Array<{section?: string, items: Array<object>}>} navItems
 * @returns {Array<{key: string, link?: object, title?: string, icon?: object, items?: Array<object>}>}
 * @example toMenuEntries([{ items: [{ label: 'Dashboard', path: '/dashboard' }] }]); // [{ key: '/dashboard', link: {...} }]
 */
export function toMenuEntries(navItems) {
    const entries = [];
    navItems.forEach((group, gi) => {
        if (!group.section) {
            group.items.forEach((item, ii) => {
                const key = item.path || `${gi}-${ii}`;
                if (item.children) entries.push({ key, title: item.label, icon: item.icon, items: item.children });
                else entries.push({ key, link: item });
            });
            return;
        }
        if (group.items.length === 1 && !group.items[0].children) {
            entries.push({ key: group.items[0].path || `${gi}`, link: group.items[0] });
            return;
        }
        entries.push({ key: `section-${group.section}`, title: group.section, icon: group.items[0]?.icon, items: group.items });
    });
    return entries;
}
