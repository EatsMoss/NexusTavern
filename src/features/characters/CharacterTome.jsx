import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Icon,
  SafeImage,
  CharacterCardTile,
  MultiSelectBar,
} from '@ui/index.js';
import { PinnedSection } from './PinnedSection.jsx';
import { FolderPopover } from './FolderPopover.jsx';
import { CharacterGallery } from './CharacterGallery.jsx';
import { sortCards } from './tagFilters.js';
import { usePinnedSplit } from './usePinnedSplit.js';
import './CharacterTome.css';

const DRAG_THRESHOLD_PX = 6;
const REORDER_DWELL_MS = 45;
const PIN_TAB_SWITCH_DWELL_MS = 340;

/**
 * Captures the baseline (un-transformed) slot rectangles of a grid container
 * at the start of a drag gesture so slot hit-testing never oscillates while
 * cards animate apart.
 */
function measureGridSlots(gridEl, slotSelector, colsCount) {
  if (!gridEl) return null;
  const gridRect = gridEl.getBoundingClientRect();
  const slotEls = Array.from(gridEl.querySelectorAll(slotSelector));
  const rects = slotEls.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  });

  let cols = Number(colsCount) || 5;
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    const templateCols = window.getComputedStyle(gridEl).gridTemplateColumns;
    if (templateCols && templateCols !== 'none') {
      const tracks = templateCols.trim().split(/\s+/).filter(Boolean);
      if (tracks.length > 0) {
        cols = tracks.length;
      }
    }
  }

  let stepX = 0;
  let stepY = 0;

  if (rects.length >= 2) {
    stepX = rects[1].left - rects[0].left;
  } else if (rects.length === 1) {
    stepX = rects[0].width + 8;
  }

  if (rects.length > cols) {
    stepY = rects[cols].top - rects[0].top;
  } else if (rects.length >= 1) {
    stepY = rects[0].height + 8;
  }

  return {
    gridRect,
    scrollTop: gridEl.scrollTop || 0,
    rects,
    cols,
    stepX,
    stepY,
  };
}

/**
 * Resolves the current hover action ('merge' | 'reorder') inside a measured grid.
 * Uses both pointer coordinates and the dragged card ghost rectangle with hysteresis
 * so dropping a card onto another card to form a folder feels effortless and stable.
 */
