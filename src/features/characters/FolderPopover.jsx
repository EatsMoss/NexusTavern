import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { ScrollIndicator } from '@ui/atoms/ScrollIndicator/ScrollIndicator.jsx';
import { CharacterCardTile } from '@ui/molecules/CharacterCardTile/CharacterCardTile.jsx';
import { useVirtualWindow } from '@core/hooks/useVirtualWindow.js';
import { computeSlotDisplacement, computeDropSlotBox } from './PinnedSection.jsx';

const EMPTY_ARRAY = Object.freeze([]);
const USER_FOLDER_VIRTUALIZE_MIN = 60;

export function FolderPopover({
  activeFolder = null,
  triggerKey = '',
  anchorSectionRef,
  anchorHeaderRef,
  popoverRef: externalPopoverRef,
  popoverGridRef: externalPopoverGridRef,
  gridStyle,
  selectedId,
  multiSelectActive = false,
  multiSelectedIds = [],
  onToggleMultiSelect,
  onSelect,
  onOpen,
  onClose,
  onRenameFolder,
  onRemoveCardFromFolder,
  onStartPointerDrag,
  kebabItemsFor,
  dragState = null,
}) {
  const internalPopoverRef = useRef(null);
  const resolvedPopoverRef = externalPopoverRef || internalPopoverRef;
  const internalPopoverGridRef = useRef(null);
  const resolvedPopoverGridRef = externalPopoverGridRef || internalPopoverGridRef;

  const handleMemberOpen = useCallback(
    (id) => {
      onOpen?.(id);
      onClose?.();
    },
    [onOpen, onClose],
  );

  const [popoverCoords, setPopoverCoords] = useState({
    top: 0,
    left: 0,
    width: 320,
    maxHeight: 520,
    ready: false,
  });

  const members = activeFolder?.items || EMPTY_ARRAY;
  const isUserFolder = activeFolder?.type === 'folder';
  const colsCount = Math.max(1, Number(gridStyle?.['--bb-char-cols']) || 5);
  const aspect = gridStyle?.['--bb-char-aspect'] === '1 / 1' ? 'square' : 'portrait';

  // Keep all slots mounted for standard user folders (and whenever reordering inside a user folder)
  // so slot index hit-testing works directly; virtualize tag folders & massive folders (800+ cards).
  const virtualizePopover =
    Boolean(activeFolder) &&
    (!isUserFolder || (!dragState?.active && members.length > USER_FOLDER_VIRTUALIZE_MIN));

  const {
    startIndex: windowStart,
    endIndex: windowEnd,
    topPaddingPx,
    bottomPaddingPx,
  } = useVirtualWindow({
    scrollRef: resolvedPopoverGridRef,
    totalItems: members.length,
    cols: colsCount,
    isList: false,
    aspect,
    rowGap: 8,
    colGap: 8,
    horizontalPadding: 0,
    basePaddingTop: 0,
    basePaddingBottom: 0,
    overscanRows: colsCount <= 3 ? 3 : 2,
    enabled: virtualizePopover,
    resetKey: String(activeFolder?.id || ''),
  });

  const visibleMembers = useMemo(
    () => (virtualizePopover ? members.slice(windowStart, windowEnd) : members),
    [virtualizePopover, members, windowStart, windowEnd],
  );

  const multiSelectedSet = useMemo(
    () => new Set(multiSelectedIds || []),
    [multiSelectedIds],
  );

  const updatePopoverPosition = useCallback(() => {
    const sectionEl = anchorSectionRef?.current;
    if (!sectionEl || typeof window === 'undefined') return;

    const sRect = sectionEl.getBoundingClientRect();
    const hRect = anchorHeaderRef?.current?.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const vw = window.innerWidth || 1280;

    const left = Math.max(8, Math.round(sRect.left + 4));
    const width = Math.max(180, Math.min(Math.round(sRect.width - 8), vw - left - 8));
    let top = hRect ? Math.round(hRect.bottom + 4) : Math.round(sRect.top + 28);

    const popEl = resolvedPopoverRef.current;
    if (popEl) {
      popEl.style.width = `${width}px`;
      popEl.style.maxHeight = 'none';
      const naturalH = popEl.offsetHeight;
      if (top + naturalH > vh - 12) {
        top = Math.max(12, vh - naturalH - 12);
      }
    }

    const maxHeight = Math.max(180, vh - top - 12);
    if (popEl) {
      popEl.style.maxHeight = `${maxHeight}px`;
    }

    setPopoverCoords((prev) => {
      if (
        prev.ready &&
        prev.top === top &&
        prev.left === left &&
        prev.width === width &&
        prev.maxHeight === maxHeight
      ) {
        return prev;
      }
      return { top, left, width, maxHeight, ready: true };
    });
  }, [anchorSectionRef, anchorHeaderRef, resolvedPopoverRef]);

  useLayoutEffect(() => {
    if (!activeFolder) {
      setPopoverCoords((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return undefined;
    }
    updatePopoverPosition();

    const sectionEl = anchorSectionRef?.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && sectionEl
        ? new ResizeObserver(() => updatePopoverPosition())
        : null;
    if (ro && sectionEl) ro.observe(sectionEl);

    window.addEventListener('resize', updatePopoverPosition);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updatePopoverPosition);
    };
  }, [
    activeFolder,
    members.length,
    topPaddingPx,
    bottomPaddingPx,
    gridStyle,
    anchorSectionRef,
    updatePopoverPosition,
  ]);

  useEffect(() => {
    if (!activeFolder || typeof document === 'undefined') return undefined;

    const closeFolderSafely = () => {
      const popEl = resolvedPopoverRef.current;
      if (
        popEl &&
        document.activeElement &&
        popEl.contains(document.activeElement) &&
        typeof document.activeElement.blur === 'function'
      ) {
        document.activeElement.blur();
      }
      onClose?.();
    };

    const handleDocPointerDown = (e) => {
      const target = e.target;
      const popEl = resolvedPopoverRef.current;
      if (popEl && popEl.contains(target)) {
        return;
      }
      if (
        target?.closest?.('.bb-kebab-menu__popover') &&
        popEl?.querySelector?.('.bb-kebab-menu.is-open')
      ) {
        return;
      }
      if (target?.closest?.('.bb-modal-backdrop')) {
        return;
      }
      if (triggerKey) {
        const clickedTrigger = target?.closest?.('[data-bb-folder-trigger-key]');
        if (
          clickedTrigger &&
          clickedTrigger.getAttribute('data-bb-folder-trigger-key') === triggerKey
        ) {
          return;
        }
      }
      closeFolderSafely();
    };

    const handleDocKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (document.querySelector('.bb-kebab-menu__popover, .bb-modal-backdrop')) return;
        e.stopPropagation();
        closeFolderSafely();
      }
    };

    document.addEventListener('pointerdown', handleDocPointerDown, true);
    document.addEventListener('keydown', handleDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocPointerDown, true);
      document.removeEventListener('keydown', handleDocKeyDown);
    };
  }, [activeFolder, triggerKey, onClose, resolvedPopoverRef]);

  if (!activeFolder || typeof document === 'undefined') return null;

  const popoverHover =
    isUserFolder && dragState?.active && dragState.hover?.scope === 'popover'
      ? dragState.hover
      : null;
  const popoverDropSlotBox = isUserFolder
    ? computeDropSlotBox(popoverHover, dragState?.popoverMetrics)
    : null;

  return createPortal(
    <div
      ref={resolvedPopoverRef}
      className="bb-pinned-folder-popover"
      style={{
        ...gridStyle,
        top: `${popoverCoords.top}px`,
        left: `${popoverCoords.left}px`,
        width: `${popoverCoords.width}px`,
        maxHeight: `${popoverCoords.maxHeight}px`,
        visibility: popoverCoords.ready ? 'visible' : 'hidden',
      }}
    >
      <div className="bb-folder-popover-header">
        <Icon
          name={activeFolder.type === 'tag-folder' ? 'tags' : 'folder'}
          size={14}
          style={{ color: 'var(--bb-ink-accent)', flexShrink: 0 }}
        />
        <input
          type="text"
          className="bb-folder-title-input"
          aria-label="Folder name"
          defaultValue={activeFolder.name}
          key={`${activeFolder.id}:${activeFolder.name}`}
          onBlur={(e) => onRenameFolder?.(activeFolder.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose?.();
            }
          }}
        />
        <span className="bb-char-section-hint" style={{ flexShrink: 0 }}>
          {members.length}
        </span>
        <button
          type="button"
          className="bb-folder-popover-close"
          title="Close folder"
          aria-label="Close folder"
          onClick={() => onClose?.()}
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      <div className="bb-folder-popover-grid-wrap">
        <div
          className={[
            'bb-folder-popover-grid',
            'bb-scrollbar--hidden',
            dragState?.active ? 'is-drag-active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={
            virtualizePopover
              ? {
                  paddingTop: `${topPaddingPx}px`,
                  paddingBottom: `${bottomPaddingPx}px`,
                }
              : undefined
          }
          ref={resolvedPopoverGridRef}
        >
          {popoverDropSlotBox && (
            <div
              className="bb-pinned-drop-slot-indicator"
              style={{
                left: `${popoverDropSlotBox.left}px`,
                top: `${popoverDropSlotBox.top}px`,
                width: `${popoverDropSlotBox.width}px`,
                height: `${popoverDropSlotBox.height}px`,
              }}
            />
          )}

          {visibleMembers.map((member, localIdx) => {
            const mIndex = virtualizePopover ? windowStart + localIdx : localIdx;
            const isPopoverSource =
              dragState?.active &&
              dragState.sourceOrigin === 'folder-popover' &&
              dragState.draggedCard?.id === member.id;

            const memberDisplacement = isUserFolder
              ? computeSlotDisplacement(mIndex, popoverHover, dragState?.popoverMetrics)
              : undefined;

            return (
              <div
                key={member.id}
                data-bb-popover-slot={mIndex}
                style={memberDisplacement}
                className={`${isUserFolder ? 'bb-pinned-slot' : 'bb-char-gallery__item'} ${isPopoverSource ? 'is-dragging-source' : ''}`.trim()}
                onPointerDown={(e) => {
                  if (
                    e.target.closest(
                      '.bb-folder-member-remove, .bb-char-tile__actions, .bb-kebab-menu',
                    )
                  ) {
                    return;
                  }
                  if (multiSelectActive || e.ctrlKey || e.metaKey || e.shiftKey) return;
                  onStartPointerDrag?.(e, {
                    sourceOrigin: 'folder-popover',
                    sourceType: 'item',
                    sourceIndex: mIndex,
                    sourceFolderId: activeFolder.id,
                    sourceFolderType: activeFolder.type,
                    card: member,
                  });
                }}
              >
                <CharacterCardTile
                  item={member}
                  showPinBadge={activeFolder.type === 'tag-folder'}
                  selected={member.id === selectedId}
                  multiSelectActive={multiSelectActive}
                  multiSelected={multiSelectedSet.has(member.id)}
                  onToggleMultiSelect={onToggleMultiSelect}
                  onSelect={onSelect}
                  onOpen={handleMemberOpen}
                  kebabItemsFor={kebabItemsFor}
                />
                {onRemoveCardFromFolder && (
                  <button
                    type="button"
                    className="bb-folder-member-remove"
                    title={
                      activeFolder.type === 'tag-folder'
                        ? `Remove tag "${activeFolder.name}"`
                        : 'Move out of folder'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCardFromFolder(activeFolder.id, member.id, false);
                    }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="bb-pinned-empty">This folder is empty.</div>
          )}
        </div>
        <ScrollIndicator
          scrollRef={resolvedPopoverGridRef}
          className="bb-scroll-indicator--panel"
        />
      </div>
    </div>,
    document.body,
  );
}
