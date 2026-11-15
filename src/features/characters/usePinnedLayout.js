import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const PINNED_LAYOUT_STORAGE_KEY = 'nexustavern_pinned_layout_v2';

function loadStoredLayout() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PINNED_LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveStoredLayout(entries) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PINNED_LAYOUT_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage quota errors
  }
}

export function isCardInPinnedEntries(entries, cardId) {
  if (!Array.isArray(entries) || !cardId) return false;
  for (const entry of entries) {
    if (entry.type === 'item' && entry.key === cardId) return true;
    if (entry.type === 'folder' && Array.isArray(entry.items) && entry.items.includes(cardId)) {
      return true;
    }
  }
  return false;
}

/**
 * Cleans up folders with <= 1 valid card:
 * - 1 card remaining -> dissolves folder into a single `{ type: 'item', key }` at the same slot.
 * - 0 cards remaining -> removes the empty folder.
 * Also deduplicates keys across entries.
 */
function normalizeEntries(entries, validCardIdsSet) {
  const seenKeys = new Set();
  const seenTagIds = new Set();
  const result = [];

  for (const entry of entries || []) {
    if (!entry || typeof entry !== 'object') continue;

    if (entry.type === 'item' && entry.key) {
      if (validCardIdsSet && !validCardIdsSet.has(entry.key)) continue;
      if (seenKeys.has(entry.key)) continue;
      seenKeys.add(entry.key);
      result.push({ type: 'item', key: entry.key });
    } else if (entry.type === 'folder' && Array.isArray(entry.items)) {
      const cleanItems = [];
      for (const k of entry.items) {
        if (!k || seenKeys.has(k)) continue;
        if (validCardIdsSet && !validCardIdsSet.has(k)) continue;
        seenKeys.add(k);
        cleanItems.push(k);
      }
      if (cleanItems.length >= 2) {
        result.push({
          type: 'folder',
          id: entry.id || `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: entry.name || 'Folder',
          items: cleanItems,
        });
      } else if (cleanItems.length === 1) {
        result.push({ type: 'item', key: cleanItems[0] });
      }
    } else if (entry.type === 'tag-folder' && entry.tagId != null) {
      const tagKey = String(entry.tagId);
      if (seenTagIds.has(tagKey)) continue;
      seenTagIds.add(tagKey);
      result.push({ type: 'tag-folder', tagId: tagKey });
    }
  }

  return result;
}

/**
 * Builds default demo entries when no layout is stored yet.
 */
function seedInitialEntries(cards) {
  const folderMap = new Map();
  const entries = [];

  for (const card of cards || []) {
    if (!card?.pinned) continue;
    if (card.folderId) {
      let folder = folderMap.get(card.folderId);
      if (!folder) {
        const prettyName = String(card.folderId)
          .replace(/^folder[-_]/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        folder = {
          type: 'folder',
          id: card.folderId,
          name: prettyName || 'Folder',
          items: [],
        };
        folderMap.set(card.folderId, folder);
        entries.push(folder);
      }
      folder.items.push(card.id);
    } else {
      entries.push({ type: 'item', key: card.id });
    }
  }

  return normalizeEntries(entries, null);
}

/**
 * Manages the ordered Pinned grid layout (single cards, user-created folders,
 * and pinned live tag-folders) with persistence to localStorage.
 */
export function usePinnedLayout({
  cards = [],
  tags = [],
  hiddenTagIds = [],
  onSyncCardPinServer,
  onAssignTagToCard,
  onRemoveTagFromCard,
  onRenameTag,
}) {
  const [entries, setEntries] = useState(() => loadStoredLayout() || []);
  const [openFolderId, setOpenFolderId] = useState(null);
  const seededRef = useRef(false);
  // Becomes `true` only once the layout has been reconciled against a real, server-backed
  // card list. Before that the app is showing placeholder demo cards whose ids cannot
  // match the stored layout, so normalising and persisting against them would wipe
  // every user folder from localStorage. Persistence is gated on this flag.
  const hydratedRef = useRef(false);

  const hiddenTagSet = useMemo(
    () => new Set((hiddenTagIds || []).map(String)),
    [hiddenTagIds],
  );

  const isCardHiddenByTags = useCallback(
    (card) => {
      if (!card || hiddenTagSet.size === 0) return false;
      const cardTags = card.tagIds || card.tags || [];
      return cardTags.some((tid) => hiddenTagSet.has(String(tid)));
    },
    [hiddenTagSet],
  );

  const cardById = useMemo(() => {
    const map = new Map();
    for (const c of cards) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [cards]);

  const tagById = useMemo(() => {
    const map = new Map();
    for (const t of tags) {
      if (t?.id != null) map.set(String(t.id), t);
    }
    return map;
  }, [tags]);

  // Sync with cards array: seed on first non-empty cards load and append any newly-pinned cards
  useEffect(() => {
    if (!cards || cards.length === 0) return;

    // Placeholder demo cards (ids `c1`, `c2`, ...) are shown while the server-backed
    // character list is still loading. Their ids can never match the stored layout, so
    // running the destructive reconciliation below against them would delete user folders.
    // Skip until a real card list arrives, then hydrate once.
    const isPlaceholderList = cards.every((c) => /^(?:c\d+|c_\d+)$/.test(String(c.id)));
    if (isPlaceholderList && !hydratedRef.current) return;

    const validIds = new Set(cards.map((c) => c.id));

    setEntries((prev) => {
      let base = prev;
      if (!seededRef.current) {
        seededRef.current = true;
        if (!base || base.length === 0) {
          base = seedInitialEntries(cards);
        }
      }

      // Ensure every card marked `pinned: true` is present in `base`
      const next = [...base];
      for (const card of cards) {
        if (card.pinned && !isCardInPinnedEntries(next, card.id)) {
          next.push({ type: 'item', key: card.id });
        }
      }

      // Remove cards that were unpinned externally (via kebab/star toggle)
      const filtered = [];
      for (const entry of next) {
        if (entry.type === 'item') {
          const c = cardById.get(entry.key);
          if (c && c.pinned) filtered.push(entry);
        } else if (entry.type === 'folder') {
          const remaining = (entry.items || []).filter((k) => {
            const c = cardById.get(k);
            return c && c.pinned;
          });
          filtered.push({ ...entry, items: remaining });
        } else if (entry.type === 'tag-folder') {
          filtered.push(entry);
        }
      }

      hydratedRef.current = true;
      return normalizeEntries(filtered, validIds);
    });
  }, [cards, cardById]);

  useEffect(() => {
    // `hydratedRef` guards against writing a placeholder-derived layout back to
    // localStorage, which would erase folders before the real cards load.
    if (seededRef.current && hydratedRef.current) {
      saveStoredLayout(entries);
    }
  }, [entries]);

  // Resolved entries ready for rendering in PinnedSection
  const resolvedEntries = useMemo(() => {
    const out = [];
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.type === 'item') {
        const card = cardById.get(entry.key);
        if (card && !isCardHiddenByTags(card)) {
          out.push({
            type: 'item',
            entryIndex: i,
            id: card.id,
            card,
          });
        }
      } else if (entry.type === 'folder') {
        const members = (entry.items || [])
          .map((k) => cardById.get(k))
          .filter((c) => c && !isCardHiddenByTags(c));
        if (members.length >= 1) {
          out.push({
            type: 'folder',
            entryIndex: i,
            id: entry.id,
            name: entry.name || 'Folder',
            items: members,
          });
        }
      } else if (entry.type === 'tag-folder') {
        const tag = tagById.get(String(entry.tagId));
        if (tag) {
          const isHidden = hiddenTagSet.has(String(tag.id));
          const members = cards.filter((c) =>
            (c.tagIds || c.tags || []).map(String).includes(String(tag.id)),
          );
          out.push({
            type: 'tag-folder',
            entryIndex: i,
            id: `tag:${tag.id}`,
            tagId: String(tag.id),
            name: tag.name,
            isHidden,
            items: members,
          });
        }
      }
    }
    return out;
  }, [entries, cardById, tagById, cards, isCardHiddenByTags, hiddenTagSet]);

  // Reorder a top-level entry in Pinned
  const reorderEntry = useCallback((fromIndex, toIndex) => {
    setEntries((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      const clampedTo = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (fromIndex === clampedTo) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clampedTo, 0, moved);
      return next;
    });
  }, []);

  // Pin a card from All (or move a card out of a user folder) to `targetIndex` in Pinned
  const pinOrMoveItemToIndex = useCallback(
    (cardId, targetIndex) => {
      if (!cardId) return;
      onSyncCardPinServer?.(cardId, true);

      setEntries((prev) => {
        const next = [];
        for (const entry of prev) {
          if (entry.type === 'item' && entry.key === cardId) continue;
          if (entry.type === 'folder') {
            next.push({
              ...entry,
              items: (entry.items || []).filter((k) => k !== cardId),
            });
          } else {
            next.push(entry);
          }
        }

        const insertIdx =
          typeof targetIndex === 'number'
            ? Math.max(0, Math.min(next.length, targetIndex))
            : next.length;
        next.splice(insertIdx, 0, { type: 'item', key: cardId });
        return normalizeEntries(next, null);
      });
    },
    [onSyncCardPinServer],
  );

  // Pin a tag folder from the TAGS view into Pinned at `targetIndex`
  const pinTagFolderToIndex = useCallback((tagId, targetIndex) => {
    if (tagId == null) return;
    const tagKey = String(tagId);
    setEntries((prev) => {
      const next = prev.filter(
        (e) => !(e.type === 'tag-folder' && String(e.tagId) === tagKey),
      );
      const insertIdx =
        typeof targetIndex === 'number'
          ? Math.max(0, Math.min(next.length, targetIndex))
          : next.length;
      next.splice(insertIdx, 0, { type: 'tag-folder', tagId: tagKey });
      return normalizeEntries(next, null);
    });
  }, []);

  // Drop a card onto the center of another Pinned tile -> create a new folder or append to existing folder
  const mergeCardIntoEntry = useCallback(
    (sourceCardId, targetEntryIndex, _fromFolderId = null) => {
      if (!sourceCardId) return;
      onSyncCardPinServer?.(sourceCardId, true);

      setEntries((prev) => {
        const target = prev[targetEntryIndex];
        if (!target) return prev;

        if (target.type === 'tag-folder') {
          onAssignTagToCard?.(sourceCardId, target.tagId);
          return prev;
        }

        if (target.type === 'item' && target.key === sourceCardId) {
          return prev;
        }
        if (
          target.type === 'folder' &&
          Array.isArray(target.items) &&
          target.items.includes(sourceCardId)
        ) {
          return prev;
        }

        const targetRef = target;
        const next = [];
        for (const entry of prev) {
          if (entry === targetRef) {
            if (entry.type === 'item') {
              const createdFolderId = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              next.push({
                type: 'folder',
                id: createdFolderId,
                name: 'Folder',
                items: [entry.key, sourceCardId],
              });
            } else if (entry.type === 'folder') {
              next.push({
                ...entry,
                items: [...(entry.items || []).filter((k) => k !== sourceCardId), sourceCardId],
              });
            }
          } else if (entry.type === 'item' && entry.key === sourceCardId) {
            continue;
          } else if (entry.type === 'folder') {
            next.push({
              ...entry,
              items: (entry.items || []).filter((k) => k !== sourceCardId),
            });
          } else {
            next.push(entry);
          }
        }

        return normalizeEntries(next, null);
      });
    },
    [onSyncCardPinServer, onAssignTagToCard],
  );

  // Rename a folder (user folder or tag-folder)
  const renameFolder = useCallback(
    (folderId, newName) => {
      const trimmed = String(newName || '').trim() || 'Folder';
      if (String(folderId).startsWith('tag:')) {
        const tagId = String(folderId).slice(4);
        onRenameTag?.(tagId, trimmed);
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.type === 'folder' && e.id === folderId ? { ...e, name: trimmed } : e)),
      );
    },
    [onRenameTag],
  );

  // Remove a card from a folder (dissolves the folder if 1 card remains)
  const removeCardFromFolder = useCallback(
    (folderId, cardId, alsoUnpin = false) => {
      if (String(folderId).startsWith('tag:')) {
        const tagId = String(folderId).slice(4);
        onRemoveTagFromCard?.(cardId, tagId);
        return;
      }
      if (alsoUnpin) {
        onSyncCardPinServer?.(cardId, false);
      }
      setEntries((prev) => {
        const next = [];
        for (const entry of prev) {
          if (entry.type === 'folder' && entry.id === folderId) {
            const remaining = (entry.items || []).filter((k) => k !== cardId);
            next.push({ ...entry, items: remaining });
            if (!alsoUnpin) {
              next.push({ type: 'item', key: cardId });
            }
          } else {
            next.push(entry);
          }
        }
        return normalizeEntries(next, null);
      });
    },
    [onRemoveTagFromCard, onSyncCardPinServer],
  );

  // Reorder cards inside an open user folder
  const reorderFolderMember = useCallback((folderId, fromIdx, toIdx) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.type !== 'folder' || entry.id !== folderId) return entry;
        const items = [...(entry.items || [])];
        if (fromIdx < 0 || fromIdx >= items.length) return entry;
        const clampedTo = Math.max(0, Math.min(items.length - 1, toIdx));
        if (fromIdx === clampedTo) return entry;
        const [moved] = items.splice(fromIdx, 1);
        items.splice(clampedTo, 0, moved);
        return { ...entry, items };
      }),
    );
  }, []);

  // Unpin an entry when dragged downward out of Pinned
  const unpinEntryAt = useCallback(
    (entryIndex) => {
      setEntries((prev) => {
        const target = prev[entryIndex];
        if (!target) return prev;
        if (target.type === 'item') {
          onSyncCardPinServer?.(target.key, false);
        } else if (target.type === 'folder') {
          for (const k of target.items || []) {
            onSyncCardPinServer?.(k, false);
          }
        }
        const next = prev.filter((_, i) => i !== entryIndex);
        return normalizeEntries(next, null);
      });
    },
    [onSyncCardPinServer],
  );

  // Dissolve a user folder into individual pinned cards at the same position
  const dissolveFolder = useCallback((folderId) => {
    setEntries((prev) => {
      const next = [];
      for (const entry of prev) {
        if (entry.type === 'folder' && entry.id === folderId) {
          for (const k of entry.items || []) {
            next.push({ type: 'item', key: k });
          }
        } else {
          next.push(entry);
        }
      }
      return normalizeEntries(next, null);
    });
    setOpenFolderId((prev) => (prev === folderId ? null : prev));
  }, []);

  // Unpin a pinned tag-folder by tagId
  const unpinTagFolder = useCallback((tagId) => {
    const key = String(tagId).replace(/^tag:/, '');
    setEntries((prev) =>
      prev.filter((e) => !(e.type === 'tag-folder' && String(e.tagId) === key)),
    );
    setOpenFolderId((prev) => (prev === `tag:${key}` ? null : prev));
  }, []);

  // Bulk pin multiple cards into Pinned (skips cards already in Pinned or inside a Pinned folder)
  const bulkPinCards = useCallback(
    (cardIds = []) => {
      const ids = Array.from(new Set((cardIds || []).filter(Boolean)));
      if (ids.length === 0) return;
      for (const id of ids) {
        onSyncCardPinServer?.(id, true);
      }
      setEntries((prev) => {
        const next = [...prev];
        for (const id of ids) {
          if (!isCardInPinnedEntries(next, id)) {
            next.push({ type: 'item', key: id });
          }
        }
        return normalizeEntries(next, null);
      });
    },
    [onSyncCardPinServer],
  );

  // Bulk unpin multiple cards from Pinned and from any user folders inside Pinned
  const bulkUnpinCards = useCallback(
    (cardIds = [], { syncServer = true } = {}) => {
      const ids = Array.from(new Set((cardIds || []).filter(Boolean)));
      if (ids.length === 0) return;
      const removeSet = new Set(ids);
      if (syncServer) {
        for (const id of ids) {
          onSyncCardPinServer?.(id, false);
        }
      }
      setEntries((prev) => {
        const next = [];
        for (const entry of prev) {
          if (entry.type === 'item') {
            if (!removeSet.has(entry.key)) {
              next.push(entry);
            }
          } else if (entry.type === 'folder') {
            const remaining = (entry.items || []).filter((k) => !removeSet.has(k));
            next.push({ ...entry, items: remaining });
          } else {
            next.push(entry);
          }
        }
        return normalizeEntries(next, null);
      });
    },
    [onSyncCardPinServer],
  );

  // Move multiple cards into an existing user folder or a newly created user folder
  const moveCardsToFolder = useCallback(
    (cardIds = [], targetFolderId = null, newFolderName = 'New Folder') => {
      const ids = Array.from(new Set((cardIds || []).filter(Boolean)));
      if (ids.length === 0) return null;
      const moveSet = new Set(ids);
      for (const id of ids) {
        onSyncCardPinServer?.(id, true);
      }

      let resolvedFolderId = targetFolderId;
      setEntries((prev) => {
        // Strip moved cards from any existing item slots or other folders first
        const stripped = [];
        for (const entry of prev) {
          if (entry.type === 'item') {
            if (!moveSet.has(entry.key)) stripped.push(entry);
          } else if (entry.type === 'folder') {
            if (targetFolderId && entry.id === targetFolderId) {
              const merged = [...(entry.items || [])];
              for (const id of ids) {
                if (!merged.includes(id)) merged.push(id);
              }
              stripped.push({ ...entry, items: merged });
            } else {
              const remaining = (entry.items || []).filter((k) => !moveSet.has(k));
              stripped.push({ ...entry, items: remaining });
            }
          } else {
            stripped.push(entry);
          }
        }

        if (!targetFolderId) {
          const newId = `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          resolvedFolderId = newId;
          if (ids.length >= 2) {
            stripped.push({
              type: 'folder',
              id: newId,
              name: String(newFolderName || '').trim() || 'New Folder',
              items: ids,
            });
          } else if (ids.length === 1) {
            stripped.push({ type: 'item', key: ids[0] });
          }
        }

        return normalizeEntries(stripped, null);
      });

      return resolvedFolderId;
    },
    [onSyncCardPinServer],
  );

  return {
    entries,
    setEntries,
    resolvedEntries,
    openFolderId,
    setOpenFolderId,
    reorderEntry,
    pinOrMoveItemToIndex,
    pinTagFolderToIndex,
    mergeCardIntoEntry,
    renameFolder,
    removeCardFromFolder,
    reorderFolderMember,
    unpinEntryAt,
    dissolveFolder,
    unpinTagFolder,
    bulkPinCards,
    bulkUnpinCards,
    moveCardsToFolder,
  };
}
