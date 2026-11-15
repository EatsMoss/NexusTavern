import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChatTitleAndBranch,
  resolvePreferredCharacterChatFile,
  buildTimelineForest,
  getTimelineNodeNeighbors,
} from '../src/core/chats/timelineForest.js';

describe('timelineForest — SillyTavern branch naming, tree topology & navigation', () => {
  it('parses both suffix and prefix SillyTavern branch naming conventions', () => {
    const suffix = parseChatTitleAndBranch('Aria - 2026-11-16 @14h 20m 10s - Branch #3.jsonl');
    assert.equal(suffix.baseTitle, 'Aria - 2026-11-16 @14h 20m 10s');
    assert.equal(suffix.branchNumber, 3);
    assert.equal(suffix.branchLabel, 'Branch #3');

    const prefix = parseChatTitleAndBranch('Branch #12 - Aria - 2026-11-16 @14h 20m 10s.jsonl');
    assert.equal(prefix.baseTitle, 'Aria - 2026-11-16 @14h 20m 10s');
    assert.equal(prefix.branchNumber, 12);
    assert.equal(prefix.branchLabel, 'Branch #12');
  });

  it('builds multi-generation timeline trees, prevents cycles, and resolves directional neighbors', () => {
    const chats = [
      {
        fileName: 'Main Story.jsonl',
        messageCount: 10,
        hasUserMessages: true,
        sortTimestampMs: 1000,
      },
      {
        fileName: 'Main Story - Branch #1.jsonl',
        messageCount: 14,
        hasUserMessages: true,
        sortTimestampMs: 2000,
      },
      {
        fileName: 'Branch #2 - Main Story.jsonl',
        messageCount: 18,
        hasUserMessages: true,
        sortTimestampMs: 3000,
      },
      {
        fileName: 'Deep Subbranch.jsonl',
        parentChat: 'Main Story - Branch #1.jsonl',
        messageCount: 22,
        hasUserMessages: true,
        sortTimestampMs: 4000,
      },
      {
        fileName: 'Cycle A.jsonl',
        parentChat: 'Cycle B.jsonl',
        messageCount: 2,
        sortTimestampMs: 500,
      },
      {
        fileName: 'Cycle B.jsonl',
        parentChat: 'Cycle A.jsonl',
        messageCount: 2,
        sortTimestampMs: 600,
      },
    ];

    const forest = buildTimelineForest(chats);
    const mainGroup = forest.groups.find((g) => g.rootFile === 'Main Story.jsonl');
    assert.ok(mainGroup);
    assert.equal(mainGroup.totalChats, 4);
    assert.equal(mainGroup.totalLeafBranches, 2);
    assert.equal(mainGroup.latestTimestampMs, 4000);

    const branch1 = forest.byFile.get('Main Story - Branch #1.jsonl');
    const branch2 = forest.byFile.get('Branch #2 - Main Story.jsonl');
    const deep = forest.byFile.get('Deep Subbranch.jsonl');
    assert.equal(branch1.parentFile, 'Main Story.jsonl');
    assert.equal(branch2.parentFile, 'Main Story.jsonl');
    assert.equal(deep.parentFile, 'Main Story - Branch #1.jsonl');
    assert.equal(deep.depth, 2);

    const neighbors = getTimelineNodeNeighbors(branch1, forest, {
      activeChatFile: 'Deep Subbranch.jsonl',
    });
    assert.equal(neighbors.left?.fileName, 'Main Story.jsonl');
    assert.equal(neighbors.right?.fileName, 'Deep Subbranch.jsonl');
    assert.equal(neighbors.down?.fileName, 'Branch #2 - Main Story.jsonl');
  });

  it('honors remembered chat pointer and prefers substantive timelines over stale greeting-only chats', () => {
    const chats = [
      { fileName: 'Fresh Greeting Only.jsonl', messageCount: 1, hasUserMessages: false },
      { fileName: 'Active Story.jsonl', messageCount: 24, hasUserMessages: true },
      { fileName: 'Old Card Chat.jsonl', messageCount: 1, hasUserMessages: false },
    ];

    assert.equal(
      resolvePreferredCharacterChatFile(chats, {
        rememberedFile: 'Fresh Greeting Only',
        cardChat: 'Old Card Chat.jsonl',
      }),
      'Fresh Greeting Only.jsonl',
    );

    assert.equal(
      resolvePreferredCharacterChatFile(chats, {
        rememberedFile: '',
        cardChat: 'Old Card Chat.jsonl',
      }),
      'Active Story.jsonl',
    );
  });
});
