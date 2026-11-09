/* eslint-disable complexity, react/no-array-index-key --
 * Pre-existing debt, surfaced for the first time because this file is being
 * committed (lint-staged only lints staged files).
 *   · complexity: TopNav branches on its inbox and menu states. Splitting
 *     the nav bar by branch would scatter one cohesive component.
 *   · react/no-array-index-key: the nav and breadcrumb arrays are static and
 *     never reordered, so the index is a stable key here.
 * Pragma is a ceiling: do NOT grow the file or add new violations.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    ChevronRight, Bell, Loader2, LogOut, User,
    CheckCircle2, AlertTriangle, ClipboardList, Inbox, Compass, CalendarOff,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { useMyTasks } from '@/hooks/useMyTasks';
import DivisionSwitcher from './DivisionSwitcher';
import FiscalYearSwitcher from './FiscalYearSwitcher';
import MobileNav from './MobileNav';
import GlobalSearch from './GlobalSearch';
import { useTourStore } from '@/stores/useTourStore';
import { withBase } from '@/utils/basePath';

/**
 * Top header bar showing the logo, breadcrumbs, global search, fiscal year
 * badge, the unified to-do inbox bell, and the user/profile menu.
 *
 * @param {{breadcrumbs?: Array<{label: string, path?: string}>}} props
 * @returns {JSX.Element}
 */
