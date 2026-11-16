import { apiFetchJson, getAuthorizedAssetUrl } from '@core/api/apiClient.js';

function normalizeChatMessageUrls(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  return {
    ...msg,
    userAvatarUrl: msg.userAvatarUrl ? getAuthorizedAssetUrl(msg.userAvatarUrl) : null,
    attachments: Array.isArray(msg.attachments)
      ? msg.attachments.map((att) => ({
          ...att,
          url: att?.url ? getAuthorizedAssetUrl(att.url) : '',
        }))
      : [],
  };
}

function normalizeChatWindowResponse(res) {
  if (!res || typeof res !== 'object') return res;
  const next = { ...res };
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map(normalizeChatMessageUrls);
  }
  if (next.message && typeof next.message === 'object') {
    next.message = normalizeChatMessageUrls(next.message);
  }
  return next;
}

/**
 * Lists `.jsonl` chat files for a character (`GET /api/chats/:avatar`).
 * Supports paginated batches via `{ offset, limit }` (default limit = 30).
 */
export async function fetchCharacterChats(avatarOrFolder, options = {}) {
  const { offset = 0, limit = 30 } = options;
  const params = new URLSearchParams();
  if (offset !== null && offset !== undefined) {
    params.set('offset', String(offset));
  }
  if (limit !== null && limit !== undefined) {
    params.set('limit', String(limit));
  }
  const query = params.toString();
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}${query ? `?${query}` : ''}`,
  );
  if (res && Array.isArray(res.chats)) {
    return {
      ...res,
      chats: res.chats.map((c) => ({
        ...c,
        personaAvatarUrl: c.personaAvatarUrl
          ? getAuthorizedAssetUrl(c.personaAvatarUrl)
          : null,
        lastMessage: normalizeChatMessageUrls(c.lastMessage),
      })),
    };
  }
  return res;
}

/**
 * Tail-First paginated window of `.jsonl` messages (`GET /api/chats/:avatar/messages`).
 */
export async function fetchChatWindow(avatarOrFolder, options = {}) {
  const { file = null, beforeIndex = null, limit = 20, isGroup = false } = options;
  const params = new URLSearchParams();
  if (file) params.set('file', file);
  if (beforeIndex !== null && beforeIndex !== undefined) {
    params.set('beforeIndex', String(beforeIndex));
  }
  if (limit) params.set('limit', String(limit));
  if (isGroup) params.set('group', 'true');

  const query = params.toString();
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages${query ? `?${query}` : ''}`,
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Re-computes active & raw token totals for older on-disk messages (`0..beforeIndex-1`)
 * when Message Recap or Prompt-Only Regex settings change (`GET /api/chats/:avatar/token-summary`).
 */
export async function fetchChatOlderTokenSummary(avatarOrFolder, options = {}) {
  const { file = null, beforeIndex = 0, isGroup = false } = options;
  const params = new URLSearchParams();
  if (file) params.set('file', file);
  params.set('beforeIndex', String(Math.max(0, Number(beforeIndex) || 0)));
  if (isGroup) params.set('group', 'true');
  return apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/token-summary?${params.toString()}`,
  );
}

/**
 * Creates a brand-new `.jsonl` chat file for a character (`POST /api/chats/:avatar/new`).
 */
export async function createNewChat(avatarOrFolder, greetingIndex = 0, options = {}) {
  const { greetingText = null, introPortraitUrl = null } = options || {};
  const res = await apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}/new`, {
    method: 'POST',
    body: { greetingIndex, greetingText, introPortraitUrl },
  });
  return normalizeChatWindowResponse(res);
}

/**
 * Creates a new branch (fork) from an existing `.jsonl` chat (`POST /api/chats/:avatar/branch`).
 * Optional `options.upToMessageIndex` keeps messages `0..upToMessageIndex` inclusive.
 */
export async function branchCharacterChat(avatarOrFolder, file, options = {}) {
  const { upToMessageIndex = null } = options || {};
  const body = { file };
  if (upToMessageIndex !== null && upToMessageIndex !== undefined) {
    body.upToMessageIndex = Number(upToMessageIndex);
  }
  const res = await apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}/branch`, {
    method: 'POST',
    body,
  });
  return normalizeChatWindowResponse(res);
}

/**
 * Deletes one or more `.jsonl` chat files for a character (`DELETE /api/chats/:avatar`).
 */
export async function deleteCharacterChats(avatarOrFolder, files = []) {
  const list = Array.isArray(files) ? files : [files];
  return apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}`, {
    method: 'DELETE',
    body: { files: list },
  });
}

/**
 * Deletes ALL `.jsonl` chat files for a character (`DELETE /api/chats/:avatar/all`).
 */
export async function deleteAllCharacterChats(avatarOrFolder) {
  return apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}/all`, {
    method: 'DELETE',
  });
}

/**
 * Exports all `.jsonl` chat files for a character packed as a `.zip` archive
 * (`POST /api/chats/:avatar/export-zip`) and triggers browser download.
 */
export async function downloadCharacterChatsZip(avatarOrFolder) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/export-zip`,
    { method: 'POST' },
  );
  if (!res?.zipBase64) {
    throw new Error('Failed to build chats ZIP archive');
  }

  const binString = window.atob(res.zipBase64);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i += 1) {
    bytes[i] = binString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: 'application/zip' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = res.fileName || 'chats.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

  return { fileName: res.fileName, count: res.count };
}