function hitTestGrid(clientX, clientY, metrics, options) {
  if (!metrics) return null;
  const { rects } = metrics;
  const { isInternalReorder, sourceIndex, canMerge, scope, prevHover } = options;

  if (rects.length === 0) {
    return {
      scope,
      mode: 'reorder',
      sourceIndex: isInternalReorder ? sourceIndex : -1,
      targetIndex: 0,
      onTileEdge: false,
    };
  }

  const getVisualRect = (cardIdx) => {
    const baseRect = rects[cardIdx];
    if (!baseRect) return null;
    if (
      !prevHover ||
      prevHover.scope !== scope ||
      prevHover.mode !== 'reorder' ||
      typeof prevHover.targetIndex !== 'number'
    ) {
      return baseRect;
    }

    const tIdx = prevHover.targetIndex;
    let destSlot = cardIdx;
    if (isInternalReorder && typeof sourceIndex === 'number' && sourceIndex >= 0) {
      if (cardIdx === sourceIndex) return baseRect;
      if (sourceIndex < tIdx && cardIdx > sourceIndex && cardIdx <= tIdx) {
        destSlot = cardIdx - 1;
      } else if (sourceIndex > tIdx && cardIdx >= tIdx && cardIdx < sourceIndex) {
        destSlot = cardIdx + 1;
      }
    } else if (cardIdx >= tIdx) {
      destSlot = cardIdx + 1;
    }

    if (destSlot === cardIdx) return baseRect;
    if (rects[destSlot]) return rects[destSlot];

    const cols = metrics.cols || 5;
    const dx = ((destSlot % cols) - (cardIdx % cols)) * (metrics.stepX || 0);
    const dy = (Math.floor(destSlot / cols) - Math.floor(cardIdx / cols)) * (metrics.stepY || 0);
    return {
      left: baseRect.left + dx,
      right: baseRect.right + dx,
      top: baseRect.top + dy,
      bottom: baseRect.bottom + dy,
      width: baseRect.width,
      height: baseRect.height,
      cx: baseRect.cx + dx,
      cy: baseRect.cy + dy,
    };
  };

  // Helper: converts an insertion boundary `gapIndex` (0 .. rects.length, where `k` means
  // the corridor between slot `k - 1` and slot `k`) into a slot `targetIndex`.
  const gapToTargetIndex = (gapIndex) => {
    const clampedGap = Math.max(0, Math.min(rects.length, gapIndex));
    if (!isInternalReorder || typeof sourceIndex !== 'number' || sourceIndex < 0) {
      return clampedGap;
    }
    if (clampedGap <= sourceIndex) {
      return clampedGap;
    }
    return Math.min(rects.length - 1, clampedGap - 1);
  };

  // 0a. Keep an already-open reorder slot stable while pointer is inside its dashed placeholder
  // (padded by 6px to include the adjacent grid gap so it never flickers).
  if (
    prevHover?.scope === scope &&
    prevHover?.mode === 'reorder' &&
    typeof prevHover.targetIndex === 'number'
  ) {
    const openIdx = prevHover.targetIndex;
    const openRect = rects[openIdx];
    const isDisplacedOpenSlot = !isInternalReorder || openIdx !== sourceIndex;
    if (
      isDisplacedOpenSlot &&
      openRect &&
      clientX >= openRect.left - 6 &&
      clientX <= openRect.right + 6 &&
      clientY >= openRect.top - 4 &&
      clientY <= openRect.bottom + 4
    ) {
      return {
        scope,
        mode: 'reorder',
        sourceIndex: isInternalReorder ? sourceIndex : -1,
        targetIndex: openIdx,
        onTileEdge: false,
      };
    }
  }

  // 0b. Hysteresis: if already merging into slot `lockedIdx`, keep merge locked
  // while pointer stays inside the 60% x 80% retention zone of that card.
  if (
    canMerge &&
    prevHover?.scope === scope &&
    prevHover?.mode === 'merge' &&
    typeof prevHover.targetIndex === 'number'
  ) {
    const lockedIdx = prevHover.targetIndex;
    const lockedRect = rects[lockedIdx];
    if (lockedRect && !(isInternalReorder && lockedIdx === sourceIndex)) {
      const ptrRelX = (clientX - lockedRect.left) / Math.max(1, lockedRect.width);
      const ptrRelY = (clientY - lockedRect.top) / Math.max(1, lockedRect.height);
      const ptrInsideRetention =
        ptrRelX >= 0.2 && ptrRelX <= 0.8 && ptrRelY >= 0.1 && ptrRelY <= 0.9;

      if (ptrInsideRetention) {
        return {
          scope,
          mode: 'merge',
          sourceIndex: isInternalReorder ? sourceIndex : -1,
          targetIndex: lockedIdx,
          onTileEdge: false,
        };
      }
    }
  }

  // 1. Check if pointer hits the current visual position of any card -> merge if inside 52%x76% center
  if (canMerge) {
    for (let i = 0; i < rects.length; i += 1) {
      if (isInternalReorder && i === sourceIndex) continue;
      const vr = getVisualRect(i);
      if (!vr) continue;
      if (clientX >= vr.left && clientX <= vr.right && clientY >= vr.top && clientY <= vr.bottom) {
        const relX = (clientX - vr.left) / Math.max(1, vr.width);
        const relY = (clientY - vr.top) / Math.max(1, vr.height);
        const pointerInMergeZone =
          relX >= 0.24 && relX <= 0.76 && relY >= 0.12 && relY <= 0.88;
        if (pointerInMergeZone) {
          return {
            scope,
            mode: 'merge',
            sourceIndex: isInternalReorder ? sourceIndex : -1,
            targetIndex: i,
            onTileEdge: false,
          };
        }
      }
    }
  }

  // 1b. Direct pointer hit inside a baseline slot rectangle:
  // left half maps to boundary `i` (before slot `i`), right half maps to boundary `i + 1` (after slot `i`).
  // This makes the right 24% of card `k - 1`, the 8px gap, and the left 24% of card `k`
  // one continuous, unified insertion corridor between card `k - 1` and card `k`.
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      if (isInternalReorder && i === sourceIndex) {
        return {
          scope,
          mode: 'reorder',
          sourceIndex,
          targetIndex: sourceIndex,
          onTileEdge: false,
        };
      }

      const relX = (clientX - r.left) / Math.max(1, r.width);
      const gapIndex = relX < 0.5 ? i : i + 1;

      return {
        scope,
        mode: 'reorder',
        sourceIndex: isInternalReorder ? sourceIndex : -1,
        targetIndex: gapToTargetIndex(gapIndex),
        onTileEdge: true,
      };
    }
  }

  // 2. Pointer is in the gap between slots or in the trailing area of the grid
  let bestGapIndex = rects.length;
  let bestDist = Infinity;

  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    const dx = clientX - r.cx;
    const dy = clientY - r.cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestGapIndex = clientX < r.cx ? i : i + 1;
    }
  }

  return {
    scope,
    mode: 'reorder',
    sourceIndex: isInternalReorder ? sourceIndex : -1,
    targetIndex: gapToTargetIndex(bestGapIndex),
    onTileEdge: false,
  };
}

