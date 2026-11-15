import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  SearchInput,
  Slider,
  TagChip,
  TagPicker,
  ToggleGroup,
  CharacterCardTile,
  CharacterCardRow,
  KebabMenu,
  SafeImage,
  ProgressIndicator,
  ScrollIndicator,
  Skeleton,
  SkeletonListRow,
} from '@ui/index.js';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { filterCards, sortCards, countCardsByTag, TAG_MODES } from './tagFilters.js';
import { CARD_SIZE_MIN, CARD_SIZE_MAX, CARD_SIZE_DEFAULT } from './useCharacterGallery.js';
import './CharacterGallery.css';

const GALLERY_INITIAL_GRID_ROWS = 4;
const GALLERY_STEP_GRID_ROWS = 3;
const GALLERY_INITIAL_LIST_ITEMS = 14;
const GALLERY_STEP_LIST_ITEMS = 12;

/**
 * NexusTavern — character gallery (ALL tab of the right tome).
 *
 * Renders the searchable, tag-filterable grid of character and scenario cards.
 * All view state comes from `useCharacterGallery`; this component stays a
 * renderer plus event wiring, so the filtering rules stay testable in isolation.
 */
export function CharacterGallery({
  cards = [],
  groups = [],
  tags = [],
  gallery,
  gridStyle: externalGridStyle,
  selectedId,
  multiSelectActive = false,
  multiSelectedIds = [],
  onToggleMultiSelect,
  onToggleMultiSelectMode,
  onSelect,
  onOpen,
  onTogglePin,
  openTagFolderId = null,
  onOpenTag,
  onToggleTagHidden: _onToggleTagHidden,
  onCreateTag,
  onOpenCreateModal,
  onDropImportFiles,
  onStartPointerDrag,
  dragState = null,
  hiddenTagIds = [],
  kebabItemsFor,
  kebabItemsForTagFolder,
  userName = 'User',
  chromeRef,
  scrollRef: externalScrollRef,
  loading = false,
}) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const importFileInputRef = useRef(null);
  const internalScrollRef = useRef(null);
  const resolvedScrollRef = externalScrollRef || internalScrollRef;
  const {
    query,
    setQuery,
    chipState,
    activeChipIds,
    toggleTagChip,
    setTagChipMode,
    removeTagChip,
    clearTagChips,
    cardSize,
    setCardSize,
    aspect,
    setAspect,
    layoutMode = 'grid',
    viewSwitcherValue,
    sortMode,
    setSortMode,
    entityFilter,
    setEntityFilter,
    gridStyle: galleryGridStyle,
  } = gallery;

  const isListMode = layoutMode === 'list' && entityFilter !== 'tags';
  const activeViewOption =
    entityFilter === 'tags' ? aspect : viewSwitcherValue || aspect;

  const gridStyle = externalGridStyle || galleryGridStyle;

  const tagById = useMemo(() => {
    const map = new Map();
    for (const tag of tags) map.set(String(tag.id), tag);
    return map;
  }, [tags]);

  const tagNameById = useMemo(() => {
    const map = new Map();
    for (const tag of tags) map.set(String(tag.id), String(tag.name || ''));
    return map;
  }, [tags]);

  const tagCounts = useMemo(() => countCardsByTag(cards), [cards]);

  const tagPreviewMap = useMemo(() => {
    const map = new Map();
    for (const card of cards) {
      const cardTagIds = card.tagIds || card.tags || [];
      for (const tid of cardTagIds) {
        const key = String(tid);
        let list = map.get(key);
        if (!list) {
          list = [];
          map.set(key, list);
        }
        if (list.length < 4) list.push(card);
      }
    }
    return map;
  }, [cards]);

  const pickerTags = useMemo(
    () =>
      tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        count: tagCounts[String(tag.id)] || 0,
      })),
    [tags, tagCounts],
  );

  const activeChips = useMemo(
    () =>
      activeChipIds
        .map((id) => {
          const tag = tagById.get(String(id));
          if (!tag) return null;
          return {
            id,
            name: tag.name,
            mode: TAG_MODES.includes(chipState[id]) ? chipState[id] : 'or',
            count: tagCounts[String(id)] || 0,
          };
        })
        .filter(Boolean),
    [activeChipIds, tagById, chipState, tagCounts],
  );

  const hiddenTagSet = useMemo(
    () => new Set((hiddenTagIds || []).map(String)),
    [hiddenTagIds],
  );

  const multiSelectedSet = useMemo(
    () => new Set(multiSelectedIds || []),
    [multiSelectedIds],
  );

  const visibleCards = useMemo(() => {
    const nonHidden =
      hiddenTagSet.size === 0
        ? cards
        : cards.filter(
            (c) => !(c.tagIds || c.tags || []).some((tid) => hiddenTagSet.has(String(tid))),
          );
    const filtered = filterCards(nonHidden, { query, chipState, tagNameById });
    return sortCards(filtered, sortMode);
  }, [cards, hiddenTagSet, query, chipState, tagNameById, sortMode]);

  const visibleGroups = useMemo(() => {
    const nonHidden =
      hiddenTagSet.size === 0
        ? groups
        : groups.filter(
            (g) => !(g.tagIds || g.tags || []).some((tid) => hiddenTagSet.has(String(tid))),
          );
    const filtered = filterCards(nonHidden, { query, chipState, tagNameById });
    return sortCards(filtered, sortMode);
  }, [groups, hiddenTagSet, query, chipState, tagNameById, sortMode]);

  const visibleTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? [...tags]
      : tags.filter((tag) => String(tag.name || '').toLowerCase().includes(q));
    if (sortMode === 'az') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    return list;
  }, [tags, query, sortMode]);

  const totalShown =
    entityFilter === 'tags'
      ? visibleTags.length
      : entityFilter === 'groups'
        ? visibleGroups.length
        : visibleCards.length;

  const colsCount = Math.max(1, Number(gridStyle?.['--bb-char-cols']) || 5);
  const initialChunkSize = isListMode
    ? GALLERY_INITIAL_LIST_ITEMS
    : Math.max(16, colsCount * GALLERY_INITIAL_GRID_ROWS);
  const chunkStepSize = isListMode
    ? GALLERY_STEP_LIST_ITEMS
    : Math.max(12, colsCount * GALLERY_STEP_GRID_ROWS);

  const [renderedLimit, setRenderedLimit] = useState(initialChunkSize);
  const sentinelRef = useRef(null);
  const activeChipsKey = activeChipIds.map((id) => `${id}:${chipState[id]}`).join('|');

  // Reset progressive chunk window whenever filters, sort or layout mode change
  useEffect(() => {
    setRenderedLimit(initialChunkSize);
  }, [query, entityFilter, sortMode, activeChipsKey, isListMode, initialChunkSize]);

  const slicedCards = useMemo(
    () => visibleCards.slice(0, renderedLimit),
    [visibleCards, renderedLimit],
  );

  const slicedGroups = useMemo(
    () =>
      visibleGroups.slice(0, renderedLimit).map((group) => ({
        id: group.id,
        name: group.name,
        subtitle: group.subtitle || '',
        chatsCount: group.chatsCount ?? 0,
        latestChatPreview: group.latestChatPreview || '',
        memberCount: group.memberCount ?? group.members?.length ?? 0,
        thumbnailUrl: group.avatarUrl,
        pinned: group.pinned,
        isGroup: true,
      })),
    [visibleGroups, renderedLimit],
  );

  const hasMoreChunks =
    entityFilter === 'groups'
      ? slicedGroups.length < visibleGroups.length
      : entityFilter === 'scenarios'
        ? slicedCards.length < visibleCards.length
        : false;

  useEffect(() => {
    if (!hasMoreChunks) return undefined;
    const node = sentinelRef.current;
    const scrollRoot =
      resolvedScrollRef.current || node?.closest?.('.bb-char-gallery__scroll') || null;
    if (!node || !scrollRoot) return undefined;

    // If the viewport is taller than the initial batch and has no scrollbar yet,
    // top up one chunk smoothly until the scroll area is filled.
    if (scrollRoot.clientHeight > 0 && scrollRoot.scrollHeight <= scrollRoot.clientHeight + 32) {
      const rafId = requestAnimationFrame(() => {
        setRenderedLimit((prev) => Math.min(totalShown, prev + chunkStepSize));
      });
      return () => cancelAnimationFrame(rafId);
    }

    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRenderedLimit((prev) => Math.min(totalShown, prev + chunkStepSize));
        }
      },
      {
        root: scrollRoot,
        rootMargin: '180px 0px',
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreChunks, totalShown, renderedLimit, chunkStepSize, resolvedScrollRef]);

  const currentlyRenderedCount =
    entityFilter === 'tags'
      ? visibleTags.length
      : entityFilter === 'groups'
        ? slicedGroups.length
        : slicedCards.length;

  return (
    <div
      className={`bb-char-gallery ${isDraggingFiles ? 'is-dropping-files' : ''}`.trim()}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
          if (!isDraggingFiles) setIsDraggingFiles(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.files?.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingFiles(false);
          onDropImportFiles?.(e.dataTransfer.files);
        }
      }}
    >
      <div className="bb-char-gallery__chrome" ref={chromeRef}>
        <div className="bb-char-gallery__search">
          <div className="bb-char-gallery__search-row">
            <SearchInput
              value={query}
              onFocus={() => setTagPickerOpen(true)}
              onClick={() => setTagPickerOpen(true)}
              onChange={(next) => {
                setQuery(next);
                setTagPickerOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && tagPickerOpen) {
                  setTagPickerOpen(false);
                }
              }}
              placeholder={
                entityFilter === 'tags'
                  ? 'Search tags or cards...'
                  : entityFilter === 'groups'
                    ? 'Search groups or tags...'
                    : 'Search by name, tag or creator...'
              }
            />
            <TagPicker
              compact
              hideTrigger
              open={tagPickerOpen}
              onOpenChange={setTagPickerOpen}
              tags={pickerTags}
              chipState={chipState}
              selectedIds={activeChipIds}
              externalQuery={query}
              onSelectMode={setTagChipMode}
              onToggleTag={(id) => (chipState[id] ? removeTagChip(id) : toggleTagChip(id))}
              onClearAll={clearTagChips}
              onCreateTag={onCreateTag}
            />
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="bb-char-gallery__chips">
            {activeChips.map((chip) => (
              <TagChip
                key={chip.id}
                label={chip.name}
                state={chip.mode}
                count={chip.count}
                onCycle={() => toggleTagChip(chip.id)}
                onRemove={() => removeTagChip(chip.id)}
              />
            ))}
            <button
              type="button"
              className="bb-char-gallery__clear-tags"
              title="Clear all tag filters"
              onClick={clearTagChips}
            >
              <Icon name="close" size={12} />
              Clear
            </button>
          </div>
        )}

        <div className="bb-char-gallery__toolbar">
          <ToggleGroup
            size="sm"
            value={entityFilter}
            onChange={setEntityFilter}
            title="Entity type"
            options={[
              { value: 'scenarios', icon: 'addressCard', title: 'Scenarios' },
              { value: 'groups', icon: 'users', title: 'Groups' },
              { value: 'tags', icon: 'tags', title: 'Tags' },
            ]}
          />

          <Slider
            variant="inline"
            icon="gridView"
            min={CARD_SIZE_MIN}
            max={CARD_SIZE_MAX}
            step={2}
            value={cardSize || CARD_SIZE_DEFAULT}
            defaultValue={CARD_SIZE_DEFAULT}
            unit="px"
            ariaLabel="Card size"
            title="Target card width — double-click to reset (cards scale seamlessly until another column fits)"
            onChange={setCardSize}
            className="bb-char-gallery__size-control"
          />

          <ToggleGroup
            size="sm"
            value={activeViewOption}
            onChange={setAspect}
            title="Gallery view: Square grid (1:1), Portrait grid (2:3), or Horizontal list"
            options={
              entityFilter === 'tags'
                ? [
                    { value: 'square', icon: 'aspectSquare', title: 'Square 1:1' },
                    { value: 'portrait', icon: 'aspectPortrait', title: 'Portrait 2:3' },
                  ]
                : [
                    { value: 'square', icon: 'aspectSquare', title: 'Square grid (1:1)' },
                    { value: 'portrait', icon: 'aspectPortrait', title: 'Portrait grid (2:3)' },
                    { value: 'list', icon: 'bars', title: 'Horizontal list cards' },
                  ]
            }
          />
          <ToggleGroup
            size="sm"
            value={sortMode}
            onChange={setSortMode}
            title="Sort order"
            options={[
              { value: 'recent', label: 'Recent', title: 'Sort by recent activity' },
              { value: 'az', label: 'A-Z', title: 'Sort alphabetically (A–Z)' },
            ]}
          />
        </div>

        <div className="bb-char-gallery__meta-row">
          <div className="bb-char-gallery__count">
            {loading
              ? 'Loading cards...'
              : currentlyRenderedCount < totalShown
                ? `${currentlyRenderedCount} / ${totalShown} shown`
                : `${totalShown} shown`}
            {entityFilter === 'scenarios' && cards.length > 0 && totalShown !== cards.length
              ? ` (filtered from ${cards.length})`
              : ''}
            {multiSelectActive && multiSelectedIds.length > 0
              ? ` • ${multiSelectedIds.length} selected`
              : ''}
          </div>

          <div className="bb-char-gallery__meta-actions">
            {onOpenCreateModal && (
              <button
                type="button"
                className="bb-char-gallery__new-btn"
                title="Create a new scenario card from scratch"
                onClick={() => onOpenCreateModal('create')}
              >
                <Icon name="plus" size={13} />
                <span>New</span>
              </button>
            )}
            {onDropImportFiles && (
              <>
                <button
                  type="button"
                  className="bb-char-gallery__import-btn"
                  title="Import SillyTavern .png or .json card files"
                  onClick={() => importFileInputRef.current?.click()}
                >
                  <Icon name="upload" size={13} />
                  <span>Import</span>
                </button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".png,.json,image/png,application/json"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length > 0) {
                      onDropImportFiles(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
              </>
            )}

            {entityFilter !== 'tags' && onToggleMultiSelectMode && (
              <button
                type="button"
                className={`bb-char-gallery__select-btn ${multiSelectActive ? 'is-active' : ''}`.trim()}
                title={
                  multiSelectActive
                    ? 'Exit multi-select mode (Esc)'
                    : 'Enter multi-select mode (or Ctrl+Click / Shift+Click any card)'
                }
                onClick={() => onToggleMultiSelectMode(!multiSelectActive)}
              >
                <Icon name="selectAll" size={13} />
                <span>{multiSelectActive ? 'Selecting' : 'Select'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bb-char-gallery__stage">
        {loading && visibleCards.length > 0 && (
          <ProgressIndicator
            variant="linear"
            size="sm"
            overlay="top"
            ariaLabel="Updating scenario gallery"
          />
        )}
        <div
          className="bb-char-gallery__scroll bb-scrollbar--hidden"
          ref={resolvedScrollRef}
        >
          {entityFilter === 'groups' ? (
        <div
          className={isListMode ? 'bb-char-gallery__list' : 'bb-char-gallery__grid'}
          style={isListMode ? undefined : gridStyle}
        >
          {slicedGroups.map((groupItem) => {
            const CardComponent = isListMode ? CharacterCardRow : CharacterCardTile;
            return (
              <CardComponent
                key={groupItem.id}
                item={groupItem}
                userName={userName}
                showPinBadge={true}
                selected={groupItem.id === selectedId}
                multiSelectActive={multiSelectActive}
                multiSelected={multiSelectedSet.has(groupItem.id)}
                onToggleMultiSelect={onToggleMultiSelect}
                onSelect={onSelect}
                onOpen={onOpen}
                kebabItemsFor={kebabItemsFor}
              />
            );
          })}
          {hasMoreChunks && (
            <div
              ref={sentinelRef}
              style={{ gridColumn: '1 / -1', height: 4 }}
              aria-hidden="true"
            />
          )}
          {loading && visibleGroups.length === 0 && (
            <>
              {isListMode
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <SkeletonListRow key={`sk-grp-row-${idx}`} avatarVariant="portrait" />
                  ))
                : Array.from({ length: 6 }).map((_, idx) => (
                    <Skeleton
                      key={`sk-grp-card-${idx}`}
                      variant="card"
                      style={
                        aspect === 'square' ? { aspectRatio: '1 / 1' } : { aspectRatio: '2 / 3' }
                      }
                    />
                  ))}
            </>
          )}
          {visibleGroups.length === 0 && !loading && (
            <div className="bb-char-gallery__empty">
              No group chats yet. Group definitions live in{' '}
              <code>data/default-user/groups</code>.
            </div>
          )}
        </div>
      ) : entityFilter === 'tags' ? (
        <div className="bb-char-gallery__grid bb-char-gallery__grid--tags" style={gridStyle}>
          {visibleTags.map((tag) => {
            const isHidden = hiddenTagIds.includes(String(tag.id));
            const previewMembers = tagPreviewMap.get(String(tag.id)) || [];
            const isDraggingTag =
              dragState?.active &&
              dragState.sourceOrigin === 'all-tag' &&
              String(dragState.tagId) === String(tag.id);
            const isOpenTagFolder =
              openTagFolderId != null && String(openTagFolderId) === String(tag.id);
            const tagKebabItems = kebabItemsForTagFolder ? kebabItemsForTagFolder(tag) : [];
            return (
              <div
                key={tag.id}
                role="button"
                tabIndex={0}
                data-bb-folder-trigger-key={`all:tag:${tag.id}`}
                className={[
                  'bb-tag-folder',
                  isHidden ? 'is-hidden' : '',
                  isOpenTagFolder ? 'is-open' : '',
                  isDraggingTag ? 'is-dragging-source' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={`${tagCounts[String(tag.id)] || 0} cards · click to open folder · drag to pin`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenTag?.(String(tag.id));
                  }
                }}
                onPointerDown={(e) => {
                  if (e.target.closest('.bb-tag-folder__actions, .bb-kebab-menu')) return;
                  onStartPointerDrag?.(e, {
                    sourceOrigin: 'all-tag',
                    sourceType: 'tag-folder',
                    tagId: String(tag.id),
                    folderEntry: {
                      type: 'tag-folder',
                      id: `tag:${tag.id}`,
                      tagId: String(tag.id),
                      name: tag.name,
                      items: previewMembers,
                    },
                    onClick: () => onOpenTag?.(String(tag.id)),
                  });
                }}
              >
                {isHidden ? (
                  <span className="bb-tag-folder__hidden-overlay" title="Hidden tag">
                    <Icon name="eyeSlash" size={20} />
                  </span>
                ) : (
                  <span className="bb-tag-folder__grid">
                    {[0, 1, 2, 3].map((slot) => {
                      const member = previewMembers[slot];
                      return (
                        <span key={slot} className="bb-tag-folder__cell">
                          {member ? (
                            <SafeImage
                              src={member.thumbnailUrl || member.avatarUrl}
                              alt={member.name}
                              loading="lazy"
                              draggable={false}
                              className="bb-tag-folder__img"
                              fallback={<span>{member.initials || member.name?.[0]}</span>}
                            />
                          ) : null}
                        </span>
                      );
                    })}
                  </span>
                )}
                <span className="bb-tag-folder__name">
                  <Icon name="tags" size={11} style={{ color: 'var(--bb-ink-accent)' }} />
                  {tag.name}
                </span>
                <span className="bb-tag-folder__count">{tagCounts[String(tag.id)] || 0}</span>
                {tagKebabItems.length > 0 && (
                  <div className="bb-tag-folder__actions">
                    <KebabMenu size="sm" title="Tag folder actions" items={tagKebabItems} />
                  </div>
                )}
              </div>
            );
          })}
          {loading && visibleTags.length === 0 &&
            Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton
                key={`sk-tag-${idx}`}
                variant="card"
                style={
                  aspect === 'square' ? { aspectRatio: '1 / 1' } : { aspectRatio: '2 / 3' }
                }
              />
            ))}
          {tags.length === 0 && !loading && (
            <div className="bb-char-gallery__empty">
              No tags yet. Create one from the tag picker in the Scenarios view.
            </div>
          )}
        </div>
      ) : (
        <div
          className={isListMode ? 'bb-char-gallery__list' : 'bb-char-gallery__grid'}
          style={isListMode ? undefined : gridStyle}
        >
          {slicedCards.map((card) => {
            const isDraggingCard =
              dragState?.active &&
              dragState.sourceOrigin === 'all' &&
              dragState.draggedCard?.id === card.id;
            return (
              <div
                key={card.id}
                className={`bb-pinned-slot ${isDraggingCard ? 'is-dragging-source' : ''}`.trim()}
                onPointerDown={(e) => {
                  if (
                    e.target.closest(
                      '.bb-char-tile__actions, .bb-char-row__actions, .bb-kebab-menu',
                    )
                  ) {
                    return;
                  }
                  if (multiSelectActive || e.ctrlKey || e.metaKey || e.shiftKey) return;
                  onStartPointerDrag?.(e, {
                    sourceOrigin: 'all',
                    sourceType: 'item',
                    fromRow: isListMode,
                    card,
                    onClick: () => onSelect?.(card.id),
                    onDoubleClick: () => {
                      onSelect?.(card.id);
                      onOpen?.(card.id);
                    },
                  });
                }}
              >
                {isListMode ? (
                  <CharacterCardRow
                    item={card}
                    userName={userName}
                    showPinBadge={true}
                    selected={card.id === selectedId}
                    multiSelectActive={multiSelectActive}
                    multiSelected={multiSelectedSet.has(card.id)}
                    onToggleMultiSelect={onToggleMultiSelect}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    kebabItemsFor={kebabItemsFor}
                  />
                ) : (
                  <CharacterCardTile
                    item={card}
                    showPinBadge={true}
                    selected={card.id === selectedId}
                    multiSelectActive={multiSelectActive}
                    multiSelected={multiSelectedSet.has(card.id)}
                    onToggleMultiSelect={onToggleMultiSelect}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    onTogglePin={onTogglePin}
                    kebabItemsFor={kebabItemsFor}
                  />
                )}
              </div>
            );
          })}
          {hasMoreChunks && (
            <div
              ref={sentinelRef}
              style={{ gridColumn: '1 / -1', height: 4 }}
              aria-hidden="true"
            />
          )}
          {loading && visibleCards.length === 0 && (
            <>
              {isListMode
                ? Array.from({ length: 5 }).map((_, idx) => <SkeletonListRow key={`sk-row-${idx}`} />)
                : Array.from({ length: 8 }).map((_, idx) => (
                    <Skeleton
                      key={`sk-card-${idx}`}
                      variant="card"
                      style={
                        aspect === 'square' ? { aspectRatio: '1 / 1' } : { aspectRatio: '2 / 3' }
                      }
                    />
                  ))}
            </>
          )}
          {visibleCards.length === 0 && !loading && (
            <div className="bb-char-gallery__empty">
              No cards match the current search and tag filters.
            </div>
          )}
        </div>
      )}
        </div>
        <ScrollIndicator scrollRef={resolvedScrollRef} variant="panel" />
      </div>
    </div>
  );
}