/**
 * Imports one or more `.jsonl` / `.json` chat files or `.zip` chat archives
 * into a character's chat folder (`POST /api/chats/:avatar/import`).
 */
export async function importCharacterChats(avatarOrFolder, items = []) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/import`,
    {
      method: 'POST',
      body: { items },
    },
  );
  if (res && Array.isArray(res.chats)) {
    return {
      ...res,
      chats: res.chats.map((c) => ({
        ...c,
        personaAvatarUrl: c.personaAvatarUrl
          ? getAuthorizedAssetUrl(c.personaAvatarUrl)
          : null,
        lastMessage: normalizeChatMessageUrls(c.lastMessage),
      })),
    };
  }
  return res;
}

/**
 * Uploads file/image attachments for a character chat (`POST /api/chats/:avatar/attachments`).
 */
export async function uploadChatAttachments(avatarOrFolder, attachments = []) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/attachments`,
    {
      method: 'POST',
      body: { attachments },
    },
  );
  if (res && Array.isArray(res.attachments)) {
    return {
      ...res,
      attachments: res.attachments.map((att) => ({
        ...att,
        url: att?.url ? getAuthorizedAssetUrl(att.url) : '',
      })),
    };
  }
  return res;
}

/**
 * Delta Sync: Appends a single message to the end of a `.jsonl` chat (`POST /api/chats/:avatar/messages`).
 */
export async function appendMessageToChat(avatarOrFolder, file, messagePayload) {
  const res = await apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}/messages`, {
    method: 'POST',
    body: {
      file,
      ...messagePayload,
    },
  });
  return normalizeChatWindowResponse(res);
}

/**
 * Lazy Swipe selector: fetches and persists a specific swipe variant (`POST /api/chats/:avatar/messages/:index/swipe`).
 */
export async function switchChatMessageSwipe(
  avatarOrFolder,
  file,
  messageIndex,
  swipeId,
  persist = true,
) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages/${messageIndex}/swipe`,
    {
      method: 'POST',
      body: { file, swipeId, persist },
    },
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Delta Sync: Patches a single message (`mes`, `reasoning`, or `addSwipeText`) (`PATCH /api/chats/:avatar/messages/:index`).
 */
export async function patchMessageInChat(avatarOrFolder, file, messageIndex, patch) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages/${messageIndex}`,
    {
      method: 'PATCH',
      body: {
        file,
        ...patch,
      },
    },
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Delta Sync: Deletes a single swipe variant (`DELETE /api/chats/:avatar/messages/:index/swipes/:swipeId`).
 */
export async function deleteSwipeFromMessage(avatarOrFolder, file, messageIndex, swipeId) {
  const params = new URLSearchParams({ file });
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages/${messageIndex}/swipes/${swipeId}?${params.toString()}`,
    {
      method: 'DELETE',
    },
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Delta Sync: Deletes a single message or truncates tail (`DELETE /api/chats/:avatar/messages/:index`).
 */
export async function deleteMessageFromChat(
  avatarOrFolder,
  file,
  messageIndex,
  truncateTail = false,
) {
  const params = new URLSearchParams({
    file,
    truncateTail: truncateTail ? 'true' : 'false',
  });
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages/${messageIndex}?${params.toString()}`,
    {
      method: 'DELETE',
    },
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Batch deletes an arbitrary selection of messages (`POST /api/chats/:avatar/messages/delete-batch`).
 */
export async function deleteMessagesFromChat(
  avatarOrFolder,
  file,
  messageIndices = [],
  isGroup = false,
) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/messages/delete-batch`,
    {
      method: 'POST',
      body: { file, indices: messageIndices, isGroup },
    },
  );
  return normalizeChatWindowResponse(res);
}

/**
 * Lists rotating `.jsonl` chat backups (`GET /api/chats/backups/list`).
 */
export async function fetchChatBackups() {
  return apiFetchJson('/api/chats/backups/list');
}

/**
 * Patches `chat_metadata` inside a `.jsonl` chat header (`PATCH /api/chats/:avatar/metadata`).
 */
export async function updateChatMetadata(avatarOrFolder, file, metadata = {}, isGroup = false) {
  return apiFetchJson(`/api/chats/${encodeURIComponent(avatarOrFolder)}/metadata`, {
    method: 'PATCH',
    body: { file, metadata, isGroup },
  });
}

/**
 * Replaces the active persona across an existing `.jsonl` chat (`POST /api/chats/:avatar/replace-persona`).
 */
export async function replaceChatPersona(
  avatarOrFolder,
  file,
  { personaAvatar, personaName, isGroup = false } = {},
) {
  const res = await apiFetchJson(
    `/api/chats/${encodeURIComponent(avatarOrFolder)}/replace-persona`,
    {
      method: 'POST',
      body: { file, personaAvatar, personaName, isGroup },
    },
  );
  return normalizeChatWindowResponse(res);
}
