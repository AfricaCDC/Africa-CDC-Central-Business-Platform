import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { governanceService } from '@/services/governanceService';
import {
  FileSearch, Filter, ChevronLeft, ChevronRight, ChevronDown,
  AlertCircle, Eye, Download, RefreshCw,
  Shield, User, FileText, Activity, Database,
  Globe, LogIn, Zap, Settings,
} from 'lucide-react';

/* ── Action config ── */
const CFG = {
  LOGIN:                      { color: '#6B7280', icon: LogIn,      verb: 'signed in' },
  LOGIN_FAILED:               { color: '#DC2626', icon: Shield,     verb: 'failed login attempt' },
  SSO_LOGIN:                  { color: '#2563EB', icon: LogIn,      verb: 'signed in via Microsoft SSO' },
  TOKEN_REFRESH:              { color: '#9CA3AF', icon: RefreshCw,  verb: 'refreshed session' },
  LOGOUT:                     { color: '#6B7280', icon: LogIn,      verb: 'signed out' },
  CREATE_USER:                { color: '#059669', icon: User,       verb: 'created user' },
  UPDATE_USER:                { color: '#2563EB', icon: User,       verb: 'updated user' },
  ASSIGN_ROLE:                { color: '#7C3AED', icon: Shield,     verb: 'assigned role' },
  SPECIFIC_ACTIVITY_CREATE:   { color: '#059669', icon: Activity,   verb: 'created specific activity' },
  SPECIFIC_ACTIVITY_UPDATE:   { color: '#2563EB', icon: Activity,   verb: 'updated specific activity' },
  SPECIFIC_ACTIVITY_SUBMIT:   { color: '#D97706', icon: Activity,   verb: 'submitted for approval' },
  SPECIFIC_ACTIVITY_APPROVE:  { color: '#059669', icon: Activity,   verb: 'approved specific activity' },
  SPECIFIC_ACTIVITY_REJECT:   { color: '#DC2626', icon: Activity,   verb: 'rejected specific activity' },
  SPECIFIC_ACTIVITY_CANCEL:   { color: '#6B7280', icon: Activity,   verb: 'cancelled specific activity' },
  SPECIFIC_ACTIVITY_DELETE:   { color: '#DC2626', icon: Activity,   verb: 'deleted specific activity' },
  OPEN_REPORTING_PERIOD:      { color: '#D97706', icon: FileText,   verb: 'opened reporting period' },
  UPDATE_REPORTING_PERIOD:    { color: '#2563EB', icon: FileText,   verb: 'updated reporting period' },
  PASSWORD_RESET_REQUESTED:   { color: '#D97706', icon: Shield,     verb: 'requested password reset' },
  PASSWORD_RESET_COMPLETED:   { color: '#059669', icon: Shield,     verb: 'completed password reset' },
  ADMIN_PASSWORD_RESET_SENT:  { color: '#7C3AED', icon: Shield,     verb: 'sent password reset link' },
  API_REQUEST:                { color: '#D1D5DB', icon: Globe,      verb: null },
  API_ERROR_4XX:              { color: '#F59E0B', icon: AlertCircle, verb: null },
  API_ERROR_5XX:              { color: '#DC2626', icon: AlertCircle, verb: null },
  PAGE_VIEW:                  { color: '#6366F1', icon: Eye,        verb: 'visited' },
  REFRESH_FAILED:             { color: '#DC2626', icon: RefreshCw,  verb: 'session refresh failed' },
  SSO_LOGIN_DENIED:           { color: '#DC2626', icon: Shield,     verb: 'SSO login denied' },
  PASSWORD_RESET_REQUEST_NOOP:{ color: '#9CA3AF', icon: Shield,     verb: 'password reset (no account)' },
};
const DEFAULT_CFG = { color: '#9CA3AF', icon: Database, verb: null };

