import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCardSortTimestampMs,
  deriveCardChatSummaryPatch,
  applyCardChatSummaryPatch,
} from '../src/core/cards/cardsApi.js';
import { filterCards, sortCards } from '../src/features/characters/tagFilters.js';

describe('tagFilters & sortTimestampMs — O(N log N) numeric sorting & fast filtering on 800+ cards', () => {
  it('sorts 800+ pre-normalized cards with zero Date.parse calls inside Array.sort', () => {
    const rawCards = Array.from({ length: 850 }, (_, idx) => {
      const hasChat = idx % 3 === 0;
      const iso = hasChat
        ? new Date(1700000000000 + idx * 60_000).toISOString()
        : null;
      const base = {
        id: `Card_${idx}.png`,
        avatar: `Card_${idx}.png`,
        name: `Character ${String(idx).padStart(4, '0')}`,
        pinned: idx % 10 === 0,
        latestChatMtime: iso,
        dateAdded: 1690000000000 + idx * 1000,
      };
      return {
        ...base,
        sortTimestampMs: computeCardSortTimestampMs(base),
      };
    });

    const originalDateParse = Date.parse;
    let parseCallsDuringSort = 0;
    Date.parse = (...args) => {
      parseCallsDuringSort += 1;
      return originalDateParse(...args);
    };

    try {
      const recentSorted = sortCards(rawCards, 'recent');
      assert.equal(parseCallsDuringSort, 0);
      assert.equal(recentSorted.length, 850);
      // Highest index divisible by 3 <= 849 is 849
      assert.equal(recentSorted[0].id, 'Card_849.png');

      const azSorted = sortCards(rawCards, 'az');
      assert.equal(parseCallsDuringSort, 0);
      assert.equal(azSorted[0].pinned, true);
      assert.equal(azSorted[0].name, 'Character 0000');
    } finally {
      Date.parse = originalDateParse;
    }
  });

  it('short-circuits filterCards in O(1) when query and chips are empty and honors NOT/AND/OR chips', () => {
    const cards = [
      { id: '1', name: 'Elowen', tagIds: ['t_elf', 't_magic'], tags: [] },
      { id: '2', name: 'Kaelen', tagIds: ['t_knight', 't_dark'], tags: [] },
      { id: '3', name: 'Sylvi', tagIds: ['t_elf', 't_dark'], tags: [] },
    ];
    const tagNameById = new Map([
      ['t_elf', 'Elf'],
      ['t_magic', 'Magic'],
      ['t_knight', 'Knight'],
      ['t_dark', 'Dark Fantasy'],
    ]);

    const untouched = filterCards(cards, { query: '   ', chipState: {}, tagNameById });
    assert.equal(untouched, cards);

    const byTagText = filterCards(cards, { query: 'knight', chipState: {}, tagNameById });
    assert.deepEqual(
      byTagText.map((c) => c.id),
      ['2'],
    );

    const chipFiltered = filterCards(cards, {
      query: '',
      chipState: { t_elf: 'and', t_dark: 'not' },
      tagNameById,
    });
    assert.deepEqual(
      chipFiltered.map((c) => c.id),
      ['1'],
    );
  });

  it('patches a single card chat summary in O(1) reference-preserving fashion across 800 cards', () => {
    const baseCards = Array.from({ length: 800 }, (_, idx) => {
      const dateAdded = 1700000000000 + idx * 1000;
      return {
        id: `Card_${idx}.png`,
        avatar: `Card_${idx}.png`,
        name: `Character ${idx}`,
        chatsCount: 1,
        latestChatPreview: 'Initial greeting',
        latestChatSender: `Character ${idx}`,
        latestChatIsUser: false,
        latestChatMtime: '2026-01-01T00:00:00.000Z',
        dateAdded,
        sortTimestampMs: Date.parse('2026-01-01T00:00:00.000Z'),
      };
    });

    const newIso = '2026-11-17T12:30:00.000Z';
    const patch = deriveCardChatSummaryPatch({
      chatsCount: 2,
      chats: [
        {
          fileName: '2026-11-17 - Branch #1.jsonl',
          lastModifiedMs: Date.parse(newIso),
          lastModifiedIso: newIso,
          messageCount: 3,
          hasUserMessages: true,
        },
      ],
      activeChatFile: '2026-11-17 - Branch #1.jsonl',
      activeMessages: [
        {
          sender: 'User',
          isUser: true,
          text: '<think>internal reasoning</think> Let us take the northern path.',
        },
      ],
    });

    assert.equal(patch.chatsCount, 2);
    assert.equal(patch.latestChatPreview, 'Let us take the northern path.');
    assert.equal(patch.latestChatSender, 'User');
    assert.equal(patch.latestChatIsUser, true);
    assert.equal(patch.latestChatMtime, newIso);

    const updatedCards = applyCardChatSummaryPatch(baseCards, 'Card_42.png', patch);
    assert.notEqual(updatedCards, baseCards);
    assert.equal(updatedCards.length, 800);
    assert.notEqual(updatedCards[42], baseCards[42]);
    assert.equal(updatedCards[42].chatsCount, 2);
    assert.equal(updatedCards[42].latestChatPreview, 'Let us take the northern path.');
    assert.equal(updatedCards[42].sortTimestampMs, Date.parse(newIso));

    // Every other card keeps strict referential equality for React.memo tiles/rows
    for (let i = 0; i < 800; i += 1) {
      if (i === 42) continue;
      assert.equal(updatedCards[i], baseCards[i]);
    }

    // Re-applying identical values returns the exact same array reference (0 React re-renders)
    const noopResult = applyCardChatSummaryPatch(updatedCards, 'Card_42.png', patch);
    assert.equal(noopResult, updatedCards);

    // Deleting all chats resets count, preview, mtime, and falls back to `dateAdded` for sortTimestampMs
    const emptyPatch = deriveCardChatSummaryPatch({ chatsCount: 0, chats: [] });
    const clearedCards = applyCardChatSummaryPatch(updatedCards, 'Card_42.png', emptyPatch);
    assert.equal(clearedCards[42].chatsCount, 0);
    assert.equal(clearedCards[42].latestChatPreview, '');
    assert.equal(clearedCards[42].latestChatMtime, null);
    assert.equal(clearedCards[42].sortTimestampMs, baseCards[42].dateAdded);
  });
});
