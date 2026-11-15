import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { SearchInput } from '../../atoms/Input/Input.jsx';
import { OverlayScrollArea } from '../../atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import {
  NON_GROUPABLE_PROMPT_IDS,
  UNDELETABLE_SYSTEM_PROMPT_IDS,
  normalizePromptNameAndEmoji,
  sanitizeXmlTagName,
  buildPromptTree,
  flattenPromptTree,
  computeTotalEnabledTreeTokens,
  formatCompactTokens,
  createNewPromptEntry,
  createNewXmlGroupPair,
} from './promptGroupsModel.js';
import './PromptManager.css';

const DRAG_THRESHOLD_PX = 5;
const COLLAPSED_GROUPS_KEY = 'nexustavern_pm_collapsed_groups_v1';
const BULK_SNAPSHOT_KEY = 'nexustavern_pm_bulk_snapshot_v1';

function loadCollapsedSet() {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedSet(set) {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/**
 * Measures the baseline vertical rectangles of all `[data-pm-slot]` children
 * inside a container (root list or an open group body) at drag start.
 */
function measureContainerSlots(containerEl, scopeId) {
  if (!containerEl) return null;
  const containerRect = containerEl.getBoundingClientRect();
  const slotEls = Array.from(containerEl.children).filter((el) =>
    el.hasAttribute('data-pm-slot'),
  );
  const rects = slotEls.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      cy: r.top + r.height / 2,
    };
  });
  const stepY =
    rects.length >= 2
      ? rects[1].top - rects[0].top
      : rects.length === 1
        ? rects[0].height + 6
        : 48;
  return {
    scopeId,
    containerRect,
    rects,
    stepY,
  };
}

/**
 * Computes the smooth vertical `translate3d(0, dy, 0)` displacement for slot `index`
 * inside `scopeId` when items slide apart to make room at `targetIndex`.
 */
function computeVerticalSlotDisplacement(index, hover, metrics, draggedHeight = 42) {
  if (!hover || !metrics || hover.scopeId !== metrics.scopeId) return undefined;
  const { sourceScopeId, sourceIndex, targetIndex } = hover;
  if (typeof targetIndex !== 'number') return undefined;

  const rects = metrics.rects || [];
  const currentRect = rects[index];
  if (!currentRect) return undefined;

  const shiftPx = Math.round((draggedHeight || currentRect.height) + 6);

  if (sourceScopeId === metrics.scopeId && typeof sourceIndex === 'number' && sourceIndex >= 0) {
    // Reorder within the same container
    if (index === sourceIndex) return undefined;
    if (sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) {
      return { transform: `translate3d(0, ${-shiftPx}px, 0)` };
    }
    if (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex) {
      return { transform: `translate3d(0, ${shiftPx}px, 0)` };
    }
    return undefined;
  }

  // External insertion into this container: shift items at >= targetIndex down
  if (index >= targetIndex) {
    return { transform: `translate3d(0, ${shiftPx}px, 0)` };
  }
  return undefined;
}

/**
 * Computes the dashed drop indicator box `{ top, height }` relative to the container.
 */
