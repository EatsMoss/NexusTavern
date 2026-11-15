import React, { useState, useRef, useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { BookmarkRibbons } from '../../molecules/BookmarkRibbons/BookmarkRibbons.jsx';
import { FolderCard } from '../../molecules/FolderCard/FolderCard.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { AvatarStack } from '../../molecules/AvatarStack/AvatarStack.jsx';
import {
  ScenarioLinkActionButton,
  ScenarioBindingBar,
} from '../../molecules/ScenarioBindingBar/ScenarioBindingBar.jsx';
import { PromptManager } from '../PromptManager/PromptManager.jsx';
import { PresetSamplersTab } from './PresetSamplersTab.jsx';
import { PresetPromptsUtilities } from './PresetPromptsUtilities.jsx';
import { PresetManageModals } from './PresetManageModals.jsx';
import './PresetVaultInspector.css';

const PRESET_SUB_TABS = [
  { id: 'prompts', label: 'Prompts' },
  { id: 'samplers', label: 'Samplers' },
];

function formatPresetTimestamp(item) {
  if (!item) return { label: '', title: '' };
  const updatedMs =
    Number(item.updatedAtMs || (item.updatedAt ? Date.parse(item.updatedAt) : 0)) || 0;
  const createdMs =
    Number(item.createdAtMs || (item.createdAt ? Date.parse(item.createdAt) : 0)) || 0;
  const primaryMs = updatedMs || createdMs;
  if (!primaryMs) return { label: '', title: '' };

  try {
    const d = new Date(primaryMs);
    const nowYear = new Date().getFullYear();
    const sameYear = d.getFullYear() === nowYear;
    const datePart = d.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const fullFormat = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };
    const titleParts = [];
    if (updatedMs) {
      titleParts.push(`Updated: ${new Date(updatedMs).toLocaleString('en-US', fullFormat)}`);
    }
    if (createdMs) {
      titleParts.push(`Created: ${new Date(createdMs).toLocaleString('en-US', fullFormat)}`);
    }
    return {
      label: `${datePart} · ${timePart}`,
      title: titleParts.join(' • '),
    };
  } catch {
    return { label: '', title: '' };
  }
}

