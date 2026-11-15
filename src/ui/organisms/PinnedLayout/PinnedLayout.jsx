import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import { SearchInput } from '@ui/atoms/Input/Input.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import './PinnedLayout.css';

export function PinnedLayout({
  items = [],
  folders = [],
  selectedId,
  onSelect,
  onOpenSelected,
  onTogglePin,
  onMoveToFolder,
  className = '',
}) {
  const [cols, setCols] = useState(4);
  const [aspect, setAspect] = useState('2 / 3');
  const [query, setQuery] = useState('');
  const [openFolderId, setOpenFolderId] = useState(null);
  const [openKebabId, setOpenKebabId] = useState(null);
  const [pinnedHeight, setPinnedHeight] = useState(195);
  const [dragItemId, setDragItemId] = useState(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const startYRef = useRef(0);
  const startHRef = useRef(195);
  const folderPopoverRef = useRef(null);

  useEffect(() => {
    if (!openFolderId || typeof document === 'undefined') return undefined;
    const onDocPointerDown = (e) => {
      if (folderPopoverRef.current && folderPopoverRef.current.contains(e.target)) return;
      if (e.target?.closest?.('[data-bb-demo-folder-id]')) return;
      setOpenFolderId(null);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
  }, [openFolderId]);

  const filteredItems = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const pinnedItems = filteredItems.filter((item) => item.pinned && !item.folderId);
  const activeFolder = folders.find((f) => f.id === openFolderId) || null;
  const folderMembers = activeFolder
    ? items.filter((item) => item.folderId === activeFolder.id)
    : [];

  const handleSplitterMouseDown = (e) => {
    e.preventDefault();
    startYRef.current = e.clientY;
    startHRef.current = pinnedHeight;

    const onMove = (ev) => {
      const delta = ev.clientY - startYRef.current;
      setPinnedHeight(Math.max(96, Math.min(320, startHRef.current + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const renderTile = (item) => {
    const isSelected = item.id === selectedId;
    const isKebabOpen = openKebabId === item.id;
    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => setDragItemId(item.id)}
        onDragEnd={() => {
          setDragItemId(null);
          setDropZoneActive(false);
        }}
        onClick={() => onSelect?.(item.id)}
        onDoubleClick={() => {
          onSelect?.(item.id);
          onOpenSelected?.(item.id);
        }}
        className={`bb-pinned-tile ${isSelected ? 'is-selected' : ''}`}
      >
        <div className="bb-pinned-tile-card">
          <div className="bb-pinned-avatar">
            <SafeImage
              src={item.thumbnailUrl || item.avatarUrl}
              alt={item.name}
              loading="lazy"
              className="bb-pinned-avatar-img"
              fallback={<span>{item.initials || item.name.slice(0, 2).toUpperCase()}</span>}
            />
            {item.badgeText && (
              <span className="bb-pinned-meta-badge">{item.badgeText}</span>
            )}
          </div>
          <div className="bb-pinned-name">{item.name}</div>
        </div>

        <button
          type="button"
          title="Card actions"
          className={`bb-kebab-btn ${isKebabOpen ? 'is-open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpenKebabId(isKebabOpen ? null : item.id);
          }}
        >
          <Icon name="moreVert" size={14} />
        </button>

        {isKebabOpen && (
          <div className="bb-kebab-popover" onClick={(e) => e.stopPropagation()}>
            {onOpenSelected && (
              <button
                type="button"
                className="bb-kebab-item"
                onClick={() => {
                  onSelect?.(item.id);
                  onOpenSelected(item.id);
                  setOpenKebabId(null);
                }}
              >
                <Icon name="bookOpen" size={12} style={{ marginRight: 5 }} />
                Selected Scenario
              </button>
            )}
            <button
              type="button"
              className="bb-kebab-item"
              onClick={() => {
                onTogglePin?.(item.id);
                setOpenKebabId(null);
              }}
            >
              <Icon name="pin" size={12} style={{ marginRight: 5 }} />
              {item.pinned ? 'Unpin Card' : 'Pin to Top'}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="bb-kebab-item"
                onClick={() => {
                  onMoveToFolder?.(item.id, item.folderId === f.id ? null : f.id);
                  setOpenKebabId(null);
                }}
              >
                <Icon name="folder" size={12} style={{ marginRight: 5 }} />
                {item.folderId === f.id ? `Remove from ${f.name}` : `Move to ${f.name}`}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`bb-pinned-layout ${className}`.trim()}
      style={{ '--bb-char-cols': cols, '--bb-char-aspect': aspect }}
    >
      <div className="bb-char-section-header">
        <span className="bb-char-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pin" size={14} style={{ color: 'var(--bb-ink-accent)' }} />
          Pinned ({pinnedItems.length + folders.length})
        </span>
        <div className="bb-card-size-toolbar">
          <div className="bb-all-sort-filter" title="Grid columns">
            {[4, 5, 6].map((c) => (
              <button
                key={c}
                type="button"
                className={`bb-sort-filter-btn ${cols === c ? 'active' : ''}`}
                onClick={() => setCols(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="bb-all-sort-filter" title="Portrait aspect ratio">
            {[
              { id: '1 / 1', label: '1:1' },
              { id: '2 / 3', label: '2:3' },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                className={`bb-sort-filter-btn ${aspect === r.id ? 'active' : ''}`}
                onClick={() => setAspect(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <OverlayScrollArea
        style={{ height: pinnedHeight }}
        viewportClassName={`bb-pinned-section ${dropZoneActive ? 'is-drop-target' : ''}`}
        variant="compact"
        onDragOver={(e) => {
          e.preventDefault();
          setDropZoneActive(true);
        }}
        onDragLeave={() => setDropZoneActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropZoneActive(false);
          if (dragItemId) onTogglePin?.(dragItemId, true);
        }}
      >
        <div className="bb-pinned-grid">
          {folders.map((folder) => {
            const members = items.filter((i) => i.folderId === folder.id);
            const isOpen = openFolderId === folder.id;
            return (
              <div
                key={folder.id}
                data-bb-demo-folder-id={folder.id}
                className={`bb-pinned-tile ${isOpen ? 'is-selected' : ''}`}
                onClick={() => setOpenFolderId(isOpen ? null : folder.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  if (dragItemId) onMoveToFolder?.(dragItemId, folder.id);
                }}
              >
                <div className="bb-pinned-tile-card">
                  <div className="bb-pinned-avatar">
                    <div className="bb-folder-mini-grid">
                      {[0, 1, 2, 3].map((slot) => {
                        const m = members[slot];
                        return (
                          <div key={slot} className="bb-folder-mini-cell">
                            {m ? (
                              <SafeImage
                                src={m.thumbnailUrl || m.avatarUrl}
                                alt={m.name}
                                loading="lazy"
                                className="bb-pinned-avatar-img"
                                fallback={<span>{m.initials || m.name[0]}</span>}
                              />
                            ) : (
                              ''
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="bb-pinned-name" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Icon name="folder" size={12} style={{ color: 'var(--bb-ink-accent)' }} />
                    <span>{folder.name}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {pinnedItems.map(renderTile)}

          {pinnedItems.length === 0 && folders.length === 0 && (
            <div className="bb-pinned-empty">
              Drag any card here to pin it for instant access
            </div>
          )}
        </div>
      </OverlayScrollArea>

      {activeFolder && (
        <div ref={folderPopoverRef} className="bb-opened-folder-box">
          <div className="bb-char-section-header" style={{ paddingBottom: 4 }}>
            <span className="bb-char-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="folder" size={14} style={{ color: 'var(--bb-ink-accent)' }} />
              {activeFolder.name} ({folderMembers.length})
            </span>
            <button
              type="button"
              className="bb-sort-filter-btn"
              onClick={() => setOpenFolderId(null)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <div className="bb-pinned-grid">{folderMembers.map(renderTile)}</div>
        </div>
      )}

      <div
        className="bb-char-splitter"
        title="Drag to resize Pinned section"
        onMouseDown={handleSplitterMouseDown}
      >
        <div className="bb-char-splitter-grip" />
      </div>

      <div className="bb-char-section-header">
        <span className="bb-char-section-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="users" size={14} style={{ color: 'var(--bb-ink-accent)' }} />
          All Cards ({filteredItems.length})
        </span>
      </div>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Filter cards by name or tag (e.g. fantasy, sci-fi)..."
      />
      <div className="bb-pinned-grid" style={{ marginTop: 4 }}>
        {filteredItems.map(renderTile)}
      </div>
    </div>
  );
}


