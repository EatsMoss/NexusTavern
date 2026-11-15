import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { SearchInput } from '@ui/atoms/Input/Input.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import './TagPicker.css';

/**
 * Multi-mode M3 tag filter & creator popover for the character gallery search row.
 *
 * Supports tri-state mode (`chipState` + `onSelectMode(tagId, mode)`) with
 * `[+]` (OR) / `[Tag Name]` (AND) / `[−]` (NOT) pills, as well as legacy
 * `selectedIds` + `onToggleTag`.
 */
export function TagPicker({
  tags = [],
  chipState = null,
  selectedIds = [],
  onSelectMode,
  onToggleTag,
  onClearAll,
  onCreateTag,
  externalQuery = '',
  compact = false,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
  placeholder = 'Filter by tags...',
  disabled = false,
  className = '',
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const wrapRef = useRef(null);
  const searchInputRef = useRef(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setIsOpen = (nextVal) => {
    const resolved = typeof nextVal === 'function' ? nextVal(isOpen) : nextVal;
    if (controlledOpen === undefined) setUncontrolledOpen(resolved);
    onOpenChange?.(resolved);
  };

  const activeMap = useMemo(() => {
    if (chipState && typeof chipState === 'object') return chipState;
    const fallback = {};
    for (const id of selectedIds || []) fallback[String(id)] = 'and';
    return fallback;
  }, [chipState, selectedIds]);

  const activeCount = useMemo(() => Object.keys(activeMap).length, [activeMap]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onDocPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        const searchScope = wrapRef.current.closest(
          '.bb-char-gallery__search, .bb-char-gallery__search-row',
        );
        if (searchScope && searchScope.contains(e.target)) return;
        setIsOpen(false);
      }
    };
    const onDocKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    if (!compact && !hideTrigger) requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [isOpen, compact, hideTrigger]);

  const effectiveFilter = (internalQuery.trim() || externalQuery.trim()).toLowerCase();

  const filtered = useMemo(() => {
    if (!effectiveFilter) return tags;
    return tags.filter((tag) =>
      String(tag.name || '')
        .toLowerCase()
        .includes(effectiveFilter),
    );
  }, [tags, effectiveFilter]);

  const candidateNewName = (newTagName.trim() || internalQuery.trim()).trim();
  const canCreate =
    Boolean(onCreateTag) &&
    candidateNewName.length > 0 &&
    !tags.some((tag) => String(tag.name || '').toLowerCase() === candidateNewName.toLowerCase());

  const handleCreate = () => {
    if (!canCreate) return;
    onCreateTag(candidateNewName);
    setNewTagName('');
    setInternalQuery('');
  };

  const handleModeClick = (tagId, mode) => {
    const key = String(tagId);
    const current = activeMap[key];
    const nextMode = current === mode ? null : mode;
    if (onSelectMode) onSelectMode(tagId, nextMode);
    else if (onToggleTag) onToggleTag(tagId, nextMode);
  };


  if (hideTrigger && !isOpen) return null;

  return (
    <div
      ref={wrapRef}
      className={`bb-tag-picker ${compact ? 'bb-tag-picker--compact' : ''} ${
        hideTrigger ? 'bb-tag-picker--headless' : ''
      } ${className}`.trim()}
    >
      {!hideTrigger &&
        (compact ? (
          <button
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            title="Filter by tags (+ OR / AND / − NOT)"
            className={`bb-tag-picker__icon-trigger ${isOpen ? 'is-open' : ''} ${
              activeCount > 0 ? 'has-active' : ''
            }`.trim()}
            onClick={() => setIsOpen((v) => !v)}
          >
            <Icon name="tags" size={14} />
            {activeCount > 0 && <span className="bb-tag-picker__badge">{activeCount}</span>}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={`bb-custom-select-trigger ${isOpen ? 'is-open' : ''}`}
            onClick={() => setIsOpen((v) => !v)}
          >
            <span className="bb-custom-select-trigger-text">
              <Icon name="tags" size={14} className="bb-custom-select-trigger-star" />
              <span>{activeCount > 0 ? `${activeCount} tag(s) active` : placeholder}</span>
            </span>
            <Icon name="chevronDown" size={15} className="bb-custom-select-trigger-caret" />
          </button>
        ))}

      {isOpen && (
        <div className="bb-tag-picker__popover" role="dialog" aria-label="Tag filter picker">
          <div className="bb-tag-picker__header">
            <span className="bb-tag-picker__legend">
              <span className="bb-tag-picker__legend-item is-or">
                <b>+</b> OR
              </span>
              <span className="bb-tag-picker__legend-sep">·</span>
              <span className="bb-tag-picker__legend-item is-and">
                <b>Tag</b> AND
              </span>
              <span className="bb-tag-picker__legend-sep">·</span>
              <span className="bb-tag-picker__legend-item is-not">
                <b>−</b> NOT
              </span>
            </span>

            <div className="bb-tag-picker__header-actions">
              {activeCount > 0 && onClearAll && (
                <button
                  type="button"
                  className="bb-tag-picker__clear-btn"
                  title="Clear all active tag filters"
                  onClick={() => onClearAll()}
                >
                  Clear ({activeCount})
                </button>
              )}
              <button
                type="button"
                className="bb-tag-picker__close-btn"
                title="Close tag list"
                aria-label="Close tag list"
                onClick={() => setIsOpen(false)}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>

          {!compact && !hideTrigger && (
            <SearchInput
              size="sm"
              inputRef={searchInputRef}
              value={internalQuery}
              onChange={(next) => setInternalQuery(next)}
              placeholder="Search tags..."
              className="bb-starred-dropdown-search"
            />
          )}

          <OverlayScrollArea
            viewportClassName="bb-tag-picker__cloud"
            variant="compact"
          >
            {filtered.length === 0 ? (
              <div className="bb-tag-picker__empty">
                {effectiveFilter ? `No tags matching "${effectiveFilter}"` : 'No tags created yet'}
              </div>
            ) : (
              filtered.map((tag) => {
                const tid = String(tag.id);
                const activeMode = activeMap[tid] || '';
                return (
                  <div
                    key={tid}
                    className={`bb-tag-pick-pill ${
                      activeMode ? `is-active-${activeMode}` : ''
                    }`.trim()}
                  >
                    <button
                      type="button"
                      className={`bb-tag-pick-seg bb-tag-pick-seg--or ${
                        activeMode === 'or' ? 'is-active' : ''
                      }`.trim()}
                      title="OR: include cards with at least one OR tag (+)"
                      onClick={() => handleModeClick(tag.id, 'or')}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={`bb-tag-pick-seg bb-tag-pick-seg--and ${
                        activeMode === 'and' ? 'is-active' : ''
                      }`.trim()}
                      title="AND: require cards to carry this tag"
                      onClick={() => handleModeClick(tag.id, 'and')}
                    >
                      <span className="bb-tag-pick-seg__name">{tag.name}</span>
                      {tag.count !== undefined && (
                        <span className="bb-tag-pick-seg__count">{tag.count}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`bb-tag-pick-seg bb-tag-pick-seg--not ${
                        activeMode === 'not' ? 'is-active' : ''
                      }`.trim()}
                      title="NOT: exclude cards carrying this tag (−)"
                      onClick={() => handleModeClick(tag.id, 'not')}
                    >
                      −
                    </button>
                  </div>
                );
              })
            )}
          </OverlayScrollArea>

          {onCreateTag && (
            <div className="bb-tag-picker__create">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="New tag name..."
                className="bb-tag-picker__create-input"
              />
              <button
                type="button"
                disabled={!canCreate}
                title="Create new tag"
                className="bb-tag-picker__create-btn"
                onClick={handleCreate}
              >
                <Icon name="plus" size={13} />
                <span>Create</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
