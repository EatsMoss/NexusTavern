import { matchesSearch } from '@core/utils/searchText.js';

/**
 * NexusTavern — pure tag-filter engine for the character gallery.
 *
 * Reproduces the SillyTavern + BookboundUI search-tag semantics exactly, but as
 * pure functions so the rules can be unit-tested without a DOM:
 *
 *   NOT (red, "−")  every card carrying a NOT tag is dropped
 *   AND (blue)      the card must carry EVERY AND tag
 *   OR  (green, "+") when any OR tag is set, the card must carry AT LEAST ONE
 *
 * Evaluation order matters only for readability: NOT is a hard exclusion, AND is
 * a conjunction, OR is a disjunction over the remainder.
 */

export const TAG_MODES = ['or', 'and', 'not'];

/**
 * Groups the active chip map ({ tagId: 'or'|'and'|'not' }) into three id arrays.
 */
export function splitTagChips(chipState = {}) {
  const or = [];
  const and = [];
  const not = [];

  for (const [tagId, mode] of Object.entries(chipState)) {
    if (mode === 'and') and.push(String(tagId));
    else if (mode === 'not') not.push(String(tagId));
    else if (mode === 'or') or.push(String(tagId));
  }

  return { or, and, not };
}

/**
 * Whether a card carrying `entityTagIds` satisfies the active tag chips.
 * No chips at all matches every card.
 */
export function matchesTagChips(entityTagIds = [], chipState = {}) {
  const { or, and, not } = splitTagChips(chipState);
  if (or.length === 0 && and.length === 0 && not.length === 0) return true;

  const entitySet = new Set(entityTagIds.map(String));

  // NOT: a card carrying any excluded tag is dropped outright.
  for (const tagId of not) {
    if (entitySet.has(tagId)) return false;
  }

  // AND: every required tag must be present.
  for (const tagId of and) {
    if (!entitySet.has(tagId)) return false;
  }

  // OR: at least one of the optional tags must be present.
  if (or.length > 0 && !or.some((tagId) => entitySet.has(tagId))) {
    return false;
  }

  return true;
}

/**
 * Whether a card matches the free-text query. The display name, any assigned
 * tag names (via `tagNameById` or embedded `card.tags`) and the creator are all
 * searchable, mirroring BookboundUI where a query hits either the name or a tag.
 */
export function matchesTextQuery(card, query = '', tagNameById = null) {
  if (!query || !String(query).trim()) return true;
  if (matchesSearch(card?.name || '', query)) return true;
  if (matchesSearch(card?.subtitle || card?.scenarioMeta?.subtitle || '', query)) return true;
  if ((card?.tags || []).some((tag) => matchesSearch(tag, query))) return true;
  if (tagNameById && Array.isArray(card?.tagIds)) {
    const matchedById = card.tagIds.some((tid) => {
      const tName = tagNameById.get(String(tid)) || '';
      return tName && matchesSearch(tName, query);
    });
    if (matchedById) return true;
  }
  if (matchesSearch(card?.creator || '', query)) return true;
  return false;
}

/**
 * Applies both the text query and the tag chips, returning the visible cards.
 */
export function filterCards(cards = [], { query = '', chipState = {}, tagNameById = null } = {}) {
  return cards.filter(
    (card) =>
      matchesTextQuery(card, query, tagNameById) &&
      matchesTagChips(card.tagIds || card.tags || [], chipState),
  );
}

/**
 * Counts how many cards carry each tag, so the picker can show a badge per tag.
 * Returns a `{ [tagId]: count }` map.
 */
export function countCardsByTag(cards = []) {
  const counts = {};
  for (const card of cards) {
    for (const tagId of card.tagIds || []) {
      const key = String(tagId);
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Sorts cards for the gallery. In `recent` mode, cards are ordered strictly by
 * latest activity (freshest chat timestamp or file creation date) without elevating
 * starred/pinned cards; in `az` mode, pinned cards remain grouped first, then A–Z.
 */
export function sortCards(cards = [], sortMode = 'recent') {
  const sorted = [...cards];

  sorted.sort((a, b) => {
    if (sortMode === 'az') {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    }

    // 'recent': the freshest chat wins, and a card with no chat falls back to
    // its file creation date so it never sorts above one with real activity.
    const aTime = Date.parse(a.latestChatMtime || '') || a.dateAdded || 0;
    const bTime = Date.parse(b.latestChatMtime || '') || b.dateAdded || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return sorted;
}