export default function TopNav({ breadcrumbs }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showNotifs, setShowNotifs] = useState(false);
    // Tasks = the unified actionable inbox of /api/me/tasks (aggregator in
    // services/api-server/src/routes/meRoutes.js), refreshed every minute.
    const { data: tasks = [], isFetching: loadingNotifs, refetch: refetchTasks } = useMyTasks();
    const notifRef = useRef(null);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const userRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
            if (userRef.current && !userRef.current.contains(e.target)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Total actionable items — count distinct tasks OR, when a task
    // represents a batch (e.g. "5 specific activities pending"), use
    // the batch count so the badge shows the true number of open items.
    const unreadCount = tasks.reduce((sum, t) => sum + (Number(t.count) || 1), 0);

    // Click a row → navigate to its href + close the dropdown.
    const openTask = (task) => {
        setShowNotifs(false);
        if (task?.href) navigate(task.href);
    };

    // Icon resolver — keeps the mapping in one place so new task
    // types just need to pick an icon here.
    const iconForTask = (task) => {
        const sev = task?.severity || 'info';
        if (sev === 'action') return <ClipboardList className="w-3.5 h-3.5 text-[#1A5632] flex-shrink-0 mt-0.5" />;
        if (sev === 'warning') return <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] flex-shrink-0 mt-0.5" />;
        return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />;
    };

    // Relative timestamp — "5 min ago", "2 days ago". Falls back to
    // absolute date if the task has no created_at.
    const relativeTime = (iso) => {
        if (!iso) return '';
        try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true }); }
        catch { return ''; }
    };

    return (
        <header className="flex items-center h-[60px] px-5 bg-[#1A5632] flex-shrink-0">
            {/* Left: burger (below lg), logo */}
            <MobileNav />
            <Link to="/" className="flex items-center min-w-0 mr-6">
                <img src={withBase('/africa-cdc-logo.png')} alt="Africa CDC" className="h-[40px] w-auto brightness-0 invert object-contain" />
            </Link>

            {/* Breadcrumbs */}
            <div className="flex items-center min-w-0 flex-1">
                {breadcrumbs && (
                    <nav className="flex items-center gap-1.5 text-[12px] overflow-hidden">
                        {breadcrumbs.map((crumb, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <span className="text-white/40 mx-0.5">/</span>}
                                {i === breadcrumbs.length - 1 ? (
                                    <span className="font-semibold text-white truncate">{crumb.label}</span>
                                ) : crumb.path ? (
                                    <Link to={crumb.path} className="text-white/70 hover:text-white truncate transition-colors">
                                        {crumb.label}
                                    </Link>
                                ) : (
                                    <span className="text-white/70 truncate">{crumb.label}</span>
                                )}
                            </React.Fragment>
                        ))}
                    </nav>
                )}
            </div>

            <GlobalSearch />

            {/* Right: division switcher + FY selector + notifications + user */}
            <div className="flex items-center gap-2">
                {/* Division switcher (only renders if user has > 1 division) and
                    fiscal year (falls back to a plain chip when a single plan
                    generation exists). Below lg both live in the burger menu. */}
                <div className="hidden lg:flex items-center gap-2" data-tour="selectors">
                    <DivisionSwitcher />
                    <FiscalYearSwitcher />
                </div>

                {/* Tasks inbox — items the current user needs to act on */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) refetchTasks(); }} data-tour="tasks"
                        className="relative w-9 h-9 flex items-center justify-center text-white/80 hover:bg-white/10 transition-colors"
                        title={unreadCount > 0 ? `${unreadCount} pending action${unreadCount > 1 ? 's' : ''}` : 'No pending actions'}
                    >
                        <Bell className="w-[18px] h-[18px]" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] bg-[#9F2241] text-[10px] font-bold text-white flex items-center justify-center px-1">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifs && (
                        <div className="fixed inset-x-2 top-[64px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[400px] bg-white border border-gray-200 z-50 max-h-[460px] flex flex-col">
                            {/* Header */}
                            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                                <Inbox className="w-4 h-4 text-[#1A5632]" />
                                <span className="text-[13px] font-semibold text-gray-900 flex-1">Your inbox</span>
                                {unreadCount > 0 && (
                                    <span className="text-[10px] font-bold text-[#9F2241] bg-[#9F2241]/10 px-1.5 py-0.5">
                                        {unreadCount} pending
                                    </span>
                                )}
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto">
                                {loadingNotifs && tasks.length === 0 ? (
                                    <div className="flex items-center justify-center py-10">
                                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                    </div>
                                ) : tasks.length === 0 ? (
                                    <div className="py-10 px-4 text-center">
                                        <CheckCircle2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                        <p className="text-[12px] text-gray-400">You're all caught up</p>
                                        <p className="text-[10px] text-gray-300 mt-1">Nothing needs your attention right now.</p>
                                    </div>
                                ) : (
                                    tasks.map((task) => (
                                        <button
                                            key={task.id}
                                            type="button"
                                            onClick={() => openTask(task)}
                                            className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-[#1A5632]/5 transition-colors"
                                        >
                                            <div className="flex items-start gap-2.5">
                                                {iconForTask(task)}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start gap-2">
                                                        <p className="flex-1 text-[12px] font-semibold text-gray-900 leading-snug">
                                                            {task.title}
                                                        </p>
                                                        {task.count > 1 && (
                                                            <span className="flex-shrink-0 text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5">
                                                                ×{task.count}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {task.description && (
                                                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-snug">
                                                            {task.description}
                                                        </p>
                                                    )}
                                                    {task.created_at && (
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            {relativeTime(task.created_at)}
                                                        </p>
                                                    )}
                                                </div>
                                                <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>

                            {/* Footer refresh hint */}
                            {tasks.length > 0 && (
                                <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 text-[9px] text-gray-400 text-center">
                                    Auto-refresh every 60s · click an item to open it
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* User avatar */}
                <div className="relative" ref={userRef}>
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)} data-tour="avatar"
                        className="w-9 h-9 bg-[#348F41] flex items-center justify-center text-white text-[12px] font-semibold hover:ring-2 hover:ring-white/30 transition-all"
                    >
                        {user?.full_name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U'}
                    </button>

                    {showUserMenu && (
                        <div className="absolute right-0 top-full mt-1 w-[200px] bg-white border border-gray-200 shadow-lg z-50 py-1">
                            <div className="px-3 py-2 border-b border-gray-100">
                                <div className="text-[13px] font-medium text-gray-900">{user?.full_name}</div>
                                <div className="text-[11px] text-gray-400">{user?.email}</div>
                            </div>
                            <button
                                onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                                className="w-full text-left px-3 py-2 text-[13px] text-gray-700 hover:bg-[#F5F7FA] flex items-center gap-2"
                            >
                                <User className="w-3.5 h-3.5 text-gray-400" /> Profile
                            </button>
                            <button
                                onClick={() => { setShowUserMenu(false); useTourStore.getState().start('full'); }}
                                className="w-full text-left px-3 py-2 text-[13px] text-gray-700 hover:bg-[#F5F7FA] flex items-center gap-2"
                            >
                                <Compass className="w-3.5 h-3.5 text-gray-400" /> Take the tour
                            </button>
                            <button
                                onClick={() => { setShowUserMenu(false); navigate('/out-of-office'); }}
                                className="w-full text-left px-3 py-2 text-[13px] text-gray-700 hover:bg-[#F5F7FA] flex items-center gap-2"
                            >
                                <CalendarOff className="w-3.5 h-3.5 text-gray-400" /> Out of office
                            </button>
                            <div className="border-t border-gray-100 mt-1">
                                <button
                                    onClick={logout}
                                    className="w-full text-left px-3 py-2 text-[13px] text-[#9F2241] hover:bg-red-50 flex items-center gap-2"
                                >
                                    <LogOut className="w-3.5 h-3.5" /> Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
