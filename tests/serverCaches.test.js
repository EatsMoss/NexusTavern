import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_PARSED_CHAT_CACHE_ENTRIES,
  getParsedChatCacheSize,
  invalidateChatCodecCaches,
  readParsedJsonlChat,
} from '../server/services/chatJsonlCodec.js';
import {
  hydratePersistentIndexSnapshot,
  serializePersistentIndexSnapshot,
  flushPersistentIndexCache,
  invalidateChatFolderCacheByChatFile,
  cancelScheduledPersistentIndexSave,
} from '../server/services/cardStore.js';

describe('server caches — LRU parsedChatCache & persistent index-cache snapshot', () => {
  it('bounds parsedChatCache strictly to MAX_PARSED_CHAT_CACHE_ENTRIES (24) with LRU promotion', async () => {
    invalidateChatCodecCaches();
    assert.equal(getParsedChatCacheSize(), 0);

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nt-chat-lru-'));
    try {
      const totalFiles = MAX_PARSED_CHAT_CACHE_ENTRIES + 10;
      const paths = [];

      for (let i = 0; i < totalFiles; i += 1) {
        const p = path.join(tmpDir, `chat_${i}.jsonl`);
        const payload = [
          JSON.stringify({ user_name: 'User', character_name: 'Elowen', chat_metadata: {} }),
          JSON.stringify({ name: 'Elowen', is_user: false, mes: `Hello #${i}` }),
        ].join('\n');
        await fsp.writeFile(p, `${payload}\n`, 'utf8');
        paths.push(p);
      }

      for (let i = 0; i < MAX_PARSED_CHAT_CACHE_ENTRIES; i += 1) {
        const parsed = readParsedJsonlChat(paths[i]);
        assert.equal(parsed.messages[0].mes, `Hello #${i}`);
      }
      assert.equal(getParsedChatCacheSize(), MAX_PARSED_CHAT_CACHE_ENTRIES);

      // Promote chat_0 so chat_1 becomes the least-recently-used entry
      const promotedRef = readParsedJsonlChat(paths[0]);

      // Load 10 newer chats beyond capacity
      for (let i = MAX_PARSED_CHAT_CACHE_ENTRIES; i < totalFiles; i += 1) {
        readParsedJsonlChat(paths[i]);
      }

      assert.equal(getParsedChatCacheSize(), MAX_PARSED_CHAT_CACHE_ENTRIES);

      // Keep chat_0 promoted earlier? Wait: 10 evictions after promoting chat_0 when size=24:
      // chat_0 moved to slot 23 (newest), so 10 new chats evicted slots 1..10, keeping chat_0 in RAM!
      const afterEvictionsRef = readParsedJsonlChat(paths[0]);
      assert.equal(afterEvictionsRef, promotedRef);

      // Meanwhile chat_1 WAS evicted, so reading it again creates a fresh object reference
      const rehydratedChat1 = readParsedJsonlChat(paths[1]);
      assert.equal(rehydratedChat1.messages[0].mes, 'Hello #1');
      assert.equal(getParsedChatCacheSize(), MAX_PARSED_CHAT_CACHE_ENTRIES);
    } finally {
      invalidateChatCodecCaches();
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('persists index-cache.json atomically and invalidates single character chat folder entries', async () => {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nt-index-cache-'));
    const tmpIndexPath = path.join(tmpDir, 'index-cache.json');
    try {
      const ok = hydratePersistentIndexSnapshot({
        version: 1,
        cards: {
          '__test_elowen__.png': {
            mtimeMs: 1700000000000,
            size: 123456,
            birthtimeMs: 1700000000000,
            core: {
              avatar: '__test_elowen__.png',
              name: 'Elowen',
              fav: true,
              greetingsCount: 3,
            },
          },
        },
        chatFolders: {
          '__test_elowen__.png::__test_elowen__': {
            folderName: '__test_elowen__',
            dirMtimeMs: 1700000005000,
            latestFile: '2026-11-17.jsonl',
            latestFileMtimeMs: 1700000005000,
            latestFileSize: 4096,
            rememberedFile: '',
            preferredCardChat: '',
            signature: 'sig-1',
            stats: {
              chatFolder: '__test_elowen__',
              chatsCount: 5,
              latestChatFile: '2026-11-17.jsonl',
            },
          },
        },
      });
      assert.equal(ok, true);

      await flushPersistentIndexCache(tmpIndexPath);
      const onDisk = JSON.parse(await fsp.readFile(tmpIndexPath, 'utf8'));
      assert.equal(onDisk.version, 1);
      assert.equal(onDisk.cards['__test_elowen__.png'].core.name, 'Elowen');
      assert.equal(
        onDisk.chatFolders['__test_elowen__.png::__test_elowen__'].stats.chatsCount,
        5,
      );

      // Mutating a chat inside chats/__test_elowen__/ invalidates only that folder entry
      invalidateChatFolderCacheByChatFile(
        path.join(tmpDir, 'chats', '__test_elowen__', '2026-11-17.jsonl'),
      );
      cancelScheduledPersistentIndexSave();

      const afterInvalidation = serializePersistentIndexSnapshot();
      assert.equal(
        afterInvalidation.chatFolders['__test_elowen__.png::__test_elowen__'],
        undefined,
      );
      assert.equal(
        afterInvalidation.cards['__test_elowen__.png'].core.name,
        'Elowen',
      );
    } finally {
      cancelScheduledPersistentIndexSave();
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
