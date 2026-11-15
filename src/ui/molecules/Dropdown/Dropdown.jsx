import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { SearchInput } from '@ui/atoms/Input/Input.jsx';
import { Checkbox } from '@ui/atoms/Checkbox/Checkbox.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import './Dropdown.css';

const SORT_MODES = [
  { id: 'alpha-asc', label: 'A–Z', title: 'Sort alphabetically (A to Z)' },
  { id: 'alpha-desc', label: 'Z–A', title: 'Sort alphabetically (Z to A)' },
  { id: 'date-desc', label: 'Newest', title: 'Sort by date (newest first)' },
  { id: 'date-asc', label: 'Oldest', title: 'Sort by date (oldest first)' },
];

function resolveOptionTimestampMs(opt) {
  if (!opt) return 0;
  return (
    Number(
      opt.timestampMs ||
        opt.updatedAtMs ||
        opt.createdAtMs ||
        (opt.updatedAt ? Date.parse(opt.updatedAt) : 0) ||
        (opt.createdAt ? Date.parse(opt.createdAt) : 0),
    ) || 0
  );
}

function sortDropdownOptions(list, sortMode) {
  const arr = [...list];
  if (sortMode === 'alpha-desc') {
    arr.sort((a, b) =>
      String(b.label || '').localeCompare(String(a.label || ''), undefined, {
        sensitivity: 'base',
      }),
    );
  } else if (sortMode === 'date-desc') {
    arr.sort((a, b) => {
      const ta = resolveOptionTimestampMs(a);
      const tb = resolveOptionTimestampMs(b);
      if (tb !== ta) return tb - ta;
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, {
        sensitivity: 'base',
      });
    });
  } else if (sortMode === 'date-asc') {
    arr.sort((a, b) => {
      const ta = resolveOptionTimestampMs(a);
      const tb = resolveOptionTimestampMs(b);
      if (ta !== tb) return ta - tb;
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, {
        sensitivity: 'base',
      });
    });
  } else {
    arr.sort((a, b) =>
      String(a.label || '').localeCompare(String(b.label || ''), undefined, {
        sensitivity: 'base',
      }),
    );
  }
  return arr;
}

