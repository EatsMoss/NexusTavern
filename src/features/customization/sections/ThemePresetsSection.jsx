import React, { useState, useRef } from 'react';
import { buildPresetPreviewSwatches } from '@core/customization/paletteEngine.js';
import { normalizeThemePreset } from '@core/customization/customizationDefaults.js';
import {
  Button,
  Input,
  FolderCard,
  ThemePresetCard,
  Modal,
} from '@ui/index.js';

function downloadJsonFile(fileName, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ThemePresetsSection({ customization, forceOpen = false, onNotify }) {
  const {
    config,
    allPresets,
    applyPreset,
    handleSavePreset,
    handleDeletePreset,
    resetAppearanceToDefault,
  } = customization;

  const [modalMode, setModalMode] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const importInputRef = useRef(null);

  const handleConfirmModal = async () => {
    const clean = draftName.trim();
    if (!clean) return;
    if (modalMode?.type === 'rename' && modalMode.preset) {
      await handleSavePreset(clean, modalMode.preset.id);
    } else {
      await handleSavePreset(clean, null);
    }
    setModalMode(null);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const norm = normalizeThemePreset({ ...parsed, id: undefined, builtin: false });
      if (!norm) throw new Error('Invalid theme preset JSON file.');
      const saved = await handleSavePreset(norm.name, null);
      if (saved) {
        applyPreset({ ...norm, id: saved.id, name: saved.name, builtin: false });
      }
    } catch (err) {
      onNotify?.(err.message || 'Failed to import theme preset JSON', 'error');
    }
  };

  return (
    <>
      <FolderCard
        title="Theme Presets"
        subtitle="Indigo Slate standard & BookboundUI library"
        icon="book"
        forceOpen={forceOpen}
      >
        <div className="bb-cust-toolbar">
          <Button
            variant="b1"
            size="sm"
            emphasis="filled"
            icon="plus"
            onClick={() => {
              setDraftName('');
              setModalMode({ type: 'create', preset: null });
            }}
          >
            Save Preset
          </Button>
          <Button
            variant="b2"
            size="sm"
            icon="upload"
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </Button>
          <Button
            variant="b2"
            size="sm"
            icon="refresh"
            title="Reset appearance to default Indigo Slate"
            onClick={() => setConfirmResetOpen(true)}
          >
            Reset
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={handleImportFile}
          />
        </div>

        <div className="bb-cust-presets-grid">
          {allPresets.map((preset) => {
            const isBuiltin = Boolean(preset.builtin);
            const menuItems = [
              !isBuiltin && {
                id: 'update',
                label: 'Overwrite with Current',
                icon: 'check',
                onClick: () => handleSavePreset(preset.name, preset.id),
              },
              !isBuiltin && {
                id: 'rename',
                label: 'Rename Preset',
                icon: 'edit',
                onClick: () => {
                  setDraftName(preset.name);
                  setModalMode({ type: 'rename', preset });
                },
              },
              {
                id: 'export',
                label: 'Export JSON',
                icon: 'download',
                onClick: () =>
                  downloadJsonFile(
                    `${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-theme.json`,
                    preset,
                  ),
              },
              !isBuiltin && {
                id: 'delete',
                label: 'Delete Preset',
                icon: 'trash',
                danger: true,
                onClick: () => handleDeletePreset(preset.id),
              },
            ].filter(Boolean);

            return (
              <ThemePresetCard
                key={preset.id}
                name={preset.name}
                subtitle={`${preset.themeMode === 'light' ? 'Light' : 'Dark'} · ${
                  preset.colorScheme === 'monochrome' ? 'Monochrome' : 'Two-Color'
                }${isBuiltin ? '' : ' · Custom'}`}
                themeMode={preset.themeMode}
                isDefault={preset.isDefault}
                previewColors={buildPresetPreviewSwatches(preset)}
                active={config.activePresetId === preset.id}
                menuItems={menuItems}
                onSelect={() => applyPreset(preset)}
              />
            );
          })}
        </div>
      </FolderCard>

      <Modal
        open={Boolean(modalMode)}
        onClose={() => setModalMode(null)}
        title={modalMode?.type === 'rename' ? 'Rename Theme Preset' : 'Save New Theme Preset'}
        subtitle="Saves current palette, scheme & RP prose colors to .nexustavern/themes/"
        icon="palette"
        width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="b2" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              disabled={!draftName.trim()}
              onClick={handleConfirmModal}
            >
              Save
            </Button>
          </div>
        }
      >
        <Input
          label="Preset Name"
          placeholder="e.g. Midnight Velvet"
          value={draftName}
          autoFocus
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirmModal();
          }}
        />
      </Modal>

      <Modal
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Reset Appearance to Default?"
        subtitle="Restores Indigo Slate palette, typography & surface defaults."
        icon="refresh"
        width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="b2" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="refresh"
              onClick={() => {
                resetAppearanceToDefault();
                setConfirmResetOpen(false);
              }}
            >
              Reset Appearance
            </Button>
          </div>
        }
      >
        <p className="bb-caption-text">
          All active palette overrides, font scales, surface sliders, and custom CSS will return to
          the clean NexusTavern baseline.
        </p>
      </Modal>
    </>
  );
}