export function CharacterTome({
  pinnedLayout,
  cards,
  groups,
  tags,
  gallery,
  selectedCardId,
  hiddenTagIds,
  visibleCards = null,
  visibleGroups = null,
  multiSelectActive = false,
  multiSelectedIds = [],
  onToggleMultiSelect,
  onToggleMultiSelectMode,
  onSelectAllResults,
  onClearMultiSelect,
  onExitMultiSelect,
  totalSelectableCount = 0,
  allResultsSelected = false,
  multiSelectActions = [],
  multiSelectActiveActionId = null,
  multiSelectPopover = null,
  onSelect,
  onOpen,
  onTogglePin,
  onOpenTag,
  onToggleTagHidden,
  onCreateTag,
  onOpenCreateModal,
  onDropImportFiles,
  kebabItemsFor,
  kebabItemsForFolder,
  kebabItemsForTagFolder,
  userName = 'User',
  loading = false,
  splitRatio = null,
  onSplitRatioChange,
}) {
  const rootRef = useRef(null);
  const pinnedRef = useRef(null);
  const pinnedHeaderRef = useRef(null);
  const pinnedGridRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverGridRef = useRef(null);
  const allWrapRef = useRef(null);
  const allChromeRef = useRef(null);
  const allScrollRef = useRef(null);

  const [dragState, setDragState] = useState(null);
  const [openAllTagId, setOpenAllTagId] = useState(null);
  const latestPinnedRef = useRef(pinnedLayout);
  latestPinnedRef.current = pinnedLayout;
  const latestGalleryRef = useRef(gallery);
  latestGalleryRef.current = gallery;
  const isSplitMode = Boolean(gallery?.splitView);

  useEffect(() => {
    if (gallery.entityFilter !== 'tags' && openAllTagId !== null) {
      setOpenAllTagId(null);
    }
  }, [gallery.entityFilter, openAllTagId]);

  const activeAllTagFolder = useMemo(() => {
    if (!openAllTagId || gallery.entityFilter !== 'tags') return null;
    const tag = (tags || []).find((t) => String(t.id) === String(openAllTagId));
    if (!tag) return null;
    const rawMembers = (cards || []).filter((c) =>
      (c.tagIds || c.tags || []).map(String).includes(String(tag.id)),
    );
    const sortedMembers = sortCards(rawMembers, gallery.sortMode);
    return {
      type: 'tag-folder',
      id: `tag:${tag.id}`,
      tagId: String(tag.id),
      name: tag.name,
      items: sortedMembers,
    };
  }, [openAllTagId, gallery.entityFilter, gallery.sortMode, tags, cards]);

  const handleOpenPinnedFolder = useCallback(
    (id) => {
      setOpenAllTagId(null);
      pinnedLayout?.setOpenFolderId?.((prev) => (prev === id ? null : id));
    },
    [pinnedLayout],
  );

  const handleToggleAllTagFolder = useCallback(
    (tagId) => {
      if (tagId == null) {
        setOpenAllTagId(null);
        return;
      }
      const key = String(tagId);
      pinnedLayout?.setOpenFolderId?.(null);
      setOpenAllTagId((prev) => (prev === key ? null : key));
    },
    [pinnedLayout],
  );

  const [measuredGridWidth, setMeasuredGridWidth] = useState(0);

  useEffect(() => {
    const targetEl = pinnedGridRef.current || allScrollRef.current || rootRef.current;
    if (!targetEl || typeof ResizeObserver === 'undefined') return undefined;

    const updateWidth = () => {
      const w =
        pinnedGridRef.current?.clientWidth ||
        allScrollRef.current?.clientWidth ||
        rootRef.current?.clientWidth ||
        0;
      if (w > 0) setMeasuredGridWidth(w);
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(targetEl);
    if (rootRef.current && rootRef.current !== targetEl) {
      ro.observe(rootRef.current);
    }
    return () => ro.disconnect();
  }, [gallery.entityFilter]);

  const colsCount = useMemo(() => {
    const targetCardSize = Number(gallery.cardSize) || 88;
    const gap = 8;
    const width = measuredGridWidth || 480;
    return Math.max(1, Math.floor((width + gap) / (targetCardSize + gap)));
  }, [measuredGridWidth, gallery.cardSize]);

  const pinnedEntriesCount = pinnedLayout?.resolvedEntries?.length || 0;
  const splitRecomputeKey = `${isSplitMode}:${pinnedEntriesCount}:${colsCount}:${gallery.cardSize}:${gallery.aspect}:${gallery.entityFilter}:${gallery.activeChipIds?.length || 0}`;

  const { layout, handleSplitterPointerDown, resetSplit } = usePinnedSplit({
    enabled: isSplitMode,
    rootRef,
    pinnedRef,
    pinnedHeaderRef,
    pinnedGridRef,
    allChromeRef,
    initialRatio: splitRatio,
    onRatioChange: onSplitRatioChange,
    recomputeKey: splitRecomputeKey,
  });

  const gridStyle = useMemo(
    () => ({
      ...gallery.gridStyle,
      '--bb-char-cols': colsCount,
    }),
    [gallery.gridStyle, colsCount],
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove('bb-char-dragging');
    };
  }, []);

  const handleStartPointerDrag = useCallback(
    (e, meta) => {
      if (e.button !== 0) return;
      const targetEl = e.currentTarget;
      if (!targetEl) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const tileRect = targetEl.getBoundingClientRect();
      let ghostW = tileRect.width;
      let ghostH = tileRect.height;
      let offsetX = startX - tileRect.left;
      let offsetY = startY - tileRect.top;

      if (meta.fromRow) {
        const sampleSlot = pinnedGridRef.current?.querySelector('[data-bb-pinned-slot]');
        if (sampleSlot) {
          const sampleRect = sampleSlot.getBoundingClientRect();
          if (sampleRect.width > 24 && sampleRect.height > 24) {
            ghostW = sampleRect.width;
            ghostH = sampleRect.height;
          }
        }
        if (ghostW === tileRect.width) {
          ghostW = Number(gallery.cardSize) || 88;
          ghostH = gallery.aspect === 'square' ? ghostW : Math.round(ghostW * 1.5);
        }
        offsetX = Math.round(ghostW / 2);
        offsetY = Math.round(ghostH / 2);
      }

      let active = false;
      let pinnedMetrics = null;
      let popoverMetrics = null;
      let currentHover = null;
      let pendingRawHover = null;
      let pendingReorderKey = null;
      let reorderDwellTimer = null;
      let pinTabSwitchTimer = null;
      let lastGhost = null;
      let outsidePopover = false;

      const clearReorderTimer = () => {
        if (reorderDwellTimer !== null) {
          clearTimeout(reorderDwellTimer);
          reorderDwellTimer = null;
        }
        pendingReorderKey = null;
        pendingRawHover = null;
      };

      const clearPinTabTimer = () => {
        if (pinTabSwitchTimer !== null) {
          clearTimeout(pinTabSwitchTimer);
          pinTabSwitchTimer = null;
        }
      };

      const pushDragState = () => {
        if (!active || !lastGhost) return;
        setDragState({
          active: true,
          sourceOrigin: meta.sourceOrigin,
          sourceType: meta.sourceType,
          sourceIndex: meta.sourceIndex,
          sourceFolderId: meta.sourceFolderId,
          draggedCard: meta.card || null,
          folderEntry: meta.folderEntry || null,
          tagId: meta.tagId || null,
          ghost: lastGhost,
          outsidePopover,
          pinnedMetrics,
          popoverMetrics,
          hover: currentHover,
        });
      };

      const onPointerMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (!active) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          active = true;
          document.body.classList.add('bb-char-dragging');
          if (meta.sourceType === 'folder' || meta.sourceType === 'tag-folder') {
            latestPinnedRef.current?.setOpenFolderId?.(null);
            setOpenAllTagId(null);
          }
          pinnedMetrics = measureGridSlots(
            pinnedGridRef.current,
            '[data-bb-pinned-slot]',
            colsCount,
          );
          if (popoverGridRef.current && meta.sourceFolderType === 'folder') {
            popoverMetrics = measureGridSlots(
              popoverGridRef.current,
              '[data-bb-popover-slot]',
              colsCount,
            );
          }
        }

        ev.preventDefault();

        const ghostX = ev.clientX - offsetX;
        const ghostY = ev.clientY - offsetY;
        lastGhost = {
          x: ghostX,
          y: ghostY,
          width: ghostW,
          height: ghostH,
        };
        const ghostRect = {
          left: ghostX,
          top: ghostY,
          right: ghostX + ghostW,
          bottom: ghostY + ghostH,
          width: ghostW,
          height: ghostH,
        };

        const pinnedBox =
          (latestGalleryRef.current?.splitView ? pinnedRef.current : pinnedGridRef.current)?.getBoundingClientRect() ||
          null;
        const popoverBox = popoverRef.current?.getBoundingClientRect() || null;
        const pinTabEl = rootRef.current?.querySelector('[data-bb-pin-drop-tab="true"]');
        const pinTabBox = pinTabEl?.getBoundingClientRect() || null;

        // 1. Dragging from inside an open folder popover:
        //    As soon as the pointer leaves the folder bounds, close the folder immediately
        //    so the card can be placed freely into Pinned or dropped out of the folder.
        if (meta.sourceOrigin === 'folder-popover' && !outsidePopover) {
          const insidePop =
            popoverBox &&
            ev.clientX >= popoverBox.left - 8 &&
            ev.clientX <= popoverBox.right + 8 &&
            ev.clientY >= popoverBox.top - 8 &&
            ev.clientY <= popoverBox.bottom + 8;

          if (insidePop) {
            clearReorderTimer();
            clearPinTabTimer();
            currentHover =
              meta.sourceFolderType === 'folder' && popoverMetrics
                ? hitTestGrid(ev.clientX, ev.clientY, popoverMetrics, {
                    isInternalReorder: true,
                    sourceIndex: meta.sourceIndex,
                    canMerge: false,
                    scope: 'popover',
                    ghostRect,
                    prevHover: currentHover,
                  })
                : null;
            outsidePopover = false;
            pushDragState();
            return;
          }

          outsidePopover = true;
          currentHover = null;
          latestPinnedRef.current?.setOpenFolderId?.(null);
          setOpenAllTagId(null);
          pinnedMetrics = measureGridSlots(
            pinnedGridRef.current,
            '[data-bb-pinned-slot]',
            colsCount,
          );
        }

        const overPinTab =
          (meta.sourceOrigin === 'all' ||
            meta.sourceOrigin === 'all-tag' ||
            meta.sourceOrigin === 'folder-popover') &&
          pinTabBox &&
          ev.clientX >= pinTabBox.left - 6 &&
          ev.clientX <= pinTabBox.right + 6 &&
          ev.clientY >= pinTabBox.top - 6 &&
          ev.clientY <= pinTabBox.bottom + 6;

        if (overPinTab && latestGalleryRef.current?.entityFilter !== 'pinned') {
          clearReorderTimer();
          currentHover = { scope: 'pin-tab', mode: 'pin' };
          if (pinTabSwitchTimer === null) {
            pinTabSwitchTimer = setTimeout(() => {
              pinTabSwitchTimer = null;
              latestGalleryRef.current?.setEntityFilter?.('pinned');
              window.requestAnimationFrame(() => {
                pinnedMetrics = measureGridSlots(
                  pinnedGridRef.current,
                  '[data-bb-pinned-slot]',
                  colsCount,
                );
                currentHover = null;
                pushDragState();
              });
            }, PIN_TAB_SWITCH_DWELL_MS);
          }
          pushDragState();
          return;
        }
        clearPinTabTimer();

        if (
          latestGalleryRef.current?.splitView &&
          (meta.sourceOrigin === 'pinned' ||
            (meta.sourceOrigin === 'folder-popover' &&
              outsidePopover &&
              meta.sourceFolderType === 'folder')) &&
          pinnedBox &&
          ev.clientY > pinnedBox.bottom + 24
        ) {
          clearReorderTimer();
          currentHover = {
            scope: 'pinned',
            mode: 'unpin',
            sourceIndex: meta.sourceOrigin === 'pinned' ? meta.sourceIndex : -1,
            targetIndex: meta.sourceOrigin === 'pinned' ? meta.sourceIndex : -1,
          };
        } else if (
          pinnedBox &&
          ev.clientY >= pinnedBox.top - 16 &&
          ev.clientY <= pinnedBox.bottom + 28 &&
          ev.clientX >= pinnedBox.left - 16 &&
          ev.clientX <= pinnedBox.right + 16
        ) {
          if (!pinnedMetrics) {
            pinnedMetrics = measureGridSlots(
              pinnedGridRef.current,
              '[data-bb-pinned-slot]',
              colsCount,
            );
          }
          // Hovering over the Pinned section
          const rawHover = hitTestGrid(ev.clientX, ev.clientY, pinnedMetrics, {
            isInternalReorder: meta.sourceOrigin === 'pinned',
            sourceIndex: meta.sourceOrigin === 'pinned' ? meta.sourceIndex : -1,
            canMerge: meta.sourceType === 'item',
            scope: 'pinned',
            ghostRect,
            prevHover: currentHover,
          });

          const isNeutralSelfSlot =
            rawHover?.mode === 'reorder' &&
            meta.sourceOrigin === 'pinned' &&
            rawHover.targetIndex === meta.sourceIndex;

          const isTrailingEmptySlot =
            rawHover?.mode === 'reorder' &&
            pinnedMetrics &&
            (pinnedMetrics.rects.length === 0 ||
              (!rawHover.onTileEdge && rawHover.targetIndex >= pinnedMetrics.rects.length));

          if (!rawHover || rawHover.mode === 'merge' || isNeutralSelfSlot || isTrailingEmptySlot) {
            clearReorderTimer();
            currentHover = rawHover;
          } else if (meta.sourceType === 'item') {
            // Delay slot displacement briefly when moving across cards/gaps so target cards
            // stay still when the user is aiming to drop one card onto another.
            const key = `${rawHover.scope}:${rawHover.mode}:${rawHover.targetIndex}`;
            if (
              currentHover?.mode === 'reorder' &&
              currentHover?.targetIndex === rawHover.targetIndex
            ) {
              clearReorderTimer();
              currentHover = rawHover;
            } else if (pendingReorderKey !== key) {
              clearReorderTimer();
              pendingReorderKey = key;
              pendingRawHover = rawHover;
              reorderDwellTimer = setTimeout(() => {
                reorderDwellTimer = null;
                pendingReorderKey = null;
                currentHover = pendingRawHover;
                pendingRawHover = null;
                pushDragState();
              }, REORDER_DWELL_MS);
            } else {
              pendingRawHover = rawHover;
            }
          } else {
            clearReorderTimer();
            currentHover = rawHover;
          }
        } else {
          clearReorderTimer();
          currentHover = null;
        }

        pushDragState();
      };

      const onPointerUp = (ev) => {
        const effectiveHover = currentHover || pendingRawHover;
        clearReorderTimer();
        clearPinTabTimer();
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.body.classList.remove('bb-char-dragging');

        if (!active) {
          if (meta.sourceType === 'folder' || meta.sourceType === 'tag-folder') {
            meta.onClick?.(ev);
          }
          return;
        }

        ev.preventDefault();
        setDragState(null);

        const ctrl = latestPinnedRef.current;
        if (!ctrl) return;

        if (effectiveHover?.scope === 'pin-tab') {
          const endIdx = (ctrl.resolvedEntries || []).length;
          if (meta.card) {
            ctrl.pinOrMoveItemToIndex?.(meta.card.id, endIdx);
          } else if (meta.sourceOrigin === 'all-tag' && meta.tagId != null) {
            ctrl.pinTagFolderToIndex?.(meta.tagId, endIdx);
          }
          return;
        }

        if (!effectiveHover) {
          if (
            meta.sourceOrigin === 'folder-popover' &&
            outsidePopover &&
            meta.sourceFolderType === 'folder' &&
            meta.card
          ) {
            ctrl.removeCardFromFolder?.(meta.sourceFolderId, meta.card.id, false);
          }
          return;
        }

        if (effectiveHover.scope === 'popover' && effectiveHover.mode === 'reorder') {
          ctrl.reorderFolderMember?.(
            meta.sourceFolderId,
            meta.sourceIndex,
            effectiveHover.targetIndex,
          );
          return;
        }

        if (effectiveHover.scope === 'pinned') {
          if (effectiveHover.mode === 'unpin') {
            if (meta.sourceOrigin === 'pinned') {
              ctrl.unpinEntryAt?.(meta.sourceIndex);
            } else if (
              meta.sourceOrigin === 'folder-popover' &&
              meta.sourceFolderType === 'folder' &&
              meta.card
            ) {
              ctrl.removeCardFromFolder?.(meta.sourceFolderId, meta.card.id, true);
            }
            return;
          }

          if (effectiveHover.mode === 'merge' && meta.card) {
            ctrl.mergeCardIntoEntry?.(
              meta.card.id,
              effectiveHover.targetIndex,
              meta.sourceFolderId || null,
            );
            return;
          }

          if (effectiveHover.mode === 'reorder') {
            if (meta.sourceOrigin === 'pinned') {
              ctrl.reorderEntry?.(meta.sourceIndex, effectiveHover.targetIndex);
            } else if (
              (meta.sourceOrigin === 'all' || meta.sourceOrigin === 'folder-popover') &&
              meta.card
            ) {
              ctrl.pinOrMoveItemToIndex?.(meta.card.id, effectiveHover.targetIndex);
            } else if (meta.sourceOrigin === 'all-tag' && meta.tagId != null) {
              ctrl.pinTagFolderToIndex?.(meta.tagId, effectiveHover.targetIndex);
            }
          }
        }
      };

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [colsCount, gallery.cardSize, gallery.aspect],
  );
  const pinnedSectionNode = (
    <PinnedSection
      entries={pinnedLayout?.resolvedEntries || []}
      query={isSplitMode ? '' : gallery.query}
      showHeader={isSplitMode}
      selectedId={selectedCardId}
      openFolderId={pinnedLayout?.openFolderId || null}
      multiSelectActive={multiSelectActive}
      multiSelectedIds={multiSelectedIds}
      onToggleMultiSelect={onToggleMultiSelect}
      onSelect={onSelect}
      onOpen={onOpen}
      onTogglePin={onTogglePin}
      onOpenFolder={handleOpenPinnedFolder}
      onRenameFolder={pinnedLayout?.renameFolder}
      onRemoveCardFromFolder={pinnedLayout?.removeCardFromFolder}
      onStartPointerDrag={handleStartPointerDrag}
      kebabItemsFor={kebabItemsFor}
      kebabItemsForFolder={kebabItemsForFolder}
      dragState={dragState}
      gridStyle={gridStyle}
      headerRef={pinnedHeaderRef}
      anchorHeaderRef={allChromeRef}
      gridRef={pinnedGridRef}
      popoverRef={popoverRef}
      popoverGridRef={popoverGridRef}
    />
  );

  return (
    <div className={`bb-char-tome ${multiSelectActive ? 'is-multi-select-active' : ''}`.trim()}>
      <div className={isSplitMode ? 'bb-char-tome__split' : 'bb-char-tome__stage'} ref={rootRef}>
        {isSplitMode && (
          <>
            <section
              className="bb-char-tome__pinned"
              ref={pinnedRef}
              style={{ height: layout.pinnedH, minHeight: layout.minPinnedH }}
            >
              {pinnedSectionNode}
            </section>

            <div
              className="bb-char-splitter"
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize the Pinned section (double-click to reset)"
              onPointerDown={handleSplitterPointerDown}
              onDoubleClick={resetSplit}
            >
              <span className="bb-char-splitter-grip" />
            </div>
          </>
        )}

        <div
          className="bb-char-tome__all-wrap"
          ref={allWrapRef}
          style={isSplitMode ? { minHeight: layout.minAllH } : undefined}
        >
          <CharacterGallery
            cards={cards}
            groups={groups}
            visibleCards={visibleCards}
            visibleGroups={visibleGroups}
            tags={tags}
            gallery={gallery}
            gridStyle={gridStyle}
            selectedId={selectedCardId}
            multiSelectActive={multiSelectActive}
            multiSelectedIds={multiSelectedIds}
            onToggleMultiSelect={onToggleMultiSelect}
            onToggleMultiSelectMode={onToggleMultiSelectMode}
            hiddenTagIds={hiddenTagIds}
            onSelect={onSelect}
            onOpen={onOpen}
            onTogglePin={onTogglePin}
            openTagFolderId={openAllTagId}
            onOpenTag={(tagId) => {
              handleToggleAllTagFolder(tagId);
              onOpenTag?.(tagId);
            }}
            onToggleTagHidden={onToggleTagHidden}
            onCreateTag={onCreateTag}
            onOpenCreateModal={onOpenCreateModal}
            onDropImportFiles={onDropImportFiles}
            onStartPointerDrag={handleStartPointerDrag}
            dragState={dragState}
            kebabItemsFor={kebabItemsFor}
            kebabItemsForTagFolder={kebabItemsForTagFolder}
            userName={userName}
            pinnedCount={pinnedEntriesCount}
            pinnedDropHovered={Boolean(
              dragState?.active && dragState.hover?.scope === 'pin-tab',
            )}
            pinnedSlot={isSplitMode ? null : pinnedSectionNode}
            chromeRef={allChromeRef}
            scrollRef={allScrollRef}
            loading={loading}
          />

            {/* Expanded Tag Folder Popover inside Characters / All / Tags */}
            <FolderPopover
              activeFolder={activeAllTagFolder}
              triggerKey={activeAllTagFolder ? `all:tag:${activeAllTagFolder.tagId}` : ''}
              anchorSectionRef={allWrapRef}
              anchorHeaderRef={allChromeRef}
              popoverRef={popoverRef}
              popoverGridRef={popoverGridRef}
              gridStyle={gridStyle}
              selectedId={selectedCardId}
              multiSelectActive={multiSelectActive}
              multiSelectedIds={multiSelectedIds}
              onToggleMultiSelect={onToggleMultiSelect}
              onSelect={onSelect}
              onOpen={onOpen}
              onClose={() => setOpenAllTagId(null)}
              onRenameFolder={pinnedLayout?.renameFolder}
              onRemoveCardFromFolder={pinnedLayout?.removeCardFromFolder}
              onStartPointerDrag={handleStartPointerDrag}
              kebabItemsFor={kebabItemsFor}
              dragState={dragState}
            />
          </div>

          {/* Floating M3 Contextual Action Bar at the bottom of the right tome */}
          <MultiSelectBar
            open={multiSelectActive}
            count={multiSelectedIds.length}
            totalSelectable={totalSelectableCount}
            allSelected={allResultsSelected}
            onSelectAll={onSelectAllResults}
            onClear={onClearMultiSelect}
            onClose={onExitMultiSelect}
            actions={multiSelectActions}
            activeActionId={multiSelectActiveActionId}
            popover={multiSelectPopover}
          />
        </div>

      {/* Floating Drag Ghost following pointer */}
      {dragState?.active &&
        dragState.ghost &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`bb-pinned-drag-ghost ${dragState.hover?.mode === 'merge' ? 'is-merging' : ''}`}
            style={{
              ...gridStyle,
              left: `${Math.round(dragState.ghost.x)}px`,
              top: `${Math.round(dragState.ghost.y)}px`,
              width: `${Math.round(dragState.ghost.width)}px`,
              height: `${Math.round(dragState.ghost.height)}px`,
            }}
          >
            {dragState.draggedCard ? (
              <CharacterCardTile item={dragState.draggedCard} showPinBadge={false} />
            ) : dragState.folderEntry ? (
              <div className="bb-pinned-folder" style={{ width: '100%', height: '100%' }}>
                <div className="bb-folder-mini-grid">
                  {[0, 1, 2, 3].map((slot) => {
                    const m = (dragState.folderEntry.items || [])[slot];
                    return (
                      <div key={slot} className="bb-folder-mini-cell">
                        {m ? (
                          <SafeImage
                            src={m.thumbnailUrl || m.avatarUrl}
                            alt={m.name}
                            draggable={false}
                            className="bb-folder-mini-img"
                            fallback={<span>{m.initials || m.name?.[0] || 'CH'}</span>}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <span className="bb-pinned-folder__name">
                  <Icon
                    name={dragState.folderEntry.type === 'tag-folder' ? 'tags' : 'folder'}
                    size={11}
                    style={{ color: 'var(--bb-ink-accent)' }}
                  />
                  {dragState.folderEntry.name}
                </span>
              </div>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}


