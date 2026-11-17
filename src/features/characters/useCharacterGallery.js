import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * NexusTavern — character gallery view state.
 *
 * Owns everything the ALL tab needs to render but which is not server data:
 * the search query, the OR/AND/NOT tag chips, sorting, grid density, card aspect
 * and the entity filter. Density and aspect persist to localStorage the way the
 * reference extension persisted them, so the layout survives a reload.
 */

const STORAGE_KEYS = {
  cols: 'nexustavern_char_cols',
  cardSize: 'nexustavern_char_card_size',
  aspect: 'nexustavern_char_aspect',
  layoutMode: 'nexustavern_char_layout_mode',
  sort: 'nexustavern_char_sort',
  entity: 'nexustavern_char_entity',
  splitView: 'nexustavern_char_split_view',
};

const VALID_COLS = ['4', '5', '6'];
const VALID_ASPECTS = ['square', 'portrait'];
const VALID_LAYOUT_MODES = ['grid', 'list'];
const VALID_SORTS = ['recent', 'az'];
const VALID_ENTITIES = ['scenarios', 'pinned', 'groups', 'tags'];

export const CARD_SIZE_MIN = 64;
export const CARD_SIZE_MAX = 150;
export const CARD_SIZE_DEFAULT = 88;

function readStored(key, allowed, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return allowed.includes(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

function readStoredCardSize() {
  if (typeof localStorage === 'undefined') return CARD_SIZE_DEFAULT;
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEYS.cardSize));
    if (Number.isFinite(raw) && raw >= CARD_SIZE_MIN && raw <= CARD_SIZE_MAX) {
      return Math.round(raw);
    }
  } catch {
    // ignore
  }
  return CARD_SIZE_DEFAULT;
}

export function useCharacterGallery() {
  const [query, setQuery] = useState('');
  const [chipState, setChipState] = useState({}); // { [tagId]: 'or'|'and'|'not' }
  const [cols, setCols] = useState(() => readStored(STORAGE_KEYS.cols, VALID_COLS, '5'));
  const [cardSize, setCardSizeState] = useState(readStoredCardSize);
  const [aspect, setAspectState] = useState(() =>
    readStored(STORAGE_KEYS.aspect, VALID_ASPECTS, 'portrait'),
  );
  const [layoutMode, setLayoutModeState] = useState(() =>
    readStored(STORAGE_KEYS.layoutMode, VALID_LAYOUT_MODES, 'grid'),
  );
  const [sortMode, setSortMode] = useState(() =>
    readStored(STORAGE_KEYS.sort, VALID_SORTS, 'recent'),
  );
  const [splitView, setSplitViewState] = useState(
    () => readStored(STORAGE_KEYS.splitView, ['1', '0'], '0') === '1',
  );
  const [entityFilter, setEntityFilter] = useState(() => {
    const stored = readStored(STORAGE_KEYS.entity, VALID_ENTITIES, 'scenarios');
    const isSplit = readStored(STORAGE_KEYS.splitView, ['1', '0'], '0') === '1';
    return isSplit && stored === 'pinned' ? 'scenarios' : stored;
  });

  const setSplitView = useCallback((nextVal) => {
    setSplitViewState((prev) => {
      const resolved = typeof nextVal === 'function' ? Boolean(nextVal(prev)) : Boolean(nextVal);
      if (resolved) {
        setEntityFilter((cur) => (cur === 'pinned' ? 'scenarios' : cur));
      }
      return resolved;
    });
  }, []);

  const setAspect = useCallback((nextVal) => {
    if (nextVal === 'list') {
      setLayoutModeState('list');
      return;
    }
    if (VALID_ASPECTS.includes(nextVal)) {
      setAspectState(nextVal);
      setLayoutModeState('grid');
    }
  }, []);

  const setLayoutMode = useCallback((nextMode) => {
    if (VALID_LAYOUT_MODES.includes(nextMode)) {
      setLayoutModeState(nextMode);
    }
  }, []);

  const setCardSize = useCallback((val) => {
    const num = Number(val);
    if (!Number.isFinite(num)) return;
    const clamped = Math.max(CARD_SIZE_MIN, Math.min(CARD_SIZE_MAX, Math.round(num)));
    setCardSizeState(clamped);
  }, []);

  // Persist the layout preferences only when they actually change.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEYS.cols, cols);
      localStorage.setItem(STORAGE_KEYS.cardSize, String(cardSize));
      localStorage.setItem(STORAGE_KEYS.aspect, aspect);
      localStorage.setItem(STORAGE_KEYS.layoutMode, layoutMode);
      localStorage.setItem(STORAGE_KEYS.sort, sortMode);
      localStorage.setItem(STORAGE_KEYS.entity, entityFilter);
      localStorage.setItem(STORAGE_KEYS.splitView, splitView ? '1' : '0');
    } catch {
      // Storage can be unavailable in private mode; the layout still works.
    }
  }, [cols, cardSize, aspect, layoutMode, sortMode, entityFilter, splitView]);

  /**
   * Cycles a tag chip through OR -> AND -> NOT -> OR, or adds it as OR when it is
   * not active yet. Clicking the same chip never has to be a two-step gesture.
   */
  const toggleTagChip = useCallback((tagId) => {
    const id = String(tagId);
    setChipState((prev) => {
      const current = prev[id];
      if (!current) return { ...prev, [id]: 'or' };
      if (current === 'or') return { ...prev, [id]: 'and' };
      if (current === 'and') return { ...prev, [id]: 'not' };
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /** Sets a chip to an explicit mode (used by the picker's checkbox list). */
  const setTagChipMode = useCallback((tagId, mode) => {
    const id = String(tagId);
    setChipState((prev) => {
      if (!mode) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: mode };
    });
  }, []);

  const removeTagChip = useCallback((tagId) => {
    const id = String(tagId);
    setChipState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearTagChips = useCallback(() => setChipState({}), []);

  const activeChipIds = useMemo(() => Object.keys(chipState), [chipState]);

  const gridStyle = useMemo(() => {
    return {
      '--bb-char-cols': Number(cols),
      '--bb-char-card-size': `${cardSize}px`,
      '--bb-char-aspect': aspect === 'square' ? '1 / 1' : '2 / 3',
    };
  }, [cols, cardSize, aspect]);

  return {
    query,
    setQuery,
    chipState,
    activeChipIds,
    toggleTagChip,
    setTagChipMode,
    removeTagChip,
    clearTagChips,
    cols,
    setCols,
    cardSize,
    setCardSize,
    aspect,
    setAspect,
    layoutMode,
    setLayoutMode,
    viewSwitcherValue: layoutMode === 'list' ? 'list' : aspect,
    sortMode,
    setSortMode,
    entityFilter,
    setEntityFilter,
    splitView,
    setSplitView,
    gridStyle,
  };
}
