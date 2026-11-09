import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Menu, Search, X } from 'lucide-react';
import { isSectionActive, toMenuEntries } from './navMatch';
import useNavItems from './useNavItems';
import MobileContextPickers from './MobileContextPickers';
import HelpLink from './HelpLink';

const linkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-4 py-2.5 text-[12px] border-l-2 ${
        isActive
            ? 'bg-[#1A5632]/10 text-[#1A5632] font-semibold border-[#1A5632]'
            : 'text-gray-700 border-transparent hover:bg-gray-50'
    }`;

/** One link row of the drawer. */
function MenuLink({ item, onNavigate, indent = false }) {
    const Ic = item.icon;
    return (
        <NavLink to={item.path} end={!!item.exact} onClick={onNavigate} className={(s) => `${linkClass(s)} ${indent ? 'pl-9' : ''}`}>
            {Ic && <Ic className="w-4 h-4 flex-shrink-0 text-gray-400" />}
            <span className="truncate">{item.label}</span>
        </NavLink>
    );
}

/**
 * Burger button for phones and tablets (below `lg`), placed in TopNav before
 * the logo. Opens a drawer with the same role- and RBAC-filtered entries as
 * the desktop bar (useNavItems), with the header tools hidden below `lg`:
 * search on top, division and fiscal year at the bottom. Sections fold with
 * native <details>; the active one starts open.
 *
 * @returns {JSX.Element}
 * @throws {never}
 * @example <MobileNav />
 */
export default function MobileNav() {
    const [isOpen, setIsOpen] = useState(false);
    const { pathname } = useLocation();
    const entries = toMenuEntries(useNavItems());
    const navigate = useNavigate();
    const close = () => setIsOpen(false);

    const handleSearch = (e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get('q')?.toString().trim();
        if (!q) return;
        close();
        navigate(`/search?q=${encodeURIComponent(q)}`);
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]);

    return (
        <div className="lg:hidden flex-shrink-0 mr-2 -ml-2">
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label="Open menu" data-tour="burger"
                aria-expanded={isOpen}
                aria-controls="mobile-main-menu"
                className="flex items-center justify-center w-10 h-10 text-white hover:bg-white/10"
            >
                <Menu className="w-6 h-6" />
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[9998] flex">
                    <nav id="mobile-main-menu" role="dialog" aria-modal="true" aria-label="Main menu"
                        className="w-[85%] max-w-[320px] h-full bg-white border-r border-gray-200 flex flex-col">
                        <div className="flex items-center justify-between h-[48px] px-4 bg-[#1A5632] text-white flex-shrink-0">
                            <span className="text-[12px] font-semibold uppercase tracking-wide">Menu</span>
                            <button type="button" onClick={close} aria-label="Close menu" className="p-1.5 hover:bg-white/10">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form role="search" onSubmit={handleSearch} className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input name="q" type="search" enterKeyHint="search" aria-label="Search"
                                    placeholder="Search activities, indicators, Business Units..."
                                    className="w-full h-9 pl-8 pr-2 text-[12px] border border-gray-300 outline-none focus:border-[#1A5632]" />
                            </div>
                        </form>
                        <HelpLink variant="menu" onNavigate={close} />
                        <div className="flex-1 overflow-y-auto py-1">
                            {entries.map((e) => (e.link ? (
                                <MenuLink key={e.key} item={e.link} onNavigate={close} />
                            ) : (
                                <details key={e.key} open={isSectionActive(e, pathname)} className="group border-t border-gray-100">
                                    <summary className="flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-semibold text-gray-800 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                                        {e.icon && <e.icon className="w-4 h-4 flex-shrink-0 text-gray-400" />}
                                        <span className="flex-1 truncate">{e.title}</span>
                                        <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform group-open:rotate-180" />
                                    </summary>
                                    {e.items.map((item) => (
                                        <MenuLink key={item.path} item={{ ...item, icon: null }} onNavigate={close} indent />
                                    ))}
                                </details>
                            )))}
                        </div>
                        <MobileContextPickers onDone={close} />
                    </nav>
                    <button type="button" aria-label="Close menu" onClick={close} className="flex-1 bg-black/40" />
                </div>
            )}
        </div>
    );
}
