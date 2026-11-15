import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Checkbox } from '@ui/atoms/Checkbox/Checkbox.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { KebabMenu } from '@ui/molecules/KebabMenu/KebabMenu.jsx';
import './CharacterCardTile.css';

/**
 * Character gallery tile for the right tome.
 *
 * Presentation only: the gallery owns selection, multi-select and drag state, so
 * this component never keeps any of it locally. The multi-select checkbox is
 * rendered only while the selection mode is active, mirroring the reference
 * behaviour where tiles double as selection toggles in that mode.
 */
export function CharacterCardTile({
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
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragging = false,
  className = '',
}) {
  if (!item) return null;

  const initials =
    item.initials || String(item.name || 'CH').slice(0, 2).toUpperCase();
  const avatarSrc = item.thumbnailUrl || item.avatarUrl || null;

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

      {!multiSelectActive && kebabItems.length > 0 && (
        <div className="bb-char-tile__actions">
          <KebabMenu size="sm" items={kebabItems} />
        </div>
      )}
    </div>
  );
}
