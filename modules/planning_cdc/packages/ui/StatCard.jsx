import React from 'react';
import { COLORS } from '@rbm/lib';

export default function StatCard({ label, value, sub, onClick, className = '' }) {
  return (
    <div
      onClick={onClick}
      className={`px-5 py-4 ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors ${className}`}
    >
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      <span className="text-[28px] font-bold leading-none" style={{ color: COLORS.AU_GREEN_DARK }}>{value}</span>
      {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