export function Dropdown({
  label,
  hint,
  options = [],
  value,
  onChange,
  starredValues = [],
  onToggleStar,
  searchable = true,
  allowStars = true,
  sortable = false,
  defaultSort = 'alpha-asc',
  enableFolders = false,
  folders = [],
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAssignFolder,
  enableBulkEdit = false,
  onBulkDelete,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Filter options...',
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState(defaultSort);
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
  const [bulkMoveMenuOpen, setBulkMoveMenuOpen] = useState(false);
  const [itemMoveFolderFor, setItemMoveFolderFor] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [draggedValue, setDraggedValue] = useState(null);
  const [popoverStyle, setPopoverStyle] = useState({});

  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const starSet = useMemo(() => new Set(starredValues), [starredValues]);
  const bulkSet = useMemo(() => new Set(bulkSelected), [bulkSelected]);
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) || null,
    [options, value],
  );

  const updatePopoverPosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return;
    if (window.innerWidth <= 640) {
      setPopoverStyle({});
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.max(Math.round(rect.width), 240);
    let left = Math.round(rect.left);
    if (left + width > vw - 10) left = Math.max(10, vw - width - 10);
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;

    if (openUpward) {
      setPopoverStyle({
        left: `${left}px`,
        width: `${Math.min(width, vw - 20)}px`,
        bottom: `${Math.round(vh - rect.top + 6)}px`,
        maxHeight: `${Math.min(440, Math.max(180, Math.round(spaceAbove)))}px`,
      });
    } else {
      setPopoverStyle({
        left: `${left}px`,
        width: `${Math.min(width, vw - 20)}px`,
        top: `${Math.round(rect.bottom + 6)}px`,
        maxHeight: `${Math.min(440, Math.max(180, Math.round(spaceBelow)))}px`,
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setBulkConfirmDelete(false);
      setBulkMoveMenuOpen(false);
      setItemMoveFolderFor(null);
      setCreatingFolder(false);
      setRenamingFolderId(null);
      return undefined;
    }
    updatePopoverPosition();

    const onDocPointerDown = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onDocKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    const onScrollOrResize = (e) => {
      if (popoverRef.current && e?.target && popoverRef.current.contains(e.target)) return;
      updatePopoverPosition();
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    if (searchable && typeof window !== 'undefined' && window.innerWidth > 640) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      document.removeEventListener('keydown', onDocKeyDown, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen, searchable, updatePopoverPosition]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? options
      : options.filter(
          (opt) =>
            String(opt.label).toLowerCase().includes(q) ||
            String(opt.meta || '').toLowerCase().includes(q) ||
            String(opt.timestamp || opt.sublabel || '').toLowerCase().includes(q),
        );
    return sortable ? sortDropdownOptions(base, sortMode) : base;
  }, [options, query, sortable, sortMode]);

  const validFolderIds = useMemo(
    () => new Set((folders || []).map((f) => f.id)),
    [folders],
  );

  const starredList = useMemo(
    () => (allowStars ? filteredAndSorted.filter((opt) => starSet.has(opt.value)) : []),
    [allowStars, filteredAndSorted, starSet],
  );

  const folderBuckets = useMemo(() => {
    if (!enableFolders || !Array.isArray(folders) || folders.length === 0) return [];
    return folders.map((f) => ({
      ...f,
      items: filteredAndSorted.filter((opt) => opt.folderId === f.id),
    }));
  }, [enableFolders, folders, filteredAndSorted]);

  const regularUnfolderedList = useMemo(() => {
    return filteredAndSorted.filter((opt) => {
      if (allowStars && starSet.has(opt.value)) return false;
      if (enableFolders && opt.folderId && validFolderIds.has(opt.folderId)) return false;
      return true;
    });
  }, [filteredAndSorted, allowStars, starSet, enableFolders, validFolderIds]);

  const handleSelect = (val) => {
    if (bulkMode) {
      setBulkSelected((prev) =>
        prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val],
      );
      setBulkConfirmDelete(false);
      return;
    }
    onChange?.(val);
    setIsOpen(false);
    setQuery('');
  };

  const handleToggleFolderCollapse = (folderId) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateFolderSubmit = () => {
    const clean = newFolderName.trim();
    if (!clean) return;
    onCreateFolder?.(clean, bulkMode && bulkSelected.length > 0 ? bulkSelected : []);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const handleRenameFolderSubmit = (folderId) => {
    const clean = renameFolderDraft.trim();
    if (clean && folderId) {
      onRenameFolder?.(folderId, clean);
    }
    setRenamingFolderId(null);
    setRenameFolderDraft('');
  };

  const allFilteredValues = useMemo(
    () => filteredAndSorted.map((o) => o.value),
    [filteredAndSorted],
  );
  const allFilteredSelected =
    allFilteredValues.length > 0 &&
    allFilteredValues.every((v) => bulkSet.has(v));
  const renderRow = (opt, contextKey = '') => {
    const isStarred = starSet.has(opt.value);
    const isSelected = opt.value === value;
    const isChecked = bulkSet.has(opt.value);
    const isFolderMenuOpen = itemMoveFolderFor === `${contextKey}:${opt.value}`;

    return (
      <div
        key={`${contextKey}-${opt.value}`}
        role="option"
        aria-selected={bulkMode ? isChecked : isSelected}
        draggable={enableFolders && !bulkMode}
        onDragStart={() => setDraggedValue(opt.value)}
        onDragEnd={() => {
          setDraggedValue(null);
          setDragOverFolderId(null);
        }}
        className={`bb-starred-dropdown-item ${isSelected && !bulkMode ? 'is-selected' : ''} ${
          bulkMode && isChecked ? 'is-bulk-checked' : ''
        }`}
        onClick={() => handleSelect(opt.value)}
      >
        {bulkMode ? (
          <Checkbox
            variant="plain"
            size="sm"
            checked={isChecked}
            interactive={false}
            className="bb-dropdown-item-check"
          />
        ) : (
          allowStars && (
            <button
              type="button"
              title={isStarred ? 'Remove from favorites' : 'Pin to favorites'}
              className={`bb-starred-dropdown-star-btn ${isStarred ? 'is-starred' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar?.(opt.value);
              }}
            >
              <Icon name="star" size={13} />
            </button>
          )
        )}

        {opt.timestamp || opt.sublabel ? (
          <span className="bb-starred-dropdown-item-text">
            <span className="bb-starred-dropdown-item-label">{opt.label}</span>
            <span
              className="bb-starred-dropdown-item-sub"
              title={opt.timestampTitle || undefined}
            >
              {opt.timestamp || opt.sublabel}
            </span>
          </span>
        ) : (
          <span className="bb-starred-dropdown-item-label">{opt.label}</span>
        )}
        {opt.meta && <span className="bb-starred-dropdown-item-meta">{opt.meta}</span>}

        {enableFolders && !bulkMode && folders.length > 0 && (
          <div className="bb-dropdown-item-folder-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              title={opt.folderId ? 'Change or remove folder' : 'Move to folder'}
              className={`bb-dropdown-item-folder-btn ${opt.folderId ? 'has-folder' : ''}`}
              onClick={() =>
                setItemMoveFolderFor((prev) =>
                  prev === `${contextKey}:${opt.value}` ? null : `${contextKey}:${opt.value}`,
                )
              }
            >
              <Icon name="folder" size={12} />
            </button>
            {isFolderMenuOpen && (
              <div className="bb-dropdown-mini-folder-menu">
                <button
                  type="button"
                  className={`bb-dropdown-mini-folder-opt ${!opt.folderId ? 'is-active' : ''}`}
                  onClick={() => {
                    onAssignFolder?.([opt.value], null);
                    setItemMoveFolderFor(null);
                  }}
                >
                  <span>No Folder</span>
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`bb-dropdown-mini-folder-opt ${
                      opt.folderId === f.id ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      onAssignFolder?.([opt.value], f.id);
                      setItemMoveFolderFor(null);
                    }}
                  >
                    <Icon name="folder" size={11} />
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFolderSection = (folder) => {
    const isCollapsed = Boolean(collapsedFolders[folder.id]) && !query.trim();
    const folderValues = folder.items.map((i) => i.value);
    const allFolderChecked =
      folderValues.length > 0 && folderValues.every((v) => bulkSet.has(v));
    const isRenaming = renamingFolderId === folder.id;

    return (
      <div
        key={folder.id}
        className={`bb-dropdown-folder-section ${
          dragOverFolderId === folder.id ? 'is-drag-over' : ''
        }`}
        onDragOver={(e) => {
          if (!draggedValue) return;
          e.preventDefault();
          setDragOverFolderId(folder.id);
        }}
        onDragLeave={() => {
          if (dragOverFolderId === folder.id) setDragOverFolderId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (draggedValue) onAssignFolder?.([draggedValue], folder.id);
          setDraggedValue(null);
          setDragOverFolderId(null);
        }}
      >
        <div
          className="bb-dropdown-folder-header"
          onClick={() => handleToggleFolderCollapse(folder.id)}
        >
          {bulkMode && (
            <Checkbox
              variant="plain"
              size="sm"
              checked={allFolderChecked}
              className="bb-dropdown-folder-check"
              onChange={() => {
                setBulkSelected((prev) => {
                  const next = new Set(prev);
                  if (allFolderChecked) folderValues.forEach((v) => next.delete(v));
                  else folderValues.forEach((v) => next.add(v));
                  return Array.from(next);
                });
              }}
            />
          )}
          <Icon
            name="chevronDown"
            size={12}
            className={`bb-dropdown-folder-caret ${isCollapsed ? 'is-collapsed' : ''}`}
          />
          <Icon name="folder" size={13} className="bb-dropdown-folder-icon" />

          {isRenaming ? (
            <input
              type="text"
              value={renameFolderDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolderSubmit(folder.id);
                if (e.key === 'Escape') setRenamingFolderId(null);
              }}
              onBlur={() => handleRenameFolderSubmit(folder.id)}
              autoFocus
              className="bb-dropdown-folder-rename-input"
            />
          ) : (
            <span className="bb-dropdown-folder-title">
              {folder.name} ({folder.items.length})
            </span>
          )}

          {!isRenaming && (
            <div className="bb-dropdown-folder-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                title="Rename folder"
                className="bb-dropdown-folder-act-btn"
                onClick={() => {
                  setRenamingFolderId(folder.id);
                  setRenameFolderDraft(folder.name);
                }}
              >
                <Icon name="edit" size={11} />
              </button>
              <button
                type="button"
                title="Delete folder (presets stay in All)"
                className="bb-dropdown-folder-act-btn is-danger"
                onClick={() => onDeleteFolder?.(folder.id)}
              >
                <Icon name="trash" size={11} />
              </button>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div className="bb-dropdown-folder-body">
            {folder.items.length === 0 ? (
              <div className="bb-dropdown-folder-empty">
                Empty folder — drag or move presets here
              </div>
            ) : (
              folder.items.map((opt) => renderRow(opt, `f-${folder.id}`))
            )}
          </div>
        )}
      </div>
    );
  };

  const showToolbar = sortable || enableFolders || enableBulkEdit;

  return (
    <div ref={wrapRef} className={`bb-dropdown-wrap ${className}`.trim()}>
      {label && <span className="bb-dropdown-label">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`bb-custom-select-trigger ${isOpen ? 'is-open' : ''}`}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) updatePopoverPosition();
          setIsOpen((v) => !v);
        }}
      >
        <span className="bb-custom-select-trigger-text">
          {allowStars && selectedOption && starSet.has(selectedOption.value) && (
            <Icon name="star" size={14} className="bb-custom-select-trigger-star" />
          )}
          <span>{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <Icon name="chevronDown" size={16} className="bb-custom-select-trigger-caret" />
      </button>
      {hint && <span className="bb-dropdown-hint">{hint}</span>}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="bb-starred-dropdown-overlay">
            <div
              ref={popoverRef}
              className="bb-starred-dropdown-popover"
              role="listbox"
              style={popoverStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bb-starred-dropdown-grabber" aria-hidden="true" />
              <div className="bb-starred-dropdown-mobile-hdr">
                <span className="bb-starred-dropdown-mobile-title">
                  {label || placeholder || 'Select Option'}
                </span>
                <button
                  type="button"
                  aria-label="Close selector"
                  className="bb-starred-dropdown-mobile-close"
                  onClick={() => setIsOpen(false)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              {searchable && (
                <SearchInput
                  size="sm"
                  inputRef={searchInputRef}
                  value={query}
                  onChange={(next) => setQuery(next)}
                  placeholder={searchPlaceholder}
                  className="bb-starred-dropdown-search"
                />
              )}

          {showToolbar && (
            <div className="bb-dropdown-toolbar">
              {sortable && (
                <div className="bb-dropdown-sort-pills">
                  {SORT_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      title={m.title}
                      className={`bb-dropdown-tool-pill ${sortMode === m.id ? 'is-active' : ''}`}
                      onClick={() => setSortMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="bb-dropdown-toolbar-actions">
                {enableFolders && (
                  <button
                    type="button"
                    title="Create preset folder"
                    className={`bb-dropdown-tool-btn ${creatingFolder ? 'is-active' : ''}`}
                    onClick={() => {
                      setCreatingFolder((v) => !v);
                      setNewFolderName('');
                    }}
                  >
                    <Icon name="folderPlus" size={13} />
                    <span>Folder</span>
                  </button>
                )}
                {enableBulkEdit && (
                  <button
                    type="button"
                    title="Toggle Bulk Select for deleting or moving presets to folders"
                    className={`bb-dropdown-tool-btn ${bulkMode ? 'is-active' : ''}`}
                    onClick={() => {
                      setBulkMode((v) => {
                        if (v) {
                          setBulkSelected([]);
                          setBulkConfirmDelete(false);
                          setBulkMoveMenuOpen(false);
                        }
                        return !v;
                      });
                    }}
                  >
                    <Icon name="selectAll" size={13} />
                    <span>Bulk</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {creatingFolder && (
            <div className="bb-dropdown-inline-folder-create">
              <Icon name="folder" size={13} style={{ color: 'var(--bb-ink-accent)' }} />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolderSubmit();
                  if (e.key === 'Escape') setCreatingFolder(false);
                }}
                placeholder={
                  bulkMode && bulkSelected.length > 0
                    ? `Folder name (${bulkSelected.length} selected)...`
                    : 'New folder name...'
                }
                autoFocus
                className="bb-dropdown-inline-folder-input"
              />
              <button
                type="button"
                className="bb-dropdown-inline-folder-save"
                disabled={!newFolderName.trim()}
                onClick={handleCreateFolderSubmit}
              >
                Create
              </button>
            </div>
          )}

          <OverlayScrollArea
            className="bb-starred-dropdown-list-wrap"
            viewportClassName="bb-starred-dropdown-list"
            variant="compact"
          >
            {filteredAndSorted.length === 0 && folderBuckets.length === 0 ? (
              <div className="bb-starred-dropdown-empty">No matching options</div>
            ) : (
              <>
                {starredList.length > 0 && (
                  <>
                    <div className="bb-starred-dropdown-group-header is-starred">
                      <Icon name="star" size={12} />
                      <span>Favorites ({starredList.length})</span>
                    </div>
                    {starredList.map((opt) => renderRow(opt, 'star'))}
                    {(folderBuckets.length > 0 || regularUnfolderedList.length > 0) && (
                      <div className="bb-starred-dropdown-divider" />
                    )}
                  </>
                )}

                {enableFolders && folderBuckets.map(renderFolderSection)}

                {regularUnfolderedList.length > 0 && (
                  <div
                    onDragOver={(e) => {
                      if (!draggedValue) return;
                      e.preventDefault();
                      setDragOverFolderId('__root__');
                    }}
                    onDragLeave={() => {
                      if (dragOverFolderId === '__root__') setDragOverFolderId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedValue) onAssignFolder?.([draggedValue], null);
                      setDraggedValue(null);
                      setDragOverFolderId(null);
                    }}
                  >
                    {(starredList.length > 0 || folderBuckets.length > 0) && (
                      <div className="bb-starred-dropdown-group-header">
                        <span>All Options ({regularUnfolderedList.length})</span>
                      </div>
                    )}
                    {regularUnfolderedList.map((opt) => renderRow(opt, 'reg'))}
                  </div>
                )}
              </>
            )}
          </OverlayScrollArea>
          {bulkMode && (
            <div className="bb-dropdown-bulk-bar">
              <button
                type="button"
                className="bb-dropdown-bulk-selectall"
                onClick={() => {
                  if (allFilteredSelected) setBulkSelected([]);
                  else setBulkSelected(allFilteredValues);
                  setBulkConfirmDelete(false);
                }}
              >
                <Checkbox
                  variant="plain"
                  size="sm"
                  checked={allFilteredSelected}
                  interactive={false}
                />
                <span>{bulkSelected.length} selected</span>
              </button>

              <div className="bb-dropdown-bulk-actions">
                {enableFolders && (
                  <div className="bb-dropdown-bulk-move-wrap">
                    <button
                      type="button"
                      disabled={bulkSelected.length === 0}
                      className="bb-dropdown-bulk-btn"
                      onClick={() => setBulkMoveMenuOpen((v) => !v)}
                    >
                      <Icon name="folder" size={12} />
                      <span>Folder</span>
                    </button>
                    {bulkMoveMenuOpen && bulkSelected.length > 0 && (
                      <div className="bb-dropdown-bulk-folder-popover">
                        <button
                          type="button"
                          className="bb-dropdown-mini-folder-opt"
                          onClick={() => {
                            onAssignFolder?.(bulkSelected, null);
                            setBulkMoveMenuOpen(false);
                          }}
                        >
                          <span>Remove from folder</span>
                        </button>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className="bb-dropdown-mini-folder-opt"
                            onClick={() => {
                              onAssignFolder?.(bulkSelected, f.id);
                              setBulkMoveMenuOpen(false);
                            }}
                          >
                            <Icon name="folder" size={11} />
                            <span>{f.name}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="bb-dropdown-mini-folder-opt is-accent"
                          onClick={() => {
                            setBulkMoveMenuOpen(false);
                            setCreatingFolder(true);
                          }}
                        >
                          <Icon name="folderPlus" size={11} />
                          <span>+ New Folder ({bulkSelected.length})</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {bulkConfirmDelete ? (
                  <>
                    <button
                      type="button"
                      className="bb-dropdown-bulk-btn is-danger-confirm"
                      onClick={() => {
                        onBulkDelete?.(bulkSelected);
                        setBulkSelected([]);
                        setBulkConfirmDelete(false);
                      }}
                    >
                      Confirm ({bulkSelected.length})
                    </button>
                    <button
                      type="button"
                      className="bb-dropdown-bulk-btn"
                      onClick={() => setBulkConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={bulkSelected.length === 0}
                    className="bb-dropdown-bulk-btn is-danger"
                    onClick={() => setBulkConfirmDelete(true)}
                  >
                    <Icon name="trash" size={12} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

