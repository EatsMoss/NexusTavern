import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Skeleton } from '@ui/atoms/Skeleton/Skeleton.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { useViewport } from '@core/hooks/useViewport.js';
import './EmojiPicker.css';

const PICKER_WIDTH = 348;
const PICKER_HEIGHT = 416;
const VIEWPORT_MARGIN = 10;
const CHUNK_SIZE = 24; // 3 rows of 8 emojis per lazy chunk

const DEFAULT_CATEGORIES = [
  { id: 'recent', label: 'Recent', icon: 'history' },
  { id: 'smileys', label: 'Smileys & Emotion', icon: 'smile' },
  { id: 'people', label: 'People & Body', icon: 'users' },
  { id: 'nature', label: 'Animals & Nature', icon: 'paw' },
  { id: 'food', label: 'Food & Drink', icon: 'cup' },
  { id: 'travel', label: 'Travel & Places', icon: 'globe' },
  { id: 'activities', label: 'Activities', icon: 'trophy' },
  { id: 'objects', label: 'Objects', icon: 'lightbulb' },
  { id: 'symbols', label: 'Symbols', icon: 'heart' },
  { id: 'flags', label: 'Flags', icon: 'flag' },
];

let catalogModuleCache = null;
let catalogModulePromise = null;

function loadCatalogModuleLazy() {
  if (catalogModuleCache) return Promise.resolve(catalogModuleCache);
  if (!catalogModulePromise) {
    catalogModulePromise = import('./emojiCatalog.js').then((mod) => {
      catalogModuleCache = mod;
      return mod;
    });
  }
  return catalogModulePromise;
}

