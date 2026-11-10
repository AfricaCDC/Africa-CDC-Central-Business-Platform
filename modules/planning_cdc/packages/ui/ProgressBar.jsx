import React from 'react';

export default function ProgressBar({ percent, showLabel = true, className = '' }) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const barColor = p >= 100 ? 'bg-green-500' : p > 50 ? 'bg-blue-500' : p > 0 ? 'bg-amber-500' : 'bg-gray-200';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex-1 h-1.5 bg-gray-100 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${p}%` }} />
      </div>
      {showLabel && (
        <span className="text-[11px] text-gray-400 w-7 text-right">{p}%</span>
      )}
    </div>
  );
}
