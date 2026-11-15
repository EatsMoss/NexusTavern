import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import {
  buildTimelineForest,
  cleanChatPreview,
  formatShortChatDate,
} from '@core/chats/timelineForest.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { SearchInput } from '../../atoms/Input/Input.jsx';
import { Checkbox } from '../../atoms/Checkbox/Checkbox.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { ScrollIndicator } from '../../atoms/ScrollIndicator/ScrollIndicator.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { SkeletonTimelineGroup } from '../../atoms/Skeleton/Skeleton.jsx';
import { AvatarStack } from '../../molecules/AvatarStack/AvatarStack.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { MultiSelectBar } from '../MultiSelectBar/MultiSelectBar.jsx';
import { Modal } from '../Modal/Modal.jsx';
import './TimelineBranchList.css';

function nodeMatchesQuery(node, q) {
  if (!q) return true;
  const hay = `${node.fileName || ''} ${node.baseTitle || ''} ${node.branchLabel || ''} ${
    node.lastPreview || ''
  } ${node.personaName || ''}`.toLowerCase();
  return hay.includes(q);
}

/**
 * TimelineBranchList — Reusable M3 Organism for navigating a character's chats
 * grouped by Timeline families and displaying only active leaf branches
 * (plus the currently open fork node when the user stepped into an interior fork).
 */
