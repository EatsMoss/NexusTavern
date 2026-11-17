import React, { useMemo, useState, useRef } from 'react';
import {
  Button,
  SearchInput,
  Slider,
  Switch,
  TagChip,
  TagPicker,
  ToggleGroup,
  PopoverSheet,
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
import { useViewport } from '@core/hooks/useViewport.js';
import { useVirtualWindow } from '@core/hooks/useVirtualWindow.js';
import { filterCards, sortCards, countCardsByTag, TAG_MODES } from './tagFilters.js';
import { CARD_SIZE_MIN, CARD_SIZE_MAX, CARD_SIZE_DEFAULT } from './useCharacterGallery.js';
import './CharacterGallery.css';

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
  visibleCards: externalVisibleCards = null,
  visibleGroups: externalVisibleGroups = null,
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
  pinnedCount = 0,
  pinnedDropHovered = false,
  pinnedSlot = null,
  hideSplitToggle = false,
  chromeRef,
  scrollRef: externalScrollRef,
  loading = false,
}) {
  const { isMobile } = useViewport();
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
    splitView = false,
    setSplitView,
    gridStyle: galleryGridStyle,
  } = gallery;

  const effectiveSplitView = Boolean(splitView && !hideSplitToggle);
  const canSplitView = Boolean(setSplitView && !hideSplitToggle);
  const isPinnedMode = !effectiveSplitView && entityFilter === 'pinned';
  const supportsListMode = entityFilter === 'scenarios' || entityFilter === 'groups';
  const isListMode = layoutMode === 'list' && supportsListMode;
  const activeViewOption = supportsListMode ? viewSwitcherValue || aspect : aspect;

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
    if (Array.isArray(externalVisibleCards)) {
      return externalVisibleCards;
    }
    const nonHidden =
      hiddenTagSet.size === 0
        ? cards
        : cards.filter(
            (c) => !(c.tagIds || c.tags || []).some((tid) => hiddenTagSet.has(String(tid))),
          );
    const filtered = filterCards(nonHidden, { query, chipState, tagNameById });
    return sortCards(filtered, sortMode);
  }, [externalVisibleCards, cards, hiddenTagSet, query, chipState, tagNameById, sortMode]);

  const visibleGroups = useMemo(() => {
    if (Array.isArray(externalVisibleGroups)) {
      return externalVisibleGroups;
    }
    const nonHidden =
      hiddenTagSet.size === 0
        ? groups
        : groups.filter(
            (g) => !(g.tagIds || g.tags || []).some((tid) => hiddenTagSet.has(String(tid))),
          );
    const filtered = filterCards(nonHidden, { query, chipState, tagNameById });
    return sortCards(filtered, sortMode);
  }, [externalVisibleGroups, groups, hiddenTagSet, query, chipState, tagNameById, sortMode]);

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
  const activeChipsKey = activeChipIds.map((id) => `${id}:${chipState[id]}`).join('|');
  const windowResetKey = `${entityFilter}|${sortMode}|${isListMode ? 'list' : 'grid'}|${query}|${activeChipsKey}`;

  const normalizedGroups = useMemo(
    () =>
      visibleGroups.map((group) => ({
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
    [visibleGroups],
  );

  const {
    startIndex: windowStart,
    endIndex: windowEnd,
    topPaddingPx,
    bottomPaddingPx,
  } = useVirtualWindow({
    scrollRef: resolvedScrollRef,
    totalItems: totalShown,
    cols: isListMode ? 1 : colsCount,
    isList: isListMode,
    aspect,
    rowGap: isListMode ? 6 : 8,
    colGap: 8,
    horizontalPadding: isListMode ? 16 : 0,
    basePaddingTop: isListMode ? 8 : 0,
    basePaddingBottom: 8,
    overscanRows: isListMode ? 5 : colsCount <= 3 ? 3 : 2,
    enabled: true,
    sampleSelector: isListMode ? '.bb-char-row' : '',
    resetKey: windowResetKey,
  });

  const slicedCards = useMemo(
    () => (entityFilter === 'scenarios' ? visibleCards.slice(windowStart, windowEnd) : []),
    [entityFilter, visibleCards, windowStart, windowEnd],
  );

  const slicedGroups = useMemo(
    () => (entityFilter === 'groups' ? normalizedGroups.slice(windowStart, windowEnd) : []),
    [entityFilter, normalizedGroups, windowStart, windowEnd],
  );

  const slicedTags = useMemo(
    () => (entityFilter === 'tags' ? visibleTags.slice(windowStart, windowEnd) : []),
    [entityFilter, visibleTags, windowStart, windowEnd],
  );

  const virtualContainerStyle = useMemo(() => {
    const padStyle = {
      paddingTop: `${topPaddingPx}px`,
      paddingBottom: `${bottomPaddingPx}px`,
    };
    return isListMode ? padStyle : { ...gridStyle, ...padStyle };
  }, [isListMode, gridStyle, topPaddingPx, bottomPaddingPx]);

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
        <div
          className="bb-char-gallery__tabs bb-scrollbar--hidden"
          role="tablist"
          aria-label="Library view"
        >
          {[
            { id: 'scenarios', label: 'All', count: cards.length },
            !splitView && {
              id: 'pinned',
              label: 'Pinned',
              icon: 'starFilled',
              count: pinnedCount,
              isPinDropTab: true,
            },
            { id: 'groups', label: 'Groups', count: groups.length },
            { id: 'tags', label: 'Tags', count: tags.length },
          ]
            .filter(Boolean)
            .map((tab) => {
            const active = entityFilter === tab.id;
            const isDropTarget = Boolean(tab.isPinDropTab && pinnedDropHovered);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-bb-pin-drop-tab={tab.isPinDropTab ? 'true' : undefined}
                className={[
                  'bb-char-gallery__tab',
                  active ? 'is-active' : '',
                  isDropTarget ? 'is-pin-drop-target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setTagPickerOpen(false);
                  setEntityFilter(tab.id);
                }}
              >
                {tab.icon && (
                  <Icon
                    name={tab.icon}
                    size={13}
                    className="bb-char-gallery__tab-icon"
                  />
                )}
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className="bb-char-gallery__tab-count">{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="bb-char-gallery__search">
          <div className="bb-char-gallery__action-row">
            <div className="bb-char-gallery__search-row">
              <SearchInput
                value={query}
                onFocus={() => {
                  if (!isMobile && (entityFilter === 'scenarios' || entityFilter === 'groups')) {
                    setTagPickerOpen(true);
                  }
                }}
                onClick={() => {
                  if (!isMobile && (entityFilter === 'scenarios' || entityFilter === 'groups')) {
                    setTagPickerOpen(true);
                  }
                }}
                onChange={(next) => {
                  setQuery(next);
                  if (!isMobile && (entityFilter === 'scenarios' || entityFilter === 'groups')) {
                    setTagPickerOpen(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && tagPickerOpen) {
                    setTagPickerOpen(false);
                  }
                }}
                placeholder={
                  entityFilter === 'tags'
                    ? 'Search tags...'
                    : entityFilter === 'groups'
                      ? 'Search groups or tags...'
                      : entityFilter === 'pinned'
                        ? 'Filter pinned cards & folders...'
                        : 'Search scenarios, tags or creators...'
                }
              />
              {(entityFilter === 'scenarios' || entityFilter === 'groups') && (
                <TagPicker
                  compact
                  hideTrigger={!isMobile}
                  open={tagPickerOpen}
                  onOpenChange={setTagPickerOpen}
                  tags={pickerTags}
                  chipState={chipState}
                  selectedIds={activeChipIds}
                  externalQuery={isMobile ? '' : query}
                  onSelectMode={setTagChipMode}
                  onToggleTag={(id) => (chipState[id] ? removeTagChip(id) : toggleTagChip(id))}
                  onClearAll={clearTagChips}
                  onCreateTag={onCreateTag}
                />
              )}
            </div>

            <PopoverSheet
              icon="sliders"
              size="sm"
              align="right"
              title="View & Sort"
              width={272}
              activeIndicator={
                sortMode !== 'recent' ||
                activeViewOption !== 'portrait' ||
                (cardSize && cardSize !== CARD_SIZE_DEFAULT)
              }
            >
              <div className="bb-popover-sheet__section">
                <div className="bb-popover-sheet__label">
                  <span>Layout</span>
                </div>
                <ToggleGroup
                  size="sm"
                  value={activeViewOption}
                  onChange={setAspect}
                  title="Card layout"
                  options={
                    supportsListMode
                      ? [
                          { value: 'portrait', icon: 'aspectPortrait', label: '2:3', title: 'Portrait grid (2:3)' },
                          { value: 'square', icon: 'aspectSquare', label: '1:1', title: 'Square grid (1:1)' },
                          { value: 'list', icon: 'bars', label: 'List', title: 'Horizontal list' },
                        ]
                      : [
                          { value: 'portrait', icon: 'aspectPortrait', label: '2:3', title: 'Portrait grid (2:3)' },
                          { value: 'square', icon: 'aspectSquare', label: '1:1', title: 'Square grid (1:1)' },
                        ]
                  }
                />
              </div>

              {!isPinnedMode ? (
                <div className="bb-popover-sheet__section">
                  <div className="bb-popover-sheet__label">
                    <span>Sort By</span>
                  </div>
                  <ToggleGroup
                    size="sm"
                    value={sortMode}
                    onChange={setSortMode}
                    title="Sort order"
                    options={[
                      { value: 'recent', label: 'Recent Activity', title: 'Sort by recent activity' },
                      { value: 'az', label: 'Name (A–Z)', title: 'Sort alphabetically (A–Z)' },
                    ]}
                  />
                </div>
              ) : (
                <div className="bb-popover-sheet__section">
                  <div className="bb-popover-sheet__label">
                    <span>Order</span>
                    <span style={{ textTransform: 'none', fontWeight: 500 }}>
                      Custom drag &amp; drop
                    </span>
                  </div>
                </div>
              )}

              {!isListMode && (
                <div className="bb-popover-sheet__section">
                  <div className="bb-popover-sheet__label">
                    <span>Card Size</span>
                    <span>{cardSize || CARD_SIZE_DEFAULT}px</span>
                  </div>
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
                    title="Target card width — double-click to reset"
                    onChange={setCardSize}
                  />
                </div>
              )}

              {canSplitView && (
                <div className="bb-popover-sheet__section">
                  <div className="bb-popover-sheet__label">
                    <span style={{ textTransform: 'none', fontSize: '12.5px', color: 'var(--bb-ink-main)' }}>
                      Split Pinned / All
                    </span>
                    <Switch
                      size="sm"
                      bare
                      checked={effectiveSplitView}
                      onChange={(val) => setSplitView(val)}
                      title="Show Pinned and All stacked with a resizable splitter"
                    />
                  </div>
                </div>
              )}
            </PopoverSheet>

            {onOpenCreateModal && (
              <Button
                variant="b1"
                size="sm"
                emphasis="tonal"
                icon="plus"
                title="Create a new scenario card"
                className="bb-char-gallery__create-btn"
                onClick={() => onOpenCreateModal('create')}
              >
                <span className="bb-char-gallery__create-btn-label">New</span>
              </Button>
            )}

            <KebabMenu
              size="sm"
              align="right"
              title="Library actions"
              items={[
                onDropImportFiles && {
                  id: 'import-cards',
                  label: 'Import Cards (.png / .json)...',
                  icon: 'upload',
                  onClick: () => importFileInputRef.current?.click(),
                },
                entityFilter !== 'tags' &&
                  onToggleMultiSelectMode && {
                    id: 'toggle-select',
                    label: multiSelectActive ? 'Exit Multi-Select' : 'Select Multiple',
                    icon: 'selectAll',
                    active: multiSelectActive,
                    onClick: () => onToggleMultiSelectMode(!multiSelectActive),
                  },
                canSplitView && { divider: true },
                canSplitView && {
                  id: 'toggle-split-view',
                  label: 'Split Pinned / All',
                  icon: 'window',
                  active: effectiveSplitView,
                  onClick: () => setSplitView(!effectiveSplitView),
                },
              ].filter(Boolean)}
            />

            {onDropImportFiles && (
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
            )}
          </div>
        </div>

        {!isPinnedMode && activeChips.length > 0 && (
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

        {!isPinnedMode &&
          entityFilter === 'scenarios' &&
          cards.length > 0 &&
          totalShown !== cards.length && (
            <div className="bb-char-gallery__filter-readout">
              <span>
                Showing <strong>{totalShown}</strong> of {cards.length} scenarios
              </span>
            </div>
          )}
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
        {isPinnedMode ? (
          pinnedSlot
        ) : (
          <>
            <div
              className="bb-char-gallery__scroll bb-scrollbar--hidden"
              ref={resolvedScrollRef}
            >
              {entityFilter === 'groups' ? (
        <div
          className={isListMode ? 'bb-char-gallery__list' : 'bb-char-gallery__grid'}
          style={virtualContainerStyle}
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
        <div
          className="bb-char-gallery__grid bb-char-gallery__grid--tags"
          style={virtualContainerStyle}
        >
          {slicedTags.map((tag) => {
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
          style={virtualContainerStyle}
        >
          {slicedCards.map((card) => {
            const isDraggingCard =
              dragState?.active &&
              dragState.sourceOrigin === 'all' &&
              dragState.draggedCard?.id === card.id;
            return (
              <div
                key={card.id}
                className={`bb-char-gallery__item ${isDraggingCard ? 'is-dragging-source' : ''}`.trim()}
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
          </>
        )}
      </div>
    </div>
  );
}
