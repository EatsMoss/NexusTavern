import { Router } from 'express';
import {
  listCharacterChats,
  listGroupChats,
  listChatBackups,
  getChatWindow,
  getChatOlderTokenSummary,
  getOrSelectMessageSwipe,
  saveChatAttachments,
  appendChatMessage,
  patchChatMessage,
  deleteMessageSwipe,
  patchChatMetadata,
  replacePersonaInChat,
  deleteChatMessage,
  deleteChatMessagesBatch,
  createNewCharacterChat,
  branchCharacterChat,
  deleteCharacterChatFiles,
  deleteAllCharacterChats,
  exportCharacterChatsZip,
  importCharacterChats,
} from '../services/chatStore.js';
import { saveSession } from '../services/sessionStore.js';
import { recordConsoleLog } from '../services/consoleLogger.js';

export const chatsRouter = Router();

chatsRouter.get('/groups/list', (_req, res) => {
  try {
    const groups = listGroupChats();
    res.json({ ok: true, count: groups.length, groups });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.get('/backups/list', (_req, res) => {
  try {
    const backups = listChatBackups();
    res.json({ ok: true, count: backups.length, backups });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.get('/:avatar', (req, res) => {
  try {
    const startMs = performance.now();
    const { offset, limit } = req.query;
    const result = listCharacterChats(req.params.avatar, {
      offset: offset !== undefined ? Number(offset) : 0,
      limit: limit !== undefined ? Number(limit) : null,
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.get('/:avatar/messages', (req, res) => {
  try {
    const startMs = performance.now();
    const { file, beforeIndex, limit, group } = req.query;
    const windowData = getChatWindow(req.params.avatar, {
      fileName: file || null,
      beforeIndex: beforeIndex !== undefined ? beforeIndex : null,
      limit: limit ? Number(limit) : 20,
      isGroup: group === 'true',
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...windowData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.get('/:avatar/token-summary', (req, res) => {
  try {
    const { file, beforeIndex, group } = req.query;
    const summary = getChatOlderTokenSummary(req.params.avatar, {
      fileName: file || null,
      beforeIndex: beforeIndex !== undefined ? Number(beforeIndex) : 0,
      isGroup: group === 'true',
    });
    res.json({ ok: true, ...summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/new', async (req, res) => {
  try {
    const startMs = performance.now();
    const { greetingIndex = 0, greetingText = null, introPortraitUrl = null } = req.body || {};
    const windowData = await createNewCharacterChat(req.params.avatar, {
      greetingIndex,
      greetingText,
      introPortraitUrl,
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Chat',
      title: `Created new chat "${windowData.fileName}"`,
      summary: `Scenario: ${req.params.avatar} • Intro #${Number(greetingIndex) + 1}`,
      badges: [{ label: `${elapsedMs}ms`, tone: 'neutral' }],
    });
    res.json({ ok: true, elapsedMs, ...windowData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/branch', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, upToMessageIndex = null } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Source chat file is required' });
    }
    const windowData = await branchCharacterChat(req.params.avatar, file, {
      upToMessageIndex,
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Chat',
      title: `Created timeline branch "${windowData.fileName}"`,
      summary: `From "${file}"${upToMessageIndex !== null ? ` at message #${Number(upToMessageIndex) + 1}` : ''}`,
      badges: [{ label: 'BRANCH', tone: 'accent' }],
    });
    res.json({ ok: true, elapsedMs, ...windowData });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.delete('/:avatar/all', async (req, res) => {
  try {
    const startMs = performance.now();
    const result = deleteAllCharacterChats(req.params.avatar);
    await saveSession({ lastChats: { [req.params.avatar]: null } }).catch(() => {});
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/export-zip', (req, res) => {
  try {
    const zip = exportCharacterChatsZip(req.params.avatar);
    if (zip.count === 0) {
      return res.status(404).json({ ok: false, error: 'No chat files found to export' });
    }
    res.json({
      ok: true,
      fileName: zip.fileName,
      count: zip.count,
      zipBase64: zip.buffer.toString('base64'),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/import', async (req, res) => {
  try {
    const startMs = performance.now();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = await importCharacterChats(req.params.avatar, items);
    const listed = listCharacterChats(req.params.avatar, { offset: 0, limit: null });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({
      ok: true,
      elapsedMs,
      ...result,
      chats: listed.chats || [],
      totalChats: listed.totalChats ?? 0,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

chatsRouter.delete('/:avatar', (req, res) => {
  try {
    const startMs = performance.now();
    const filesParam = req.body?.files || req.body?.file || req.query.file;
    const filesList = Array.isArray(filesParam)
      ? filesParam
      : filesParam
        ? [filesParam]
        : [];
    if (filesList.length === 0) {
      return res.status(400).json({ ok: false, error: 'At least one chat file is required' });
    }
    const result = deleteCharacterChatFiles(req.params.avatar, filesList);
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'warn',
      scope: 'Chat',
      title: `Deleted ${filesList.length} chat file(s)`,
      summary: `${req.params.avatar}: ${filesList.join(', ')}`,
    });
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/attachments', async (req, res) => {
  try {
    const startMs = performance.now();
    const rawList = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (rawList.length === 0) {
      return res.status(400).json({ ok: false, error: 'Attachments array is required' });
    }
    const attachments = await saveChatAttachments(req.params.avatar, rawList);
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, attachments });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/messages', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, ...messagePayload } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await appendChatMessage(req.params.avatar, file, messagePayload);
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Chat',
      title: `Appended ${messagePayload.is_user !== false ? 'user' : 'assistant'} message (#${result.totalMessages || '?'})`,
      summary: `"${file}" (${String(messagePayload.mes || '').slice(0, 90)}${String(messagePayload.mes || '').length > 90 ? '…' : ''})`,
    });
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/messages/:index/swipe', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, swipeId, persist = true } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await getOrSelectMessageSwipe(
      req.params.avatar,
      file,
      Number(req.params.index),
      Number(swipeId),
      { persistSelection: Boolean(persist) },
    );
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.patch('/:avatar/messages/:index', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, ...patch } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await patchChatMessage(
      req.params.avatar,
      file,
      Number(req.params.index),
      patch,
    );
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Chat',
      title: `Edited message #${Number(req.params.index) + 1} in "${file}"`,
      summary: `Scenario: ${req.params.avatar}`,
    });
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.delete('/:avatar/messages/:index/swipes/:swipeId', async (req, res) => {
  try {
    const startMs = performance.now();
    const file = req.query.file || req.body?.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await deleteMessageSwipe(
      req.params.avatar,
      file,
      Number(req.params.index),
      Number(req.params.swipeId),
    );
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/messages/delete-batch', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, indices, isGroup = false } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    if (!Array.isArray(indices) || indices.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: 'At least one message index is required' });
    }
    const result = await deleteChatMessagesBatch(req.params.avatar, file, indices, {
      isGroup: Boolean(isGroup),
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'warn',
      scope: 'Chat',
      title: `Batch-deleted ${result.deletedCount} message(s) from "${file}"`,
      summary: `Indices: ${indices.map((idx) => `#${Number(idx) + 1}`).join(', ')} • Backup saved`,
    });
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

chatsRouter.delete('/:avatar/messages/:index', async (req, res) => {
  try {
    const startMs = performance.now();
    const file = req.query.file || req.body?.file;
    const truncateTail = req.query.truncateTail === 'true' || Boolean(req.body?.truncateTail);
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await deleteChatMessage(
      req.params.avatar,
      file,
      Number(req.params.index),
      { truncateTail },
    );
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    recordConsoleLog({
      category: 'change',
      level: 'warn',
      scope: 'Chat',
      title: `${truncateTail ? 'Truncated chat from' : 'Deleted'} message #${Number(req.params.index) + 1}`,
      summary: `"${file}" (${result.totalMessages} remaining)`,
    });
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.patch('/:avatar/metadata', async (req, res) => {
  try {
    const { file, metadata, isGroup = false } = req.body || {};
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Target chat file is required' });
    }
    const result = await patchChatMetadata(
      req.params.avatar,
      file,
      metadata || {},
      Boolean(isGroup),
    );
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

chatsRouter.post('/:avatar/replace-persona', async (req, res) => {
  try {
    const startMs = performance.now();
    const { file, personaAvatar, personaName, isGroup = false } = req.body || {};
    if (!file || !personaAvatar) {
      return res
        .status(400)
        .json({ ok: false, error: 'Both chat file and personaAvatar are required' });
    }
    const result = await replacePersonaInChat(req.params.avatar, file, {
      personaAvatar,
      personaName,
      isGroup: Boolean(isGroup),
    });
    const elapsedMs = Number((performance.now() - startMs).toFixed(2));
    res.json({ ok: true, elapsedMs, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
