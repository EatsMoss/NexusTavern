import React, { useState, useEffect } from 'react';
import './AvatarStack.css';

function AvatarStackItem({
  item,
  index,
  total,
  size,
  overlap,
  cutoutGapPx,
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item?.avatarUrl]);

  const label = String(item?.name || '').trim();
  const fallbackInitials =
    item?.initials ||
    label.slice(0, 2).toUpperCase() ||
    (index === 0 ? 'SC' : 'ME');
  const showImage = Boolean(item?.avatarUrl) && !imgError;

  const stepPx = size * (1 - overlap);
  const marginLeftPx = index === 0 ? 0 : -Number((size * overlap).toFixed(2));
  // In local coords of circle `index`, previous circle center sits at `size / 2 - stepPx`
  const cutoutCenterX = Number((size / 2 - stepPx).toFixed(2));
  const cutoutRadius = Number((size / 2 + cutoutGapPx).toFixed(2));

  const style = {
    width: `${size}px`,
    height: `${size}px`,
    marginLeft: index === 0 ? '0px' : `${marginLeftPx}px`,
    zIndex: total - index,
    ...(index > 0
      ? {
          '--bb-avatar-cutout-x': `${cutoutCenterX}px`,
          '--bb-avatar-cutout-r': `${cutoutRadius}px`,
          '--bb-avatar-cutout-inner': `${Math.max(0, cutoutRadius - 0.85).toFixed(2)}px`,
        }
      : {}),
  };

  return (
    <span
      className={`bb-avatar-stack__item ${index > 0 ? 'is-under' : 'is-lead'}`}
      style={style}
      title={item?.title || undefined}
    >
      {showImage ? (
        <img
          src={item.avatarUrl}
          alt={label}
          className="bb-avatar-stack__img"
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="bb-avatar-stack__initials">{fallbackInitials}</span>
      )}
    </span>
  );
}

/**
 * AvatarStack — M3 overlapping circular avatar group molecule.
 * Leftmost avatar sits in front; each subsequent avatar to the right sits deeper underneath
 * with a clean transparent crescent cutout so translucent surfaces show through cleanly.
 */
export function AvatarStack({
  items = [],
  size = 24,
  overlap = 0.35,
  cutoutGapPx = 1.5,
  maxVisible = 4,
  className = '',
}) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (safeItems.length === 0) return null;

  const visible = safeItems.slice(0, maxVisible);
  const extraCount = Math.max(0, safeItems.length - visible.length);
  const totalSlots = visible.length + (extraCount > 0 ? 1 : 0);
  const clampedOverlap = Math.max(0, Math.min(0.75, Number(overlap) || 0.35));
  const numericSize = Math.max(16, Number(size) || 24);

  return (
    <span
      className={`bb-avatar-stack ${className}`.trim()}
      style={{ '--bb-avatar-stack-size': `${numericSize}px` }}
      aria-hidden="true"
    >
      {visible.map((item, idx) => (
        <AvatarStackItem
          key={item.id || `${item.name || 'av'}-${idx}`}
          item={item}
          index={idx}
          total={totalSlots}
          size={numericSize}
          overlap={clampedOverlap}
          cutoutGapPx={cutoutGapPx}
        />
      ))}
      {extraCount > 0 && (
        <span
          className="bb-avatar-stack__item bb-avatar-stack__more is-under"
          style={{
            width: `${numericSize}px`,
            height: `${numericSize}px`,
            marginLeft: `${-Number((numericSize * clampedOverlap).toFixed(2))}px`,
            zIndex: 0,
            '--bb-avatar-cutout-x': `${Number((numericSize / 2 - numericSize * (1 - clampedOverlap)).toFixed(2))}px`,
            '--bb-avatar-cutout-r': `${Number((numericSize / 2 + cutoutGapPx).toFixed(2))}px`,
            '--bb-avatar-cutout-inner': `${Math.max(0, numericSize / 2 + cutoutGapPx - 0.85).toFixed(2)}px`,
          }}
        >
          <span className="bb-avatar-stack__initials">+{extraCount}</span>
        </span>
      )}
    </span>
  );
}
