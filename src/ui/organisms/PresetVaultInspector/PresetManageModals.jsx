import React from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Modal } from '../Modal/Modal.jsx';

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
  return (
    <>
      <Modal
        open={saveAsModalOpen}
        onClose={() => setSaveAsModalOpen(false)}
        title="Save Preset As"
        subtitle={`Create a new ${isOpenai ? 'Chat Completion' : 'TextGen'} preset`}
        icon="plus"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setSaveAsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!saveAsDraftName.trim()}
              onClick={() => {
                const clean = saveAsDraftName.trim();
                if (!clean) return;
                onSaveAsPreset?.(currentCategory, clean, activeDoc);
                setSaveAsModalOpen(false);
              }}
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
        onClose={() => setRenameModalOpen(false)}
        title="Rename Preset"
        subtitle={`Current preset: ${currentSelectedName}`}
        icon="edit"
        width={420}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!renameDraftName.trim() || renameDraftName.trim() === currentSelectedName}
              onClick={() => {
                const clean = renameDraftName.trim();
                if (!clean) return;
                onRenamePreset?.(currentCategory, currentSelectedName, clean);
                setRenameModalOpen(false);
              }}
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

      <Modal
        open={Boolean(unsavedSwitchTarget)}
        onClose={() => setUnsavedSwitchTarget(null)}
        title="Unsaved Preset Changes"
        subtitle={`You have unsaved edits in "${currentSelectedName}"`}
        icon="sliders"
        width={450}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={() => setUnsavedSwitchTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="outlined"
              onClick={() => {
                const target = unsavedSwitchTarget;
                setUnsavedSwitchTarget(null);
                if (target) onSelectPreset?.(target.category, target.name);
              }}
            >
              Discard &amp; Switch
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              onClick={async () => {
                const target = unsavedSwitchTarget;
                setUnsavedSwitchTarget(null);
                await onSaveActiveDoc?.();
                if (target) onSelectPreset?.(target.category, target.name);
              }}
            >
              Save &amp; Switch
            </Button>
          </>
        }
      >
        <div className="bb-caption-text">
          Would you like to save your changes to <strong>{currentSelectedName}</strong> before switching to{' '}
          <strong>{unsavedSwitchTarget?.name}</strong>?
        </div>
      </Modal>
    </>
  );
}
