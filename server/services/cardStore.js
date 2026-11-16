import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import { buildZipBuffer } from '../utils/zipBuilder.js';
import {
  isPngBuffer,
  normalizeCardData,
  readCardFromPngBuffer,
  writeCardToPngBuffer,
  serializeCardPayload,
} from './pngCardCodec.js';
import { ensureThumbnailFile, invalidateThumbnailCache } from './thumbnails.js';
import {
  readScenarioMeta,
  saveScenarioMeta,
  addScenarioGalleryPortrait,
  ensureOriginalPortraitInGallery,
  readScenarioGalleryPortraitBuffer,
  duplicateScenarioMeta,
  deleteScenarioMeta,
} from './scenarioMetaStore.js';
import { readSession } from './sessionStore.js';

export const CHARACTERS_DIR = path.join(DEFAULT_USER_DIR, 'characters');
export const CHATS_DIR = path.join(DEFAULT_USER_DIR, 'chats');
export const USER_AVATARS_DIR = path.join(DEFAULT_USER_DIR, 'User Avatars');
export const SETTINGS_FILE_PATH = path.join(DEFAULT_USER_DIR, 'settings.json');

/**
 * High-speed in-memory metadata index cache keyed by filename.
 * Entry: { mtimeMs, size, card }
 * Avoids re-reading and re-parsing 500 KB PNG buffers when files have not changed.
 */
const cardIndexCache = new Map();
const chatFolderCache = new Map();

export function invalidateCardStoreCaches() {
  cardIndexCache.clear();
  chatFolderCache.clear();
}

/**
 * Serializes every `settings.json` read-modify-write so concurrent tag,
 * persona, or pin operations cannot lose each other's updates (the file is
 * shared by tags, tag_map, personas and active persona).
 */
let settingsWriteChain = Promise.resolve();
const cardFileLocks = new Map();