function splitIntoChunks(items = [], size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function EmojiSkeletonGrid({ count = 24, cols = 8 }) {
  return (
    <div className="bb-emoji-picker__grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <span key={idx} className="bb-emoji-picker__skeleton-slot">
          <Skeleton
            variant="circle"
            className="bb-emoji-picker__skeleton-cell"
            style={idx >= cols * 3 ? { opacity: 0.72 } : undefined}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Windowed lazy emoji chunk: renders animated M3 Skeleton circles while offscreen
 * or awaiting staggered frame hydration, mounting real emoji buttons only near viewport.
 */
const EmojiLazyChunk = React.memo(function EmojiLazyChunk({
  chunkKey,
  items,
  cols,
  rowHeight,
  initialImmediate = false,
  registerChunkNode,
  isReady,
  selectedEmoji,
  onHoverItem,
  onPickItem,
}) {
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const minHeight = rows * rowHeight;

  return (
    <div
      ref={(node) => registerChunkNode(chunkKey, node)}
      data-chunk-key={chunkKey}
      className="bb-emoji-picker__chunk"
      style={{ minHeight: `${minHeight}px` }}
    >
      {isReady || initialImmediate ? (
        <div className="bb-emoji-picker__grid">
          {items.map((item) => (
            <button
              key={item.emoji}
              type="button"
              title={`${item.name} (:${item.shortcode}:)`}
              className={`bb-emoji-picker__cell ${
                selectedEmoji === item.emoji ? 'is-selected' : ''
              }`.trim()}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHoverItem(item)}
              onClick={() => onPickItem(item)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      ) : (
        <EmojiSkeletonGrid count={items.length} cols={cols} />
      )}
    </div>
  );
});

export function EmojiPicker({
  open = false,
  onOpenChange,
  onSelect,
  selectedEmoji = '',
  allowClear = false,
  onClear,
  closeOnSelect = false,
  inline = false,
  mobileInlineDock = false,
  onRequestKeyboard,
  anchorRef = null,
  placement = 'auto',
  className = '',
}) {
  const { isMobile, width: viewportWidth } = useViewport();
  const [catalogMod, setCatalogMod] = useState(() => catalogModuleCache);
  const [query, setQuery] = useState('');
  const [recentList, setRecentList] = useState([]);
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [hoveredItem, setHoveredItem] = useState(null);
  const [hydratedChunks, setHydratedChunks] = useState(() => new Set());
  const [coords, setCoords] = useState({ left: 16, top: 'auto', bottom: 64 });

  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const sectionRefs = useRef({});
  const chunkNodesRef = useRef(new Map());
  const observerRef = useRef(null);
  const hydrateQueueRef = useRef([]);
  const hydrateTimerRef = useRef(null);
  const visibleChunksSetRef = useRef(new Set());
  const programmaticScrollUntilRef = useRef(0);

  const isVisible = inline || open;
  const cols = viewportWidth <= 390 ? 7 : 8;
  const rowHeight = isMobile ? 43 : 38;

  useEffect(() => {
    if (!isVisible) return undefined;
    let cancelled = false;
    if (catalogModuleCache) {
      setCatalogMod(catalogModuleCache);
      setRecentList(catalogModuleCache.readRecentEmojis());
    } else {
      loadCatalogModuleLazy().then((mod) => {
        if (!cancelled) {
          setCatalogMod(mod);
          setRecentList(mod.readRecentEmojis());
        }
      });
    }
    setQuery('');
    return () => {
      cancelled = true;
    };
  }, [isVisible]);

  const catalog = useMemo(
    () => (isVisible && catalogMod ? catalogMod.getEmojiCatalog() : null),
    [isVisible, catalogMod],
  );

  useEffect(() => {
    if (!open || inline || isMobile) return undefined;
    const raf = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, inline, isMobile]);

  const recentItems = useMemo(() => {
    if (!catalog || recentList.length === 0) return [];
    return recentList
      .map(
        (em) =>
          catalog.byEmoji.get(em) || {
            emoji: em,
            name: 'Recent emoji',
            shortcode: 'emoji',
            category: 'recent',
          },
      )
      .filter(Boolean);
  }, [catalog, recentList]);

  const categoriesList = catalogMod?.EMOJI_CATEGORIES || DEFAULT_CATEGORIES;

  const visibleCategories = useMemo(
    () =>
      categoriesList.filter((cat) => {
        if (cat.id === 'recent') return recentItems.length > 0;
        return true;
      }),
    [categoriesList, recentItems.length],
  );

  useEffect(() => {
    if (!isVisible) return;
    setActiveCategory(recentItems.length > 0 ? 'recent' : 'smileys');
  }, [isVisible, recentItems.length > 0]);

  const searchResults = useMemo(() => {
    if (!isVisible || !catalogMod || !query.trim()) return null;
    return catalogMod.searchEmojiCatalog(query);
  }, [isVisible, catalogMod, query]);

  const categoryChunks = useMemo(() => {
    if (!catalog) return {};
    const map = {};
    for (const cat of visibleCategories) {
      const items = cat.id === 'recent' ? recentItems : catalog.groups[cat.id] || [];
      map[cat.id] = splitIntoChunks(items, cols * 3);
    }
    return map;
  }, [catalog, visibleCategories, recentItems, cols]);

  const searchChunks = useMemo(() => {
    if (!searchResults) return null;
    return splitIntoChunks(searchResults, cols * 3);
  }, [searchResults, cols]);

  const pumpHydrateQueue = useCallback(() => {
    if (hydrateTimerRef.current !== null) return;
    const step = () => {
      hydrateTimerRef.current = null;
      while (hydrateQueueRef.current.length > 0) {
        const nextKey = hydrateQueueRef.current.shift();
        if (visibleChunksSetRef.current.has(nextKey)) {
          setHydratedChunks((prev) => {
            if (prev.has(nextKey)) return prev;
            const next = new Set(prev);
            next.add(nextKey);
            return next;
          });
          hydrateTimerRef.current = window.setTimeout(step, 22);
          return;
        }
      }
    };
    hydrateTimerRef.current = window.setTimeout(step, 18);
  }, []);

  const registerChunkNode = useCallback((chunkKey, node) => {
    const map = chunkNodesRef.current;
    const prevNode = map.get(chunkKey);
    if (prevNode && prevNode !== node && observerRef.current) {
      observerRef.current.unobserve(prevNode);
    }
    if (node) {
      map.set(chunkKey, node);
      if (observerRef.current) {
        observerRef.current.observe(node);
      }
    } else {
      map.delete(chunkKey);
    }
  }, []);

  useEffect(() => {
    if (!isVisible || !catalog) return undefined;
    const rootEl = scrollRef.current;
    if (!rootEl || typeof IntersectionObserver === 'undefined') return undefined;

    const obs = new IntersectionObserver(
      (entries) => {
        const toRemove = [];
        let queuedAny = false;

        for (const entry of entries) {
          const key = entry.target.getAttribute('data-chunk-key');
          if (!key) continue;
          if (entry.isIntersecting) {
            visibleChunksSetRef.current.add(key);
            if (!hydrateQueueRef.current.includes(key)) {
              hydrateQueueRef.current.push(key);
              queuedAny = true;
            }
          } else {
            visibleChunksSetRef.current.delete(key);
            toRemove.push(key);
          }
        }

        if (toRemove.length > 0) {
          setHydratedChunks((prev) => {
            let changed = false;
            const next = new Set(prev);
            for (const k of toRemove) {
              if (next.delete(k)) changed = true;
            }
            return changed ? next : prev;
          });
        }

        if (queuedAny) {
          pumpHydrateQueue();
        }
      },
      {
        root: rootEl,
        rootMargin: '120px 0px 160px 0px',
        threshold: 0.01,
      },
    );

    observerRef.current = obs;
    for (const node of chunkNodesRef.current.values()) {
      obs.observe(node);
    }

    return () => {
      obs.disconnect();
      observerRef.current = null;
      visibleChunksSetRef.current.clear();
      hydrateQueueRef.current = [];
      if (hydrateTimerRef.current !== null) {
        clearTimeout(hydrateTimerRef.current);
        hydrateTimerRef.current = null;
      }
    };
  }, [isVisible, catalog, query, pumpHydrateQueue]);

  const updatePopoverPosition = useCallback(() => {
    if (inline || isMobile || !open) return;
    const anchorEl = anchorRef?.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PICKER_WIDTH, vw - VIEWPORT_MARGIN * 2);

    if (!anchorEl) {
      setCoords({
        left: Math.max(VIEWPORT_MARGIN, Math.round((vw - width) / 2)),
        top: Math.max(VIEWPORT_MARGIN, Math.round((vh - PICKER_HEIGHT) / 2)),
        bottom: 'auto',
      });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;

    const preferTop =
      placement.startsWith('top') ||
      (placement === 'auto' && spaceBelow < PICKER_HEIGHT && spaceAbove > spaceBelow);

    const alignEnd =
      placement.endsWith('end') ||
      (placement === 'auto' && rect.left + width > vw - VIEWPORT_MARGIN);

    let left = alignEnd ? rect.right - width : rect.left;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - width - VIEWPORT_MARGIN));

    if (preferTop && spaceAbove >= 220) {
      setCoords({
        left: Math.round(left),
        top: 'auto',
        bottom: Math.max(VIEWPORT_MARGIN, Math.round(vh - rect.top + 8)),
      });
    } else {
      const maxTop = Math.max(
        VIEWPORT_MARGIN,
        vh - Math.min(PICKER_HEIGHT, vh * 0.72) - VIEWPORT_MARGIN,
      );
      setCoords({
        left: Math.round(left),
        top: Math.min(Math.max(VIEWPORT_MARGIN, Math.round(rect.bottom + 8)), Math.round(maxTop)),
        bottom: 'auto',
      });
    }
  }, [anchorRef, inline, isMobile, open, placement]);

  useLayoutEffect(() => {
    if (!open || inline || isMobile) return undefined;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition, { passive: true });
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open, inline, isMobile, updatePopoverPosition]);

  useEffect(() => {
    if (!open || inline) return undefined;

    const handlePointerDown = (e) => {
      const target = e.target;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      // In mobile inline dock (chat composer), allow interacting with composer/stream without accidental close,
      // except when focusing the textarea (handled below) or clicking outside composer if desired.
      if (isMobile && mobileInlineDock) return;
      onOpenChange?.(false);
    };

    const handleFocusIn = (e) => {
      if (!isMobile) return;
      const target = e.target;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable)
      ) {
        onOpenChange?.(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange?.(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, inline, isMobile, mobileInlineDock, anchorRef, onOpenChange]);

  const handleScroll = useCallback(() => {
    if (query.trim() || !scrollRef.current) return;
    if (performance.now() < programmaticScrollUntilRef.current) return;
    const containerTop = scrollRef.current.getBoundingClientRect().top + 48;
    let current = visibleCategories[0]?.id || 'smileys';
    for (const cat of visibleCategories) {
      const secEl = sectionRefs.current[cat.id];
      if (!secEl) continue;
      const rect = secEl.getBoundingClientRect();
      if (rect.top <= containerTop) {
        current = cat.id;
      } else {
        break;
      }
    }
    setActiveCategory((prev) => (prev === current ? prev : current));
  }, [query, visibleCategories]);

  const scrollToCategory = (catId) => {
    const hadQuery = Boolean(query.trim());
    if (hadQuery) setQuery('');
    setActiveCategory(catId);
    programmaticScrollUntilRef.current = performance.now() + 420;

    const runScroll = () => {
      const container = scrollRef.current;
      const secEl = sectionRefs.current[catId];
      if (!container || !secEl) return;
      const containerRect = container.getBoundingClientRect();
      const secRect = secEl.getBoundingClientRect();
      const targetTop = Math.max(0, container.scrollTop + (secRect.top - containerRect.top));
      container.scrollTo({
        top: targetTop,
        behavior: 'smooth',
      });
    };

    if (hadQuery) {
      window.requestAnimationFrame(runScroll);
    } else {
      runScroll();
    }
  };

  const handlePickEmoji = useCallback(
    (item) => {
      if (catalogMod) {
        const updatedRecent = catalogMod.recordRecentEmoji(item.emoji);
        setRecentList(updatedRecent);
      }
      onSelect?.(item.emoji, item);
      if (closeOnSelect && !inline) {
        onOpenChange?.(false);
      }
    },
    [catalogMod, closeOnSelect, inline, onOpenChange, onSelect],
  );

  if (!isVisible) return null;

  const previewItem =
    hoveredItem ||
    (catalog && selectedEmoji && catalog.byEmoji.get(selectedEmoji)) ||
    catalog?.groups?.smileys?.[0] || {
      emoji: '😀',
      name: catalog ? 'Select an emoji' : 'Loading emojis...',
      shortcode: catalog ? 'grinning' : '',
    };

  const isMobileDock = !inline && isMobile;

  const panelClasses = [
    'bb-emoji-picker',
    inline ? 'bb-emoji-picker--inline' : '',
    !inline && !isMobile ? 'bb-emoji-picker--popover' : '',
    isMobileDock ? 'bb-emoji-picker--mobile-dock' : '',
    isMobileDock && !mobileInlineDock ? 'bb-emoji-picker--mobile-fixed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const popoverStyle =
    !inline && !isMobile
      ? {
          '--bb-ep-left': `${coords.left}px`,
          '--bb-ep-top': typeof coords.top === 'number' ? `${coords.top}px` : 'auto',
          '--bb-ep-bottom': typeof coords.bottom === 'number' ? `${coords.bottom}px` : 'auto',
        }
      : undefined;

  const panelNode = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Emoji picker"
      className={panelClasses}
      style={popoverStyle}
    >
      <div className="bb-emoji-picker__header">
        <div className="bb-emoji-picker__search-box">
          <Icon name="search" size={15} className="bb-emoji-picker__search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emojis..."
            aria-label="Search emojis"
            className="bb-emoji-picker__search-input"
          />
          {query && (
            <button
              type="button"
              className="bb-emoji-picker__search-clear"
              title="Clear search"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                if (!isMobile) searchInputRef.current?.focus({ preventScroll: true });
              }}
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        {allowClear && selectedEmoji && (
          <button
            type="button"
            className="bb-emoji-picker__util-btn bb-emoji-picker__util-btn--danger"
            title="Clear selected emoji"
            onClick={() => {
              onClear?.();
              if (closeOnSelect && !inline) onOpenChange?.(false);
            }}
          >
            Clear
          </button>
        )}

        {isMobileDock && onRequestKeyboard && (
          <button
            type="button"
            className="bb-emoji-picker__util-btn bb-emoji-picker__util-btn--icon"
            title="Switch to keyboard"
            aria-label="Switch to keyboard"
            onClick={() => {
              onOpenChange?.(false);
              onRequestKeyboard();
            }}
          >
            <Icon name="keyboard" size={16} />
          </button>
        )}

        {isMobileDock && !mobileInlineDock && (
          <button
            type="button"
            className="bb-emoji-picker__util-btn bb-emoji-picker__util-btn--icon"
            title="Close emoji panel"
            aria-label="Close emoji panel"
            onClick={() => onOpenChange?.(false)}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      {!searchResults && (
        <div className="bb-emoji-picker__tabs bb-scrollbar--hidden" role="tablist">
          {visibleCategories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={cat.label}
                aria-label={cat.label}
                className={`bb-emoji-picker__tab ${isActive ? 'is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => scrollToCategory(cat.id)}
              >
                <Icon name={cat.icon} size={16} />
              </button>
            );
          })}
        </div>
      )}

      <OverlayScrollArea
        ref={scrollRef}
        variant="compact"
        watchValue={`${Boolean(catalog)}:${query}:${recentItems.length}`}
        onScroll={handleScroll}
        className="bb-emoji-picker__scroll"
      >
        {!catalog ? (
          <div className="bb-emoji-picker__section" aria-busy="true">
            <div className="bb-emoji-picker__section-title">
              <Skeleton variant="text" width={112} height={11} />
            </div>
            <EmojiSkeletonGrid count={cols * 6} cols={cols} />
          </div>
        ) : searchResults ? (
          searchResults.length === 0 ? (
            <div className="bb-emoji-picker__empty">
              <Icon name="smile" size={24} />
              <span>No emojis matching &ldquo;{query.trim()}&rdquo;</span>
            </div>
          ) : (
            <div className="bb-emoji-picker__section">
              <div className="bb-emoji-picker__section-title">
                <span>Search Results</span>
                <span>{searchResults.length}</span>
              </div>
              {(searchChunks || []).map((chunkItems, chunkIdx) => {
                const chunkKey = `sr-${query.trim()}-${chunkIdx}`;
                return (
                  <EmojiLazyChunk
                    key={chunkKey}
                    chunkKey={chunkKey}
                    items={chunkItems}
                    cols={cols}
                    rowHeight={rowHeight}
                    initialImmediate={chunkIdx === 0}
                    registerChunkNode={registerChunkNode}
                    isReady={hydratedChunks.has(chunkKey)}
                    selectedEmoji={selectedEmoji}
                    onHoverItem={setHoveredItem}
                    onPickItem={handlePickEmoji}
                  />
                );
              })}
            </div>
          )
        ) : (
          visibleCategories.map((cat, catIdx) => {
            const chunks = categoryChunks[cat.id] || [];
            if (chunks.length === 0) return null;

            return (
              <div
                key={cat.id}
                ref={(el) => {
                  sectionRefs.current[cat.id] = el;
                }}
                className="bb-emoji-picker__section"
              >
                <div className="bb-emoji-picker__section-title">
                  <span>{cat.label}</span>
                </div>
                {chunks.map((chunkItems, chunkIdx) => {
                  const chunkKey = `${cat.id}-${chunkIdx}`;
                  const isFirstViewportSlice =
                    (catIdx === 0 && chunkIdx <= 1) ||
                    (catIdx === 1 && recentItems.length > 0 && chunkIdx === 0);
                  return (
                    <EmojiLazyChunk
                      key={chunkKey}
                      chunkKey={chunkKey}
                      items={chunkItems}
                      cols={cols}
                      rowHeight={rowHeight}
                      initialImmediate={isFirstViewportSlice}
                      registerChunkNode={registerChunkNode}
                      isReady={hydratedChunks.has(chunkKey)}
                      selectedEmoji={selectedEmoji}
                      onHoverItem={setHoveredItem}
                      onPickItem={handlePickEmoji}
                    />
                  );
                })}
              </div>
            );
          })
        )}
      </OverlayScrollArea>

      <div className="bb-emoji-picker__footer">
        <span className="bb-emoji-picker__preview-glyph" aria-hidden="true">
          {previewItem.emoji}
        </span>
        <div className="bb-emoji-picker__preview-meta">
          <span className="bb-emoji-picker__preview-name">{previewItem.name}</span>
          {previewItem.shortcode && (
            <span className="bb-emoji-picker__preview-code">{`:${previewItem.shortcode}:`}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (inline || (isMobileDock && mobileInlineDock)) {
    return panelNode;
  }

  if (typeof document === 'undefined') return null;
  return createPortal(panelNode, document.body);
}


