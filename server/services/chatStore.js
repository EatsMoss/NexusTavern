/**
 * Public facade for NexusTavern `.jsonl` chat storage, preserving 100% backward-compatible
 * exports across server routes and services while delegating to focused domain modules:
 * - `chatJsonlCodec.js`: `.jsonl` parser/serializer, mtime caches, Tail-First windows & listings
 * - `chatAttachmentsAndBackups.js`: media/file uploads, rotating backups, `.zip` archives & imports
 * - `chatMutations.js`: message/swipe CRUD, timeline branching, metadata & persona replacement
 */
import { invalidateChatCodecCaches } from './chatJsonlCodec.js';
import { clearAllChatBackupTimestamps } from './chatAttachmentsAndBackups.js';

export function invalidateChatStoreCaches() {
  invalidateChatCodecCaches();
  clearAllChatBackupTimestamps();
}

export {
  GROUP_CHATS_DIR,
  formatSillyTavernSendDate,
  formatSillyTavernChatFilename,
  estimateTokenCount,
  resolveCharacterChatDir,
  resolveChatFilePath,
  readParsedJsonlChat,
  writeParsedJsonlChat,
  toCompactClientMessage,
  resolveStAssetDiskPath,
  normalizeStAssetClientUrl,
  extractMessageAttachments,
  resolveChatPersonaState,
  parseEmbeddedChatStampMs,
  parseSendDateMs,
  resolveDefaultCharacterChatSummary,
  listCharacterChats,
  listGroupChats,
  getChatWindow,
  getChatOlderTokenSummary,
} from './chatJsonlCodec.js';

export {
  BACKUPS_DIR,
  ensureChatBackup,
  listChatBackups,
  saveChatAttachments,
  exportCharacterChatsZip,
  importCharacterChats,
} from './chatAttachmentsAndBackups.js';

export {
  getOrSelectMessageSwipe,
  appendChatMessage,
  patchChatMessage,
  deleteMessageSwipe,
  deleteChatMessage,
  deleteChatMessagesBatch,
  createNewCharacterChat,
  branchCharacterChat,
  deleteCharacterChatFiles,
  deleteAllCharacterChats,
  patchChatMetadata,
  replacePersonaInChat,
} from './chatMutations.js';