export function PresetVaultInspector({
  mode = 'aiconfig',
  openaiPresets = [],
  activePresets = {},
  onSelectPreset,
  starredPresets = [],
  onToggleStarPreset,
  presetFolders = [],
  onCreatePresetFolder,
  onRenamePresetFolder,
  onDeletePresetFolder,
  onAssignPresetFolder,
  onSaveAsPreset,
  onRenamePreset,
  onDuplicatePreset,
  onDeletePreset,
  onBulkDeletePresets,
  onExportPreset,
  onImportPresetFiles,
  onRevertPreset,
  isPresetDirty = false,
  activeOpenaiDoc = null,
  onChangeOpenaiDoc,
  onSaveOpenaiDoc,
  activeTextgenDoc = null,
  onChangeTextgenDoc,
  onSaveTextgenDoc,
  aiSubTab: controlledAiSubTab,
  onChangeAiSubTab,
  presetStatusMsg = '',
  savingPreset = false,
  loadingPreset = false,
  promptTokenContext = null,
  promptManagerSlot = null,
  activeModelMeta = null,
  editingPromptSelection = null,
  onChangeEditingPromptSelection,
  cards = [],
  activeCharacter = null,
  hasActiveScenario = false,
  characterBindings = {},
  onBindCharacterPreset,
  onUnbindAllCharactersFromPreset,
  onSelectCharacter,
}) {
  const [internalAiSubTab, setInternalAiSubTab] = useState('prompts'); // 'prompts' | 'samplers'
  const rawSubTab = controlledAiSubTab || internalAiSubTab;
  const aiSubTab = rawSubTab === 'samplers' ? 'samplers' : 'prompts';
  const handleSelectAiSubTab = (val) => {
    setInternalAiSubTab(val);
    onChangeAiSubTab?.(val);
  };

  // Preset Management Modals State
  const [saveAsModalOpen, setSaveAsModalOpen] = useState(false);
  const [saveAsDraftName, setSaveAsDraftName] = useState('');
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameDraftName, setRenameDraftName] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportWithConnection, setExportWithConnection] = useState(false);
  const [unsavedSwitchTarget, setUnsavedSwitchTarget] = useState(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  const fileInputRef = useRef(null);

  const cardsByAvatar = useMemo(() => {
    const map = new Map();
    for (const c of cards) {
      const av = c?.avatar || c?.id;
      if (av) map.set(av, c);
    }
    return map;
  }, [cards]);

  const boundScenariosByPreset = useMemo(() => {
    const byPreset = new Map();
    if (!characterBindings || typeof characterBindings !== 'object') return byPreset;
    for (const [avatar, presetName] of Object.entries(characterBindings)) {
      if (!avatar || !presetName) continue;
      const cardObj = cardsByAvatar.get(avatar);
      if (!cardObj) continue;
      const list = byPreset.get(presetName) || [];
      list.push(cardObj);
      byPreset.set(presetName, list);
    }
    return byPreset;
  }, [characterBindings, cardsByAvatar]);

  const enrichedAvailableScenarios = useMemo(
    () =>
      cards
        .filter((c) => c && (c.avatar || c.id) && !String(c.id || '').startsWith('c_'))
        .map((c) => {
          const av = c.avatar || c.id;
          return {
            ...c,
            boundPresetName: characterBindings?.[av] || '',
          };
        }),
    [cards, characterBindings],
  );

  const effectiveActiveScenario = useMemo(() => {
    if (!hasActiveScenario || !activeCharacter) return null;
    const av = activeCharacter.avatar || activeCharacter.id || '';
    if (!av || av.startsWith('c_')) return null;
    return cardsByAvatar.get(av) || activeCharacter;
  }, [hasActiveScenario, activeCharacter, cardsByAvatar]);

  if (mode === 'aiconfig') {
    const isOpenai = true;
    const currentCategory = 'openai';
    const currentList = openaiPresets;
    const currentSelectedName = activePresets.openai;
    const oaiData = activeOpenaiDoc?.data || {};
    const orderedPrompts = activeOpenaiDoc?.orderedPrompts || [];
    const unlinkedPrompts = activeOpenaiDoc?.unlinkedPrompts || [];
    const tgData = activeTextgenDoc?.data || {};

    const patchOaiField = (patch) => {
      if (!activeOpenaiDoc) return;
      onChangeOpenaiDoc?.({
        ...activeOpenaiDoc,
        data: { ...oaiData, ...patch },
      });
    };

    const patchTgField = (patch) => {
      if (!activeTextgenDoc) return;
      onChangeTextgenDoc?.({
        ...activeTextgenDoc,
        data: { ...tgData, ...patch },
      });
    };

    const handleRequestSwitchPreset = (nextName) => {
      if (!nextName || nextName === currentSelectedName) return;
      if (isPresetDirty) {
        setUnsavedSwitchTarget({ category: currentCategory, name: nextName });
        return;
      }
      onSelectPreset?.(currentCategory, nextName);
    };

    const handleFilesImport = async (fileList) => {
      if (!fileList || fileList.length === 0) return;
      const parsedItems = [];
      for (const file of Array.from(fileList)) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const cleanName = file.name.replace(/\.(json|settings)$/i, '').trim();
          parsedItems.push({ name: cleanName || 'Imported Preset', data: json });
        } catch {
          // skip invalid JSON file
        }
      }
      if (parsedItems.length > 0) {
        onImportPresetFiles?.(currentCategory, parsedItems);
      }
    };

    const manageMenuItems = [
      {
        id: 'save-as',
        label: 'Save As / New Preset...',
        icon: 'plus',
        onClick: () => {
          setSaveAsDraftName(`${currentSelectedName || 'Preset'} (Custom)`);
          setSaveAsModalOpen(true);
        },
      },
      {
        id: 'rename',
        label: 'Rename Preset...',
        icon: 'edit',
        onClick: () => {
          setRenameDraftName(currentSelectedName || '');
          setRenameModalOpen(true);
        },
      },
      {
        id: 'duplicate',
        label: 'Duplicate Preset',
        icon: 'copy',
        onClick: () => onDuplicatePreset?.(currentCategory, currentSelectedName),
      },
      {
        id: 'import',
        label: 'Import JSON Preset(s)...',
        icon: 'upload',
        onClick: () => fileInputRef.current?.click(),
      },
      {
        id: 'export',
        label: 'Export Preset...',
        icon: 'download',
        onClick: () => {
          setExportWithConnection(false);
          setExportModalOpen(true);
        },
      },
      {
        id: 'delete',
        label: 'Delete Preset...',
        icon: 'trash',
        danger: true,
        onClick: () => setDeleteModalOpen(true),
      },
    ];

    return (
      <div className="bb-aiconfig-root">
        {(loadingPreset || savingPreset) && (
          <ProgressIndicator
            variant="linear"
            size="sm"
            overlay="top"
            ariaLabel={savingPreset ? 'Saving preset' : 'Loading preset'}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.settings"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFilesImport(e.target.files);
            e.target.value = '';
          }}
        />

        <FolderCard
          title="Completion Presets"
          subtitle={`${currentList.length} SillyTavern presets • Drag & drop .json to import`}
          icon="sliders"
          defaultOpen
        >
          <div
            className={`bb-preset-dropzone ${isDraggingFiles ? 'is-dragging-file' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer?.types?.includes('Files')) {
                e.preventDefault();
                setIsDraggingFiles(true);
              }
            }}
            onDragLeave={() => setIsDraggingFiles(false)}
            onDrop={(e) => {
              if (e.dataTransfer?.files?.length) {
                e.preventDefault();
                setIsDraggingFiles(false);
                handleFilesImport(e.dataTransfer.files);
              }
            }}
          >
            {isDraggingFiles && (
              <div className="bb-preset-dropzone-overlay">
                <Icon name="upload" size={22} />
                <span>Drop .json preset file(s) to import</span>
              </div>
            )}

            <Dropdown
              label="Chat Completion Preset"
              options={currentList.map((item) => {
                const ts = formatPresetTimestamp(item);
                return {
                  value: item.name,
                  label: item.name,
                  folderId: item.folderId || null,
                  createdAt: item.createdAt,
                  createdAtMs: item.createdAtMs,
                  updatedAt: item.updatedAt,
                  updatedAtMs: item.updatedAtMs,
                  timestamp: ts.label,
                  timestampTitle: ts.title,
                  meta:
                    item.promptsCount !== undefined
                      ? `${item.promptsCount} prompts`
                      : `${Math.max(1, Math.round((item.fileSize || 0) / 1024))} KB`,
                };
              })}
              value={currentSelectedName || ''}
              onChange={handleRequestSwitchPreset}
              starredValues={starredPresets}
              onToggleStar={(val) => onToggleStarPreset?.(val, currentCategory)}
              sortable
              enableFolders
              folders={presetFolders}
              onCreateFolder={(folderName, selectedNames) =>
                onCreatePresetFolder?.(currentCategory, folderName, selectedNames)
              }
              onRenameFolder={(folderId, newName) =>
                onRenamePresetFolder?.(currentCategory, folderId, newName)
              }
              onDeleteFolder={(folderId) =>
                onDeletePresetFolder?.(currentCategory, folderId)
              }
              onAssignFolder={(names, folderId) =>
                onAssignPresetFolder?.(currentCategory, names, folderId)
              }
              enableBulkEdit
              onBulkDelete={(names) => onBulkDeletePresets?.(currentCategory, names)}
              renderTriggerTail={() => {
                const selectedBound =
                  boundScenariosByPreset.get(currentSelectedName) || [];
                if (selectedBound.length === 0) return null;
                return (
                  <AvatarStack
                    size={20}
                    maxVisible={3}
                    overlap={0.35}
                    items={selectedBound.map((sc) => ({
                      id: sc.avatar || sc.id,
                      name: sc.name || sc.avatar,
                      initials: sc.initials,
                      avatarUrl: sc.thumbnailUrl || sc.avatarUrl || null,
                      title: `Bound to ${sc.name || sc.avatar}`,
                    }))}
                  />
                );
              }}
              renderOptionTail={(opt) => {
                const rowBound = boundScenariosByPreset.get(opt.value) || [];
                const activeAv =
                  effectiveActiveScenario?.avatar || effectiveActiveScenario?.id || '';
                const activeCurrentPreset = activeAv
                  ? characterBindings?.[activeAv] || ''
                  : '';
                return (
                  <ScenarioLinkActionButton
                    targetLabel={opt.label}
                    linkedScenarios={rowBound}
                    activeScenario={effectiveActiveScenario}
                    activeScenarioBoundOther={
                      activeCurrentPreset && activeCurrentPreset !== opt.value
                        ? activeCurrentPreset
                        : ''
                    }
                    onToggleActiveScenario={
                      activeAv && onBindCharacterPreset
                        ? (nextBound) =>
                            onBindCharacterPreset(
                              activeAv,
                              nextBound ? opt.value : null,
                            )
                        : undefined
                    }
                  />
                );
              }}
            />

            {currentSelectedName && (
              <ScenarioBindingBar
                entityName={currentSelectedName}
                linkedScenarios={boundScenariosByPreset.get(currentSelectedName) || []}
                availableScenarios={enrichedAvailableScenarios}
                activeScenario={effectiveActiveScenario}
                activeScenarioBoundOther={(() => {
                  const activeAv =
                    effectiveActiveScenario?.avatar || effectiveActiveScenario?.id || '';
                  const cur = activeAv ? characterBindings?.[activeAv] || '' : '';
                  return cur && cur !== currentSelectedName ? cur : '';
                })()}
                onBindScenario={(av) =>
                  onBindCharacterPreset?.(av, currentSelectedName)
                }
                onUnbindScenario={(av) => onBindCharacterPreset?.(av, null)}
                onUnbindAll={
                  onUnbindAllCharactersFromPreset
                    ? () => onUnbindAllCharactersFromPreset(currentSelectedName)
                    : undefined
                }
                onSelectScenario={onSelectCharacter}
              />
            )}
            {isPresetDirty && (
              <div className="bb-preset-dirty-banner">
                <span>Unsaved changes in “{currentSelectedName}”</span>
                <div className="bb-preset-dirty-banner-actions">
                  <Button
                    variant="b2"
                    size="sm"
                    icon="refresh"
                    title="Revert unsaved edits"
                    onClick={() => onRevertPreset?.(currentCategory, currentSelectedName)}
                  >
                    Revert
                  </Button>
                </div>
              </div>
            )}

            <div className="bb-preset-action-row">
              <div className="bb-preset-action-group">
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  icon="check"
                  disabled={savingPreset}
                  onClick={isOpenai ? onSaveOpenaiDoc : onSaveTextgenDoc}
                  title="Save changes to active preset file"
                >
                  {savingPreset ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="outlined"
                  icon="plus"
                  onClick={() => {
                    setSaveAsDraftName(`${currentSelectedName || 'Preset'} (Custom)`);
                    setSaveAsModalOpen(true);
                  }}
                  title="Save as a new preset"
                >
                  Save As
                </Button>
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="outlined"
                  icon="upload"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import .json preset file(s)"
                >
                  Import
                </Button>
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="outlined"
                  icon="download"
                  onClick={() => {
                    setExportWithConnection(false);
                    setExportModalOpen(true);
                  }}
                  title="Export active preset to .json"
                >
                  Export
                </Button>
              </div>
              <div className="bb-preset-action-group">
                <KebabMenu items={manageMenuItems} title="More preset actions" />
              </div>
            </div>

            {presetStatusMsg && (
              <div className="bb-caption-text" style={{ fontSize: 11 }}>
                {presetStatusMsg}
              </div>
            )}
          </div>
        </FolderCard>

        <BookmarkRibbons
          variant="secondary"
          tabs={PRESET_SUB_TABS}
          activeId={aiSubTab}
          onChange={handleSelectAiSubTab}
        />

        {aiSubTab === 'samplers' && (
          <PresetSamplersTab
            isOpenai={isOpenai}
            oaiData={oaiData}
            patchOaiField={patchOaiField}
            tgData={tgData}
            patchTgField={patchTgField}
            activeModelMeta={activeModelMeta}
          />
        )}

        {activeOpenaiDoc && aiSubTab === 'prompts' && (
          <>
            <PresetPromptsUtilities oaiData={oaiData} patchOaiField={patchOaiField} />
            {promptManagerSlot || (
              <PromptManager
                orderedPrompts={orderedPrompts}
                unlinkedPrompts={unlinkedPrompts}
                tokenContext={promptTokenContext}
                activeEditorSelection={editingPromptSelection}
                onChangeEditorSelection={onChangeEditingPromptSelection}
                onChangePrompts={({ orderedPrompts: nextOrdered, unlinkedPrompts: nextUnlinked }) => {
                  onChangeOpenaiDoc?.({
                    ...activeOpenaiDoc,
                    orderedPrompts: nextOrdered,
                    unlinkedPrompts: nextUnlinked,
                  });
                }}
              />
            )}
          </>
        )}

        <PresetManageModals
          isOpenai={isOpenai}
          currentCategory={currentCategory}
          currentSelectedName={currentSelectedName}
          activeDoc={isOpenai ? activeOpenaiDoc : activeTextgenDoc}
          saveAsModalOpen={saveAsModalOpen}
          setSaveAsModalOpen={setSaveAsModalOpen}
          saveAsDraftName={saveAsDraftName}
          setSaveAsDraftName={setSaveAsDraftName}
          onSaveAsPreset={onSaveAsPreset}
          renameModalOpen={renameModalOpen}
          setRenameModalOpen={setRenameModalOpen}
          renameDraftName={renameDraftName}
          setRenameDraftName={setRenameDraftName}
          onRenamePreset={onRenamePreset}
          exportModalOpen={exportModalOpen}
          setExportModalOpen={setExportModalOpen}
          exportWithConnection={exportWithConnection}
          setExportWithConnection={setExportWithConnection}
          onExportPreset={onExportPreset}
          deleteModalOpen={deleteModalOpen}
          setDeleteModalOpen={setDeleteModalOpen}
          onDeletePreset={onDeletePreset}
          unsavedSwitchTarget={unsavedSwitchTarget}
          setUnsavedSwitchTarget={setUnsavedSwitchTarget}
          onSelectPreset={onSelectPreset}
          onSaveActiveDoc={isOpenai ? onSaveOpenaiDoc : onSaveTextgenDoc}
        />
      </div>
    );
  }

  return null;
}