function withCardFileLock(avatarFilename, task) {
  const key = path.basename(String(avatarFilename || '')).toLowerCase();
  const prev = cardFileLocks.get(key) || Promise.resolve();
  const run = prev.then(task, task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  cardFileLocks.set(key, settled);
  settled.finally(() => {
    if (cardFileLocks.get(key) === settled) {
      cardFileLocks.delete(key);
    }
  });
  return run;
}

export function withUserSettingsLock(task) {
  const run = settingsWriteChain.then(task, task);
  // Keep the chain alive even when a task rejects, so later writers still run.
  settingsWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function readUserSettings() {
  if (!fs.existsSync(SETTINGS_FILE_PATH)) {
    return {
      username: 'User',
      user_avatar: 'user-default.png',
      active_character: null,
      tags: [],
      tag_map: {},
      power_user: {
        personas: {},
        persona_descriptions: {},
        default_persona: null,
      },
      extension_settings: {},
    };
  }
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf8'));
  } catch {
    return {
      username: 'User',
      user_avatar: 'user-default.png',
      active_character: null,
      tags: [],
      tag_map: {},
      power_user: {
        personas: {},
        persona_descriptions: {},
        default_persona: null,
      },
      extension_settings: {},
    };
  }
}

export async function writeUserSettings(settings) {
  await writeFileAtomic(
    SETTINGS_FILE_PATH,
    JSON.stringify(settings, null, 2),
    'utf8',
  );
  return settings;
}

const REASONING_BLOCKS_RE =
  /<(?:think|thinking|reasoning|thought)>[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi;

function parseEmbeddedChatStampMs(raw = '') {
  const m = String(raw || '').match(
    /(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/,
  );
  if (!m) return 0;
  const ts = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7] || 0),
  ).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function cleanChatRecordText(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const swipes = Array.isArray(msg.swipes) ? msg.swipes : null;
  const rawSwipeId = Number(msg.swipe_id ?? 0);
  const activeSwipeId =
    swipes && swipes.length > 0
      ? Math.max(0, Math.min(rawSwipeId, swipes.length - 1))
      : 0;
  const rawText =
    swipes && swipes.length > 0 && swipes[activeSwipeId] !== undefined
      ? String(swipes[activeSwipeId])
      : String(msg.mes ?? '');

  return rawText
    .replace(REASONING_BLOCKS_RE, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasChatRecordAttachment(msg) {
  const extra = msg?.extra;
  if (!extra || typeof extra !== 'object') return false;
  if (extra.image || extra.inline_image) return true;
  if (Array.isArray(extra.media) && extra.media.length > 0) return true;
  if (Array.isArray(extra.image_swipes) && extra.image_swipes.length > 0) return true;
  return false;
}

/**
 * Reads the tail of a `.jsonl` chat file using an adaptive backward window
 * (starting at 64 KB and expanding only when a multi-swipe / CoT / attachment
 * JSONL line exceeds the current window) to extract a clean single-line snippet
 * of the latest non-empty message.
 */
function extractLatestChatSnippet(filePath, fileSize = 0) {
  try {
    const size = fileSize || fs.statSync(filePath).size;
    if (!size || size <= 2) {
      return {
        preview: '',
        sender: '',
        isUser: false,
        hasMessages: false,
        hasConversation: false,
      };
    }

    let tailBytes = Math.min(size, 65536);
    let newestMsg = null;
    let snippetMsg = null;
    let snippetText = '';
    let messageLinesSeen = 0;
    let sawUserMessage = false;

    const fd = fs.openSync(filePath, 'r');
    try {
      while (true) {
        const startOffset = size - tailBytes;
        const buf = Buffer.allocUnsafe(tailBytes);
        const bytesRead = fs.readSync(fd, buf, 0, tailBytes, startOffset);
        const chunk = buf.subarray(0, bytesRead).toString('utf8');
        const lines = chunk.split(/\r?\n/);
        // When `startOffset > 0`, `lines[0]` may begin mid-line or mid-UTF-8 sequence;
        // every subsequent element starts right after `\n` (0x0A) on a clean boundary.
        const minLineIdx = startOffset === 0 ? 0 : 1;

        newestMsg = null;
        snippetMsg = null;
        snippetText = '';
        messageLinesSeen = 0;
        sawUserMessage = false;

        for (let i = lines.length - 1; i >= minLineIdx; i -= 1) {
          const trimmed = lines[i].trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;
          let parsed = null;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (!parsed || typeof parsed !== 'object') continue;
          // Skip JSONL metadata header line when scanning up to line 0
          if (
            parsed.mes === undefined &&
            !Array.isArray(parsed.swipes) &&
            (parsed.chat_metadata !== undefined || parsed.user_name !== undefined)
          ) {
            continue;
          }

          messageLinesSeen += 1;
          if (parsed.is_user) sawUserMessage = true;
          if (!newestMsg) {
            newestMsg = parsed;
          }
          if (!snippetMsg) {
            const cleaned = cleanChatRecordText(parsed);
            if (cleaned) {
              snippetMsg = parsed;
              snippetText = cleaned;
            }
          }

          if (snippetMsg && (messageLinesSeen >= 2 || sawUserMessage)) {
            break;
          }
        }

        if (
          (snippetMsg && (messageLinesSeen >= 2 || sawUserMessage)) ||
          startOffset === 0
        ) {
          break;
        }

        tailBytes = Math.min(size, tailBytes * 4);
      }
    } finally {
      fs.closeSync(fd);
    }

    const chosenMsg = snippetMsg || newestMsg;
    if (chosenMsg) {
      const preview = snippetText
        ? snippetText.slice(0, 220)
        : hasChatRecordAttachment(chosenMsg)
          ? '[Attachment]'
          : '';
      return {
        preview,
        sender: String(chosenMsg.name || '').trim(),
        isUser: Boolean(chosenMsg.is_user),
        hasMessages: messageLinesSeen > 0,
        hasConversation: Boolean(messageLinesSeen > 1 || sawUserMessage),
      };
    }
  } catch {
    // ignore unreadable or mid-write file
  }
  return {
    preview: '',
    sender: '',
    isUser: false,
    hasMessages: false,
    hasConversation: false,
  };
}

/**
 * Resolves the chat folder and `.jsonl` chat statistics for a given character card.
 */
export function getCharacterChatStats(card, options = {}) {
  const { rememberedChatFile = '' } = options;
  const baseFolder = String(card.avatar || '')
    .replace(/\.(png|json)$/i, '')
    .trim();

  const candidates = [baseFolder].filter(Boolean);
  if (card.name && card.name !== baseFolder) {
    const separateCardOwnsName =
      fs.existsSync(path.join(CHARACTERS_DIR, `${card.name}.png`)) ||
      fs.existsSync(path.join(CHARACTERS_DIR, `${card.name}.json`));
    if (!separateCardOwnsName) {
      candidates.push(card.name);
    }
  }

  const normalizeJsonlName = (raw) => {
    const clean = path.basename(String(raw || '').trim());
    if (!clean) return '';
    return clean.toLowerCase().endsWith('.jsonl') ? clean : `${clean}.jsonl`;
  };

  const preferredRemembered = normalizeJsonlName(rememberedChatFile);
  const preferredCardChat = normalizeJsonlName(card.chat || '');

  for (const folderName of candidates) {
    const dirPath = path.join(CHATS_DIR, folderName);
    if (fs.existsSync(dirPath)) {
      const dirStat = fs.statSync(dirPath);
      if (!dirStat.isDirectory()) continue;

      const entries = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'));

      let latestFile = null;
      let latestMtime = 0;
      let latestSize = 0;
      let totalBytes = 0;
      const entryMeta = [];

      for (const entry of entries) {
        try {
          const st = fs.statSync(path.join(dirPath, entry.name));
          totalBytes += st.size;
          entryMeta.push({ name: entry.name, mtimeMs: st.mtimeMs, size: st.size });
          if (st.mtimeMs > latestMtime) {
            latestMtime = st.mtimeMs;
            latestFile = entry.name;
            latestSize = st.size;
          }
        } catch {
          // ignore unreadable entry
        }
      }

      const cacheKey = `${card.avatar || folderName}::${folderName}`;
      const cacheSignature = `${entries.length}:${latestFile || ''}:${latestMtime}:${latestSize}:${totalBytes}:${preferredRemembered}:${preferredCardChat}`;
      const cachedStats = chatFolderCache.get(cacheKey);
      if (cachedStats && cachedStats.signature === cacheSignature) {
        return cachedStats.stats;
      }

      const findEntry = (targetName) => {
        if (!targetName) return null;
        const lower = targetName.toLowerCase();
        return (
          entryMeta.find((e) => e.name === targetName) ||
          entryMeta.find((e) => e.name.toLowerCase() === lower) ||
          null
        );
      };

      let chosenFile = latestFile;
      let latestSnippet = {
        preview: '',
        sender: '',
        isUser: false,
        hasMessages: false,
        hasConversation: false,
      };

      const snippetMemo = new Map();
      const readEntrySnippet = (entryObj) => {
        if (!entryObj || entryObj.size <= 2) {
          return {
            preview: '',
            sender: '',
            isUser: false,
            hasMessages: false,
            hasConversation: false,
          };
        }
        if (snippetMemo.has(entryObj.name)) {
          return snippetMemo.get(entryObj.name);
        }
        const res = extractLatestChatSnippet(path.join(dirPath, entryObj.name), entryObj.size);
        snippetMemo.set(entryObj.name, res);
        return res;
      };

      const rememberedEntry = findEntry(preferredRemembered);
      const rememberedSnippet = rememberedEntry ? readEntrySnippet(rememberedEntry) : null;

      if (rememberedEntry && (rememberedSnippet.hasMessages || entryMeta.length === 1)) {
        chosenFile = rememberedEntry.name;
        latestSnippet = rememberedSnippet;
      } else if (entryMeta.length > 0) {
        const sortedCandidates = [...entryMeta].sort((a, b) => {
          if (Math.abs(b.mtimeMs - a.mtimeMs) > 1000) {
            return b.mtimeMs - a.mtimeMs;
          }
          const embDiff = parseEmbeddedChatStampMs(b.name) - parseEmbeddedChatStampMs(a.name);
          if (embDiff !== 0) return embDiff;
          return b.size - a.size;
        });

        let fallbackNonEmpty = null;
        let foundSubstantive = false;

        for (const cand of sortedCandidates) {
          if (cand.size <= 2) continue;
          const candSnippet = readEntrySnippet(cand);
          if (candSnippet.hasConversation) {
            chosenFile = cand.name;
            latestSnippet = candSnippet;
            foundSubstantive = true;
            break;
          }
          if (!fallbackNonEmpty && (candSnippet.preview || candSnippet.hasMessages)) {
            fallbackNonEmpty = { name: cand.name, snippet: candSnippet };
          }
        }

        if (!foundSubstantive) {
          const cardChatEntry = findEntry(preferredCardChat);
          const cardChatSnippet = cardChatEntry ? readEntrySnippet(cardChatEntry) : null;
          if (cardChatEntry && (cardChatSnippet.preview || cardChatSnippet.hasMessages)) {
            chosenFile = cardChatEntry.name;
            latestSnippet = cardChatSnippet;
          } else if (fallbackNonEmpty) {
            chosenFile = fallbackNonEmpty.name;
            latestSnippet = fallbackNonEmpty.snippet;
          } else {
            chosenFile = sortedCandidates[0].name;
            latestSnippet = readEntrySnippet(sortedCandidates[0]);
          }
        }
      }

      const stats = {
        chatFolder: folderName,
        chatsCount: entries.length,
        latestChatFile: chosenFile,
        latestChatMtime: latestMtime ? new Date(latestMtime).toISOString() : null,
        latestChatPreview: latestSnippet.preview,
        latestChatSender: latestSnippet.sender,
        latestChatIsUser: latestSnippet.isUser,
        totalChatBytes: totalBytes,
      };
      chatFolderCache.set(cacheKey, { signature: cacheSignature, stats });
      return stats;
    }
  }

  return {
    chatFolder: baseFolder,
    chatsCount: 0,
    latestChatFile: null,
    latestChatMtime: null,
    latestChatPreview: '',
    latestChatSender: '',
    latestChatIsUser: false,
    totalChatBytes: 0,
  };
}

/**
 * Reads a single character card file (`.png` or `.json`), utilizing the `mtimeMs + size` cache.
 */
export function loadCharacterCardByFilename(filename) {
  const safeName = path.basename(filename);
  const fullPath = path.join(CHARACTERS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const stat = fs.statSync(fullPath);
  const cached = cardIndexCache.get(safeName);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.card;
  }

  const ext = path.extname(safeName).toLowerCase();
  const buf = fs.readFileSync(fullPath);
  let card;

  if (ext === '.png' && isPngBuffer(buf)) {
    card = readCardFromPngBuffer(buf, safeName);
  } else if (ext === '.json') {
    const raw = JSON.parse(buf.toString('utf8'));
    card = normalizeCardData(raw, safeName);
  } else {
    return null;
  }

  card.fileSize = stat.size;
  card.lastModified = new Date(stat.mtimeMs).toISOString();

  cardIndexCache.set(safeName, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    card,
  });

  return card;
}

/**
 * Merges external tag_map from `settings.json` with embedded card tags.
 */
function resolveMergedTags(card, settings) {
  const tagMap = settings?.tag_map || {};
  const tagDefs = Array.isArray(settings?.tags) ? settings.tags : [];
  const tagById = new Map(tagDefs.map((t) => [t.id, t.name]));

  const mappedIds = Array.isArray(tagMap[card.avatar]) ? tagMap[card.avatar] : [];
  const mappedNames = mappedIds.map((id) => tagById.get(id)).filter(Boolean);

  const merged = new Set([...(card.tags || []), ...mappedNames]);
  return Array.from(merged);
}

/**
 * Resolves the raw tag-id list assigned to a card through `settings.json -> tag_map`.
 */
function resolveMappedTagIds(card, settings) {
  const tagMap = settings?.tag_map || {};
  const mapped = tagMap[card.avatar];
  return Array.isArray(mapped) ? mapped.map(String) : [];
}

/**
 * Returns a lightweight summary list of all character/scenario cards in `data/default-user/characters`.
 */
export async function listCharacterCards() {
  if (!fs.existsSync(CHARACTERS_DIR)) {
    return [];
  }

  const settings = readUserSettings();
  const session = readSession();
  const lastChatsMap = session?.lastChats || {};
  const entries = fs.readdirSync(CHARACTERS_DIR, { withFileTypes: true });
  const summaries = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== '.png' && ext !== '.json') continue;

    try {
      const card = loadCharacterCardByFilename(entry.name);
      if (!card) continue;

      if (ext === '.png') {
        await ensureThumbnailFile('avatar', entry.name);
      }

      const fileStat = fs.statSync(path.join(CHARACTERS_DIR, entry.name));
      const rememberedChatFile =
        lastChatsMap[card.avatar]?.file ||
        (session?.lastChat?.avatar === card.avatar ? session.lastChat.file : '') ||
        '';
      const chatStats = getCharacterChatStats(card, { rememberedChatFile });
      const scenarioMeta = readScenarioMeta(card.avatar);
      const mergedTags = resolveMergedTags(card, settings);
      const mappedTagIds = resolveMappedTagIds(card, settings);
      const greetingsCount = 1 + (card.alternate_greetings?.length || 0);
      const loreEntriesCount = Array.isArray(card.character_book?.entries)
        ? card.character_book.entries.length
        : card.character_book?.entries && typeof card.character_book.entries === 'object'
          ? Object.keys(card.character_book.entries).length
          : 0;

      summaries.push({
        avatar: card.avatar,
        name: card.name,
        subtitle: scenarioMeta.subtitle || '',
        creator: card.creator,
        character_version: card.character_version,
        spec: card.spec,
        spec_version: card.spec_version,
        hasCcv3Chunk: Boolean(card.hasCcv3Chunk),
        hasCharaChunk: Boolean(card.hasCharaChunk),
        fav: Boolean(card.fav),
        tags: mergedTags,
        tagIds: mappedTagIds,
        dateAdded: Number(fileStat.birthtimeMs || fileStat.mtimeMs || 0),
        descriptionPreview: card.description.slice(0, 220),
        firstMesPreview: card.first_mes.slice(0, 220),
        creatorNotesPreview: card.creator_notes.slice(0, 180),
        greetingsCount,
        hasLorebook: loreEntriesCount > 0,
        loreEntriesCount,
        chatFolder: chatStats.chatFolder,
        chatsCount: chatStats.chatsCount,
        latestChatFile: chatStats.latestChatFile,
        latestChatMtime: chatStats.latestChatMtime,
        latestChatPreview: chatStats.latestChatPreview,
        latestChatSender: chatStats.latestChatSender,
        latestChatIsUser: chatStats.latestChatIsUser,
        totalChatBytes: chatStats.totalChatBytes,
        fileSize: card.fileSize,
        lastModified: card.lastModified,
        thumbnailUrl:
          ext === '.png'
            ? `/api/thumbnails/avatar/${encodeURIComponent(card.avatar)}`
            : null,
        avatarUrl:
          ext === '.png'
            ? `/user-data/characters/${encodeURIComponent(card.avatar)}`
            : null,
      });
    } catch {
      // skip corrupted file
    }
  }

  summaries.sort((a, b) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return summaries;
}

/**
 * Returns the full character card data + chat stats for a specific avatar filename.
 */
export function getFullCharacterCard(avatarFilename) {
  const safeName = path.basename(avatarFilename);
  const card = loadCharacterCardByFilename(safeName);
  if (!card) return null;

  const settings = readUserSettings();
  const session = readSession();
  const rememberedChatFile =
    session?.lastChats?.[card.avatar]?.file ||
    (session?.lastChat?.avatar === card.avatar ? session.lastChat.file : '') ||
    '';
  const chatStats = getCharacterChatStats(card, { rememberedChatFile });
  const mergedTags = resolveMergedTags(card, settings);
  const scenarioMeta = readScenarioMeta(safeName);
  const charLore = Array.isArray(settings?.world_info?.charLore)
    ? settings.world_info.charLore
    : [];
  const stem = safeName.replace(/\.(png|json)$/i, '');
  const auxEntry = charLore.find(
    (item) => item && (item.name === safeName || item.name === stem || item.name === card.name),
  );
  const auxWorlds = Array.isArray(auxEntry?.extraBooks)
    ? auxEntry.extraBooks.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const loreEntriesCount = Array.isArray(card.character_book?.entries)
    ? card.character_book.entries.length
    : card.character_book?.entries && typeof card.character_book.entries === 'object'
      ? Object.keys(card.character_book.entries).length
      : 0;

  const hasPngPortrait = path.extname(card.avatar).toLowerCase() === '.png';

  return {
    ...card,
    embeddedTags: Array.isArray(card.tags) ? card.tags : [],
    tags: mergedTags,
    tagIds: resolveMappedTagIds(card, settings),
    auxWorlds,
    loreEntriesCount,
    chatStats,
    scenarioMeta,
    thumbnailUrl: hasPngPortrait
      ? `/api/thumbnails/avatar/${encodeURIComponent(card.avatar)}`
      : null,
    avatarUrl: hasPngPortrait
      ? `/user-data/characters/${encodeURIComponent(card.avatar)}`
      : null,
  };
}

/**
 * Updates and atomically saves a character card back to its PNG (`chara`/`ccv3` chunks) or JSON file.
 */
export async function saveCharacterCard(avatarFilename, updates = {}) {
  const safeName = path.basename(avatarFilename);
  return withCardFileLock(safeName, async () => {
    const fullPath = path.join(CHARACTERS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Character card not found: ${safeName}`);
    }

    const current = loadCharacterCardByFilename(safeName);
    if (!current) {
      throw new Error(`Failed to parse character card: ${safeName}`);
    }

    const {
      scenarioMeta: scenarioMetaPatch,
      embeddedTags: embeddedTagsPatch,
      ...cardUpdates
    } = updates || {};

    const merged = normalizeCardData(
      {
        ...current,
        ...cardUpdates,
        ...(Array.isArray(embeddedTagsPatch) ? { tags: embeddedTagsPatch } : {}),
        extensions: {
          ...(current.extensions || {}),
          ...(cardUpdates.extensions || {}),
        },
      },
      safeName,
    );
    const hasV3OnlyFields =
      (Array.isArray(merged.group_only_greetings) && merged.group_only_greetings.length > 0) ||
      Boolean(merged.nickname);
    merged.spec = hasV3OnlyFields ? 'chara_card_v3' : cardUpdates.spec || current.spec;
    merged.hasCcv3Chunk =
      current.hasCcv3Chunk || merged.spec === 'chara_card_v3' || hasV3OnlyFields;

    const ext = path.extname(safeName).toLowerCase();
    if (ext === '.png') {
      const srcBuf = fs.readFileSync(fullPath);
      const updatedPng = writeCardToPngBuffer(srcBuf, merged, {
        writeV3: merged.spec === 'chara_card_v3' || current.hasCcv3Chunk || hasV3OnlyFields,
      });
      await writeFileAtomic(fullPath, updatedPng);
      await ensureThumbnailFile('avatar', safeName);
    } else if (ext === '.json') {
      const payload = serializeCardPayload(
        merged,
        merged.spec === 'chara_card_v3' ? 'v3' : 'v2',
      );
      await writeFileAtomic(fullPath, JSON.stringify(payload, null, 2), 'utf8');
    }

    if (scenarioMetaPatch && typeof scenarioMetaPatch === 'object') {
      await saveScenarioMeta(safeName, scenarioMetaPatch);
    }

    cardIndexCache.delete(safeName);
    return getFullCharacterCard(safeName);
  });
}

/**
 * Generates a unique `Name.png` / `Name_1.png` style filename that is free on disk.
 */
function buildUniqueAvatarFilename(baseName, extension = '.png') {
  const safeBase = String(baseName || 'character')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim() || 'character';
  let candidate = `${safeBase}${extension}`;
  let counter = 1;
  while (fs.existsSync(path.join(CHARACTERS_DIR, candidate))) {
    candidate = `${safeBase}_${counter}${extension}`;
    counter += 1;
  }
  return candidate;
}

/**
 * Creates a new character/scenario card.
 * A PNG avatar buffer (base64) is written into the card metadata when supplied;
 * otherwise the card is stored as a native SillyTavern `.json` card.
 */
export async function createCharacterCard({
  avatarBase64,
  fields = {},
  scenarioMeta = null,
  asJson = false,
} = {}) {
  const normalized = normalizeCardData(fields, fields.name || 'character');
  const extension = asJson || !avatarBase64 ? '.json' : '.png';
  const avatar = buildUniqueAvatarFilename(normalized.name, extension);
  const fullPath = path.join(CHARACTERS_DIR, avatar);

  if (extension === '.png') {
    const pngBuf = Buffer.from(String(avatarBase64).replace(/^data:[^,]+,/, ''), 'base64');
    const updatedPng = writeCardToPngBuffer(pngBuf, normalized, {
      writeV3: normalized.spec === 'chara_card_v3',
    });
    await writeFileAtomic(fullPath, updatedPng);
    await ensureThumbnailFile('avatar', avatar);
  } else {
    const payload = serializeCardPayload(
      { ...normalized, avatar },
      normalized.spec === 'chara_card_v3' ? 'v3' : 'v2',
    );
    await writeFileAtomic(fullPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  if (Array.isArray(normalized.tags) && normalized.tags.length > 0) {
    await syncTagNamesToAvatar(avatar, normalized.tags);
  }
  if (scenarioMeta && typeof scenarioMeta === 'object') {
    await saveScenarioMeta(avatar, scenarioMeta);
  }

  return getFullCharacterCard(avatar);
}

/**
 * Helper to ensure an array of tag names exist in `settings.json -> tags`
 * and assign their IDs to `settings.tag_map[avatarFilename]`.
 */
async function syncTagNamesToAvatar(avatarFilename, tagNames = []) {
  const cleanNames = Array.from(
    new Set(
      (Array.isArray(tagNames) ? tagNames : [])
        .map((t) => String(t || '').trim())
        .filter(Boolean),
    ),
  );
  if (cleanNames.length === 0) return [];

  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!Array.isArray(settings.tags)) settings.tags = [];
    if (!settings.tag_map || typeof settings.tag_map !== 'object') {
      settings.tag_map = {};
    }

    const assignedSet = new Set(
      Array.isArray(settings.tag_map[avatarFilename])
        ? settings.tag_map[avatarFilename].map(String)
        : [],
    );

    for (const tagName of cleanNames) {
      let existing = settings.tags.find(
        (t) => String(t?.name || '').toLowerCase() === tagName.toLowerCase(),
      );
      if (!existing) {
        existing = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: tagName,
          folder_type: 'NONE',
        };
        settings.tags.push(existing);
      }
      assignedSet.add(String(existing.id));
    }

    settings.tag_map[avatarFilename] = Array.from(assignedSet);
    await writeUserSettings(settings);
    return settings.tag_map[avatarFilename];
  });
}

/**
 * Imports one or more `.png` (v2/v3) or `.json` character cards.
 * Each item: `{ fileName, fileBase64, jsonPayload }`
 */
export async function importCharacterCards(
  items = [],
  { importEmbeddedTags = true } = {},
) {
  const imported = [];

  for (const item of items || []) {
    if (!item || typeof item !== 'object') continue;
    const rawFileName = String(item.fileName || 'character.png').trim();
    const isJson =
      rawFileName.toLowerCase().endsWith('.json') ||
      (item.jsonPayload && !item.fileBase64);

    if (!isJson && item.fileBase64) {
      const cleanBase64 = String(item.fileBase64).replace(/^data:[^,]+,/, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      if (!isPngBuffer(buf)) continue;

      const parsed = readCardFromPngBuffer(buf, rawFileName);
      const baseStem =
        parsed?.name || rawFileName.replace(/\.(png|json)$/i, '') || 'character';
      const avatar = buildUniqueAvatarFilename(baseStem, '.png');
      const fullPath = path.join(CHARACTERS_DIR, avatar);

      await writeFileAtomic(fullPath, buf);
      await ensureThumbnailFile('avatar', avatar);

      if (importEmbeddedTags && Array.isArray(parsed?.tags) && parsed.tags.length > 0) {
        await syncTagNamesToAvatar(avatar, parsed.tags);
      }

      cardIndexCache.delete(avatar);
      const full = getFullCharacterCard(avatar);
      if (full) imported.push(full);
    } else if (item.jsonPayload || item.fileBase64) {
      let rawJson = item.jsonPayload;
      if (!rawJson && item.fileBase64) {
        const cleanBase64 = String(item.fileBase64).replace(/^data:[^,]+,/, '');
        rawJson = JSON.parse(Buffer.from(cleanBase64, 'base64').toString('utf8'));
      }
      if (!rawJson || typeof rawJson !== 'object') continue;

      const normalized = normalizeCardData(rawJson, rawFileName);
      const baseStem =
        normalized.name || rawFileName.replace(/\.(png|json)$/i, '') || 'character';
      const avatar = buildUniqueAvatarFilename(baseStem, '.json');
      const fullPath = path.join(CHARACTERS_DIR, avatar);

      const payload = serializeCardPayload(
        { ...normalized, avatar },
        normalized.spec === 'chara_card_v3' ? 'v3' : 'v2',
      );
      await writeFileAtomic(fullPath, JSON.stringify(payload, null, 2), 'utf8');

      if (
        importEmbeddedTags &&
        Array.isArray(normalized.tags) &&
        normalized.tags.length > 0
      ) {
        await syncTagNamesToAvatar(avatar, normalized.tags);
      }

      cardIndexCache.delete(avatar);
      const full = getFullCharacterCard(avatar);
      if (full) imported.push(full);
    }
  }

  return imported;
}

/**
 * Ensures the card's initial PNG buffer is saved into `.nexustavern/portraits/<slug>/`
 * before adding or switching portraits so the original card artwork is never lost.
 */
export async function backupOriginalCardPortraitIfNeeded(avatarFilename) {
  const safeName = path.basename(String(avatarFilename || ''));
  const ext = path.extname(safeName).toLowerCase();
  if (ext !== '.png') return null;

  const fullPath = path.join(CHARACTERS_DIR, safeName);
  if (!fs.existsSync(fullPath)) return null;

  const currentBuf = fs.readFileSync(fullPath);
  if (!isPngBuffer(currentBuf)) return null;

  return ensureOriginalPortraitInGallery(safeName, currentBuf);
}

/**
 * Replaces the main PNG portrait of a card while preserving 100% of its `chara` / `ccv3` metadata.
 * Also backs up the original artwork into `avatarGallery` and registers the uploaded portrait.
 */
export async function replaceCharacterCardAvatar(
  avatarFilename,
  imageBase64,
  { addToGallery = true, label = '' } = {},
) {
  const safeName = path.basename(String(avatarFilename || ''));
  return withCardFileLock(safeName, async () => {
    const fullPath = path.join(CHARACTERS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Character card not found: ${safeName}`);
    }

    const current = loadCharacterCardByFilename(safeName);
    if (!current) {
      throw new Error(`Failed to read existing card metadata: ${safeName}`);
    }

    const cleanBase64 = String(imageBase64 || '').replace(/^data:[^,]+,/, '');
    const newPngBuf = Buffer.from(cleanBase64, 'base64');
    if (!isPngBuffer(newPngBuf)) {
      throw new Error('Uploaded portrait must be a valid PNG image buffer');
    }

    const ext = path.extname(safeName).toLowerCase();
    if (ext === '.png') {
      await backupOriginalCardPortraitIfNeeded(safeName);
    }

    if (ext === '.png') {
      const updatedPng = writeCardToPngBuffer(newPngBuf, current, {
        writeV3: current.spec === 'chara_card_v3' || current.hasCcv3Chunk,
      });
      await writeFileAtomic(fullPath, updatedPng);
      invalidateThumbnailCache('avatar', safeName);
      await ensureThumbnailFile('avatar', safeName);
      await ensureThumbnailFile('avatar', safeName, { chat: true });
    }

    if (addToGallery) {
      const added = await addScenarioGalleryPortrait(safeName, {
        imageBase64: cleanBase64,
        fileName: `${label || 'portrait'}.png`,
        label: label || 'Portrait',
      });
      if (added?.entry?.id) {
        await saveScenarioMeta(safeName, { activePortraitId: added.entry.id });
      }
    }

    cardIndexCache.delete(safeName);
    return getFullCharacterCard(safeName);
  });
}