/* ── Smart description builder ── */
// eslint-disable-next-line complexity -- one flat verb-lookup per audit action type (30+); splitting into per-action helpers adds indirection for zero clarity. Pre-dates the complexity rule; full redesign out of scope for the page-crash hotfix (D-20260703-01).
function buildDescription(entry) {
  const cfg = CFG[entry.action] || DEFAULT_CFG;
  const actor = entry.actor_name || 'Unknown user';
  let details = {};
  try { details = typeof entry.details === 'string' ? JSON.parse(entry.details) : (entry.details || {}); } catch { /* */ }

  if (cfg.verb) {
    if (entry.action === 'PAGE_VIEW') return `${actor} visited ${details.path || '/'}`;
    if (entry.action.startsWith('SPECIFIC_ACTIVITY_') && entry.entity_id) return `${actor} ${cfg.verb} #${entry.entity_id}`;
    if (entry.action === 'LOGIN_FAILED') return `Failed login attempt${details.email ? ` for ${details.email}` : ''}`;
    if (entry.action === 'ASSIGN_ROLE') return `${actor} ${cfg.verb} ${details.role || ''}${details.target_email ? ` to ${details.target_email}` : ''}`;
    if (entry.action === 'CREATE_USER' || entry.action === 'UPDATE_USER') return `${actor} ${cfg.verb} ${details.email || `#${entry.entity_id || ''}`}`;
    return `${actor} ${cfg.verb}`;
  }

  if (entry.action === 'API_REQUEST') return `${details.method || 'GET'} ${details.path || '/'} → ${details.status || '?'} (${details.duration_ms || 0}ms)`;
  if (entry.action === 'API_ERROR_4XX') return `${details.method || '?'} ${details.path || '/'} → ${details.status || 400} (${details.duration_ms || 0}ms)`;
  if (entry.action === 'API_ERROR_5XX') return `${details.method || '?'} ${details.path || '/'} → ${details.status || 500} (${details.duration_ms || 0}ms)`;

  return `${actor} performed ${(entry.action || 'unknown').replace(/_/g, ' ').toLowerCase()}`;
}

