import React from 'react';
import { Database } from 'lucide-react';

export default function EmptyState({ icon: Icon = Database, title = 'No data found', subtitle, className = '' }) {
  return (
    <div className={`py-12 text-center ${className}`}>
      <Icon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-[15px] font-medium text-gray-500">{title}</p>
      {subtitle && <p className="text-[12px] text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}
