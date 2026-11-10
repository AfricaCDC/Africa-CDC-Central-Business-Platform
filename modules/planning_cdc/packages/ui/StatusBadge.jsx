import React from 'react';

const STATUS_STYLES = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  DRAFT: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  IN_EXECUTION: 'bg-blue-50 text-blue-700',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  PUBLISHED: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  COMPLETED: 'bg-green-50 text-green-700',
  BLOCKED: 'bg-red-50 text-red-700',
  REJECTED: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  CANCELLED: 'bg-gray-100 text-gray-400',
  CLOSED: 'bg-gray-100 text-gray-500',
  ARCHIVED: 'bg-gray-50 text-gray-400',
  LOCKED: 'bg-blue-50 text-blue-700',
};

export default function StatusBadge({ status, className = '' }) {
  const key = (status || 'NOT_STARTED').toUpperCase().replace(/\s+/g, '_');
  const style = STATUS_STYLES[key] || STATUS_STYLES.NOT_STARTED;
  const label = (status || 'Not Started').replace(/_/g, ' ');

  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 ${style} ${className}`}>
      {label}
    </span>
  );
}

export { STATUS_STYLES };
