// ── ConfirmDialog component tests ──
//
// ConfirmDialog is a thin wrapper around <Modal>. These tests focus on the
// behaviour the wrapper adds on top:
//   - Renders nothing when closed
//   - Renders title + description when open
//   - Confirm button fires BOTH onConfirm and onClose (the wrapper chains them)
//   - Cancel button fires onClose only
//   - `variant="danger"` passes through to the Modal (header class change)
//
// Modal itself has its own dedicated test suite, so we don't re-assert its
// behaviour here.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';

describe('<ConfirmDialog />', () => {
  it('should render nothing when open=false', () => {
    const { container } = render(
      <ConfirmDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render title + description when open', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete user?"
        description="This action cannot be undone."
      />
    );
    expect(screen.getByText('Delete user?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('should use sane default labels for confirm + cancel', () => {
    render(<ConfirmDialog open onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should respect custom confirmLabel + cancelLabel', () => {
    render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        confirmLabel="Yes, delete"
        cancelLabel="Nope"
      />
    );
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });

  it('should fire onConfirm AND onClose when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onConfirm={onConfirm}
        onClose={onClose}
        confirmLabel="Confirm"
      />
    );
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should fire onClose (NOT onConfirm) when cancel is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onConfirm={onConfirm}
        onClose={onClose}
        cancelLabel="Cancel"
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should swap the Modal to danger mode when variant="danger"', () => {
    // danger mode renders the AlertTriangle icon in the header — we can
    // detect it via its role (lucide icons render as <svg>).
    const { container } = render(
      <ConfirmDialog
        open
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete?"
        variant="danger"
      />
    );
    // The danger header has a red background — check for the class on
    // the header wrapper. Not ideal to couple to classes, but the only
    // visible difference we can detect without a snapshot.
    const header = container.querySelector('.bg-red-600');
    expect(header).not.toBeNull();
  });

  it('should NOT crash if onConfirm is omitted (optional chaining)', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open onClose={onClose} />);
    // Default confirm label is "Confirm"
    expect(() => fireEvent.click(screen.getByText('Confirm'))).not.toThrow();
    expect(onClose).toHaveBeenCalled();
  });
});
