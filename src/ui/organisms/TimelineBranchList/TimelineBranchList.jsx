import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import { buildTimelineForest } from '@core/chats/timelineForest.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { SearchInput } from '../../atoms/Input/Input.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { ScrollIndicator } from '../../atoms/ScrollIndicator/ScrollIndicator.jsx';
import { ProgressIndicator } from '../../atoms/ProgressIndicator/ProgressIndicator.jsx';
import { SkeletonTimelineGroup } from '../../atoms/Skeleton/Skeleton.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { MultiSelectBar } from '../MultiSelectBar/MultiSelectBar.jsx';
import { Modal } from '../Modal/Modal.jsx';
import { TimelineLeafRow } from './TimelineLeafRow.jsx';
import { computeTimelineVirtualSlice } from './timelineBranchWindow.js';
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
  forest: externalForest = null,
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

  const forest = useMemo(
    () => externalForest || buildTimelineForest(chats),
    [externalForest, chats],
  );

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

  const selectedFilesSet = useMemo(() => new Set(selectedFiles), [selectedFiles]);

  const allVisibleSelected = useMemo(() => {
    if (allVisibleRowFiles.length === 0) return false;
    return allVisibleRowFiles.every((f) => selectedFilesSet.has(f));
  }, [allVisibleRowFiles, selectedFilesSet]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedFiles(allVisibleSelected ? [] : [...allVisibleRowFiles]);
  }, [allVisibleSelected, allVisibleRowFiles]);

  // Stable refs so branch row callbacks never recreate across renders.
  const latestRowActionsRef = useRef({
    multiSelectActive,
    timelinesOpen,
    onFocusNodeOnTree,
    onSelectChatFile,
    onBranchChatFile,
    handleToggleMultiSelectFile,
  });
  latestRowActionsRef.current = {
    multiSelectActive,
    timelinesOpen,
    onFocusNodeOnTree,
    onSelectChatFile,
    onBranchChatFile,
    handleToggleMultiSelectFile,
  };

  const handleRowPrimaryClick = useCallback((fileName, e) => {
    const cur = latestRowActionsRef.current;
    if (cur.multiSelectActive || e?.ctrlKey || e?.metaKey || e?.shiftKey) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      cur.handleToggleMultiSelectFile(fileName, e);
      return;
    }
    if (cur.timelinesOpen && cur.onFocusNodeOnTree) {
      cur.onFocusNodeOnTree(fileName, { openTree: false });
      return;
    }
    cur.onSelectChatFile?.(fileName);
  }, []);

  const handleRowDoubleClickStable = useCallback((fileName) => {
    const cur = latestRowActionsRef.current;
    if (cur.multiSelectActive) return;
    cur.onSelectChatFile?.(fileName);
  }, []);

  const handleRowEnterKeyStable = useCallback((fileName) => {
    latestRowActionsRef.current.onSelectChatFile?.(fileName);
  }, []);

  const handleRowBranchStable = useCallback((fileName) => {
    latestRowActionsRef.current.onBranchChatFile?.(fileName);
  }, []);

  const handleRowStartSelectStable = useCallback((fileName) => {
    setMultiSelectActive(true);
    setSelectedFiles([fileName]);
    setLastClick({ fileName, selected: true });
  }, []);

  const handleRowRequestDeleteStable = useCallback((fileName) => {
    setDeleteConfirm({ files: [fileName] });
  }, []);

  // rAF-coalesced scroll window state (updates React only when visible slice signature changes).
  const [scrollWindowState, setScrollWindowState] = useState({
    scrollTop: 0,
    viewportHeight: 640,
  });
  const scrollRafRef = useRef(0);
  const hasSearchQuery = Boolean(searchQuery.trim());

  const syncScrollWindow = useCallback(() => {
    scrollRafRef.current = 0;
    const el = scrollRef.current;
    if (!el) return;
    const nextScrollTop = el.scrollTop || 0;
    const nextViewportH = el.clientHeight > 0 ? el.clientHeight : 640;

    setScrollWindowState((prev) => {
      const prevSlice = computeTimelineVirtualSlice({
        groups: visibleGroups,
        collapsedRoots,
        hasSearchQuery,
        scrollTop: prev.scrollTop,
        viewportHeight: prev.viewportHeight,
      });
      const nextSlice = computeTimelineVirtualSlice({
        groups: visibleGroups,
        collapsedRoots,
        hasSearchQuery,
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportH,
      });
      if (prevSlice.signature === nextSlice.signature) {
        return prev;
      }
      return {
        scrollTop: nextScrollTop,
        viewportHeight: nextViewportH,
      };
    });
  }, [visibleGroups, collapsedRoots, hasSearchQuery]);

  const scheduleScrollSync = useCallback(() => {
    if (!scrollRafRef.current) {
      scrollRafRef.current = window.requestAnimationFrame(syncScrollWindow);
    }
  }, [syncScrollWindow]);

  useEffect(() => {
    scheduleScrollSync();
  }, [visibleGroups, collapsedRoots, hasSearchQuery, scheduleScrollSync]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    syncScrollWindow();

    el.addEventListener('scroll', scheduleScrollSync, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleScrollSync)
        : null;
    if (ro) ro.observe(el);

    return () => {
      el.removeEventListener('scroll', scheduleScrollSync);
      if (ro) ro.disconnect();
      if (scrollRafRef.current) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = 0;
      }
    };
  }, [syncScrollWindow, scheduleScrollSync]);

  const virtualSlice = useMemo(
    () =>
      computeTimelineVirtualSlice({
        groups: visibleGroups,
        collapsedRoots,
        hasSearchQuery,
        scrollTop: scrollWindowState.scrollTop,
        viewportHeight: scrollWindowState.viewportHeight,
      }),
    [
      visibleGroups,
      collapsedRoots,
      hasSearchQuery,
      scrollWindowState.scrollTop,
      scrollWindowState.viewportHeight,
    ],
  );

  const renderedGroups = useMemo(
    () =>
      virtualSlice.endGroupIndex >= virtualSlice.startGroupIndex
        ? visibleGroups.slice(virtualSlice.startGroupIndex, virtualSlice.endGroupIndex + 1)
        : [],
    [visibleGroups, virtualSlice.startGroupIndex, virtualSlice.endGroupIndex],
  );

  const scrollPaddingStyle = useMemo(() => {
    if (visibleGroups.length === 0) return undefined;
    const baseBottom = multiSelectActive ? 104 : 8;
    return {
      paddingTop: `${Math.round(virtualSlice.topSpacerPx)}px`,
      paddingBottom: `${Math.round(baseBottom + virtualSlice.bottomSpacerPx)}px`,
    };
  }, [
    visibleGroups.length,
    multiSelectActive,
    virtualSlice.topSpacerPx,
    virtualSlice.bottomSpacerPx,
  ]);

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
        <div
          ref={scrollRef}
          className="bb-tl-branch-list__scroll bb-scrollbar--hidden"
          style={scrollPaddingStyle}
        >
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
            renderedGroups.map((grp, localGroupIdx) => {
              const isCollapsed = collapsedRoots.has(grp.rootFile) && !hasSearchQuery;
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

              const branchRange = virtualSlice.branchRanges[localGroupIdx] || {
                startIndex: 0,
                endIndex: grp.visibleRows.length,
                topPadPx: 8,
                bottomPadPx: 8,
              };
              const slicedBranches = isCollapsed
                ? []
                : grp.visibleRows.slice(branchRange.startIndex, branchRange.endIndex);

              const getGroupKebabItems = () => [
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
                        getItems={getGroupKebabItems}
                      />
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div
                      className="bb-tl-group-card__branches"
                      style={{
                        paddingTop: `${branchRange.topPadPx}px`,
                        paddingBottom: `${branchRange.bottomPadPx}px`,
                      }}
                    >
                      {slicedBranches.map((branch) => (
                        <TimelineLeafRow
                          key={branch.fileName}
                          branch={branch}
                          totalChatsInGroup={grp.totalChats}
                          isActive={branch.fileName === activeChatFile}
                          isFocusedOnTree={
                            timelinesOpen && branch.fileName === focusedTreeFile
                          }
                          multiSelectActive={multiSelectActive}
                          isSelected={
                            multiSelectActive && selectedFilesSet.has(branch.fileName)
                          }
                          timelinesOpen={timelinesOpen}
                          characterName={characterName}
                          characterAvatarUrl={characterAvatarUrl}
                          characterInitials={characterInitials}
                          personaName={personaName}
                          personaAvatarUrl={personaAvatarUrl}
                          onPrimaryClick={handleRowPrimaryClick}
                          onRowDoubleClick={handleRowDoubleClickStable}
                          onRowEnterKey={handleRowEnterKeyStable}
                          onBranchChat={handleRowBranchStable}
                          onStartSelectBranch={handleRowStartSelectStable}
                          onRequestDeleteBranch={handleRowRequestDeleteStable}
                        />
                      ))}

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