/**
 * Switches the card's main PNG portrait to an existing item in `scenarioMeta.avatarGallery` in 1 click.
 */
export async function applyGalleryPortraitAsMainAvatar(avatarFilename, portraitId) {
  const safeName = path.basename(String(avatarFilename || ''));
  return withCardFileLock(safeName, async () => {
    const fullPath = path.join(CHARACTERS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Character card not found: ${safeName}`);
    }

    const current = loadCharacterCardByFilename(safeName);
    if (!current) {
      throw new Error(`Failed to read existing card metadata: ${safeName}`);
    }

    const stored = readScenarioGalleryPortraitBuffer(safeName, portraitId);
    if (!stored || !stored.buffer) {
      throw new Error('Gallery portrait file not found on disk');
    }

    const ext = path.extname(safeName).toLowerCase();
    if (ext === '.png' && isPngBuffer(stored.buffer)) {
      const updatedPng = writeCardToPngBuffer(stored.buffer, current, {
        writeV3: current.spec === 'chara_card_v3' || current.hasCcv3Chunk,
      });
      await writeFileAtomic(fullPath, updatedPng);
      invalidateThumbnailCache('avatar', safeName);
      await ensureThumbnailFile('avatar', safeName);
      await ensureThumbnailFile('avatar', safeName, { chat: true });
    }

    await saveScenarioMeta(safeName, { activePortraitId: stored.entry.id });
    cardIndexCache.delete(safeName);
    return getFullCharacterCard(safeName);
  });
}

/**
 * Converts a character card into a SillyTavern user persona (`User Avatars/` + `settings.json`).
 */
export async function convertCharacterCardToPersona(avatarFilename) {
  const safeName = path.basename(String(avatarFilename || ''));
  const fullPath = path.join(CHARACTERS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Character card not found: ${safeName}`);
  }

  const card = loadCharacterCardByFilename(safeName);
  if (!card) {
    throw new Error(`Failed to parse character card: ${safeName}`);
  }

  fs.mkdirSync(USER_AVATARS_DIR, { recursive: true });
  const safeStem =
    String(card.name || safeName.replace(/\.(png|json)$/i, '') || 'persona')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim() || 'persona';

  let personaAvatar = `${safeStem}.png`;
  let idx = 1;
  while (fs.existsSync(path.join(USER_AVATARS_DIR, personaAvatar))) {
    personaAvatar = `${safeStem}_${idx}.png`;
    idx += 1;
  }

  const ext = path.extname(safeName).toLowerCase();
  if (ext === '.png') {
    fs.copyFileSync(fullPath, path.join(USER_AVATARS_DIR, personaAvatar));
    await ensureThumbnailFile('persona', personaAvatar);
  }

  const personasResult = await savePersona(personaAvatar, {
    name: card.name || safeStem,
    description: card.description || '',
  });

  return {
    createdPersonaAvatar: personaAvatar,
    ...personasResult,
  };
}

/**
 * Replaces/updates an existing character card from a newly uploaded `.png` or `.json` file
 * while keeping its filename, chat folder, and tag bindings intact (ST's "Replace / Update").
 */
export async function replaceCharacterCardFromFile(
  avatarFilename,
  { fileBase64, jsonPayload } = {},
) {
  const safeName = path.basename(String(avatarFilename || ''));
  return withCardFileLock(safeName, async () => {
    const fullPath = path.join(CHARACTERS_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Character card not found: ${safeName}`);
    }

    const ext = path.extname(safeName).toLowerCase();
    let incomingCard = null;
    let incomingPngBuf = null;

    if (fileBase64) {
      const cleanBase64 = String(fileBase64).replace(/^data:[^,]+,/, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      if (isPngBuffer(buf)) {
        incomingPngBuf = buf;
        incomingCard = readCardFromPngBuffer(buf, safeName);
      } else {
        const parsedJson = JSON.parse(buf.toString('utf8'));
        incomingCard = normalizeCardData(parsedJson, safeName);
      }
    } else if (jsonPayload && typeof jsonPayload === 'object') {
      incomingCard = normalizeCardData(jsonPayload, safeName);
    }

    if (!incomingCard) {
      throw new Error('No valid PNG or JSON card payload provided for Replace / Update');
    }

    if (ext === '.png') {
      const basePngBuf = incomingPngBuf || fs.readFileSync(fullPath);
      const updatedPng = writeCardToPngBuffer(basePngBuf, incomingCard, {
        writeV3: incomingCard.spec === 'chara_card_v3' || incomingCard.hasCcv3Chunk,
      });
      await writeFileAtomic(fullPath, updatedPng);
      const thumbPath = path.join(DEFAULT_USER_DIR, 'thumbnails', 'avatar', safeName);
      if (fs.existsSync(thumbPath)) {
        fs.rmSync(thumbPath, { force: true });
      }
      await ensureThumbnailFile('avatar', safeName);
    } else {
      const payload = serializeCardPayload(
        { ...incomingCard, avatar: safeName },
        incomingCard.spec === 'chara_card_v3' ? 'v3' : 'v2',
      );
      await writeFileAtomic(fullPath, JSON.stringify(payload, null, 2), 'utf8');
    }

    cardIndexCache.delete(safeName);
    return getFullCharacterCard(safeName);
  });
}

/**
 * Imports the card's embedded `data.tags` into `settings.json -> tags` & `tag_map` (ST's "Import Tags").
 */
export async function importEmbeddedTagsForCard(avatarFilename) {
  const safeName = path.basename(String(avatarFilename || ''));
  const card = loadCharacterCardByFilename(safeName);
  if (!card) {
    throw new Error(`Character card not found: ${safeName}`);
  }
  await syncTagNamesToAvatar(safeName, card.tags || []);
  cardIndexCache.delete(safeName);
  return getFullCharacterCard(safeName);
}


/**
 * Duplicates an existing card (both the file and its tag assignments).
 */
export async function duplicateCharacterCard(avatarFilename) {
  const safeName = path.basename(avatarFilename);
  const srcPath = path.join(CHARACTERS_DIR, safeName);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Character card not found: ${safeName}`);
  }

  const card = loadCharacterCardByFilename(safeName);
  const baseName = `${card?.name || safeName.replace(/\.(png|json)$/i, '')} copy`;
  const extension = path.extname(safeName).toLowerCase() || '.png';
  const avatar = buildUniqueAvatarFilename(baseName, extension);

  fs.copyFileSync(srcPath, path.join(CHARACTERS_DIR, avatar));

  await withUserSettingsLock(async () => {
    const settings = readUserSettings();
    const assigned = resolveMappedTagIds({ avatar: safeName }, settings);
    if (assigned.length > 0) {
      if (!settings.tag_map || typeof settings.tag_map !== 'object') settings.tag_map = {};
      settings.tag_map[avatar] = assigned;
      await writeUserSettings(settings);
    }
  });

  await duplicateScenarioMeta(safeName, avatar);

  cardIndexCache.delete(avatar);
  return getFullCharacterCard(avatar);
}

/**
 * Deletes a card file, its cached thumbnail, its tag assignments and optionally its chat folder.
 */
export async function deleteCharacterCards(
  avatarFilenames = [],
  { deleteChats = true } = {},
) {
  const deletedFiles = [];

  for (const rawName of avatarFilenames) {
    const safeName = path.basename(String(rawName || ''));
    if (!safeName) continue;

    await withCardFileLock(safeName, async () => {
      const fullPath = path.join(CHARACTERS_DIR, safeName);
      if (!fs.existsSync(fullPath)) return;

      const card = loadCharacterCardByFilename(safeName);
      const resolvedChatFolder =
        deleteChats && card
          ? getCharacterChatStats(card)?.chatFolder ||
            String(card.avatar || safeName).replace(/\.(png|json)$/i, '')
          : '';

      fs.rmSync(fullPath, { force: true });

      const thumbPath = path.join(
        path.join(DEFAULT_USER_DIR, 'thumbnails', 'avatar'),
        safeName,
      );
      if (fs.existsSync(thumbPath)) {
        fs.rmSync(thumbPath, { force: true });
      }

      deleteScenarioMeta(safeName);

      if (deleteChats && resolvedChatFolder) {
        const chatsPath = path.join(CHATS_DIR, path.basename(resolvedChatFolder));
        if (fs.existsSync(chatsPath) && fs.statSync(chatsPath).isDirectory()) {
          fs.rmSync(chatsPath, { recursive: true, force: true });
        }
        chatFolderCache.clear();
      }

      cardIndexCache.delete(safeName);
      deletedFiles.push(safeName);
    });
  }

  if (deletedFiles.length > 0) {
    await withUserSettingsLock(async () => {
      const settings = readUserSettings();
      let dirty = false;
      for (const safeName of deletedFiles) {
        if (settings.tag_map && Object.prototype.hasOwnProperty.call(settings.tag_map, safeName)) {
          delete settings.tag_map[safeName];
          dirty = true;
        }
      }
      if (dirty) {
        await writeUserSettings(settings);
      }
    });
  }

  return { deleted: deletedFiles, count: deletedFiles.length };
}

/**
 * Reads a card ready for export: the untouched `.png` bytes, or the serialized
 * SillyTavern V2/V3 JSON payload for `.json` / `json` requests.
 */
export function exportCharacterCard(avatarFilename, format = 'png') {
  const safeName = path.basename(avatarFilename);
  const fullPath = path.join(CHARACTERS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Character card not found: ${safeName}`);
  }

  const card = loadCharacterCardByFilename(safeName);
  const ext = path.extname(safeName).toLowerCase();

  if (format === 'json' || ext === '.json') {
    const payload = serializeCardPayload(
      { ...card, avatar: safeName },
      card?.spec === 'chara_card_v3' ? 'v3' : 'v2',
    );
    return {
      contentType: 'application/json; charset=utf-8',
      fileName: `${safeName.replace(/\.(png|json)$/i, '')}.json`,
      buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    };
  }

  return {
    contentType: 'image/png',
    fileName: safeName,
    buffer: fs.readFileSync(fullPath),
  };
}

/**
 * Packs multiple character cards (in `png` or `json` format) into a single `.zip` archive.
 */
export function exportCharacterCardsZip(avatarFilenames = [], format = 'png') {
  const fmt = format === 'json' ? 'json' : 'png';
  const zipEntries = [];

  for (const rawName of avatarFilenames) {
    const safeName = path.basename(String(rawName || ''));
    if (!safeName) continue;
    const fullPath = path.join(CHARACTERS_DIR, safeName);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const exported = exportCharacterCard(safeName, fmt);
      zipEntries.push({
        fileName: exported.fileName,
        buffer: exported.buffer,
        compress: fmt === 'json',
      });
    } catch {
      // skip unreadable card
    }
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const zipFileName = `scenarios-${fmt}-${dateStamp}.zip`;
  const zipBuffer = buildZipBuffer(zipEntries);

  return {
    contentType: 'application/zip',
    fileName: zipFileName,
    count: zipEntries.length,
    buffer: zipBuffer,
  };
}


/**
 * Lists all user personas from `User Avatars/` and `settings.json -> power_user.personas`.
 */
export async function listPersonas() {
  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const descMap = settings?.power_user?.persona_descriptions || {};
  const activeAvatar = settings?.user_avatar || 'user-default.png';

  const filesOnDisk = fs.existsSync(USER_AVATARS_DIR)
    ? fs
        .readdirSync(USER_AVATARS_DIR, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.(png|jpg|jpeg|webp)$/i.test(e.name))
        .map((e) => e.name)
    : [];

  const allKeys = Array.from(
    new Set([...Object.keys(personasMap), ...filesOnDisk]),
  );

  const personas = [];
  for (const avatar of allKeys) {
    const fullPath = path.join(USER_AVATARS_DIR, avatar);
    const exists = fs.existsSync(fullPath);
    let mtimeStamp = 0;
    if (exists) {
      try {
        mtimeStamp = Math.trunc(fs.statSync(fullPath).mtimeMs);
      } catch {
        mtimeStamp = 0;
      }
      if (avatar.toLowerCase().endsWith('.png')) {
        await ensureThumbnailFile('persona', avatar);
      }
    }

    const meta = descMap[avatar] || {};
    const displayName =
      personasMap[avatar] || avatar.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const verSuffix = mtimeStamp ? `?v=${mtimeStamp}` : '';

    personas.push({
      avatar,
      name: displayName,
      description: String(meta.description || ''),
      title: String(meta.title || ''),
      connections: Array.isArray(meta.connections) ? meta.connections : [],
      isActive: avatar === activeAvatar,
      existsOnDisk: exists,
      thumbnailUrl: exists
        ? `/api/thumbnails/persona/${encodeURIComponent(avatar)}${verSuffix}`
        : null,
      avatarUrl: exists
        ? `/user-data/User%20Avatars/${encodeURIComponent(avatar)}${verSuffix}`
        : null,
    });
  }

  return {
    activePersonaAvatar: activeAvatar,
    personas,
  };
}

function buildUniquePersonaAvatarFilename(rawName = 'persona', ext = '.png') {
  fs.mkdirSync(USER_AVATARS_DIR, { recursive: true });
  const safeStem =
    String(rawName || 'persona')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .trim()
      .slice(0, 48) || 'persona';
  const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  let candidate = `${Date.now()}-${safeStem}${cleanExt}`;
  let suffix = 1;
  while (fs.existsSync(path.join(USER_AVATARS_DIR, candidate))) {
    candidate = `${Date.now()}-${safeStem}-${suffix}${cleanExt}`;
    suffix += 1;
  }
  return candidate;
}

function removePersonaThumbnailIfExists(avatarFilename) {
  invalidateThumbnailCache('persona', avatarFilename);
}

export async function createPersona({
  name = 'New Persona',
  title = '',
  description = '',
  imageBase64 = '',
  connections = [],
  setAsActive = true,
} = {}) {
  const trimmedName = String(name || '').trim() || 'New Persona';
  const avatar = buildUniquePersonaAvatarFilename(trimmedName, '.png');
  const fullPath = path.join(USER_AVATARS_DIR, avatar);

  if (imageBase64) {
    const cleanBase64 = String(imageBase64).replace(/^data:[^,]+,/, '');
    const buf = Buffer.from(cleanBase64, 'base64');
    await writeFileAtomic(fullPath, buf);
    if (isPngBuffer(buf)) {
      await ensureThumbnailFile('persona', avatar);
    }
  } else {
    const defaultAvatarPath = path.join(USER_AVATARS_DIR, 'user-default.png');
    if (fs.existsSync(defaultAvatarPath)) {
      fs.copyFileSync(defaultAvatarPath, fullPath);
      await ensureThumbnailFile('persona', avatar);
    }
  }

  const res = await savePersona(avatar, {
    name: trimmedName,
    title: String(title || '').trim(),
    description: String(description || ''),
    connections: Array.isArray(connections) ? connections : [],
    setAsActive: Boolean(setAsActive),
  });

  return {
    createdPersonaAvatar: avatar,
    ...res,
  };
}

export async function uploadPersonaAvatar(avatarFilename, { imageBase64 } = {}) {
  const safeName = path.basename(String(avatarFilename || ''));
  if (!safeName) {
    throw new Error('Missing persona avatar filename');
  }
  const cleanBase64 = String(imageBase64 || '').replace(/^data:[^,]+,/, '');
  if (!cleanBase64) {
    throw new Error('Missing imageBase64 payload');
  }

  fs.mkdirSync(USER_AVATARS_DIR, { recursive: true });
  const buf = Buffer.from(cleanBase64, 'base64');
  const fullPath = path.join(USER_AVATARS_DIR, safeName);
  await writeFileAtomic(fullPath, buf);
  removePersonaThumbnailIfExists(safeName);
  if (isPngBuffer(buf) && safeName.toLowerCase().endsWith('.png')) {
    await ensureThumbnailFile('persona', safeName);
  }

  return listPersonas();
}

/**
 * Updates a persona's display name, description, and prompt injection metadata in `settings.json`.
 */
export async function duplicatePersona(avatarFilename) {
  const safeSource = path.basename(String(avatarFilename || ''));
  if (!safeSource) {
    throw new Error('Missing source persona avatar');
  }

  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const descMap = settings?.power_user?.persona_descriptions || {};
  const sourceName =
    personasMap[safeSource] || safeSource.replace(/\.(png|jpg|jpeg|webp)$/i, '');
  const sourceMeta = descMap[safeSource] || {};

  const ext = path.extname(safeSource) || '.png';
  const newAvatar = buildUniquePersonaAvatarFilename(`${sourceName}-copy`, ext);
  const srcPath = path.join(USER_AVATARS_DIR, safeSource);
  const dstPath = path.join(USER_AVATARS_DIR, newAvatar);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, dstPath);
    if (newAvatar.toLowerCase().endsWith('.png')) {
      await ensureThumbnailFile('persona', newAvatar);
    }
  }

  const res = await savePersona(newAvatar, {
    name: `${sourceName} (Copy)`,
    title: String(sourceMeta.title || ''),
    description: String(sourceMeta.description || ''),
    connections: [],
    setAsActive: false,
  });

  return {
    createdPersonaAvatar: newAvatar,
    ...res,
  };
}

export async function deletePersona(avatarFilename) {
  const safeName = path.basename(String(avatarFilename || ''));
  if (!safeName) {
    throw new Error('Missing persona avatar filename');
  }

  return withUserSettingsLock(async () => {
    const current = await listPersonas();
    if (current.personas.length <= 1) {
      throw new Error('Cannot delete the only remaining persona');
    }

    const settings = readUserSettings();
    if (settings?.power_user?.personas) {
      delete settings.power_user.personas[safeName];
    }
    if (settings?.power_user?.persona_descriptions) {
      delete settings.power_user.persona_descriptions[safeName];
    }
    if (settings?.power_user?.default_persona === safeName) {
      settings.power_user.default_persona = null;
    }

    const fullPath = path.join(USER_AVATARS_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { force: true });
    }
    removePersonaThumbnailIfExists(safeName);

    if (settings.user_avatar === safeName) {
      const remaining = current.personas.find((p) => p.avatar !== safeName);
      settings.user_avatar = remaining?.avatar || 'user-default.png';
    }

    await writeUserSettings(settings);
    return listPersonas();
  });
}

export async function savePersona(avatarFilename, updates = {}) {
  const safeName = path.basename(avatarFilename);
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();

    if (!settings.power_user) {
      settings.power_user = {};
    }
    if (!settings.power_user.personas) {
      settings.power_user.personas = {};
    }
    if (!settings.power_user.persona_descriptions) {
      settings.power_user.persona_descriptions = {};
    }

    if (typeof updates.name === 'string' && updates.name.trim()) {
      settings.power_user.personas[safeName] = updates.name.trim();
    }

    const prevMeta = settings.power_user.persona_descriptions[safeName] || {};
    settings.power_user.persona_descriptions[safeName] = {
      ...prevMeta,
      position: 0,
      description:
        updates.description !== undefined
          ? String(updates.description)
          : String(prevMeta.description || ''),
      title:
        updates.title !== undefined
          ? String(updates.title)
          : String(prevMeta.title || ''),
      connections: Array.isArray(updates.connections)
        ? updates.connections
        : Array.isArray(prevMeta.connections)
          ? prevMeta.connections
          : [],
    };

    if (updates.setAsActive) {
      settings.user_avatar = safeName;
    }

    await writeUserSettings(settings);
    return listPersonas();
  });
}

/**
 * Sets the active user persona (`user_avatar` in `settings.json`).
 */
export async function selectActivePersona(avatarFilename) {
  const safeName = path.basename(avatarFilename);
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    settings.user_avatar = safeName;
    await writeUserSettings(settings);
    return listPersonas();
  });
}

