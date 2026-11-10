import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import ReactDOM from 'react-dom';
import { isSectionActive } from './navMatch';
import useNavItems from './useNavItems';
import { navTourKey } from '@/config/onboardingTour';
import HelpLink from './HelpLink';

/**
 * Horizontal main navigation bar.
 * - Top-level items render as flat links.
 * - Sections (with section name) render as a dropdown trigger.
 * - Items with children also become dropdowns.
 */

function Dropdown({ label, Icon, items, active }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const btnRef = useRef(null);
    const [coords, setCoords] = useState(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    useEffect(() => {
        if (open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            // Keep the menu on screen when the trigger sits near the right edge (phones).
            setCoords({ top: r.bottom, left: Math.max(0, Math.min(r.left, window.innerWidth - 228)) });
        }
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                data-tour={navTourKey(label)}
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1.5 h-full px-4 text-[12px] font-medium transition-colors border-b-2 ${
                    active
                        ? 'text-white border-[#B4A269] bg-white/[0.05]'
                        : 'text-white/75 border-transparent hover:text-white hover:bg-white/[0.05]'
                }`}
            >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{label}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && coords && ReactDOM.createPortal(
                <div
                    ref={ref}
                    style={{ position: 'fixed', top: coords.top, left: coords.left, minWidth: 220 }}
                    className="bg-white border border-gray-200 shadow-xl z-[9999] py-1"
                >
                    {items.map((item, i) => {
                        const Ic = item.icon;
                        return (
                            <NavLink
                                key={item.path || i}
                                to={item.path}
                                end={!!item.exact}
                                onClick={() => setOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center gap-2.5 px-3.5 py-2 text-[12px] transition-colors ${
                                        isActive
                                            ? 'bg-[#1A5632]/10 text-[#1A5632] font-semibold'
                                            : 'text-gray-700 hover:bg-gray-50'
                                    }`
                                }
                            >
                                {Ic && <Ic className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />}
                                <span className="truncate">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}

function FlatLink({ item, badgeCount }) {
    const Ic = item.icon;
    return (
        <NavLink
            to={item.path}
            end={item.exact}
            data-tour={navTourKey(item.label)}
            className={({ isActive }) =>
                `flex items-center gap-1.5 h-full px-4 text-[12px] font-medium transition-colors border-b-2 ${
                    isActive
                        ? 'text-white border-[#B4A269] bg-white/[0.05]'
                        : 'text-white/75 border-transparent hover:text-white hover:bg-white/[0.05]'
                }`
            }
        >
            {Ic && <Ic className="w-3.5 h-3.5" />}
            <span>{item.label}</span>
            {item.badge && badgeCount > 0 && (
                <span className="relative flex h-2.5 w-2.5 ml-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 bg-red-500 text-white text-[7px] font-bold items-center justify-center" />
                </span>
            )}
        </NavLink>
    );
}

/**
 * Horizontal main navigation bar under the top header, from `lg` up (below,
 * MobileNav in TopNav shows the same entries). Entries come from useNavItems
 * (role tree from `navConfig`, filtered by RBAC).
 *
 * @returns {JSX.Element}
 */
export default function MainNav() {
    const location = useLocation();
    const navItems = useNavItems();

    return (
        // Below lg the same entries live in the burger menu (MobileNav, in TopNav).
        <nav className="hidden lg:block bg-[#0F3D24] border-b border-black/20 flex-shrink-0">
            <div className="flex items-stretch h-[42px] overflow-x-auto scrollbar-thin">
                {navItems.map((group, gi) => {
                    // Group with no section name → render each item as flat link
                    if (!group.section) {
                        return group.items.map((item, ii) => {
                            if (item.children) {
                                return (
                                    <Dropdown
                                        key={item.path || `${gi}-${ii}`}
                                        label={item.label}
                                        Icon={item.icon}
                                        items={item.children}
                                        active={isSectionActive({ items: [item] }, location.pathname)}
                                    />
                                );
                            }
                            return <FlatLink key={item.path || `${gi}-${ii}`} item={item} />;
                        });
                    }
                    // Group with section name → single item (flat) or dropdown
                    if (group.items.length === 1 && !group.items[0].children) {
                        // eslint-disable-next-line react/no-array-index-key -- nav groups come from the static navConfig and are never reordered
                        return <FlatLink key={`${gi}`} item={group.items[0]} />;
                    }
                    return (
                        // eslint-disable-next-line react/no-array-index-key -- nav groups come from the static navConfig and are never reordered
                        <Dropdown key={`${gi}`}
                            label={group.section}
                            Icon={group.items[0]?.icon}
                            items={group.items}
                            active={isSectionActive(group, location.pathname)}
                        />
                    );
                })}
                <HelpLink />
            </div>
        </nav>
    );
}
