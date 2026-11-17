import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Checkbox } from '../../atoms/Checkbox/Checkbox.jsx';
import { Dropdown } from '../../molecules/Dropdown/Dropdown.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { PanelScreenHeader } from '../../molecules/PanelScreenHeader/PanelScreenHeader.jsx';
import { SortableStack } from '../../molecules/SortableStack/SortableStack.jsx';
import { MultiSelectBar } from '../MultiSelectBar/MultiSelectBar.jsx';
import { Modal } from '../Modal/Modal.jsx';
import {
  REGEX_PLACEMENT,
  normalizeRegexScript,
  createDefaultRegexScript,
  analyzeRegexSafety,
} from '@core/regex/regexEngine.js';
import { RegexEditorModal } from './RegexEditorModal.jsx';
import { UnsavedChangesModal } from '../UnsavedChangesModal/UnsavedChangesModal.jsx';
import './RegexManager.css';

const PLACEMENT_SHORT_LABELS = {
  [REGEX_PLACEMENT.AI_OUTPUT]: 'AI',
  [REGEX_PLACEMENT.USER_INPUT]: 'User',
  [REGEX_PLACEMENT.REASONING]: 'Thoughts',
  [REGEX_PLACEMENT.WORLD_INFO]: 'Lore',
  [REGEX_PLACEMENT.SLASH_COMMAND]: 'Slash',
};

function formatRuleSummary(script) {
  const mode =
    script.markdownOnly && script.promptOnly
      ? 'Visual+Prompt'
      : script.markdownOnly
        ? 'Visual'
        : script.promptOnly
          ? 'Prompt'
          : 'Saved';
  const targets = (script.placement || [])
    .map((pl) => PLACEMENT_SHORT_LABELS[pl])
    .filter(Boolean)
    .join('+');
  return targets ? `${mode} · ${targets}` : mode;
}

function downloadJsonBlob(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeDownloadFilename(name = 'regex_rule') {
  return (
    String(name || 'regex_rule')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 80) || 'regex_rule'
  );
}

/**
 * RegexManager — Reusable Pure M3 Organism for managing Global, Scenario (Card),
 * and Preset Regex pipelines with folders, Drag & Drop order, bulk actions,
 * SillyTavern JSON import/export, and integrated Live Debugger modal.
 */