/* ── Time helpers ── */
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function timeOnly(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ── Category tabs ── */
const EMPTY_FILTERS = { entityType: '', action: '', startDate: '', endDate: '', userSearch: '' };
const TABS = [
  { key: 'all', label: 'All', icon: null, filters: { ...EMPTY_FILTERS } },
  { key: 'logins', label: 'Logins', icon: LogIn, filters: { ...EMPTY_FILTERS, action: 'LOGIN,LOGIN_FAILED,SSO_LOGIN,SSO_LOGIN_DENIED' } },
  { key: 'actions', label: 'Actions', icon: Zap, filters: { ...EMPTY_FILTERS, action: 'SPECIFIC_ACTIVITY_CREATE,SPECIFIC_ACTIVITY_UPDATE,SPECIFIC_ACTIVITY_SUBMIT,SPECIFIC_ACTIVITY_APPROVE,SPECIFIC_ACTIVITY_REJECT,SPECIFIC_ACTIVITY_CANCEL,SPECIFIC_ACTIVITY_DELETE,OPEN_REPORTING_PERIOD,UPDATE_REPORTING_PERIOD' } },
  { key: 'errors', label: 'Errors', icon: AlertCircle, filters: { ...EMPTY_FILTERS, action: 'API_ERROR_4XX,API_ERROR_5XX' } },
  { key: 'pages', label: 'Pages', icon: Eye, filters: { ...EMPTY_FILTERS, action: 'PAGE_VIEW' } },
  { key: 'admin', label: 'Admin', icon: Settings, filters: { ...EMPTY_FILTERS, action: 'CREATE_USER,UPDATE_USER,ASSIGN_ROLE,ADMIN_PASSWORD_RESET_SENT' } },
];

const ENTITY_OPTIONS = [
  // eslint-disable-next-line no-restricted-syntax -- values are raw audit_events.entity_type strings and labels are human-readable filter captions ("Activity"), not ENTITY_TYPES enum usage; the enum has no entry for audit-only types like http_request/navigation.
  { value: '', label: 'All' }, { value: 'user', label: 'User' }, { value: 'plan_node', label: 'Activity' },
  { value: 'reporting_period', label: 'Period' }, { value: 'http_request', label: 'API' }, { value: 'navigation', label: 'Page' },
];
const ACTION_OPTIONS = [
  { value: '', label: 'All' }, { value: 'LOGIN', label: 'Login' }, { value: 'LOGIN_FAILED', label: 'Login Failed' },
  { value: 'SSO_LOGIN', label: 'SSO' }, { value: 'API_ERROR_4XX', label: '4xx Error' }, { value: 'API_ERROR_5XX', label: '5xx Error' },
  { value: 'PAGE_VIEW', label: 'Page View' }, { value: 'SPECIFIC_ACTIVITY_CREATE', label: 'Create Activity' },
  { value: 'SPECIFIC_ACTIVITY_APPROVE', label: 'Approve Activity' }, { value: 'SPECIFIC_ACTIVITY_REJECT', label: 'Reject Activity' },
];

/* ── Expandable details ── */
function ExpandedDetails({ details }) {
  let parsed = {};
  try { parsed = typeof details === 'string' ? JSON.parse(details) : (details || {}); } catch { return null; }
  const keys = Object.keys(parsed);
  if (!keys.length) return null;

  return (
    <div className="mt-2 pl-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1">
      {keys.map(k => {
        let val = parsed[k];
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') val = JSON.stringify(val);
        return (
          <div key={k} className="min-w-0">
            <span className="text-[9px] text-gray-400 uppercase tracking-wide">{k}</span>
            <div className="text-[11px] text-gray-700 truncate" title={String(val)}>{String(val)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main page ── */
// eslint-disable-next-line complexity -- single-page timeline with filters/tabs/expansion state; branch count pre-dates the complexity rule. Splitting is a redesign, out of scope for the page-crash hotfix (D-20260703-01).
export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS });
  const [activeTab, setActiveTab] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { data: queryData, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: ['audit', 'logs', page, applied],
    queryFn: async () => {
      const params = { page, limit: 20 };
      if (applied.entityType) params.entity_type = applied.entityType;
      if (applied.action) params.action = applied.action;
      if (applied.startDate) params.startDate = applied.startDate;
      if (applied.endDate) params.endDate = applied.endDate;
      if (applied.userSearch) params.userSearch = applied.userSearch;
      return governanceService.getAuditLog(params);
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
  const logs = queryData?.data || [];
  const pagination = queryData?.pagination || { total: 0, totalPages: 1 };
  const error = queryError ? (queryError.response?.data?.error || queryError.message || 'Failed to load') : null;

  const applyFilters = () => { setApplied({ ...filters }); setActiveTab('all'); setPage(1); };
  const clearFilters = () => { setFilters({ ...EMPTY_FILTERS }); setApplied({ ...EMPTY_FILTERS }); setActiveTab('all'); setPage(1); };
  const handleTab = (tab) => { setActiveTab(tab.key); setFilters({ ...tab.filters }); setApplied({ ...tab.filters }); setPage(1); };
  const hasFilters = Object.values(applied).some(v => v !== '');

  const exportCsv = () => {
    const hdr = 'Timestamp,User,Action,Description,Entity,ID,IP,Details\n';
    const rows = logs.map(e => [e.timestamp, e.actor_name || '', e.action, buildDescription(e),
      e.entity_type, e.entity_id || '', e.ip_address || '', (e.details || '').replace(/"/g, '""')]
      .map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([hdr + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <DashboardLayout title="Audit Trail">
      <div className="space-y-3">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A5632]">Audit Trail</h2>
            <p className="text-[11px] text-gray-400">{pagination.total.toLocaleString()} events{hasFilters ? ' (filtered)' : ''}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] border ${showFilters ? 'border-[#1A5632] text-[#1A5632] bg-[#1A5632]/5' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              <Filter className="w-3 h-3" /> Filters {hasFilters && <span className="w-1.5 h-1.5 bg-[#1A5632] inline-block" />}
            </button>
            <button onClick={() => refetch()} disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] border border-gray-200 text-gray-500 hover:bg-gray-50">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={exportCsv} disabled={!logs.length}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">
              <Download className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ── Filters (collapsible) ── */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 p-3 flex flex-wrap items-end gap-2">
            <Sel label="Entity" value={filters.entityType} onChange={v => setFilters(p => ({ ...p, entityType: v }))} options={ENTITY_OPTIONS} />
            <Sel label="Action" value={filters.action} onChange={v => setFilters(p => ({ ...p, action: v }))} options={ACTION_OPTIONS} />
            <Inp label="From" type="date" value={filters.startDate} onChange={v => setFilters(p => ({ ...p, startDate: v }))} />
            <Inp label="To" type="date" value={filters.endDate} onChange={v => setFilters(p => ({ ...p, endDate: v }))} />
            <Inp label="User" type="text" placeholder="Name or email" value={filters.userSearch} onChange={v => setFilters(p => ({ ...p, userSearch: v }))} />
            <button onClick={applyFilters} className="px-3 py-1.5 text-[11px] font-medium bg-[#1A5632] text-white hover:bg-[#0F3D24]">Apply</button>
            {hasFilters && <button onClick={clearFilters} className="px-2 py-1.5 text-[11px] text-red-500 hover:text-red-700">Clear</button>}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-[11px] text-red-600">
            <AlertCircle className="w-3 h-3" /> {typeof error === 'string' ? error : 'Error'}
          </div>
        )}

        {/* ── Category tabs ── */}
        <div className="flex items-center gap-0.5 border-b border-gray-200 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => handleTab(tab)}
                className={`flex items-center gap-1 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'border-[#1A5632] text-[#1A5632]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {Icon && <Icon className="w-3 h-3" />} {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Event feed ── */}
        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 10 }).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key -- static loading-skeleton placeholders; the list is fixed-length and never reorders.
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-1 h-8 bg-gray-100" />
                  <div className="w-6 h-6 bg-gray-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 w-2/3" />
                    <div className="h-2.5 bg-gray-50 w-1/3" />
                  </div>
                  <div className="h-3 bg-gray-50 w-16" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <FileSearch className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-[12px] text-gray-400">No events found</p>
              {hasFilters && <button onClick={clearFilters} className="text-[11px] text-[#1A5632] mt-2 hover:underline">Clear filters</button>}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* eslint-disable-next-line complexity -- timeline row renderer, one branch per optional entry field; pre-dates the complexity rule, refactor out of scope for the page-crash hotfix (D-20260703-01). */}
              {logs.map(entry => {
                const cfg = CFG[entry.action] || DEFAULT_CFG;
                const Icon = cfg.icon;
                const isExpanded = expandedId === entry.id;

                return (
                  <div key={entry.id}
                    className={`group cursor-pointer hover:bg-gray-50/80 transition-colors ${isExpanded ? 'bg-gray-50/50' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                    <div className="flex items-start gap-3 px-4 py-2.5">
                      {/* Color bar */}
                      <div className="w-1 self-stretch flex-shrink-0 mt-1" style={{ backgroundColor: cfg.color, minHeight: 24 }} />

                      {/* Icon */}
                      <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: cfg.color + '15' }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-gray-800 leading-snug">
                          {buildDescription(entry)}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-400">{entry.actor_email || ''}</span>
                          {entry.entity_type && entry.entity_type !== 'http_request' && entry.entity_type !== 'navigation' && (
                            <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 uppercase tracking-wide">
                              {entry.entity_type.replace(/_/g, ' ')}
                            </span>
                          )}
                          {entry.entity_id && (
                            <span className="text-[10px] text-gray-400 font-mono">#{entry.entity_id}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: time + IP */}
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[11px] text-gray-500 tabular-nums">{timeOnly(entry.timestamp)}</div>
                        <div className="text-[9px] text-gray-300">{relativeTime(entry.timestamp)}</div>
                      </div>

                      {/* IP */}
                      <div className="w-24 text-right flex-shrink-0 hidden lg:block">
                        <span className="text-[10px] text-gray-300 font-mono">{entry.ip_address || ''}</span>
                      </div>

                      {/* Expand indicator */}
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded details */}
                    {isExpanded && <ExpandedDetails details={entry.details} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-gray-50">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-30">
                <ChevronLeft className="w-3 h-3" /> Prev
              </button>
              <span className="text-[10px] text-gray-400">
                {page} / {pagination.totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}
                className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 disabled:opacity-30">
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ── Tiny helpers ── */
function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-[11px] border border-gray-300 bg-white min-w-[100px] focus:outline-none focus:border-[#1A5632]">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Inp({ label, type, placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-[11px] border border-gray-300 bg-white min-w-[100px] focus:outline-none focus:border-[#1A5632]" />
    </div>
  );
}
