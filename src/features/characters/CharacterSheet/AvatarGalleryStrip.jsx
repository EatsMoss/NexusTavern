import React, { useRef, useState } from 'react';
import { Icon, SafeImage } from '@ui/index.js';

/**
 * AvatarGalleryStrip — Smart M3 scenario portrait switcher.
 */
export function AvatarGalleryStrip({
  gallery = [],
  activePortraitId = null,
  busy = false,
  onSelectPortrait,
  onUploadPortraits,
  onDeletePortrait,
}) {
  const fileInputRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const hasPortraits = Array.isArray(gallery) && gallery.length > 0;
  const canDeletePortraits = Array.isArray(gallery) && gallery.length > 1;

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) onUploadPortraits?.(files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer?.files);
  };

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      multiple
      style={{ display: 'none' }}
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  if (!hasPortraits) {
    return (
      <div
        className={`bb-cs-gallery-slim ${dragOver ? 'is-drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {hiddenInput}
        <button
          type="button"
          className="bb-cs-gallery-slim__btn"
          disabled={busy}
          title="Upload alternate portraits for 1-click switching and per-intro avatars"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="plus" size={14} />
          <span>
            {busy ? 'Uploading portrait...' : 'Add Alternate Portrait (click or drop image)'}
          </span>
        </button>
      </div>
    );
  }

  const effectiveActiveId = activePortraitId || gallery[0]?.id || null;

  return (
    <section
      className={`bb-cs-gallery ${dragOver ? 'is-drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hiddenInput}
      <div className="bb-cs-gallery__head">
        <button
          type="button"
          className="bb-cs-gallery__toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand portrait gallery' : 'Collapse portrait gallery'}
        >
          <Icon name="images" size={13} />
          <span>Scenario Portraits ({gallery.length})</span>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={14} />
        </button>

        <button
          type="button"
          className="bb-cs-gallery__add-inline"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          title="Upload another portrait to this scenario"
        >
          <Icon name="plus" size={13} />
          <span>Add</span>
        </button>
      </div>

      {!collapsed && (
        <div className="bb-cs-gallery__strip">
          {gallery.map((item, idx) => {
            const isActive = item.id === effectiveActiveId;
            const titleText = item.isOriginal
              ? 'Original card portrait — click to restore as main portrait'
              : `${item.label || `Portrait #${idx + 1}`} — click to set as main portrait`;

            return (
              <div key={item.id} className={`bb-cs-gallery__thumb ${isActive ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="bb-cs-gallery__thumb-btn"
                  disabled={busy}
                  title={titleText}
                  onClick={() => {
                    if (!isActive) onSelectPortrait?.(item);
                  }}
                >
                  <SafeImage
                    src={item.url}
                    alt={item.label || `Portrait ${idx + 1}`}
                    draggable={false}
                    fallback={<Icon name="image" size={16} />}
                  />
                  {item.isOriginal && <span className="bb-cs-gallery__orig-tag">Orig</span>}
                  {isActive && (
                    <span className="bb-cs-gallery__active-badge" aria-label="Active portrait">
                      <Icon name="check" size={11} />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={`bb-cs-gallery__del-btn ${!canDeletePortraits ? 'is-disabled' : ''}`.trim()}
                  disabled={busy || !canDeletePortraits}
                  title={
                    canDeletePortraits
                      ? 'Remove portrait from gallery'
                      : 'Cannot remove the only remaining portrait'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canDeletePortraits) return;
                    onDeletePortrait?.(item);
                  }}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="bb-cs-gallery__add-tile"
            disabled={busy}
            title="Upload alternate portrait"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="plus" size={16} />
            <span>Add</span>
          </button>
        </div>
      )}
    </section>
  );
}
