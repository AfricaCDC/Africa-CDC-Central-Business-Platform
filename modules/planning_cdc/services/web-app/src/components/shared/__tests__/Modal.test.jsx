// ── Modal component tests ──
//
// Tests focus on BEHAVIOUR, not Tailwind classes:
//   - Renders only when `open`
//   - Escape key dismisses
//   - Backdrop click dismisses (unless `closeOnBackdrop=false`)
//   - Content-area click does NOT dismiss
//   - X button dismisses (and is hideable)
//   - Scroll locking on body while open
//   - Footer slot renders when provided
//   - `danger` flag swaps the AlertTriangle icon in
//   - Renders nothing (null) when closed — not a hidden div

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal, { ModalPrimaryButton, ModalSecondaryButton } from '../Modal';

describe('<Modal />', () => {
  beforeEach(() => {
    // Reset body overflow before each test — scroll-lock effect mutates it
    document.body.style.overflow = '';
  });

  it('should render nothing when open=false', () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        <p>child</p>
      </Modal>
    );
    // Early return → null
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('child')).toBeNull();
  });

  it('should render title + children + dialog role when open=true', () => {
    render(
      <Modal open onClose={vi.fn()} title="Hello">
        <p>Body content</p>
      </Modal>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('should call onClose when the Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Esc">
        <div />
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should NOT react to Escape after the modal closes', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Modal open onClose={onClose} title="Esc">
        <div />
      </Modal>
    );
    rerender(
      <Modal open={false} onClose={onClose} title="Esc">
        <div />
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should call onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Backdrop">
        <div />
      </Modal>
    );
    // The outer fixed-inset div is the first child of the portal root.
    // Clicking it simulates a click on the backdrop.
    const backdrop = screen.getByRole('dialog').parentElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onClose when clicking inside the dialog content', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Inside">
        <button type="button">child-btn</button>
      </Modal>
    );
    fireEvent.click(screen.getByText('child-btn'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should NOT call onClose on backdrop when closeOnBackdrop=false', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="NoBackdrop" closeOnBackdrop={false}>
        <div />
      </Modal>
    );
    const backdrop = screen.getByRole('dialog').parentElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('should call onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="X">
        <div />
      </Modal>
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should hide the X button when showClose=false', () => {
    render(
      <Modal open onClose={vi.fn()} title="NoX" showClose={false}>
        <div />
      </Modal>
    );
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('should render the footer slot when provided', () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Foo"
        footer={<button type="button">footer-btn</button>}
      >
        <div />
      </Modal>
    );
    expect(screen.getByText('footer-btn')).toBeInTheDocument();
  });

  it('should lock body scroll while open and restore it on close', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Scroll">
        <div />
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Modal open={false} onClose={vi.fn()} title="Scroll">
        <div />
      </Modal>
    );
    expect(document.body.style.overflow).toBe('auto');
  });
});

describe('<ModalPrimaryButton /> + <ModalSecondaryButton />', () => {
  it('should fire onClick when the primary button is clicked', () => {
    const onClick = vi.fn();
    render(<ModalPrimaryButton onClick={onClick}>Go</ModalPrimaryButton>);
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should NOT fire onClick when the primary button is disabled', () => {
    const onClick = vi.fn();
    render(
      <ModalPrimaryButton onClick={onClick} disabled>
        Go
      </ModalPrimaryButton>
    );
    fireEvent.click(screen.getByText('Go'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should fire onClick when the secondary button is clicked', () => {
    const onClick = vi.fn();
    render(<ModalSecondaryButton onClick={onClick}>Cancel</ModalSecondaryButton>);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
