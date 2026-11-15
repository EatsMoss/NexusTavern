import React, { useMemo, useRef } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { ScrollIndicator } from '@ui/atoms/ScrollIndicator/ScrollIndicator.jsx';
import { CharacterCardTile } from '@ui/molecules/CharacterCardTile/CharacterCardTile.jsx';
import { KebabMenu } from '@ui/molecules/KebabMenu/KebabMenu.jsx';
import { FolderPopover } from './FolderPopover.jsx';
import './PinnedSection.css';

function renderMiniPreviewCell(member, key, extraClass = '') {
  return (
    <div key={key} className={`bb-folder-mini-cell ${extraClass}`.trim()}>
      {member ? (
        <SafeImage
          src={member.thumbnailUrl || member.avatarUrl}
          alt={member.name}
          loading="lazy"
          draggable={false}
          className="bb-folder-mini-img"
          fallback={<span>{member.initials || member.name?.[0] || 'CH'}</span>}
        />
      ) : null}
    </div>
  );
}

/**
 * Computes the 2D translation `translate3d(dx, dy, 0)` for tile `index`
 * when tiles smoothly slide apart to open a slot at `targetSlotIndex`.
 */
export function computeSlotDisplacement(index, dragHover, slotMetrics) {
  if (!dragHover || !slotMetrics || !slotMetrics.rects || slotMetrics.rects.length === 0) {
    return undefined;
  }
  const { mode, sourceIndex, targetIndex } = dragHover;
  if (mode !== 'reorder' || typeof targetIndex !== 'number') return undefined;

  const rects = slotMetrics.rects;
  const cols = slotMetrics.cols || 5;
  const stepX = slotMetrics.stepX || 0;
  const stepY = slotMetrics.stepY || 0;
  const currentRect = rects[index];
  if (!currentRect) return undefined;

  let destSlot = index;

  if (typeof sourceIndex === 'number' && sourceIndex >= 0) {
    // Internal reorder within the same grid
    if (index === sourceIndex) return undefined;
    if (sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) {
      destSlot = index - 1;
    } else if (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex) {
      destSlot = index + 1;
    }
  } else {
    // External insertion (from All or from folder popover): shift tiles at >= targetIndex forward by 1 slot
    if (index >= targetIndex) {
      destSlot = index + 1;
    }
  }

  if (destSlot === index) return undefined;

  if (rects[destSlot]) {
    const dx = rects[destSlot].left - currentRect.left;
    const dy = rects[destSlot].top - currentRect.top;
    return { transform: `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)` };
  }

  // Extrapolate when shifting into the newly-created trailing slot (index + 1 === rects.length)
  const fromCol = index % cols;
  const toCol = destSlot % cols;
  const fromRow = Math.floor(index / cols);
  const toRow = Math.floor(destSlot / cols);
  const dx = (toCol - fromCol) * stepX;
  const dy = (toRow - fromRow) * stepY;
  return { transform: `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)` };
}

/**
 * Computes the position of the dashed insertion slot box relative to the grid container.
 */
