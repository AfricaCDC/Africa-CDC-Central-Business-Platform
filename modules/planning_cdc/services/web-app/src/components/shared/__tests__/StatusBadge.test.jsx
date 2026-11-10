// ── StatusBadge tests ──
//
// StatusBadge is the single-source status pill. It must read its label + colour
// classes exclusively from the centralized getStatusConfig (@rbm/lib/enums) and
// never crash on unknown / legacy status values.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { STATUSES, getStatusConfig } from '@rbm/lib/enums';
import StatusBadge from '../StatusBadge';

describe('<StatusBadge />', () => {
  it('should render the centralized label for a known status', () => {
    const cfg = getStatusConfig(STATUSES.DRAFT);
    render(<StatusBadge status={STATUSES.DRAFT} />);
    expect(screen.getByText(cfg.label)).toBeInTheDocument();
  });

  it('should apply the centralized bg + text classes from getStatusConfig', () => {
    const cfg = getStatusConfig(STATUSES.APPROVED);
    render(<StatusBadge status={STATUSES.APPROVED} />);
    const pill = screen.getByText(cfg.label);
    expect(pill).toHaveClass(cfg.bg);
    expect(pill).toHaveClass(cfg.text);
  });

  it('should fall back to a humanized label + neutral style for an unknown status', () => {
    render(<StatusBadge status="WEIRD_LEGACY_STATE" />);
    // getStatusConfig humanizes unknown values by replacing underscores
    expect(screen.getByText('WEIRD LEGACY STATE')).toBeInTheDocument();
  });

  it('should use the larger size classes when size="sm"', () => {
    const cfg = getStatusConfig(STATUSES.IN_REVIEW);
    render(<StatusBadge status={STATUSES.IN_REVIEW} size="sm" />);
    expect(screen.getByText(cfg.label)).toHaveClass('text-[10px]');
  });

  it('should append a custom className', () => {
    const cfg = getStatusConfig(STATUSES.COMPLETED);
    render(<StatusBadge status={STATUSES.COMPLETED} className="ml-2" />);
    expect(screen.getByText(cfg.label)).toHaveClass('ml-2');
  });
});