function computeDropIndicatorBox(hover, metrics, draggedHeight = 42) {
  if (!hover || !metrics || hover.scopeId !== metrics.scopeId) return null;
  const { sourceScopeId, sourceIndex, targetIndex } = hover;
  if (typeof targetIndex !== 'number') return null;

  const { rects, containerRect } = metrics;
  const h = Math.max(38, Math.round(draggedHeight || 42));

  if (rects.length === 0) {
    return { top: 6, height: h };
  }

  if (sourceScopeId === metrics.scopeId && typeof sourceIndex === 'number' && sourceIndex >= 0) {
    if (targetIndex === sourceIndex) {
      return {
        top: Math.round(rects[sourceIndex].top - containerRect.top),
        height: Math.round(rects[sourceIndex].height),
      };
    }
    if (targetIndex < sourceIndex) {
      return {
        top: Math.round(rects[targetIndex].top - containerRect.top),
        height: h,
      };
    }
    // targetIndex > sourceIndex
    const targetRect = rects[targetIndex] || rects[rects.length - 1];
    return {
      top: Math.round(targetRect.bottom - containerRect.top - h),
      height: h,
    };
  }

  // External insertion
  if (targetIndex < rects.length) {
    return {
      top: Math.round(rects[targetIndex].top - containerRect.top),
      height: h,
    };
  }
  const lastRect = rects[rects.length - 1];
  return {
    top: Math.round(lastRect.bottom - containerRect.top + 6),
    height: h,
  };
}
export function PromptManager({
  orderedPrompts = [],
  unlinkedPrompts = [],
  onChangePrompts,
  tokenContext = null,
  activeEditorSelection = null,
  onChangeEditorSelection,
}) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState(() => loadCollapsedSet());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [removedPopoverOpen, setRemovedPopoverOpen] = useState(false);
  const [removedSearch, setRemovedSearch] = useState('');
  const [dragState, setDragState] = useState(null);

  const rootListRef = useRef(null);
  const groupBodyRefs = useRef(new Map());
  const removedWrapRef = useRef(null);
  const treeRef = useRef([]);
  const suppressNextClickRef = useRef(false);

  const promptTree = useMemo(
    () => buildPromptTree(orderedPrompts, tokenContext),
    [orderedPrompts, tokenContext],
  );
  treeRef.current = promptTree;

  const totalEnabledTokens = useMemo(
    () => computeTotalEnabledTreeTokens(promptTree),
    [promptTree],
  );

  const nonHistoryEnabledCount = useMemo(() => {
    return orderedPrompts.filter((p) => p.identifier !== 'chatHistory' && p.enabled).length;
  }, [orderedPrompts]);

  const isBulkOff = nonHistoryEnabledCount === 0 && orderedPrompts.length > 1;

  useEffect(() => {
    if (!removedPopoverOpen) return undefined;
    const onDocDown = (e) => {
      if (removedWrapRef.current && !removedWrapRef.current.contains(e.target)) {
        setRemovedPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [removedPopoverOpen]);

  const emitUpdatedTree = useCallback(
    (nextTree, nextUnlinked = unlinkedPrompts) => {
      const nextOrdered = flattenPromptTree(nextTree, 1, null);
      onChangePrompts?.({
        orderedPrompts: nextOrdered,
        unlinkedPrompts: nextUnlinked,
      });
    },
    [onChangePrompts, unlinkedPrompts],
  );

  const handleToggleCollapseGroup = (groupId) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      saveCollapsedSet(next);
      return next;
    });
  };

  const handleMasterToggleAll = () => {
    if (!isBulkOff) {
      const snapshot = orderedPrompts
        .filter((p) => p.enabled && p.identifier !== 'chatHistory')
        .map((p) => p.identifier);
      try {
        localStorage.setItem(BULK_SNAPSHOT_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore
      }
      const nextOrdered = orderedPrompts.map((p) => ({
        ...p,
        enabled: p.identifier === 'chatHistory',
      }));
      onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
    } else {
      let snapshotSet = new Set();
      try {
        const raw = localStorage.getItem(BULK_SNAPSHOT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) snapshotSet = new Set(parsed);
        }
      } catch {
        // ignore
      }
      const enableAll = snapshotSet.size === 0;
      const nextOrdered = orderedPrompts.map((p) => ({
        ...p,
        enabled:
          p.identifier === 'chatHistory' || enableAll || snapshotSet.has(p.identifier),
      }));
      onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
    }
  };
  const handleTogglePromptEnabled = (identifier, nextEnabled) => {
    if (identifier === 'chatHistory') return;
    const nextOrdered = orderedPrompts.map((p) =>
      p.identifier === identifier ? { ...p, enabled: Boolean(nextEnabled) } : p,
    );
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
  };

  const handleToggleGroupEnabled = (groupId, nextEnabled) => {
    const updateNodes = (nodes) =>
      nodes.map((node) => {
        if (node.type !== 'group') return node;
        if (node.groupId === groupId) {
          const toggleChildren = (chList) =>
            chList.map((ch) =>
              ch.type === 'group'
                ? { ...ch, enabled: nextEnabled, children: toggleChildren(ch.children || []) }
                : {
                    ...ch,
                    prompt: {
                      ...ch.prompt,
                      enabled:
                        ch.prompt.identifier === 'chatHistory' ? true : Boolean(nextEnabled),
                    },
                  },
            );
          return {
            ...node,
            enabled: Boolean(nextEnabled),
            children: toggleChildren(node.children || []),
          };
        }
        return { ...node, children: updateNodes(node.children || []) };
      });

    emitUpdatedTree(updateNodes(promptTree));
  };

  const handleDuplicatePrompt = (promptObj) => {
    if (!promptObj || promptObj.marker) return;
    const cloned = createNewPromptEntry({
      ...promptObj,
      identifier: undefined,
      name: `${promptObj.name} (Copy)`,
      system_prompt: false,
      marker: false,
    });
    const idx = orderedPrompts.findIndex((p) => p.identifier === promptObj.identifier);
    const nextOrdered = [...orderedPrompts];
    if (idx !== -1) {
      nextOrdered.splice(idx + 1, 0, cloned);
    } else {
      nextOrdered.unshift(cloned);
    }
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
  };

  const handleUnlinkPrompt = (promptObj) => {
    if (!promptObj || promptObj.identifier === 'chatHistory') return;
    if (
      activeEditorSelection?.mode === 'prompt' &&
      activeEditorSelection?.id === promptObj.identifier
    ) {
      onChangeEditorSelection?.(null);
    }
    const nextOrdered = orderedPrompts.filter((p) => p.identifier !== promptObj.identifier);
    const alreadyInUnlinked = unlinkedPrompts.some(
      (u) => u.identifier === promptObj.identifier,
    );
    const nextUnlinked = alreadyInUnlinked
      ? unlinkedPrompts
      : [{ ...promptObj, enabled: false }, ...unlinkedPrompts];
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts: nextUnlinked });
  };

  const handleUngroupFolder = (groupNode) => {
    if (!groupNode) return;
    if (
      activeEditorSelection?.mode === 'group' &&
      activeEditorSelection?.id === groupNode.groupId
    ) {
      onChangeEditorSelection?.(null);
    }
    const rescuedSystem = [];
    const ungroupInList = (nodes) => {
      const out = [];
      for (const n of nodes) {
        if (n.type === 'group') {
          if (n.groupId === groupNode.groupId) {
            for (const boundary of [n.openPrompt, n.closePrompt]) {
              if (boundary && UNDELETABLE_SYSTEM_PROMPT_IDS.has(boundary.identifier)) {
                rescuedSystem.push({
                  ...boundary,
                  name: boundary.defaultName || boundary.identifier,
                  enabled: false,
                });
              }
            }
            out.push(...(n.children || []));
          } else {
            out.push({ ...n, children: ungroupInList(n.children || []) });
          }
        } else {
          out.push(n);
        }
      }
      return out;
    };
    const nextTree = ungroupInList(promptTree);
    const nextUnlinked = [
      ...rescuedSystem.filter((r) => !unlinkedPrompts.some((u) => u.identifier === r.identifier)),
      ...unlinkedPrompts,
    ];
    emitUpdatedTree(nextTree, nextUnlinked);
  };

  const handleRestoreRemovedPrompt = (identifier) => {
    const target = unlinkedPrompts.find((u) => u.identifier === identifier);
    if (!target) return;
    const restored = { ...target, enabled: true };
    const nextOrdered = [restored, ...orderedPrompts];
    const nextUnlinked = unlinkedPrompts.filter((u) => u.identifier !== identifier);
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts: nextUnlinked });
  };

  const handleDeleteRemovedPromptPermanently = (identifier) => {
    if (UNDELETABLE_SYSTEM_PROMPT_IDS.has(identifier)) return;
    const nextUnlinked = unlinkedPrompts.filter((u) => u.identifier !== identifier);
    onChangePrompts?.({ orderedPrompts, unlinkedPrompts: nextUnlinked });
  };

  const handleOpenEditPrompt = (promptObj) => {
    if (!promptObj?.identifier) return;
    const isAlreadyOpen =
      activeEditorSelection?.mode === 'prompt' &&
      activeEditorSelection?.id === promptObj.identifier;
    onChangeEditorSelection?.(
      isAlreadyOpen ? null : { mode: 'prompt', id: promptObj.identifier },
    );
  };

  const handleOpenEditGroup = (groupNode) => {
    if (!groupNode?.groupId) return;
    const isAlreadyOpen =
      activeEditorSelection?.mode === 'group' &&
      activeEditorSelection?.id === groupNode.groupId;
    onChangeEditorSelection?.(
      isAlreadyOpen ? null : { mode: 'group', id: groupNode.groupId },
    );
  };

  const handleCreateNewPrompt = () => {
    const created = createNewPromptEntry({ name: 'New Prompt', enabled: true });
    const nextOrdered = [created, ...orderedPrompts];
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
    onChangeEditorSelection?.({ mode: 'prompt', id: created.identifier });
  };

  const handleCreateNewGroup = () => {
    const { openPrompt, closePrompt, groupId } = createNewXmlGroupPair(
      orderedPrompts,
      'prompt_group',
    );
    const nextOrdered = [openPrompt, closePrompt, ...orderedPrompts];
    onChangePrompts?.({ orderedPrompts: nextOrdered, unlinkedPrompts });
    onChangeEditorSelection?.({ mode: 'group', id: groupId });
  };
  const moveTreeNode = useCallback(
    (sourceScopeId, sourceIdx, targetScopeId, targetIdx) => {
      const currentTree = structuredClone(treeRef.current);

      const getScopeArray = (nodes, scopeId) => {
        if (scopeId === 'root') return { list: nodes, level: 0 };
        for (const n of nodes) {
          if (n.type === 'group') {
            if (n.groupId === scopeId) return { list: n.children, level: n.level };
            const sub = getScopeArray(n.children || [], scopeId);
            if (sub) return sub;
          }
        }
        return null;
      };

      const srcScope = getScopeArray(currentTree, sourceScopeId);
      const dstScope = getScopeArray(currentTree, targetScopeId);
      if (!srcScope || !dstScope) return;

      const draggedNode = srcScope.list[sourceIdx];
      if (!draggedNode) return;

      if (
        targetScopeId !== 'root' &&
        draggedNode.type === 'prompt' &&
        NON_GROUPABLE_PROMPT_IDS.has(draggedNode.prompt?.identifier)
      ) {
        return;
      }

      if (draggedNode.type === 'group') {
        if (targetScopeId === draggedNode.groupId) return;
        if (dstScope.level >= 2) return;
        if (dstScope.level >= 1 && draggedNode.hasSubgroups) return;
      }

      if (sourceScopeId === targetScopeId) {
        if (sourceIdx === targetIdx) return;
        const [removed] = srcScope.list.splice(sourceIdx, 1);
        srcScope.list.splice(targetIdx, 0, removed);
      } else {
        const [removed] = srcScope.list.splice(sourceIdx, 1);
        const clampedIdx = Math.max(0, Math.min(dstScope.list.length, targetIdx));
        dstScope.list.splice(clampedIdx, 0, removed);
      }

      emitUpdatedTree(currentTree);
    },
    [emitUpdatedTree],
  );

  const handleStartPointerDrag = (e, { scopeId, index, node }) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('[data-pm-nodrag]')) return;
    const isFilterActive = Boolean(searchQuery.trim()) || filterMode !== 'all';
    if (isFilterActive) return;

    const slotEl = e.currentTarget.closest('[data-pm-slot]');
    if (!slotEl) return;
    const slotRect = slotEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const offsetY = startY - slotRect.top;

    let started = false;
    let metricsMap = new Map();
    let latestHover = null;

    const captureAllMetrics = () => {
      const m = new Map();
      if (rootListRef.current) {
        m.set('root', measureContainerSlots(rootListRef.current, 'root'));
      }
      for (const [gId, bodyEl] of groupBodyRefs.current.entries()) {
        if (bodyEl && bodyEl.isConnected) {
          m.set(gId, measureContainerSlots(bodyEl, gId));
        }
      }
      return m;
    };

    const resolveHover = (clientX, clientY) => {
      let targetMetrics = metricsMap.get('root') || null;
      let forbidden = false;

      for (const [gId, m] of metricsMap.entries()) {
        if (gId === 'root' || !m) continue;
        if (node.type === 'group' && node.groupId === gId) continue;
        const r = m.containerRect;
        if (
          clientY >= r.top - 6 &&
          clientY <= r.bottom + 6 &&
          clientX >= r.left - 12 &&
          clientX <= r.right + 12
        ) {
          targetMetrics = m;
        }
      }

      if (!targetMetrics) return null;
      const tScopeId = targetMetrics.scopeId;

      if (tScopeId !== 'root') {
        if (
          node.type === 'prompt' &&
          NON_GROUPABLE_PROMPT_IDS.has(node.prompt?.identifier)
        ) {
          forbidden = true;
        } else if (node.type === 'group') {
          const isLevel2Target = promptTree.some(
            (top) =>
              top.type === 'group' &&
              (top.children || []).some((sub) => sub.type === 'group' && sub.groupId === tScopeId),
          );
          if (isLevel2Target || node.hasSubgroups) {
            forbidden = true;
          }
        }
      }

      const rects = targetMetrics.rects;
      let targetIndex = rects.length;
      for (let i = 0; i < rects.length; i += 1) {
        if (clientY < rects[i].cy) {
          targetIndex = i;
          break;
        }
      }

      if (tScopeId === scopeId && targetIndex >= rects.length) {
        targetIndex = Math.max(0, rects.length - 1);
      }

      return {
        scopeId: tScopeId,
        sourceScopeId: scopeId,
        sourceIndex: tScopeId === scopeId ? index : -1,
        targetIndex,
        forbidden,
      };
    };

    const onPointerMove = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        started = true;
        metricsMap = captureAllMetrics();
      }
      latestHover = resolveHover(ev.clientX, ev.clientY);
      setDragState({
        active: true,
        sourceScopeId: scopeId,
        sourceIndex: index,
        node,
        metricsMap,
        hover: latestHover,
        ghost: {
          x: slotRect.left,
          y: ev.clientY - offsetY,
          width: slotRect.width,
          height: slotRect.height,
        },
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (started) {
        suppressNextClickRef.current = true;
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 60);
        if (latestHover && !latestHover.forbidden) {
          moveTreeNode(scopeId, index, latestHover.scopeId, latestHover.targetIndex);
        }
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };
  const matchesFilter = useCallback(
    (p) => {
      if (!p) return false;
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchName = String(p.name || '').toLowerCase().includes(q);
        const matchContent = String(p.content || '').toLowerCase().includes(q);
        if (!matchName && !matchContent) return false;
      }
      if (filterMode === 'enabled' && !p.enabled) return false;
      if (filterMode === 'depth' && Number(p.injection_position) !== 1) return false;
      if (filterMode === 'system' && (p.marker || (p.role || 'system') !== 'system')) return false;
      if (filterMode === 'user' && (p.marker || p.role !== 'user')) return false;
      if (filterMode === 'assistant' && (p.marker || p.role !== 'assistant')) return false;
      return true;
    },
    [searchQuery, filterMode],
  );

  const renderRoleIndicator = (isMarker, role) => {
    if (isMarker) {
      return (
        <span className="bb-pm-role-icon is-marker" title="System Marker">
          <Icon name="pin" size={14} />
        </span>
      );
    }
    const normRole = String(role || 'system').toLowerCase();
    if (normRole === 'user') {
      return null;
    }
    if (normRole === 'assistant') {
      return (
        <span className="bb-pm-role-icon is-assistant" title="Role: Assistant">
          <Icon name="robot" size={15} />
        </span>
      );
    }
    return (
      <span className="bb-pm-role-icon is-system" title="Role: System">
        <Icon name="wrench" size={14} />
      </span>
    );
  };

  const renderPromptRow = (node, scopeId, idx) => {
    const p = node.prompt;
    const isChatHistory = p.identifier === 'chatHistory';
    const isEditing =
      !isChatHistory &&
      activeEditorSelection?.mode === 'prompt' &&
      activeEditorSelection?.id === p.identifier;
    const isSource =
      dragState?.active &&
      dragState.sourceScopeId === scopeId &&
      dragState.sourceIndex === idx;
    const scopeMetrics = dragState?.metricsMap?.get(scopeId);
    const displacement =
      dragState?.active && !dragState.hover?.forbidden
        ? computeVerticalSlotDisplacement(
            idx,
            dragState.hover,
            scopeMetrics,
            dragState.ghost?.height,
          )
        : undefined;

    return (
      <div
        key={p.identifier}
        data-pm-slot={idx}
        style={displacement}
        className={`bb-pm-slot ${isSource ? 'is-dragging-source' : ''}`.trim()}
      >
        <div
          className={`bb-pm-row ${!p.enabled ? 'is-disabled' : ''} ${
            isChatHistory ? 'is-chat-history' : ''
          } ${isEditing ? 'is-editing' : ''}`.trim()}
          onPointerDown={(e) => handleStartPointerDrag(e, { scopeId, index: idx, node })}
          onClick={() => {
            if (suppressNextClickRef.current) return;
            if (!isChatHistory) handleOpenEditPrompt(p);
          }}
          title={
            isChatHistory
              ? 'Chat History (Locked & always active — drag anywhere to reorder)'
              : 'Click to edit prompt • Drag anywhere to reorder'
          }
        >
          <span className="bb-pm-grip" aria-hidden="true">
            <Icon name="gripVertical" size={15} />
          </span>

          <div className="bb-pm-main-col">
            <span className="bb-pm-emoji-slot" aria-hidden={!isChatHistory}>
              {isChatHistory ? (
                <Icon
                  name="chatLock"
                  size={16}
                  className="bb-pm-chat-lock-icon"
                />
              ) : p.bb_icon ? (
                <span className="bb-pm-emoji">{p.bb_icon}</span>
              ) : null}
            </span>
            <span className="bb-pm-name">{p.name}</span>
            {!isChatHistory && renderRoleIndicator(p.marker, p.role)}
            {!p.marker && Number(p.injection_position) === 1 && (
              <span className="bb-pm-badge is-depth" title="In-chat injection depth">
                @D{p.injection_depth ?? 4}
              </span>
            )}
          </div>

          <div
            className="bb-pm-cols"
            data-pm-nodrag="1"
            onClick={(e) => e.stopPropagation()}
          >
            {!p.marker ? (
              <button
                type="button"
                title="Duplicate prompt"
                className="bb-pm-act-btn"
                onClick={() => handleDuplicatePrompt(p)}
              >
                <Icon name="copy" size={15} />
              </button>
            ) : (
              <span className="bb-pm-col-empty" aria-hidden="true" />
            )}

            {!isChatHistory ? (
              <button
                type="button"
                title="Unlink from active prompt order"
                className="bb-pm-act-btn is-danger"
                onClick={() => handleUnlinkPrompt(p)}
              >
                <Icon name="unlink" size={15} />
              </button>
            ) : (
              <span className="bb-pm-col-empty" aria-hidden="true" />
            )}

            <span className="bb-pm-tokens" title={`${node.tokens || 0} estimated tokens`}>
              {formatCompactTokens(node.tokens)}
            </span>

            {!isChatHistory ? (
              <span className="bb-pm-switch-cell">
                <Switch
                  bare
                  size="sm"
                  checked={Boolean(p.enabled)}
                  title={p.enabled ? 'Disable prompt' : 'Enable prompt'}
                  onChange={(val) => handleTogglePromptEnabled(p.identifier, val)}
                />
              </span>
            ) : (
              <span className="bb-pm-col-empty" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    );
  };
  const renderGroupNode = (node, scopeId, idx) => {
    const isFilterActive = Boolean(searchQuery.trim()) || filterMode !== 'all';
    const isCollapsed = collapsedGroupIds.has(node.groupId) && !isFilterActive;
    const isSource =
      dragState?.active &&
      dragState.sourceScopeId === scopeId &&
      dragState.sourceIndex === idx;
    const scopeMetrics = dragState?.metricsMap?.get(scopeId);
    const displacement =
      dragState?.active && !dragState.hover?.forbidden
        ? computeVerticalSlotDisplacement(
            idx,
            dragState.hover,
            scopeMetrics,
            dragState.ghost?.height,
          )
        : undefined;

    const isDropTarget =
      dragState?.active && dragState.hover?.scopeId === node.groupId && !dragState.hover?.forbidden;
    const isForbiddenTarget =
      dragState?.active && dragState.hover?.scopeId === node.groupId && dragState.hover?.forbidden;
    const bodyMetrics = dragState?.metricsMap?.get(node.groupId);
    const dropIndicator =
      isDropTarget && bodyMetrics
        ? computeDropIndicatorBox(dragState.hover, bodyMetrics, dragState.ghost?.height)
        : null;

    const groupTag = sanitizeXmlTagName(node.xmlTag || node.groupName);
    const queryLower = searchQuery.trim().toLowerCase();
    const groupMatchesSearch =
      Boolean(queryLower) &&
      filterMode === 'all' &&
      groupTag.includes(queryLower.replace(/^<+|\/?>+$/g, ''));

    const visibleChildren =
      isFilterActive && !groupMatchesSearch
        ? (node.children || []).filter((ch) =>
            ch.type === 'group'
              ? sanitizeXmlTagName(ch.xmlTag || ch.groupName).includes(
                  queryLower.replace(/^<+|\/?>+$/g, ''),
                ) ||
                (ch.children || []).some((sub) => sub.type === 'prompt' && matchesFilter(sub.prompt))
              : matchesFilter(ch.prompt),
          )
        : node.children || [];

    if (isFilterActive && !groupMatchesSearch && visibleChildren.length === 0) return null;

    return (
      <div
        key={node.groupId}
        data-pm-slot={idx}
        style={displacement}
        className={`bb-pm-slot ${isSource ? 'is-dragging-source' : ''}`}
      >
        <div
          className={`bb-pm-group ${node.level >= 2 ? 'is-level-2' : ''} ${
            isCollapsed ? 'is-collapsed' : ''
          } ${!node.enabled ? 'is-disabled' : ''} ${
            activeEditorSelection?.mode === 'group' && activeEditorSelection?.id === node.groupId
              ? 'is-editing'
              : ''
          } ${isDropTarget ? 'is-drop-target' : ''} ${
            isForbiddenTarget ? 'is-forbidden-target' : ''
          }`.trim()}
        >
          <div
            className="bb-pm-group-header"
            onPointerDown={(e) => handleStartPointerDrag(e, { scopeId, index: idx, node })}
            onClick={() => {
              if (suppressNextClickRef.current) return;
              handleOpenEditGroup(node);
            }}
            title="Click to edit XML group • Drag anywhere to reorder"
          >
            <button
              type="button"
              className="bb-pm-group-collapse-btn"
              data-pm-nodrag="1"
              title={isCollapsed ? 'Expand group' : 'Collapse group'}
              aria-expanded={!isCollapsed}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCollapseGroup(node.groupId);
              }}
            >
              <Icon
                name="chevronDown"
                size={15}
                className={`bb-pm-group-chevron ${isCollapsed ? 'is-collapsed' : ''}`}
              />
            </button>

            <div className="bb-pm-main-col">
              <span className="bb-pm-emoji-slot" aria-hidden="true">
                {node.bb_icon ? (
                  <span className="bb-pm-emoji">{node.bb_icon}</span>
                ) : (
                  <Icon name="folder" size={15} style={{ color: 'var(--bb-ink-accent, #d4af63)' }} />
                )}
              </span>
              <span
                className="bb-pm-group-tag-chip"
                title={`XML Group <${groupTag}>`}
              >
                &lt;{groupTag}&gt;
              </span>
              {Boolean(String(node.preamble || '').trim()) && (
                <span
                  className="bb-pm-affix-icon"
                  title={`Prefix prompt (before <${groupTag}>):\n${String(node.preamble).trim().slice(0, 180)}`}
                >
                  <Icon name="prefixPrompt" size={14} />
                </span>
              )}
              {Boolean(String(node.postamble || '').trim()) && (
                <span
                  className="bb-pm-affix-icon"
                  title={`Postfix prompt (after </${groupTag}>):\n${String(node.postamble).trim().slice(0, 180)}`}
                >
                  <Icon name="suffixPrompt" size={14} />
                </span>
              )}
              {renderRoleIndicator(false, node.role)}
              <span className="bb-pm-badge">
                {node.enabledChildrenCount}/{node.children.length}
              </span>
            </div>

            <div
              className="bb-pm-cols"
              data-pm-nodrag="1"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="bb-pm-col-empty" aria-hidden="true" />
              <button
                type="button"
                title="Ungroup folder (keeps child prompts in place)"
                className="bb-pm-act-btn is-danger"
                onClick={() => handleUngroupFolder(node)}
              >
                <Icon name="unlink" size={15} />
              </button>
              <span className="bb-pm-tokens" title={`${node.tokens || 0} active group tokens`}>
                {formatCompactTokens(node.tokens)}
              </span>
              <span className="bb-pm-switch-cell">
                <Switch
                  bare
                  size="sm"
                  checked={Boolean(node.enabled)}
                  title={node.enabled ? 'Disable group' : 'Enable group'}
                  onChange={(val) => handleToggleGroupEnabled(node.groupId, val)}
                />
              </span>
            </div>
          </div>

          {!isCollapsed && (
            <div
              ref={(el) => {
                if (el) groupBodyRefs.current.set(node.groupId, el);
                else groupBodyRefs.current.delete(node.groupId);
              }}
              className="bb-pm-group-body"
            >
              {dropIndicator && (
                <div
                  className="bb-pm-drop-indicator"
                  style={{
                    top: `${dropIndicator.top}px`,
                    height: `${dropIndicator.height}px`,
                  }}
                />
              )}

              {visibleChildren.length === 0 ? (
                <div className="bb-pm-group-empty">
                  Empty XML group &lt;{groupTag}&gt; — drag prompts here
                </div>
              ) : (
                visibleChildren.map((child, chIdx) =>
                  child.type === 'group'
                    ? renderGroupNode(child, node.groupId, chIdx)
                    : renderPromptRow(child, node.groupId, chIdx),
                )
              )}
            </div>
          )}
        </div>
      </div>
    );
  };
  const isFilterActive = Boolean(searchQuery.trim()) || filterMode !== 'all';
  const rootMetrics = dragState?.metricsMap?.get('root');
  const rootDropIndicator =
    dragState?.active &&
    dragState.hover?.scopeId === 'root' &&
    !dragState.hover?.forbidden &&
    rootMetrics
      ? computeDropIndicatorBox(dragState.hover, rootMetrics, dragState.ghost?.height)
      : null;

  const filteredUnlinked = useMemo(() => {
    const q = removedSearch.trim().toLowerCase();
    if (!q) return unlinkedPrompts;
    return unlinkedPrompts.filter((u) =>
      String(u.name || u.identifier || '')
        .toLowerCase()
        .includes(q),
    );
  }, [unlinkedPrompts, removedSearch]);

  return (
    <div className="bb-pm-root">
      <div className="bb-pm-header">
        <div className="bb-pm-header-title-row">
          <Icon name="bookOpen" size={17} style={{ color: 'var(--bb-ink-accent)' }} />
          <span>Prompts</span>
          <span className="bb-pm-header-count">
            {orderedPrompts.filter((p) => p.enabled).length}/{orderedPrompts.length}
          </span>
        </div>

        <div className="bb-pm-cols bb-pm-cols--header">
          <span
            className="bb-pm-all-label"
            onClick={handleMasterToggleAll}
            title={
              isBulkOff
                ? 'Restore previously enabled prompts'
                : 'Disable all prompts except Chat History'
            }
          >
            All
          </span>
          <span
            className="bb-pm-tokens is-header"
            title={`${totalEnabledTokens} total enabled tokens`}
          >
            {formatCompactTokens(totalEnabledTokens)}
          </span>
          <span className="bb-pm-switch-cell">
            <Switch
              bare
              size="sm"
              checked={!isBulkOff}
              title={
                isBulkOff
                  ? 'Restore previously enabled prompts'
                  : 'Disable all prompts except Chat History'
              }
              onChange={handleMasterToggleAll}
            />
          </span>
        </div>
      </div>

      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search prompts by title or content..."
        className="bb-pm-search"
      />

      <div className="bb-pm-filter-strip bb-scrollbar--hidden" role="tablist" aria-label="Filter prompts">
        {[
          { id: 'all', label: 'All' },
          { id: 'enabled', label: 'Enabled' },
          { id: 'depth', label: '@Depth' },
          { id: 'system', label: 'System' },
          { id: 'user', label: 'User' },
          { id: 'assistant', label: 'Assistant' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filterMode === f.id}
            className={`bb-pm-filter-pill ${filterMode === f.id ? 'is-active' : ''}`}
            onClick={() => setFilterMode(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div ref={rootListRef} className="bb-pm-list">
        {rootDropIndicator && (
          <div
            className="bb-pm-drop-indicator"
            style={{
              top: `${rootDropIndicator.top}px`,
              height: `${rootDropIndicator.height}px`,
            }}
          />
        )}

        {promptTree.map((node, idx) => {
          if (node.type === 'group') {
            return renderGroupNode(node, 'root', idx);
          }
          if (isFilterActive && !matchesFilter(node.prompt)) {
            return null;
          }
          return renderPromptRow(node, 'root', idx);
        })}
      </div>

      <div className="bb-pm-footer">
        <div ref={removedWrapRef} className="bb-pm-removed-wrap">
          <button
            type="button"
            className={`bb-pm-removed-trigger ${removedPopoverOpen ? 'is-open' : ''}`}
            onClick={() => setRemovedPopoverOpen((v) => !v)}
          >
            <span>Unlinked Prompts ({unlinkedPrompts.length})</span>
            <Icon name="chevronDown" size={14} />
          </button>

          {removedPopoverOpen && (
            <div className="bb-pm-removed-popover">
              <SearchInput
                size="sm"
                value={removedSearch}
                onChange={setRemovedSearch}
                placeholder="Filter unlinked prompts..."
                className="bb-pm-removed-search"
              />
              <OverlayScrollArea
                viewportClassName="bb-pm-removed-list"
                variant="compact"
              >
                {filteredUnlinked.length === 0 ? (
                  <div className="bb-pm-group-empty" style={{ border: 'none' }}>
                    No unlinked prompts
                  </div>
                ) : (
                  filteredUnlinked.map((u) => {
                    const canDelete = !UNDELETABLE_SYSTEM_PROMPT_IDS.has(u.identifier);
                    const normU = normalizePromptNameAndEmoji(u.name, u.bb_icon);
                    const displayUnlinkedName = normU.name || u.identifier;
                    return (
                      <div key={u.identifier} className="bb-pm-removed-row">
                        <span className="bb-pm-removed-name" title={displayUnlinkedName}>
                          {normU.bb_icon ? `${normU.bb_icon} ` : ''}
                          {displayUnlinkedName}
                        </span>
                        <div className="bb-pm-removed-actions">
                          <button
                            type="button"
                            className="bb-pm-removed-btn"
                            title="Restore to active prompt list"
                            onClick={() => handleRestoreRemovedPrompt(u.identifier)}
                          >
                            <Icon name="plus" size={11} />
                            <span>Add</span>
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              className="bb-pm-removed-btn is-danger"
                              title="Permanently delete prompt from preset file"
                              onClick={() => handleDeleteRemovedPromptPermanently(u.identifier)}
                            >
                              <Icon name="trash" size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </OverlayScrollArea>
            </div>
          )}
        </div>

        <button
          type="button"
          className="bb-pm-footer-btn"
          title="Create a new prompt"
          onClick={handleCreateNewPrompt}
        >
          <Icon name="plus" size={15} />
          <span>Add New</span>
        </button>

        <button
          type="button"
          className="bb-pm-footer-btn"
          title="Create a new XML prompt group (<tag>...</tag>)"
          onClick={handleCreateNewGroup}
        >
          <Icon name="folderPlus" size={15} />
          <span>Add Group</span>
        </button>
      </div>

      {dragState?.active &&
        dragState.ghost &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`bb-pm-drag-ghost ${dragState.hover?.forbidden ? 'is-forbidden' : ''}`}
            style={{
              left: `${Math.round(dragState.ghost.x)}px`,
              top: `${Math.round(dragState.ghost.y)}px`,
              width: `${Math.round(dragState.ghost.width)}px`,
            }}
          >
            <div className="bb-pm-row" style={{ background: 'var(--bb-sheet-bg, var(--bb-page-card-bg))' }}>
              <span className="bb-pm-grip" style={{ opacity: 1 }}>
                <Icon name="gripVertical" size={15} />
              </span>
              <div className="bb-pm-main-col">
                {dragState.node.type === 'group' ? (
                  <>
                    <span className="bb-pm-emoji-slot" aria-hidden="true">
                      {dragState.node.bb_icon ? (
                        <span className="bb-pm-emoji">{dragState.node.bb_icon}</span>
                      ) : (
                        <Icon name="folder" size={13} style={{ color: 'var(--bb-ink-accent)' }} />
                      )}
                    </span>
                    <span className="bb-pm-group-tag-chip">
                      &lt;
                      {sanitizeXmlTagName(
                        dragState.node.xmlTag || dragState.node.groupName,
                      )}
                      &gt;
                    </span>
                  </>
                ) : (
                  <>
                    <span className="bb-pm-emoji-slot" aria-hidden="true">
                      {dragState.node.prompt?.identifier === 'chatHistory' ? (
                        <Icon name="chatLock" size={15} className="bb-pm-chat-lock-icon" />
                      ) : dragState.node.prompt?.bb_icon ? (
                        <span className="bb-pm-emoji">{dragState.node.prompt.bb_icon}</span>
                      ) : null}
                    </span>
                    <span className="bb-pm-name">{dragState.node.prompt?.name}</span>
                  </>
                )}
              </div>
              {dragState.hover?.forbidden && (
                <span className="bb-pm-badge" style={{ color: '#ff8a80', borderColor: '#e57373' }}>
                  Cannot Nest
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