export function computeDropSlotBox(dragHover, slotMetrics) {
  if (!dragHover || dragHover.mode !== 'reorder' || !slotMetrics) return null;
  const { targetIndex } = dragHover;
  if (typeof targetIndex !== 'number' || targetIndex < 0) return null;

  const { rects, gridRect, cols = 5, stepX = 0, stepY = 0 } = slotMetrics;
  if (!gridRect || !rects || rects.length === 0) return null;

  if (rects[targetIndex]) {
    const r = rects[targetIndex];
    return {
      left: Math.round(r.left - gridRect.left),
      top: Math.round(r.top - gridRect.top + slotMetrics.scrollTop),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  // Trailing slot after the last item
  const first = rects[0];
  const col = targetIndex % cols;
  const row = Math.floor(targetIndex / cols);
  return {
    left: Math.round(first.left - gridRect.left + col * stepX),
    top: Math.round(first.top - gridRect.top + slotMetrics.scrollTop + row * stepY),
    width: Math.round(first.width),
    height: Math.round(first.height),
  };
}
export function PinnedSection({
  entries = [],
  selectedId,
  openFolderId,
  multiSelectActive = false,
  multiSelectedIds = [],
  onToggleMultiSelect,
  onSelect,
  onOpen,
  onTogglePin,
  onOpenFolder,
  onRenameFolder,
  onRemoveCardFromFolder,
  onStartPointerDrag,
  kebabItemsFor,
  kebabItemsForFolder,
  dragState = null,
  gridStyle,
  headerRef,
  gridRef,
  popoverRef,
  popoverGridRef,
}) {
  const sectionRef = useRef(null);
  const internalHeaderRef = useRef(null);
  const resolvedHeaderRef = headerRef || internalHeaderRef;
  const internalGridRef = useRef(null);
  const resolvedGridRef = gridRef || internalGridRef;

  const multiSelectedSet = useMemo(
    () => new Set(multiSelectedIds || []),
    [multiSelectedIds],
  );

  const activeFolder = useMemo(
    () =>
      entries.find(
        (e) => (e.type === 'folder' || e.type === 'tag-folder') && e.id === openFolderId,
      ) || null,
    [entries, openFolderId],
  );

  const isPinnedDragActive = Boolean(dragState?.active);
  const isUnpinWarning = Boolean(dragState?.active && dragState.hover?.mode === 'unpin');

  const mainHover =
    dragState?.active && dragState.hover?.scope === 'pinned' ? dragState.hover : null;

  const mainDropSlotBox = computeDropSlotBox(mainHover, dragState?.pinnedMetrics);

  return (
    <div
      ref={sectionRef}
      className={[
        'bb-pinned-section',
        isPinnedDragActive && mainHover ? 'is-drop-active' : '',
        isUnpinWarning ? 'is-unpin-warning' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="bb-char-section-header" ref={resolvedHeaderRef}>
        <span className="bb-char-section-title">
          <Icon name="pin" size={14} style={{ color: 'var(--bb-ink-accent)' }} />
          Pinned ({entries.length})
        </span>
        <span className="bb-char-section-hint">
          drag between cards to reorder · drop onto center to create folder
        </span>
      </div>

      <div className="bb-pinned-grid-wrap">
        <div className="bb-pinned-grid bb-scrollbar--hidden" style={gridStyle} ref={resolvedGridRef}>
        {mainDropSlotBox && (
          <div
            className="bb-pinned-drop-slot-indicator"
            style={{
              left: `${mainDropSlotBox.left}px`,
              top: `${mainDropSlotBox.top}px`,
              width: `${mainDropSlotBox.width}px`,
              height: `${mainDropSlotBox.height}px`,
            }}
          />
        )}

        {entries.map((entry, index) => {
          const isSourceTile =
            dragState?.active &&
            dragState.sourceOrigin === 'pinned' &&
            dragState.sourceIndex === index;

          const isMergeTarget =
            mainHover?.mode === 'merge' && mainHover.targetIndex === index && !isSourceTile;

          const displacementStyle = computeSlotDisplacement(
            index,
            mainHover,
            dragState?.pinnedMetrics,
          );

          if (entry.type === 'folder' || entry.type === 'tag-folder') {
            const members = entry.items || [];
            const previewMembers =
              isMergeTarget && dragState?.draggedCard
                ? [...members.slice(0, 3), dragState.draggedCard]
                : members.slice(0, 4);
            const folderKebabItems = kebabItemsForFolder ? kebabItemsForFolder(entry) : [];

            return (
              <div
                key={entry.id}
                data-bb-pinned-slot={index}
                data-bb-slot-type={entry.type}
                data-bb-folder-id={entry.id}
                data-bb-folder-trigger-key={`pinned:${entry.id}`}
                style={displacementStyle}
                className={[
                  'bb-pinned-slot',
                  isSourceTile ? 'is-dragging-source' : '',
                  isMergeTarget ? 'is-merge-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onPointerDown={(e) => {
                  if (e.target.closest('.bb-pinned-folder__actions, .bb-kebab-menu')) return;
                  onStartPointerDrag?.(e, {
                    sourceOrigin: 'pinned',
                    sourceType: entry.type,
                    sourceIndex: index,
                    folderEntry: entry,
                    onClick: () => onOpenFolder?.(entry.id),
                  });
                }}
              >
                <div
                  className={[
                    'bb-pinned-folder',
                    openFolderId === entry.id ? 'is-open' : '',
                    entry.isHidden ? 'is-hidden' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={`${entry.name} (${members.length})`}
                >
                  {entry.isHidden ? (
                    <div className="bb-folder-hidden-overlay" title="Hidden tag">
                      <Icon name="eyeSlash" size={20} />
                    </div>
                  ) : (
                    <div className="bb-folder-mini-grid">
                      {[0, 1, 2, 3].map((slot) => {
                        const m = previewMembers[slot];
                        const isIncoming =
                          isMergeTarget &&
                          dragState?.draggedCard &&
                          slot === Math.min(3, members.length);
                        return renderMiniPreviewCell(
                          m,
                          slot,
                          isIncoming ? 'is-preview-incoming' : '',
                        );
                      })}
                    </div>
                  )}
                  <span className="bb-pinned-folder__name">
                    <Icon
                      name={entry.type === 'tag-folder' ? 'tags' : 'folder'}
                      size={11}
                      style={{ color: 'var(--bb-ink-accent)' }}
                    />
                    {entry.name}
                  </span>
                  <span className="bb-pinned-folder__count">{members.length}</span>
                  {!multiSelectActive && folderKebabItems.length > 0 && (
                    <div className="bb-pinned-folder__actions">
                      <KebabMenu size="sm" title="Folder actions" items={folderKebabItems} />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const card = entry.card;
          if (!card) return null;

          return (
            <div
              key={card.id}
              data-bb-pinned-slot={index}
              data-bb-slot-type="item"
              style={displacementStyle}
              className={[
                'bb-pinned-slot',
                isSourceTile ? 'is-dragging-source' : '',
                isMergeTarget ? 'is-merge-target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(e) => {
                if (e.target.closest('.bb-char-tile__actions, .bb-kebab-menu')) return;
                if (multiSelectActive || e.ctrlKey || e.metaKey || e.shiftKey) return;
                onStartPointerDrag?.(e, {
                  sourceOrigin: 'pinned',
                  sourceType: 'item',
                  sourceIndex: index,
                  card,
                  onClick: () => onSelect?.(card.id),
                  onDoubleClick: () => {
                    onSelect?.(card.id);
                    onOpen?.(card.id);
                  },
                });
              }}
            >
              <CharacterCardTile
                item={card}
                showPinBadge={false}
                selected={card.id === selectedId}
                multiSelectActive={multiSelectActive}
                multiSelected={multiSelectedSet.has(card.id)}
                onToggleMultiSelect={onToggleMultiSelect}
                onSelect={onSelect}
                onOpen={onOpen}
                onTogglePin={(id) => onTogglePin?.(id, false)}
                kebabItems={kebabItemsFor ? kebabItemsFor(card) : []}
              />

              {/* Live 2x2 folder morph preview when dragging another card onto the center of this card */}
              {isMergeTarget && dragState?.draggedCard && (
                <div className="bb-temp-folder-preview">
                  <div className="bb-folder-mini-grid">
                    {renderMiniPreviewCell(card, 0)}
                    {renderMiniPreviewCell(dragState.draggedCard, 1, 'is-preview-incoming')}
                    {renderMiniPreviewCell(null, 2)}
                    {renderMiniPreviewCell(null, 3)}
                  </div>
                  <span className="bb-pinned-folder__name">
                    <Icon name="folder" size={11} style={{ color: 'var(--bb-ink-accent)' }} />
                    New Folder
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {entries.length === 0 && (
          <div className="bb-pinned-empty">
            Drag any card or tag folder here to pin it — drop one card onto another to create a
            folder.
          </div>
        )}
        </div>
        <ScrollIndicator scrollRef={resolvedGridRef} className="bb-scroll-indicator--panel" />
      </div>

      {/* Expanded Folder Popover Overlay — portaled so Pinned height never clips it */}
      <FolderPopover
        activeFolder={activeFolder}
        triggerKey={activeFolder ? `pinned:${activeFolder.id}` : ''}
        anchorSectionRef={sectionRef}
        anchorHeaderRef={resolvedHeaderRef}
        popoverRef={popoverRef}
        popoverGridRef={popoverGridRef}
        gridStyle={gridStyle}
        selectedId={selectedId}
        multiSelectActive={multiSelectActive}
        multiSelectedIds={multiSelectedIds}
        onToggleMultiSelect={onToggleMultiSelect}
        onSelect={onSelect}
        onOpen={onOpen}
        onClose={() => onOpenFolder?.(null)}
        onRenameFolder={onRenameFolder}
        onRemoveCardFromFolder={onRemoveCardFromFolder}
        onStartPointerDrag={onStartPointerDrag}
        kebabItemsFor={kebabItemsFor}
        dragState={dragState}
      />
    </div>
  );
}


