/**
 * ConfirmDialog — thin wrapper around the generic Modal that renders
 * a confirmation prompt with Cancel + Confirm buttons.
 *
 * Every "Are you sure?" dialog in the web-app should route through
 * this component so copy, spacing, and destructive-action styling
 * stay consistent.
 *
 * Props (unchanged from the previous ShadCN-backed version, so callers
 * do NOT need to be updated):
 *   open         bool
 *   onClose      () => void
 *   onConfirm    () => void
 *   title        string
 *   description  string | ReactNode
 *   confirmLabel string (default 'Confirm')
 *   cancelLabel  string (default 'Cancel')
 *   variant      'default' | 'danger' (default 'default')
 */

import React from 'react';
import Modal, { ModalPrimaryButton, ModalSecondaryButton } from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm action',
  description = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}) {
  const danger = variant === 'danger';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      danger={danger}
      width="max-w-[460px]"
      footer={
        <>
          <ModalSecondaryButton onClick={onClose}>{cancelLabel}</ModalSecondaryButton>
          <ModalPrimaryButton
            danger={danger}
            onClick={() => { onConfirm?.(); onClose?.(); }}
          >
            {confirmLabel}
          </ModalPrimaryButton>
        </>
      }
    >
      <div className="text-[12px] text-gray-700 leading-relaxed">
        {description}
      </div>
    </Modal>
  );
}