export function TimelineBranchList({
  isDemoCard = false,
  chats = [],
  activeChatFile = '',
  focusedTreeFile = '',
  characterName = 'Character',
  characterAvatarUrl = null,
  characterInitials = 'CH',
  personaName = 'User',
  personaAvatarUrl = null,
  loadingChat = false,
  loadingList = false,
  timelinesOpen = false,
  onToggleTimelines,
  onFocusNodeOnTree,
  onCreateNewChat,
  onSelectChatFile,
  onBranchChatFile,
  onDeleteChatFiles,
  onImportChats,
  onExportAllChats,
  onDeleteAllChats,
  busyBulkAction = false,
}) {
  const scrollRef = useRef(null);
  const importInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedRoots, setCollapsedRoots] = useState(() => new Set());
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [lastClick, setLastClick] = useState({ fileName: null, selected: true });
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { files: string[], timelineTitle?: string } | null
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(null); // { deleteScenario: boolean } | null
  const [deleting, setDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  useLayoutEffect(() => {
    setMultiSelectActive(false);
    setSelectedFiles([]);
    setDeleteConfirm(null);
    setDeleteAllConfirm(null);
    setSearchQuery('');
    setCollapsedRoots(new Set());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [characterName]);

  const forest = useMemo(() => buildTimelineForest(chats), [chats]);

  const visibleGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const out = [];

    for (const grp of forest.groups) {
      const activeNodeInGroup =
        activeChatFile && grp.allNodes.find((n) => n.fileName === activeChatFile);
      const isInteriorActive = Boolean(activeNodeInGroup && !activeNodeInGroup.isLeaf);

      // Visible rows inside each timeline:
      // 1) If the user is currently standing on an interior fork node, keep it visible at top of its timeline
      // 2) All leaf endpoints (filtered by search query if active)
      const baseRows = isInteriorActive
        ? [activeNodeInGroup, ...grp.leafNodes]
        : grp.leafNodes;

      const filteredRows = q
        ? baseRows.filter((n) => nodeMatchesQuery(n, q) || nodeMatchesQuery(grp.rootNode, q))
        : baseRows;

      if (filteredRows.length === 0) continue;

      out.push({
        ...grp,
        containsActiveChat: Boolean(activeNodeInGroup),
        visibleRows: filteredRows,
      });
    }
    return out;
  }, [forest.groups, activeChatFile, searchQuery]);

  const allVisibleRowFiles = useMemo(
    () => visibleGroups.flatMap((g) => g.visibleRows.map((r) => r.fileName)),
    [visibleGroups],
  );
  const handleToggleCollapse = useCallback((rootFile) => {
    setCollapsedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootFile)) next.delete(rootFile);
      else next.add(rootFile);
      return next;
    });
  }, []);

  const handleExitMultiSelect = useCallback(() => {
    setMultiSelectActive(false);
    setSelectedFiles([]);
    setLastClick({ fileName: null, selected: true });
  }, []);

  useEffect(() => {
    if (!multiSelectActive || deleteConfirm) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleExitMultiSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [multiSelectActive, deleteConfirm, handleExitMultiSelect]);

  const handleToggleMultiSelectFile = useCallback(
    (fileName, event) => {
      if (!fileName) return;
      if (!multiSelectActive) setMultiSelectActive(true);
      setSelectedFiles((prev) => {
        const set = new Set(prev);
        const targetState = !set.has(fileName);
        if (event?.shiftKey && lastClick.fileName && lastClick.fileName !== fileName) {
          const a = allVisibleRowFiles.indexOf(lastClick.fileName);
          const b = allVisibleRowFiles.indexOf(fileName);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            for (let i = start; i <= end; i += 1) {
              if (lastClick.selected) set.add(allVisibleRowFiles[i]);
              else set.delete(allVisibleRowFiles[i]);
            }
            return Array.from(set);
          }
        }
        if (targetState) set.add(fileName);
        else set.delete(fileName);
        setLastClick({ fileName, selected: targetState });
        return Array.from(set);
      });
    },
    [multiSelectActive, lastClick, allVisibleRowFiles],
  );

  const allVisibleSelected = useMemo(() => {
    if (allVisibleRowFiles.length === 0) return false;
    const set = new Set(selectedFiles);
    return allVisibleRowFiles.every((f) => set.has(f));
  }, [allVisibleRowFiles, selectedFiles]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedFiles(allVisibleSelected ? [] : [...allVisibleRowFiles]);
  }, [allVisibleSelected, allVisibleRowFiles]);

  const handleConfirmDelete = useCallback(async () => {
    const files = deleteConfirm?.files || [];
    if (files.length === 0 || !onDeleteChatFiles || deleting) return;
    setDeleting(true);
    try {
      await onDeleteChatFiles(files);
      const removed = new Set(files);
      setSelectedFiles((prev) => prev.filter((name) => !removed.has(name)));
      if (multiSelectActive && selectedFiles.every((f) => removed.has(f))) {
        setMultiSelectActive(false);
      }
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, onDeleteChatFiles, deleting, multiSelectActive, selectedFiles]);

  const totalTimelines = forest.groups.length;
  const totalEndpoints = useMemo(
    () => forest.groups.reduce((sum, g) => sum + g.totalLeafBranches, 0),
    [forest.groups],
  );
  const totalChatFilesCount = Array.isArray(chats) ? chats.length : 0;

  const handleConfirmDeleteAll = useCallback(async () => {
    if (!deleteAllConfirm || !onDeleteAllChats || deletingAll) return;
    setDeletingAll(true);
    try {
      await onDeleteAllChats({ deleteScenario: Boolean(deleteAllConfirm.deleteScenario) });
      setMultiSelectActive(false);
      setSelectedFiles([]);
      setDeleteAllConfirm(null);
    } finally {
      setDeletingAll(false);
    }
  }, [deleteAllConfirm, onDeleteAllChats, deletingAll]);

  const headerKebabItems = useMemo(
    () => [
      {
        id: 'import-chats',
        label: 'Import Chats (.jsonl / .zip)',
        icon: 'upload',
        disabled: Boolean(busyBulkAction || loadingChat),
        hidden: !onImportChats,
        onClick: () => importInputRef.current?.click(),
      },
      {
        id: 'export-all-chats',
        label:
          totalChatFilesCount > 0
            ? `Export All Chats (${totalChatFilesCount})`
            : 'Export All Chats',
        icon: 'download',
        disabled: Boolean(totalChatFilesCount === 0 || busyBulkAction),
        hidden: !onExportAllChats,
        onClick: () => onExportAllChats?.(),
      },
      {
        id: 'delete-all-chats',
        label:
          totalChatFilesCount > 0
            ? `Delete All Chats (${totalChatFilesCount})`
            : 'Delete Scenario',
        icon: 'trash',
        danger: true,
        disabled: Boolean(busyBulkAction || loadingChat),
        hidden: !onDeleteAllChats,
        onClick: () =>
          setDeleteAllConfirm({ deleteScenario: totalChatFilesCount === 0 }),
      },
    ],
    [
      busyBulkAction,
      loadingChat,
      onImportChats,
      onExportAllChats,
      onDeleteAllChats,
      totalChatFilesCount,
    ],
  );

  return (
    <div
      className={`bb-tl-branch-list ${
        multiSelectActive ? 'is-multi-select-active' : ''
      }`.trim()}
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".jsonl,.json,.zip,application/zip,application/json"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const picked = Array.from(e.target.files || []);
          e.target.value = '';
          if (picked.length > 0) {
            onImportChats?.(picked);
          }
        }}
      />
      <div className="bb-tl-branch-list__header">
        <div className="bb-tl-branch-list__title-row">
          <div className="bb-tl-branch-list__title-info">
            <span className="bb-tl-branch-list__char-name">{characterName}</span>
            <span className="bb-caption-text">
              {totalTimelines} {totalTimelines === 1 ? 'timeline' : 'timelines'} ·{' '}
              {totalEndpoints} {totalEndpoints === 1 ? 'active branch' : 'active branches'}
            </span>
          </div>
          {!isDemoCard && (
            <div className="bb-tl-branch-list__top-actions">
              <Button
                variant="b1"
                size="sm"
                emphasis={timelinesOpen ? 'filled' : 'outlined'}
                icon="timeline"
                onClick={onToggleTimelines}
                title="Open interactive timeline graph in center column"
              >
                Tree
              </Button>
              <Button
                variant="b1"
                size="sm"
                emphasis="filled"
                icon="plus"
                disabled={loadingChat}
                onClick={onCreateNewChat}
                title="Start a new timeline"
              >
                New
              </Button>
              <KebabMenu
                size="sm"
                title="Character chat actions"
                items={headerKebabItems}
              />
            </div>
          )}
        </div>

        <SearchInput
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          placeholder="Search timelines & branches..."
          size="md"
        />
      </div>

      <div className="bb-tl-branch-list__stage">
        {(loadingChat || (loadingList && visibleGroups.length > 0)) && (
          <ProgressIndicator
            variant="linear"
            size="sm"
            overlay="top"
            ariaLabel="Loading timeline"
          />
        )}
        <div ref={scrollRef} className="bb-tl-branch-list__scroll bb-scrollbar--hidden">
          {loadingList && visibleGroups.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 0' }}>
              <SkeletonTimelineGroup branches={2} />
              <SkeletonTimelineGroup branches={1} />
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="bb-tl-branch-list__empty">
              {isDemoCard
                ? 'Select a scenario card in Characters to view its timelines.'
                : searchQuery
                  ? 'No timelines or branches match your search.'
                  : `No saved timelines yet for ${characterName}.`}
            </div>
          ) : (
            visibleGroups.map((grp) => {
              const isCollapsed = collapsedRoots.has(grp.rootFile) && !searchQuery;
              const hiddenIntermediateCount = Math.max(
                0,
                grp.totalChats - grp.totalLeafBranches,
              );
              const statsLabel =
                grp.totalChats <= 1
                  ? 'Single thread'
                  : `${grp.totalLeafBranches} ${
                      grp.totalLeafBranches === 1 ? 'endpoint' : 'endpoints'
                    }${
                      hiddenIntermediateCount > 0
                        ? ` · ${hiddenIntermediateCount} ${
                            hiddenIntermediateCount === 1 ? 'fork' : 'forks'
                          } in tree`
                        : ''
                    }`;

              const groupKebabItems = [
                {
                  id: 'focus-tree',
                  label: 'Show in Timelines',
                  icon: 'timeline',
                  onClick: () => {
                    const targetFile =
                      (grp.containsActiveChat && activeChatFile) ||
                      grp.leafNodes[0]?.fileName ||
                      grp.rootFile;
                    onFocusNodeOnTree?.(targetFile, { openTree: true });
                  },
                },
                {
                  id: 'select-leaves',
                  label: 'Select Endpoints',
                  icon: 'check',
                  onClick: () => {
                    const leafNames = grp.visibleRows.map((r) => r.fileName);
                    setMultiSelectActive(true);
                    setSelectedFiles((prev) => Array.from(new Set([...prev, ...leafNames])));
                  },
                },
                {
                  id: 'delete-timeline',
                  label:
                    grp.totalChats > 1
                      ? `Delete Timeline (${grp.totalChats} files)`
                      : 'Delete Timeline',
                  icon: 'trash',
                  danger: true,
                  onClick: () =>
                    setDeleteConfirm({
                      files: grp.allNodes.map((n) => n.fileName),
                      timelineTitle: grp.title,
                    }),
                },
              ];

              return (
                <section
                  key={grp.rootFile}
                  className={[
                    'bb-tl-group-card',
                    grp.containsActiveChat ? 'has-active' : '',
                    isCollapsed ? 'is-collapsed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--bb-tl-family-color': grp.familyColor }}
                >
                  <div
                    className="bb-tl-group-card__head"
                    onClick={(e) => {
                      if (e.target.closest('.bb-tl-group-card__actions, .bb-kebab-menu')) {
                        return;
                      }
                      handleToggleCollapse(grp.rootFile);
                    }}
                  >
                    <span className="bb-tl-group-card__swatch" />
                    <div className="bb-tl-group-card__title-wrap">
                      <span className="bb-tl-group-card__title" title={grp.rootFile}>
                        {grp.title}
                      </span>
                      <span className="bb-tl-group-card__stats">{statsLabel}</span>
                    </div>
                    <Icon
                      name="chevronDown"
                      size={15}
                      className="bb-tl-group-card__chevron"
                    />
                    <div className="bb-tl-group-card__actions">
                      <KebabMenu
                        size="sm"
                        title="Timeline actions"
                        items={groupKebabItems}
                      />
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="bb-tl-group-card__branches">
                      {grp.visibleRows.map((branch) => {
                        const isActive = branch.fileName === activeChatFile;
                        const isFocusedOnTree =
                          timelinesOpen && branch.fileName === focusedTreeFile;
                        const isSelected =
                          multiSelectActive && selectedFiles.includes(branch.fileName);
                        const dateLabel = formatShortChatDate(branch);
                        const preview = cleanChatPreview(branch.lastPreview);
                        const cardScenarioAvatar =
                          branch.characterAvatarUrl || characterAvatarUrl;
                        const cardPersonaAvatar = branch.personaAvatarMissing
                          ? null
                          : branch.personaAvatarUrl || personaAvatarUrl;
                        const cardPersonaName =
                          branch.personaName || personaName || 'User';
                        const cardPersonaInitials = String(cardPersonaName)
                          .slice(0, 2)
                          .toUpperCase();

                        const displayBranchTitle = !branch.isLeaf
                          ? `${branch.branchLabel || 'Root'} (Current Fork)`
                          : branch.branchLabel
                            ? branch.branchLabel
                            : grp.totalChats === 1
                              ? 'Main Storyline'
                              : 'Main Line (Root)';

                        const rowKebabItems = [
                          {
                            id: 'branch',
                            label: 'Create Branch',
                            icon: 'codeBranch',
                            onClick: () => onBranchChatFile?.(branch.fileName),
                          },
                          {
                            id: 'select',
                            label: 'Select',
                            icon: 'check',
                            onClick: () => {
                              setMultiSelectActive(true);
                              setSelectedFiles([branch.fileName]);
                              setLastClick({ fileName: branch.fileName, selected: true });
                            },
                          },
                          {
                            id: 'delete',
                            label: 'Delete Branch',
                            icon: 'trash',
                            danger: true,
                            onClick: () => setDeleteConfirm({ files: [branch.fileName] }),
                          },
                        ];

                        const handleRowClick = (e) => {
                          if (e.target.closest('.bb-tl-leaf-item__actions, .bb-kebab-menu')) {
                            return;
                          }
                          if (multiSelectActive || e?.ctrlKey || e?.metaKey || e?.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleMultiSelectFile(branch.fileName, e);
                            return;
                          }
                          if (timelinesOpen && onFocusNodeOnTree) {
                            onFocusNodeOnTree(branch.fileName, { openTree: false });
                            return;
                          }
                          onSelectChatFile?.(branch.fileName);
                        };

                        const handleRowDoubleClick = (e) => {
                          if (multiSelectActive) return;
                          if (e.target.closest('.bb-tl-leaf-item__actions, .bb-kebab-menu')) {
                            return;
                          }
                          onSelectChatFile?.(branch.fileName);
                        };

                        return (
                          <div
                            key={branch.fileName}
                            role="button"
                            tabIndex={0}
                            className={[
                              'bb-tl-leaf-item',
                              isActive ? 'is-active' : '',
                              isFocusedOnTree ? 'is-focused-on-tree' : '',
                              isSelected ? 'is-selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={
                              timelinesOpen
                                ? `${branch.fileName}\nClick: Focus on tree • Double-click: Open chat`
                                : branch.fileName
                            }
                            onClick={handleRowClick}
                            onDoubleClick={handleRowDoubleClick}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                onSelectChatFile?.(branch.fileName);
                              } else if (e.key === ' ') {
                                e.preventDefault();
                                handleRowClick(e);
                              }
                            }}
                          >
                            <AvatarStack
                              size={32}
                              overlap={0.35}
                              cutoutGapPx={1.75}
                              className="bb-tl-leaf-item__avatar-stack"
                              items={[
                                {
                                  id: `char-${branch.fileName}`,
                                  name: characterName || 'Scenario',
                                  avatarUrl: cardScenarioAvatar,
                                  initials: characterInitials || 'CH',
                                  title: `Scenario: ${characterName}`,
                                },
                                {
                                  id: `persona-${branch.fileName}`,
                                  name: cardPersonaName,
                                  avatarUrl: cardPersonaAvatar,
                                  initials: cardPersonaInitials,
                                  title: `Persona: ${cardPersonaName}`,
                                },
                              ]}
                            />

                            <div className="bb-tl-leaf-item__body">
                              <div className="bb-tl-leaf-item__top">
                                <div className="bb-tl-leaf-item__name-row">
                                  <Icon name={branch.depth > 0 ? 'codeBranch' : 'comments'} size={12} />
                                  <span className="bb-tl-leaf-item__name">{displayBranchTitle}</span>
                                </div>

                                {multiSelectActive ? (
                                  <Checkbox variant="overlay" checked={isSelected} interactive={false} />
                                ) : (
                                  <div className="bb-tl-leaf-item__actions">
                                    <KebabMenu size="sm" title="Branch actions" items={rowKebabItems} />
                                  </div>
                                )}
                              </div>

                              <div className="bb-tl-leaf-item__badges">
                                {!branch.isLeaf && (
                                  <span className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--fork">
                                    Fork Node
                                  </span>
                                )}
                                {branch.depth > 1 && (
                                  <span
                                    className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--depth"
                                    title={`Fork depth ${branch.depth} from timeline root`}
                                  >
                                    Step {branch.depth + 1}
                                  </span>
                                )}
                                {isActive && (
                                  <span className="bb-tl-leaf-item__pill bb-tl-leaf-item__pill--active">
                                    Active
                                  </span>
                                )}
                                {branch.messageCount != null && (
                                  <span className="bb-tl-leaf-item__meta">{branch.messageCount} msgs</span>
                                )}
                                <span className="bb-tl-leaf-item__meta">{dateLabel}</span>
                              </div>

                              {preview && <div className="bb-tl-leaf-item__preview">{preview}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        <ScrollIndicator scrollRef={scrollRef} className="bb-scroll-indicator--panel" />
      </div>

      <MultiSelectBar
        open={multiSelectActive}
        count={selectedFiles.length}
        totalSelectable={allVisibleRowFiles.length}
        allSelected={allVisibleSelected}
        onSelectAll={handleToggleSelectAll}
        onClear={() => setSelectedFiles([])}
        onClose={handleExitMultiSelect}
        actions={[
          {
            id: 'delete',
            label: 'Delete',
            icon: 'trash',
            danger: true,
            title: 'Delete selected branches',
            onClick: () => setDeleteConfirm({ files: selectedFiles }),
          },
        ]}
      />

      <Modal
        open={Boolean(deleteConfirm?.files?.length)}
        onClose={() => !deleting && setDeleteConfirm(null)}
        title={
          deleteConfirm?.timelineTitle
            ? `Delete Timeline "${deleteConfirm.timelineTitle}"`
            : deleteConfirm?.files?.length === 1
              ? 'Delete Branch'
              : `Delete ${deleteConfirm?.files?.length || 0} Selected Branches`
        }
        subtitle="This action permanently deletes the .jsonl chat file(s)"
        icon="trash"
        width={440}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              disabled={deleting}
              onClick={() => setDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting
                ? 'Deleting...'
                : deleteConfirm?.files?.length === 1
                  ? 'Delete'
                  : `Delete (${deleteConfirm?.files?.length || 0})`}
            </Button>
          </>
        }
      >
        {deleteConfirm?.files && (
          <p className="bb-caption-text">
            {deleteConfirm.timelineTitle ? (
              <>
                Delete the entire timeline{' '}
                <strong>&ldquo;{deleteConfirm.timelineTitle}&rdquo;</strong> including all{' '}
                <strong>{deleteConfirm.files.length}</strong> chat files?
              </>
            ) : deleteConfirm.files.length === 1 ? (
              <>
                Are you sure you want to permanently delete{' '}
                <strong>
                  &ldquo;{deleteConfirm.files[0].replace(/\.jsonl$/i, '')}&rdquo;
                </strong>
                ?
              </>
            ) : (
              <>
                Are you sure you want to permanently delete{' '}
                <strong>{deleteConfirm.files.length}</strong> selected chat files?
              </>
            )}
          </p>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteAllConfirm)}
        onClose={() => !deletingAll && setDeleteAllConfirm(null)}
        title={
          totalChatFilesCount === 0
            ? 'Delete Scenario'
            : deleteAllConfirm?.deleteScenario
              ? 'Delete Scenario & All Chats'
              : 'Delete All Chats'
        }
        subtitle="This action cannot be undone"
        icon="trash"
        width={440}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              disabled={deletingAll}
              onClick={() => setDeleteAllConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              disabled={deletingAll}
              onClick={handleConfirmDeleteAll}
            >
              {deletingAll
                ? 'Deleting...'
                : totalChatFilesCount === 0
                  ? 'Delete Scenario'
                  : deleteAllConfirm?.deleteScenario
                    ? 'Delete Scenario & Chats'
                    : `Delete All (${totalChatFilesCount})`}
            </Button>
          </>
        }
      >
        {deleteAllConfirm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="bb-caption-text">
              {totalChatFilesCount === 0 ? (
                <>
                  Permanently delete scenario <strong>&ldquo;{characterName}&rdquo;</strong>? The
                  scenario card will be removed from Characters.
                </>
              ) : deleteAllConfirm.deleteScenario ? (
                <>
                  Delete scenario <strong>&ldquo;{characterName}&rdquo;</strong> together with all{' '}
                  <strong>{totalChatFilesCount}</strong> of its{' '}
                  <code>.jsonl</code> chat file{totalChatFilesCount === 1 ? '' : 's'}?
                </>
              ) : (
                <>
                  Delete all <strong>{totalChatFilesCount}</strong>{' '}
                  <code>.jsonl</code> chat file{totalChatFilesCount === 1 ? '' : 's'} for{' '}
                  <strong>&ldquo;{characterName}&rdquo;</strong>? The scenario card itself will
                  remain intact.
                </>
              )}
            </div>

            {totalChatFilesCount > 0 && (
              <Switch
                checked={Boolean(deleteAllConfirm.deleteScenario)}
                disabled={deletingAll}
                onChange={(checked) =>
                  setDeleteAllConfirm((prev) =>
                    prev ? { ...prev, deleteScenario: Boolean(checked) } : null,
                  )
                }
                label="Also delete scenario card"
                description={`Permanently remove "${characterName}" card from Characters as well`}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
