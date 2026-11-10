import { ChevronRight } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import { timeAgo, getEntityUrl, formatEntityType, getNotifIcon } from './governanceInbox.config.jsx';

/**
 * A single inbox / draft row (entity awaiting action). Clicking navigates to
 * the entity when a route exists.
 *
 * @param {{ item: object, onNavigate: (url: string) => void }} props
 * @returns {JSX.Element}
 */
export function InboxItemRow({ item, onNavigate }) {
  const entityLabel = formatEntityType(item.entity_type) || item.entity_type;
  const status = item.governance_status || item.status || '';
  const url = getEntityUrl(item.entity_type, item.entity_id);
  const title = item.entity_name || item.name || 'Untitled';

  return (
    <div
      className="flex items-center gap-3 px-2.5 sm:px-3 py-2.5 sm:py-3 rounded-md hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={() => url && onNavigate(url)}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 px-2 py-1 rounded flex-shrink-0">
        {entityLabel}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-800 truncate">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {item.submitted_by_name && `by ${item.submitted_by_name} · `}
          {timeAgo(item.updated_at || item.created_at)}
        </p>
      </div>
      {status && <StatusBadge status={status} size="sm" />}
      <ChevronRight className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition-colors flex-shrink-0" />
    </div>
  );
}

/**
 * A single notification row. Clicking an unread one marks it read.
 *
 * @param {{ notif: object, onMarkRead: (id: number) => void }} props
 * @returns {JSX.Element}
 */
export function NotificationRow({ notif, onMarkRead }) {
  const typeConfig = getNotifIcon(notif.notification_type);
  const NotifIcon = typeConfig.icon;
  const isUnread = !notif.read_at;

  return (
    <div
      className={`flex items-start gap-3 px-2.5 sm:px-3 py-2.5 sm:py-3 rounded-md hover:bg-gray-50 transition-colors cursor-pointer group ${isUnread ? 'bg-blue-50/30' : ''}`}
      onClick={() => isUnread && onMarkRead(notif.id)}
    >
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${isUnread ? 'bg-white' : 'bg-gray-50'}`}>
        <NotifIcon className={`w-3.5 h-3.5 ${typeConfig.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
          {notif.title}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{notif.message}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] text-gray-300">{timeAgo(notif.created_at)}</span>
        {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
      </div>
    </div>
  );
}
