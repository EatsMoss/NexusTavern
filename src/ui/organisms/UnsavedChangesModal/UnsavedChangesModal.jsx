import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { Modal } from '@ui/organisms/Modal/Modal.jsx';
import './UnsavedChangesModal.css';

/**
 * Reusable M3 Unsaved Changes Confirmation Dialog.
 *
 * Clicking outside the dialog, pressing Escape, or clicking `×` / `Cancel`
 * invokes `onCancel` (keeps the underlying editor open with its draft intact).
 */
export function UnsavedChangesModal({
  open = false,
  title = 'Unsaved Changes',
  subtitle = 'Your recent edits have not been saved yet',
  itemName = '',
  message,
  saveLabel = 'Save',
  discardLabel = 'Discard & Close',
  cancelLabel = 'Cancel',
  canSave = true,
  cannotSaveReason = '',
  busy = false,
  zIndex,
  onCancel,
  onDiscard,
  onSave,
}) {
  const handleSafeCancel = () => {
    if (busy) return;
    onCancel?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleSafeCancel}
      title={title}
      subtitle={subtitle}
      icon="warning"
      width={440}
      zIndex={zIndex}
      bodyScrollable={false}
      className="bb-unsaved-modal"
      footer={
        <div className="bb-unsaved-modal__footer">
          <Button
            variant="b2"
            disabled={busy}
            className="bb-unsaved-modal__cancel-btn"
            onClick={handleSafeCancel}
          >
            {cancelLabel}
          </Button>

          <div className="bb-unsaved-modal__actions-right">
            <Button
              variant="b4"
              icon="undo"
              disabled={busy}
              onClick={() => {
                if (!busy) onDiscard?.();
              }}
            >
              {discardLabel}
            </Button>

            {onSave && (
              <Button
                variant="b1"
                emphasis="filled"
                icon={busy ? 'refresh' : 'check'}
                disabled={busy || !canSave}
                title={!canSave && cannotSaveReason ? cannotSaveReason : undefined}
                onClick={() => {
                  if (!busy && canSave) onSave();
                }}
              >
                {busy ? 'Saving...' : saveLabel}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="bb-unsaved-modal__body">
        <div className="bb-unsaved-modal__message">
          {message ?? (
            <>
              Would you like to save your changes
              {itemName ? (
                <>
                  {' '}
                  to <strong>{itemName}</strong>
                </>
              ) : null}{' '}
              before closing?
            </>
          )}
        </div>

        {!canSave && cannotSaveReason && (
          <div className="bb-unsaved-modal__note" role="note">
            <Icon name="info" size={15} className="bb-unsaved-modal__note-icon" />
            <span>{cannotSaveReason}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
