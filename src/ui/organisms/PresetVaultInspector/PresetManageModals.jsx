import React, { useState, useEffect } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { UnsavedChangesModal } from '../UnsavedChangesModal/UnsavedChangesModal.jsx';

export function PresetManageModals({
  isOpenai = true,
  currentCategory = 'openai',
  currentSelectedName = '',
  activeDoc = null,
  saveAsModalOpen = false,
  setSaveAsModalOpen,
  saveAsDraftName = '',
  setSaveAsDraftName,
  onSaveAsPreset,
  renameModalOpen = false,
  setRenameModalOpen,
  renameDraftName = '',
  setRenameDraftName,
  onRenamePreset,
  exportModalOpen = false,
  setExportModalOpen,
  exportWithConnection = false,
  setExportWithConnection,
  onExportPreset,
  deleteModalOpen = false,
  setDeleteModalOpen,
  onDeletePreset,
  unsavedSwitchTarget = null,
  setUnsavedSwitchTarget,
  onSelectPreset,
  onSaveActiveDoc,
}) {
  const [initialSaveAsName, setInitialSaveAsName] = useState('');
  const [saveAsUnsavedOpen, setSaveAsUnsavedOpen] = useState(false);
  const [renameUnsavedOpen, setRenameUnsavedOpen] = useState(false);

  useEffect(() => {
    if (saveAsModalOpen) {
      setInitialSaveAsName(saveAsDraftName);
      setSaveAsUnsavedOpen(false);
    } else {
      setSaveAsUnsavedOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAsModalOpen]);

  useEffect(() => {
    if (!renameModalOpen) {
      setRenameUnsavedOpen(false);
    }
  }, [renameModalOpen]);

  const isSaveAsDirty =
    saveAsModalOpen && saveAsDraftName.trim() !== initialSaveAsName.trim();
  const canConfirmSaveAs = Boolean(saveAsDraftName.trim());

  const handleRequestCloseSaveAs = () => {
    if (isSaveAsDirty) {
      setSaveAsUnsavedOpen(true);
      return;
    }
    setSaveAsModalOpen(false);
  };

  const handleConfirmSaveAs = () => {
    const clean = saveAsDraftName.trim();
    if (!clean) return;
    onSaveAsPreset?.(currentCategory, clean, activeDoc);
    setSaveAsUnsavedOpen(false);
    setSaveAsModalOpen(false);
  };

  const isRenameDirty =
    renameModalOpen && renameDraftName.trim() !== (currentSelectedName || '').trim();
  const canConfirmRename =
    Boolean(renameDraftName.trim()) && renameDraftName.trim() !== currentSelectedName;

  const handleRequestCloseRename = () => {
    if (isRenameDirty) {
      setRenameUnsavedOpen(true);
      return;
    }
    setRenameModalOpen(false);
  };

  const handleConfirmRename = () => {
    const clean = renameDraftName.trim();
    if (!clean || clean === currentSelectedName) return;
    onRenamePreset?.(currentCategory, currentSelectedName, clean);
    setRenameUnsavedOpen(false);
    setRenameModalOpen(false);
  };

  return (
    <>
      <Modal
        open={saveAsModalOpen}
        onClose={handleRequestCloseSaveAs}
        title="Save Preset As"
        subtitle={`Create a new ${isOpenai ? 'Chat Completion' : 'TextGen'} preset`}
        icon="plus"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={handleRequestCloseSaveAs}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!canConfirmSaveAs}
              onClick={handleConfirmSaveAs}
            >
              Save New Preset
            </Button>
          </>
        }
      >
        <Input
          label="New Preset Name"
          value={saveAsDraftName}
          onChange={(e) => setSaveAsDraftName(e.target.value)}
          placeholder="Enter preset name..."
        />
      </Modal>

      <Modal
        open={renameModalOpen}
        onClose={handleRequestCloseRename}
        title="Rename Preset"
        subtitle={`Current preset: ${currentSelectedName}`}
        icon="edit"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={handleRequestCloseRename}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!canConfirmRename}
              onClick={handleConfirmRename}
            >
              Rename
            </Button>
          </>
        }
      >
        <Input
          label="Preset Name"
          value={renameDraftName}
          onChange={(e) => setRenameDraftName(e.target.value)}
        />
      </Modal>
      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Chat Completion Preset"
        subtitle={`Preset: ${currentSelectedName}`}
        icon="download"
        width={460}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setExportModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="download"
              onClick={() => {
                onExportPreset?.(currentCategory, currentSelectedName, exportWithConnection);
                setExportModalOpen(false);
              }}
            >
              Export .json
            </Button>
          </>
        }
      >
        <div className="bb-export-preset-modal">
          <div className="bb-caption-text">
            By default, only prompts, sampler values, and behavior settings are exported for safe public sharing.
          </div>

          {isOpenai && (
            <Switch
              checked={exportWithConnection}
              onChange={setExportWithConnection}
              label="Export with all connection settings"
              description="Include API source, model names, custom proxy URLs and headers"
            />
          )}

          {isOpenai && exportWithConnection && (
            <div className="bb-export-preset-warning">
              <div className="bb-export-preset-warning-title">
                <span>⚠️ ARE YOU SURE?</span>
              </div>
              <div>
                Enabling this will include your selected API source, model names, custom endpoint/proxy URLs, proxy password, and custom headers/body in the exported JSON file. Do not share this file publicly if it contains private proxy URLs or passwords.
              </div>
            </div>
          )}

          <div className="bb-export-preset-shield-note">
            <Icon name="check" size={14} style={{ color: 'var(--bb-ink-accent)' }} />
            <span>Your server-stored API keys in secrets.json are never exported.</span>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Preset"
        subtitle={`Are you sure you want to delete "${currentSelectedName}"?`}
        icon="trash"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              onClick={() => {
                onDeletePreset?.(currentCategory, currentSelectedName);
                setDeleteModalOpen(false);
              }}
            >
              Delete (Backed up)
            </Button>
          </>
        }
      >
        <div className="bb-caption-text">
          A safety backup copy will be automatically saved to <code>data/default-user/backups/</code> before removal.
        </div>
      </Modal>

      <UnsavedChangesModal
        open={Boolean(unsavedSwitchTarget)}
        title="Unsaved Preset Changes"
        subtitle={`You have unsaved edits in "${currentSelectedName}"`}
        saveLabel="Save & Switch"
        discardLabel="Discard & Switch"
        onCancel={() => setUnsavedSwitchTarget(null)}
        onDiscard={() => {
          const target = unsavedSwitchTarget;
          setUnsavedSwitchTarget(null);
          if (target) onSelectPreset?.(target.category, target.name);
        }}
        onSave={async () => {
          const target = unsavedSwitchTarget;
          setUnsavedSwitchTarget(null);
          await onSaveActiveDoc?.();
          if (target) onSelectPreset?.(target.category, target.name);
        }}
        message={
          <>
            Would you like to save your changes to <strong>{currentSelectedName}</strong> before switching to{' '}
            <strong>{unsavedSwitchTarget?.name}</strong>?
          </>
        }
      />

      <UnsavedChangesModal
        open={saveAsUnsavedOpen && saveAsModalOpen}
        subtitle="Save Preset As"
        itemName={saveAsDraftName.trim() || 'New Preset'}
        saveLabel="Save New Preset"
        canSave={canConfirmSaveAs}
        cannotSaveReason="Preset name cannot be empty."
        onCancel={() => setSaveAsUnsavedOpen(false)}
        onDiscard={() => {
          setSaveAsUnsavedOpen(false);
          setSaveAsModalOpen(false);
        }}
        onSave={handleConfirmSaveAs}
      />

      <UnsavedChangesModal
        open={renameUnsavedOpen && renameModalOpen}
        subtitle={`Rename Preset "${currentSelectedName}"`}
        itemName={renameDraftName.trim() || currentSelectedName}
        saveLabel="Rename"
        canSave={canConfirmRename}
        cannotSaveReason="Preset name cannot be empty."
        onCancel={() => setRenameUnsavedOpen(false)}
        onDiscard={() => {
          setRenameUnsavedOpen(false);
          setRenameModalOpen(false);
        }}
        onSave={handleConfirmRename}
      />
    </>
  );
}
