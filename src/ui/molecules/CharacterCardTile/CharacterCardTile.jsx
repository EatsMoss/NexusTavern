import React, { memo, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Checkbox } from '@ui/atoms/Checkbox/Checkbox.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { KebabMenu } from '@ui/molecules/KebabMenu/KebabMenu.jsx';
import './CharacterCardTile.css';

function CharacterCardTileInner({
  item,
  selected = false,
  showPinBadge = true,
  multiSelectActive = false,
  multiSelected = false,
  onSelect,
  onOpen,
  onToggleMultiSelect,
  onTogglePin,
  kebabItems = [],
  kebabItemsFor = null,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragging = false,
  className = '',
}) {
  const resolveLazyKebab = useCallback(
    () => (kebabItemsFor && item ? kebabItemsFor(item) : []),
    [kebabItemsFor, item],
  );

  if (!item) return null;

  const initials =
    item.initials || String(item.name || 'CH').slice(0, 2).toUpperCase();
  const avatarSrc = item.thumbnailUrl || item.avatarUrl || null;
  const hasKebab =
    !multiSelectActive &&
    (typeof kebabItemsFor === 'function' || kebabItems.length > 0);

  const handleClick = (e) => {
    const isQuickMultiTrigger = e?.ctrlKey || e?.metaKey || e?.shiftKey;
    if (multiSelectActive || isQuickMultiTrigger) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onToggleMultiSelect?.(item.id, e);
      return;
    }
    onSelect?.(item.id);
  };

  return (
    <div
      className={[
        'bb-char-tile',
        selected ? 'is-selected' : '',
        multiSelectActive ? 'is-multi-select-mode' : '',
        multiSelected ? 'is-multi-selected' : '',
        isDragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={handleClick}
      onDoubleClick={() => {
        if (multiSelectActive) return;
        onSelect?.(item.id);
        onOpen?.(item.id);
      }}
    >
      <div className="bb-char-tile__portrait">
        <SafeImage
          src={avatarSrc}
          alt={item.name}
          loading="lazy"
          draggable={false}
          className="bb-char-tile__img"
          fallback={<span className="bb-char-tile__initials">{initials}</span>}
        />

        {showPinBadge && item.pinned && (
          <span className="bb-char-tile__pin" title="Pinned">
            <Icon name="starFilled" size={11} />
          </span>
        )}

        {multiSelectActive && (
          <Checkbox
            variant="overlay"
            checked={multiSelected}
            interactive={false}
            className="bb-char-tile__check"
          />
        )}

        {/* The name overlays the bottom of the portrait so the tile keeps its
            strict 1:1 / 2:3 ratio instead of being stretched by a footer. */}
        <span className="bb-char-tile__name" title={item.name}>
          {item.name}
        </span>
      </div>

      {hasKebab && (
        <div className="bb-char-tile__actions">
          <KebabMenu
            size="sm"
            items={kebabItems}
            getItems={typeof kebabItemsFor === 'function' ? resolveLazyKebab : null}
          />
        </div>
      )}
    </div>
  );
}

function areTileItemsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.initials === b.initials &&
    a.thumbnailUrl === b.thumbnailUrl &&
    a.avatarUrl === b.avatarUrl &&
    Boolean(a.pinned) === Boolean(b.pinned) &&
    Boolean(a.isGroup) === Boolean(b.isGroup)
  );
}

function areCardTilePropsEqual(prev, next) {
  return (
    areTileItemsEqual(prev.item, next.item) &&
    prev.selected === next.selected &&
    prev.showPinBadge === next.showPinBadge &&
    prev.multiSelectActive === next.multiSelectActive &&
    prev.multiSelected === next.multiSelected &&
    prev.draggable === next.draggable &&
    prev.isDragging === next.isDragging &&
    prev.className === next.className &&
    prev.onSelect === next.onSelect &&
    prev.onOpen === next.onOpen &&
    prev.onToggleMultiSelect === next.onToggleMultiSelect &&
    prev.onTogglePin === next.onTogglePin &&
    prev.kebabItemsFor === next.kebabItemsFor &&
    (prev.kebabItemsFor ? true : prev.kebabItems === next.kebabItems) &&
    prev.onDragStart === next.onDragStart &&
    prev.onDragEnd === next.onDragEnd &&
    prev.onDragOver === next.onDragOver &&
    prev.onDrop === next.onDrop
  );
}

export const CharacterCardTile = memo(CharacterCardTileInner, areCardTilePropsEqual);
