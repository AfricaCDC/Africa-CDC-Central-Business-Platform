import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  useGovernanceInbox, useMyDrafts, useGovernanceNotifications, useNotificationMutations,
} from '@/hooks/useGovernanceQueries';
import { InboxItemRow, NotificationRow } from './governance/GovernanceInboxRows.jsx';
import {
  FileEdit, Clock, Bell, Inbox, Search, X,
} from 'lucide-react';

const SKELETON_ROWS = ['sk-1', 'sk-2', 'sk-3', 'sk-4'];

/** Loading skeleton for the list panel. */
function ListSkeleton() {
  return (
    <div className="space-y-3">
      {SKELETON_ROWS.map((key) => (
        <div key={key} className="flex items-center gap-3 px-3 py-3 animate-pulse">
          <div className="w-16 h-5 bg-gray-100 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-50 rounded w-1/3" />
          </div>
          <div className="w-16 h-5 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Centered empty-state for a tab. */
function EmptyState({ message, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-gray-300" />
      </div>
      <p className="text-[13px] text-gray-400">{message}</p>
    </div>
  );
}

const matchesSearch = (query) => (item) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return [item.entity_name, item.name, item.title, item.message]
    .some((f) => (f || '').toLowerCase().includes(q));
};

/** Top stat cards (pending / drafts / unread). */
function StatCards({ cards, isLoading }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {cards.map((stat) => (
        <div key={stat.label} className="bg-white rounded-lg border border-gray-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md ${stat.color} flex items-center justify-center`}>
              <stat.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${stat.iconColor}`} />
            </div>
          </div>
          <div className="text-[22px] sm:text-[28px] font-bold text-gray-900 leading-none">
            {isLoading ? '—' : stat.value}
          </div>
          <div className="text-[11px] sm:text-[12px] text-gray-400 mt-1 sm:mt-1.5">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Tab strip with per-tab count badges and the "mark all read" shortcut. */
function InboxTabs({ tabs, activeTab, onSelect, unreadCount, onMarkAllRead }) {
  return (
    <div className="flex items-center gap-0 border-b border-gray-100 px-1 sm:px-2">
      {tabs.map((tab) => {
        const TabIcon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
              isActive ? 'border-[#348F41] text-[#348F41]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <TabIcon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[#348F41] text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
      {activeTab === 'notifications' && unreadCount > 0 && (
        <button
          onClick={onMarkAllRead}
          className="ml-auto mr-2 text-[11px] text-gray-400 hover:text-gray-600 font-medium transition-colors"
        >
          Mark all read
        </button>
      )}
    </div>
  );
}

/**
 * Governance inbox page. Surfaces items pending review, the user's drafts and
 * recent notifications across three tabs, with client-side search. All data
 * comes from React Query (`use*` hooks); marking notifications read is a
 * mutation that invalidates the notifications query.
 *
 * @returns {JSX.Element}
 */
export default function GovernanceInbox() {
  const navigate = useNavigate();
  const inboxQuery = useGovernanceInbox();
  const draftsQuery = useMyDrafts();
  const notifQuery = useGovernanceNotifications();
  const { markRead, markAllRead } = useNotificationMutations();

  const [activeTab, setActiveTab] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  const inbox = inboxQuery.data || [];
  const drafts = draftsQuery.data || [];
  const notif = notifQuery.data || { data: [], unread_count: 0 };
  const notifList = Array.isArray(notif.data) ? notif.data : [];
  const unreadCount = notif.unread_count || 0;
  const isLoading = inboxQuery.isLoading || draftsQuery.isLoading || notifQuery.isLoading;

  const match = matchesSearch(searchQuery);
  const filteredInbox = inbox.filter(match);
  const filteredDrafts = drafts.filter(match);
  const filteredNotifs = notifList.filter(match);

  const tabs = [
    { id: 'inbox', label: 'Pending Review', count: inbox.length, icon: Clock },
    { id: 'drafts', label: 'My Drafts', count: drafts.length, icon: FileEdit },
    { id: 'notifications', label: 'Notifications', count: unreadCount, icon: Bell },
  ];

  const statCards = [
    { label: 'Pending Review', value: inbox.length, icon: Clock, color: 'bg-amber-50', iconColor: 'text-amber-500' },
    { label: 'My Drafts', value: drafts.length, icon: FileEdit, color: 'bg-gray-50', iconColor: 'text-gray-500' },
    { label: 'Unread Notifications', value: unreadCount, icon: Bell, color: 'bg-blue-50', iconColor: 'text-blue-500' },
  ];

  const renderActiveList = () => {
    if (isLoading) return <ListSkeleton />;
    if (activeTab === 'notifications') {
      return filteredNotifs.length === 0
        ? <EmptyState message="No notifications yet" icon={Bell} />
        : filteredNotifs.map((n) => <NotificationRow key={n.id} notif={n} onMarkRead={markRead} />);
    }
    const isInbox = activeTab === 'inbox';
    const items = isInbox ? filteredInbox : filteredDrafts;
    if (items.length === 0) {
      return <EmptyState message={isInbox ? 'No items pending your review' : 'You have no drafts'} icon={isInbox ? Inbox : FileEdit} />;
    }
    return items.map((item) => (
      <InboxItemRow key={item.id || `${item.entity_type}-${item.entity_id}`} item={item} onNavigate={navigate} />
    ));
  };

  return (
    <DashboardLayout title="Governance">
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h2 className="text-[18px] font-semibold text-[#1A5632]">Governance Inbox</h2>
          <p className="text-[13px] text-[#58595B] mt-0.5">Review, approve, and manage your governance artifacts</p>
        </div>

        <StatCards cards={statCards} isLoading={isLoading} />

        <div className="bg-white rounded-lg border border-gray-100">
          <InboxTabs
            tabs={tabs}
            activeTab={activeTab}
            onSelect={setActiveTab}
            unreadCount={unreadCount}
            onMarkAllRead={() => markAllRead()}
          />

          <div className="px-3 sm:px-4 pt-3 pb-1">
            <div className="relative min-w-[300px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full h-10 pl-10 pr-9 text-[14px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#348F41]/20 focus:border-[#348F41]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="p-1.5 sm:p-2">{renderActiveList()}</div>
        </div>
      </div>
    </DashboardLayout>
  );
}
