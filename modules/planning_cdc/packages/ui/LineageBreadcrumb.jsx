import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { COLORS } from '@rbm/lib';

const TIER_COLORS = {
  1: COLORS.TIER_1,
  2: COLORS.TIER_2,
  3: COLORS.TIER_3,
  4: COLORS.TIER_4,
};

/**
 * LineageBreadcrumb — Impact → Outcome → Activity → Task chain
 *
 * @param {Array<{label: string, path?: string, tier?: number}>} items
 */
export default function LineageBreadcrumb({ items = [], className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 text-[12px] flex-wrap ${className}`}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
          {item.tier && (
            <span
              className="text-[9px] font-bold text-white px-1.5 py-0.5 flex-shrink-0"
              style={{ backgroundColor: TIER_COLORS[item.tier] || '#666' }}
            >
              T{item.tier}
            </span>
          )}
          {item.path ? (
            <Link to={item.path} className="text-gray-500 hover:text-gray-700 hover:underline truncate max-w-[250px]">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 font-medium truncate max-w-[300px]">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