export function RegexManager({
  masterEnabled = true,
  onToggleMaster,
  activeScope = 'global', // 'global' | 'card' | 'preset'
  onChangeScope,
  globalScripts = [],
  cardScripts = [],
  presetScripts = [],
  hasActiveScenario = false,
  scenarioName = '',
  presetName = '',
  userName = 'User',
  sampleSeedText = '',
  scopeFolders = [],
  scopeAssignments = {},
  onSaveScripts,
  onSaveFolders,
  onTransferScript,
  onNotify,
  onBack = null,
  backLabel = 'Back to Plugins',
  collapsible = false,
  defaultOpen = true,
}) {
  const fileInputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());

  // Multi-select state
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals state
  const [editorTarget, setEditorTarget] = useState(null); // { script, isNew }
  const [folderModal, setFolderModal] = useState(null); // { mode: 'create'|'rename', folderId?, name, initialName? }
  const [folderUnsavedOpen, setFolderUnsavedOpen] = useState(false);
  const [assignModal, setAssignModal] = useState(null); // { scriptIds: string[] }

  const currentScripts = useMemo(() => {
    if (activeScope === 'card') return cardScripts;
    if (activeScope === 'preset') return presetScripts;
    return globalScripts;
  }, [activeScope, globalScripts, cardScripts, presetScripts]);

  const activeTotalStackCount = useMemo(() => {
    if (!masterEnabled) return 0;
    const g = globalScripts.filter((s) => !s.disabled).length;
    const p = presetScripts.filter((s) => !s.disabled).length;
    const c = hasActiveScenario ? cardScripts.filter((s) => !s.disabled).length : 0;
    return g + p + c;
  }, [masterEnabled, globalScripts, presetScripts, cardScripts, hasActiveScenario]);

  const scopeLockedReason =
    activeScope === 'card' && !hasActiveScenario
      ? 'Select a scenario card first to manage scenario-specific rules.'
      : '';

  const scopeLabel =
    activeScope === 'card'
      ? `Scenario · ${scenarioName || 'None'}`
      : activeScope === 'preset'
        ? `Preset · ${presetName || 'Default'}`
        : 'Global Rules';

  const scopeOptions = useMemo(
    () => [
      {
        value: 'global',
        label: 'Global Rules',
        meta: `${globalScripts.length}`,
      },
      {
        value: 'card',
        label: scenarioName ? `Scenario · ${scenarioName}` : 'Scenario Rules',
        meta: `${cardScripts.length}`,
      },
      {
        value: 'preset',
        label: `Preset · ${presetName || 'Default'}`,
        meta: `${presetScripts.length}`,
      },
    ],
    [globalScripts.length, cardScripts.length, presetScripts.length, scenarioName, presetName],
  );

  const qLower = searchQuery.trim().toLowerCase();
  const isFiltered = Boolean(qLower);

  const filteredScripts = useMemo(
    () =>
      currentScripts.filter((s) => {
        if (!qLower) return true;
        const hay = `${s.scriptName || ''} ${s.findRegex || ''} ${s.replaceString || ''}`.toLowerCase();
        return hay.includes(qLower);
      }),
    [currentScripts, qLower],
  );

  // Group filtered scripts into user folders + ungrouped root list
  const groupedStructure = useMemo(() => {
    const folderMap = new Map(scopeFolders.map((f) => [f.id, { ...f, items: [] }]));
    const rootItems = [];
    for (const s of filteredScripts) {
      const fId = scopeAssignments?.[s.id];
      if (fId && folderMap.has(fId)) {
        folderMap.get(fId).items.push(s);
      } else {
        rootItems.push(s);
      }
    }
    return {
      folders: Array.from(folderMap.values()).filter(
        (f) => !isFiltered || f.items.length > 0,
      ),
      rootItems,
    };
  }, [filteredScripts, scopeFolders, scopeAssignments, isFiltered]);

  const handleToggleCollapseFolder = (folderId) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleToggleSingleScript = useCallback(
    (scriptId, enabled) => {
      const next = currentScripts.map((s) =>
        s.id === scriptId ? { ...s, disabled: !enabled } : s,
      );
      onSaveScripts?.(activeScope, next);
    },
    [currentScripts, activeScope, onSaveScripts],
  );

  const handleSaveEditedScript = (savedScript) => {
    if (!editorTarget) return;
    if (editorTarget.isNew) {
      onSaveScripts?.(activeScope, [...currentScripts, savedScript]);
      onNotify?.(`Created rule "${savedScript.scriptName}"`, 'success');
    } else {
      const next = currentScripts.map((s) =>
        s.id === savedScript.id ? savedScript : s,
      );
      onSaveScripts?.(activeScope, next);
      onNotify?.(`Saved rule "${savedScript.scriptName}"`, 'success');
    }
  };

  const handleDuplicateScript = (script) => {
    const copy = normalizeRegexScript({
      ...script,
      id: '',
      scriptName: `${script.scriptName} (Copy)`,
    });
    const idx = currentScripts.findIndex((s) => s.id === script.id);
    const next = [...currentScripts];
    next.splice(idx >= 0 ? idx + 1 : next.length, 0, copy);
    onSaveScripts?.(activeScope, next);
    const fId = scopeAssignments?.[script.id];
    if (fId) {
      onSaveFolders?.(scopeFolders, { ...scopeAssignments, [copy.id]: fId });
    }
  };

  const handleDeleteScripts = (idsToDelete = []) => {
    const idSet = new Set(idsToDelete);
    const next = currentScripts.filter((s) => !idSet.has(s.id));
    onSaveScripts?.(activeScope, next);
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
    onNotify?.(
      idsToDelete.length === 1
        ? 'Regex rule deleted'
        : `Deleted ${idsToDelete.length} regex rules`,
      'info',
    );
  };

  const handleReorderSubset = (subsetItems, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const reorderedSubset = [...subsetItems];
    const [moved] = reorderedSubset.splice(fromIdx, 1);
    reorderedSubset.splice(toIdx, 0, moved);

    const subsetIds = new Set(subsetItems.map((s) => s.id));
    let cursor = 0;
    const nextFull = currentScripts.map((s) => {
      if (subsetIds.has(s.id)) {
        const item = reorderedSubset[cursor];
        cursor += 1;
        return item;
      }
      return s;
    });
    onSaveScripts?.(activeScope, nextFull);
  };

  const handleImportFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const imported = [];
    for (const file of files) {
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.regex)
            ? parsed.regex
            : Array.isArray(parsed?.regex_scripts)
              ? parsed.regex_scripts
              : parsed && typeof parsed === 'object' && parsed.findRegex !== undefined
                ? [parsed]
                : [];
        for (const c of candidates) {
          imported.push(normalizeRegexScript({ ...c, id: '' }));
        }
      } catch {
        onNotify?.(`Failed to parse "${file.name}"`, 'error');
      }
    }

    if (imported.length > 0) {
      onSaveScripts?.(activeScope, [...currentScripts, ...imported]);
      onNotify?.(
        `Imported ${imported.length} SillyTavern regex ${imported.length === 1 ? 'rule' : 'rules'}`,
        'success',
      );
    }
  };

  const handleToggleSelectId = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleConfirmFolderModal = () => {
    if (!folderModal) return;
    const cleanName = String(folderModal.name || '').trim();
    if (!cleanName) return;

    if (folderModal.mode === 'create') {
      const newFolder = {
        id: `rxf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
      };
      onSaveFolders?.([...scopeFolders, newFolder], scopeAssignments);
    } else if (folderModal.mode === 'rename' && folderModal.folderId) {
      const nextFolders = scopeFolders.map((f) =>
        f.id === folderModal.folderId ? { ...f, name: cleanName } : f,
      );
      onSaveFolders?.(nextFolders, scopeAssignments);
    }
    setFolderUnsavedOpen(false);
    setFolderModal(null);
  };

  const isFolderModalDirty = Boolean(
    folderModal &&
      String(folderModal.name || '').trim() !==
        String(folderModal.initialName ?? '').trim(),
  );

  const handleRequestCloseFolderModal = () => {
    if (isFolderModalDirty) {
      setFolderUnsavedOpen(true);
      return;
    }
    setFolderUnsavedOpen(false);
    setFolderModal(null);
  };

  const handleDeleteFolderOnly = (folderId) => {
    const nextFolders = scopeFolders.filter((f) => f.id !== folderId);
    const nextAssign = { ...scopeAssignments };
    for (const [sId, fId] of Object.entries(nextAssign)) {
      if (fId === folderId) delete nextAssign[sId];
    }
    onSaveFolders?.(nextFolders, nextAssign);
  };

  const handleAssignToFolder = (targetFolderId) => {
    if (!assignModal?.scriptIds?.length) return;
    const nextAssign = { ...scopeAssignments };
    for (const id of assignModal.scriptIds) {
      if (!targetFolderId) {
        delete nextAssign[id];
      } else {
        nextAssign[id] = targetFolderId;
      }
    }
    onSaveFolders?.(scopeFolders, nextAssign);
    setAssignModal(null);
    if (multiSelect) {
      setMultiSelect(false);
      setSelectedIds([]);
    }
  };

  const renderScriptItem = (script) => {
    const isChecked = selectedIds.includes(script.id);
    const safety = analyzeRegexSafety(script.findRegex);
    const summaryText = formatRuleSummary(script);

    const otherScopes = [
      activeScope !== 'global' && { scope: 'global', label: 'Global' },
      activeScope !== 'card' &&
        hasActiveScenario && { scope: 'card', label: scenarioName ? `Scenario (${scenarioName})` : 'Scenario' },
      activeScope !== 'preset' && {
        scope: 'preset',
        label: `Preset (${presetName || 'Default'})`,
      },
    ].filter(Boolean);

    const kebabItems = [
      {
        label: 'Edit Rule',
        icon: 'edit',
        onClick: () => setEditorTarget({ script, isNew: false }),
      },
      {
        label: 'Duplicate',
        icon: 'copy',
        onClick: () => handleDuplicateScript(script),
      },
      ...(scopeFolders.length > 0
        ? [
            {
              label: 'Move to Folder...',
              icon: 'folder',
              onClick: () => setAssignModal({ scriptIds: [script.id] }),
            },
          ]
        : []),
      ...otherScopes.map((dst) => ({
        label: `Move to ${dst.label}`,
        icon: 'externalLink',
        onClick: () => onTransferScript?.(script.id, dst.scope, 'move'),
      })),
      ...otherScopes.map((dst) => ({
        label: `Copy to ${dst.label}`,
        icon: 'plus',
        onClick: () => onTransferScript?.(script.id, dst.scope, 'copy'),
      })),
      {
        label: 'Export .json',
        icon: 'download',
        onClick: () =>
          downloadJsonBlob(`${sanitizeDownloadFilename(script.scriptName)}.json`, script),
      },
      {
        label: 'Delete',
        icon: 'trash',
        danger: true,
        onClick: () => handleDeleteScripts([script.id]),
      },
    ];

    return (
      <div
        className={[
          'bb-rx-item',
          script.disabled ? 'is-disabled' : '',
          isChecked ? 'is-selected' : '',
          !safety.valid ? 'has-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {multiSelect ? (
          <div data-rx-nodrag="true" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isChecked}
              onChange={() => handleToggleSelectId(script.id)}
            />
          </div>
        ) : (
          <span className="bb-rx-item__grip" title="Drag to reorder">
            <Icon name="gripVertical" size={14} />
          </span>
        )}

        <div
          className="bb-rx-item__body"
          onClick={() => {
            if (multiSelect) {
              handleToggleSelectId(script.id);
            } else {
              setEditorTarget({ script, isNew: false });
            }
          }}
        >
          <div className="bb-rx-item__top">
            <span className="bb-rx-item__name">{script.scriptName || 'Untitled Rule'}</span>
            {!safety.valid && (
              <span className="bb-rx-badge bb-rx-badge--danger" title={safety.error}>
                Invalid
              </span>
            )}
            {safety.valid && safety.risk === 'danger' && (
              <span className="bb-rx-badge bb-rx-badge--warning" title={safety.warningMessage}>
                Slow
              </span>
            )}
          </div>
          <div className="bb-rx-item__sub">
            <span className="bb-rx-item__meta">{summaryText}</span>
            {script.findRegex && (
              <span className="bb-rx-item__pattern">{script.findRegex}</span>
            )}
          </div>
        </div>

        <div
          className="bb-rx-item__controls"
          data-rx-nodrag="true"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            size="sm"
            checked={!script.disabled}
            onChange={(val) => handleToggleSingleScript(script.id, val)}
          />
          <KebabMenu items={kebabItems} size="sm" title="Rule actions" />
        </div>
      </div>
    );
  };

  const allFilteredSelected =
    filteredScripts.length > 0 &&
    filteredScripts.every((s) => selectedIds.includes(s.id));

  const batchActions = [
    {
      id: 'enable',
      label: 'Enable',
      icon: 'check',
      onClick: () => {
        const set = new Set(selectedIds);
        onSaveScripts?.(
          activeScope,
          currentScripts.map((s) => (set.has(s.id) ? { ...s, disabled: false } : s)),
        );
      },
    },
    {
      id: 'disable',
      label: 'Disable',
      icon: 'eyeOff',
      onClick: () => {
        const set = new Set(selectedIds);
        onSaveScripts?.(
          activeScope,
          currentScripts.map((s) => (set.has(s.id) ? { ...s, disabled: true } : s)),
        );
      },
    },
    {
      id: 'folder',
      label: 'Folder',
      icon: 'folder',
      onClick: () => setAssignModal({ scriptIds: [...selectedIds] }),
    },
    {
      id: 'export',
      label: 'Export',
      icon: 'download',
      onClick: () => {
        const set = new Set(selectedIds);
        const picked = currentScripts.filter((s) => set.has(s.id));
        downloadJsonBlob(`nexustavern_regex_${activeScope}.json`, picked);
      },
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'trash',
      danger: true,
      onClick: () => handleDeleteScripts(selectedIds),
    },
  ];

  const headerMenuItems = [
    ...(!scopeLockedReason
      ? [
          {
            label: 'New Folder',
            icon: 'folderPlus',
            onClick: () => setFolderModal({ mode: 'create', name: '', initialName: '' }),
          },
        ]
      : []),
    ...(currentScripts.length > 0 && !scopeLockedReason
      ? [
          {
            label: multiSelect ? 'Exit Multi-Select' : 'Select Multiple',
            icon: 'selectAll',
            onClick: () => {
              setMultiSelect((v) => !v);
              setSelectedIds([]);
            },
          },
          {
            label: 'Export Scope (.json)',
            icon: 'download',
            onClick: () =>
              downloadJsonBlob(`nexustavern_${activeScope}_regex.json`, currentScripts),
          },
        ]
      : []),
  ];

  const showBody = !collapsible || isOpen;

  return (
    <div
      className={[
        'bb-rx-sheet',
        onBack ? 'is-subscreen' : '',
        collapsible ? 'bb-rx-sheet--collapsible' : '',
        !showBody ? 'is-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.files?.length && !scopeLockedReason) {
          e.preventDefault();
          handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {onBack ? (
        <PanelScreenHeader
          title="Regex Studio"
          icon="regex"
          backLabel={backLabel}
          onBack={onBack}
          badge={
            <span className="bb-rx-sheet__count" title="Active rules across Global, Scenario & Preset">
              {activeTotalStackCount}
            </span>
          }
          actions={
            <>
              <Switch
                size="sm"
                checked={masterEnabled}
                onChange={(val) => onToggleMaster?.(val)}
                title={masterEnabled ? 'Regex enabled' : 'Regex paused'}
              />
              {headerMenuItems.length > 0 && (
                <KebabMenu items={headerMenuItems} size="sm" title="More options" />
              )}
            </>
          }
        />
      ) : (
      <div
        className="bb-rx-sheet__header"
        onClick={() => {
          if (collapsible) setIsOpen((prev) => !prev);
        }}
      >
        <div className="bb-rx-sheet__title-group">
          <Icon name="regex" size={17} className="bb-rx-sheet__title-icon" />
          <span>Regex</span>
          <span className="bb-rx-sheet__count" title="Active rules across Global, Scenario & Preset">
            {activeTotalStackCount}
          </span>
        </div>

        <div
          className="bb-rx-sheet__header-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            size="sm"
            checked={masterEnabled}
            onChange={(val) => onToggleMaster?.(val)}
            title={masterEnabled ? 'Regex enabled' : 'Regex paused'}
          />
          {headerMenuItems.length > 0 && (
            <KebabMenu items={headerMenuItems} size="sm" title="More options" />
          )}
          {collapsible && (
            <button
              type="button"
              className={`bb-rx-sheet__chevron ${showBody ? 'is-open' : ''}`.trim()}
              aria-label={showBody ? 'Collapse Regex' : 'Expand Regex'}
              title={showBody ? 'Collapse' : 'Expand'}
              onClick={() => setIsOpen((prev) => !prev)}
            >
              <Icon name="chevronDown" size={17} />
            </button>
          )}
        </div>
      </div>
      )}

      {showBody && (
      <>
      <div className="bb-rx-sheet__controls">
        <div className="bb-rx-top-actions">
          <Button
            variant="b1"
            emphasis="filled"
            fullWidth
            icon="plus"
            disabled={Boolean(scopeLockedReason)}
            title={scopeLockedReason || `Create a new rule in ${scopeLabel}`}
            onClick={() =>
              setEditorTarget({
                script: createDefaultRegexScript(),
                isNew: true,
              })
            }
          >
            New
          </Button>
          <Button
            variant="b1"
            emphasis="tonal"
            fullWidth
            icon="upload"
            disabled={Boolean(scopeLockedReason)}
            title={scopeLockedReason || `Import SillyTavern regex .json into ${scopeLabel}`}
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </Button>
        </div>

        <Dropdown
          options={scopeOptions}
          value={activeScope}
          onChange={(val) => {
            setMultiSelect(false);
            setSelectedIds([]);
            onChangeScope?.(val);
          }}
          searchable={false}
          allowStars={false}
        />

        {!scopeLockedReason && (currentScripts.length > 0 || Boolean(searchQuery)) && (
          <div className="bb-rx-search-wrap">
            <Icon name="search" size={16} className="bb-rx-search-icon" />
            <input
              type="text"
              className="bb-rx-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rules..."
            />
            {searchQuery && (
              <button
                type="button"
                className="bb-rx-search-clear"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleImportFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {scopeLockedReason ? (
        <div className="bb-rx-empty">
          <Icon name="addressCard" size={22} />
          <span>{scopeLockedReason}</span>
        </div>
      ) : (
        <div className="bb-rx-sheet__body">

          {groupedStructure.folders.map((folder) => {
            const isCollapsed = collapsedFolders.has(folder.id);
            const allEnabledInFolder =
              folder.items.length > 0 && folder.items.every((s) => !s.disabled);
            return (
              <div key={folder.id} className="bb-rx-folder">
                <div
                  className="bb-rx-folder__header"
                  onClick={() => handleToggleCollapseFolder(folder.id)}
                >
                  <div className="bb-rx-folder__left">
                    <Icon
                      name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                      size={15}
                    />
                    <Icon name="folder" size={15} />
                    <span>{folder.name}</span>
                    <span className="bb-rx-folder__count">{folder.items.length}</span>
                  </div>
                  <div
                    className="bb-rx-folder__right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {folder.items.length > 0 && (
                      <Switch
                        size="sm"
                        checked={allEnabledInFolder}
                        onChange={(val) => {
                          const fIds = new Set(folder.items.map((x) => x.id));
                          onSaveScripts?.(
                            activeScope,
                            currentScripts.map((s) =>
                              fIds.has(s.id) ? { ...s, disabled: !val } : s,
                            ),
                          );
                        }}
                      />
                    )}
                    <KebabMenu
                      size="sm"
                      items={[
                        {
                          label: 'Rename Folder',
                          icon: 'edit',
                          onClick: () =>
                            setFolderModal({
                              mode: 'rename',
                              folderId: folder.id,
                              name: folder.name,
                              initialName: folder.name,
                            }),
                        },
                        {
                          label: 'Ungroup Folder',
                          icon: 'trash',
                          danger: true,
                          onClick: () => handleDeleteFolderOnly(folder.id),
                        },
                      ]}
                    />
                  </div>
                </div>
                {!isCollapsed && folder.items.length > 0 && (
                  <div className="bb-rx-folder__body">
                    <SortableStack
                      items={folder.items}
                      getKey={(s) => s.id}
                      disabled={isFiltered || multiSelect}
                      ignoreDragSelector="[data-rx-nodrag], button, input, label"
                      onReorder={(from, to) =>
                        handleReorderSubset(folder.items, from, to)
                      }
                      renderItem={(s) => renderScriptItem(s)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {groupedStructure.rootItems.length > 0 ? (
            <SortableStack
              className="bb-rx-list"
              items={groupedStructure.rootItems}
              getKey={(s) => s.id}
              disabled={isFiltered || multiSelect}
              ignoreDragSelector="[data-rx-nodrag], button, input, label"
              onReorder={(from, to) =>
                handleReorderSubset(groupedStructure.rootItems, from, to)
              }
              renderItem={(s) => renderScriptItem(s)}
            />
          ) : (
            groupedStructure.folders.length === 0 && (
              <div className="bb-rx-empty">
                {isFiltered ? (
                  <span>No rules match your search.</span>
                ) : (
                  <span>No regex rules in {scopeLabel} yet.</span>
                )}
              </div>
            )
          )}

          <MultiSelectBar
            open={multiSelect}
            count={selectedIds.length}
            totalSelectable={filteredScripts.length}
            allSelected={allFilteredSelected}
            onSelectAll={() => {
              if (allFilteredSelected) {
                setSelectedIds([]);
              } else {
                setSelectedIds(filteredScripts.map((s) => s.id));
              }
            }}
            onClear={() => setSelectedIds([])}
            onClose={() => {
              setMultiSelect(false);
              setSelectedIds([]);
            }}
            actions={batchActions}
          />
        </div>
      )}
      </>
      )}

      <Modal
        open={Boolean(folderModal)}
        onClose={handleRequestCloseFolderModal}
        title={folderModal?.mode === 'rename' ? 'Rename Regex Folder' : 'New Regex Folder'}
        subtitle={`Organize rules inside ${scopeLabel}`}
        icon="folder"
        width={400}
        footer={
          <>
            <Button variant="b1" emphasis="outlined" onClick={handleRequestCloseFolderModal}>
              Cancel
            </Button>
            <Button
              variant="b1"
              emphasis="filled"
              icon="check"
              disabled={!String(folderModal?.name || '').trim()}
              onClick={handleConfirmFolderModal}
            >
              {folderModal?.mode === 'rename' ? 'Rename' : 'Create Folder'}
            </Button>
          </>
        }
      >
        <Input
          label="Folder Name"
          value={folderModal?.name || ''}
          onChange={(e) =>
            setFolderModal((prev) => (prev ? { ...prev, name: e.target.value } : null))
          }
          placeholder="e.g. Status HUD & Decorators"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirmFolderModal();
            }
          }}
        />
      </Modal>

      <Modal
        open={Boolean(assignModal)}
        onClose={() => setAssignModal(null)}
        title="Assign to Folder"
        subtitle={`${assignModal?.scriptIds?.length || 0} selected`}
        icon="folder"
        width={400}
        footer={
          <Button variant="b1" emphasis="outlined" onClick={() => setAssignModal(null)}>
            Close
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Button
            variant="b1"
            emphasis="outlined"
            icon="close"
            onClick={() => handleAssignToFolder(null)}
          >
            Ungrouped (Root List)
          </Button>
          {scopeFolders.map((f) => (
            <Button
              key={f.id}
              variant="b1"
              emphasis="tonal"
              icon="folder"
              onClick={() => handleAssignToFolder(f.id)}
            >
              {f.name}
            </Button>
          ))}
          {scopeFolders.length === 0 && (
            <div className="bb-rx-hint" style={{ textAlign: 'center', padding: '8px 0' }}>
              No folders created yet. Click the Folder+ icon in the toolbar first.
            </div>
          )}
        </div>
      </Modal>

      <RegexEditorModal
        open={Boolean(editorTarget)}
        script={editorTarget?.script || null}
        isNew={Boolean(editorTarget?.isNew)}
        scopeLabel={scopeLabel}
        charName={scenarioName || 'Character'}
        userName={userName}
        sampleSeedText={sampleSeedText}
        onClose={() => setEditorTarget(null)}
        onSave={handleSaveEditedScript}
      />

      <UnsavedChangesModal
        open={folderUnsavedOpen && Boolean(folderModal)}
        subtitle={`Regex Folder · ${scopeLabel}`}
        itemName={
          String(folderModal?.name || '').trim() ||
          folderModal?.initialName ||
          'Regex Folder'
        }
        saveLabel={folderModal?.mode === 'rename' ? 'Rename' : 'Create Folder'}
        canSave={Boolean(String(folderModal?.name || '').trim())}
        cannotSaveReason="Folder name cannot be empty."
        onCancel={() => setFolderUnsavedOpen(false)}
        onDiscard={() => {
          setFolderUnsavedOpen(false);
          setFolderModal(null);
        }}
        onSave={handleConfirmFolderModal}
      />
    </div>
  );
}




