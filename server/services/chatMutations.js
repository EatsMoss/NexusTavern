import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  readUserSettings,
  invalidateCardStoreCaches,
} from './cardStore.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readCustomizationConfig } from './customizationStore.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../../src/core/regex/regexEngine.js';
import { applyTextFormattingRules } from '../../src/core/messages/messageDecorator.js';
import {
  resolveCharacterChatDir,
  resolveChatFilePath,
  readParsedJsonlChat,
  writeParsedJsonlChat,
  formatSillyTavernSendDate,
  formatSillyTavernChatFilename,
  estimateTokenCount,
  extractMessageAttachments,
  extractPersonaFileFromForceAvatar,
  toCompactClientMessage,
  getChatWindow,
  invalidateChatFileCache,
  invalidateChatSummaryFileCache,
} from './chatJsonlCodec.js';
import {
  ensureChatBackup,
  clearChatBackupTimestamp,
  buildSillyTavernAttachmentExtra,
} from './chatAttachmentsAndBackups.js';

export async function getOrSelectMessageSwipe(
  avatarOrFolder,
  fileName,
  messageIndex,
  swipeId,
  options = {},
) {
  const { persistSelection = true, isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const targetMsg = parsed.messages[idx];
  const swipes =
    Array.isArray(targetMsg.swipes) && targetMsg.swipes.length > 0
      ? targetMsg.swipes
      : [String(targetMsg.mes ?? '')];

  const requestedSwipe = Number(swipeId ?? 0);
  const normalizedSwipeId =
    ((requestedSwipe % swipes.length) + swipes.length) % swipes.length;

  targetMsg.swipe_id = normalizedSwipeId;
  targetMsg.mes = String(swipes[normalizedSwipeId] ?? '');
  if (
    Array.isArray(targetMsg.swipe_info) &&
    targetMsg.swipe_info[normalizedSwipeId]?.send_date
  ) {
    targetMsg.send_date = targetMsg.swipe_info[normalizedSwipeId].send_date;
  }

  if (persistSelection) {
    ensureChatBackup(filePath, chatFolder, false);
    await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  }

  return {
    chatFolder,
    fileName,
    message: toCompactClientMessage(targetMsg, idx),
  };
}

export async function appendChatMessage(avatarOrFolder, fileName, payload = {}, isGroup = false) {
  const { chatFolder, filePath, card } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );

  let parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    const settings = readUserSettings();
    const header = {
      chat_metadata: {
        note_prompt: '',
        note_interval: 1,
        note_position: 1,
        note_depth: 4,
        note_role: 0,
        tainted: false,
        integrity: crypto.randomUUID(),
      },
      user_name: settings.username || 'User',
      character_name: card?.name || chatFolder,
    };
    parsed = await writeParsedJsonlChat(filePath, header, []);
  } else {
    ensureChatBackup(filePath, chatFolder, false);
  }

  const isUser = payload.is_user !== undefined ? Boolean(payload.is_user) : true;
  const isSystem = Boolean(payload.is_system);
  let text = String(payload.mes ?? payload.text ?? '');
  const sendDate = payload.send_date || formatSillyTavernSendDate();
  const senderName =
    payload.name ||
    (isUser ? parsed.header?.user_name || 'User' : card?.name || chatFolder);

  // Run permanent (non-ephemeral) USER_INPUT regex scripts & text hygiene rules when appending a user message
  if (isUser && !isSystem && text) {
    if (!isGroup) {
      const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
      if (activeRegexScripts.length > 0) {
        text = applyRegexPipeline(text, activeRegexScripts, {
          placement: REGEX_PLACEMENT.USER_INPUT,
          isPermanent: true,
          depth: 0,
          charName: card?.nickname || card?.name || chatFolder,
          userName: senderName,
        });
      }
    }
    const aiCfg = readCustomizationConfig().chatAndAi;
    text = applyTextFormattingRules(text, {
      trimSpaces: aiCfg.trimSpaces,
      collapseNewlines: aiCfg.collapseNewlines,
      autoFixMarkdown: aiCfg.autoFixMarkdown,
      trimIncompleteSentences: false,
    });
  }

  const attachmentExtra = buildSillyTavernAttachmentExtra(payload.attachments);

  const newMsg = {
    name: senderName,
    is_user: isUser,
    is_system: isSystem,
    send_date: sendDate,
    mes: text,
    extra: {
      bias: '',
      reasoning: String(payload.reasoning || ''),
      token_count: estimateTokenCount(text),
      ...(payload.api ? { api: String(payload.api) } : {}),
      ...(payload.model ? { model: String(payload.model) } : {}),
      ...(typeof payload.reasoning_duration === 'number'
        ? { reasoning_duration: payload.reasoning_duration }
        : {}),
      ...(typeof payload.time_spent === 'number' ? { time_spent: payload.time_spent } : {}),
      ...(payload.fallback_info ? { fallback_info: payload.fallback_info } : {}),
      ...attachmentExtra,
      ...(payload.extra || {}),
    },
  };

  if (payload.gen_started) newMsg.gen_started = payload.gen_started;
  if (payload.gen_finished) newMsg.gen_finished = payload.gen_finished;

  if (!isUser) {
    newMsg.swipes = Array.isArray(payload.swipes) && payload.swipes.length > 0
      ? payload.swipes
      : [text];
    newMsg.swipe_id = Number(payload.swipe_id ?? 0);
    newMsg.swipe_info = newMsg.swipes.map((swText, sIdx) => ({
      send_date: sendDate,
      ...(payload.gen_started ? { gen_started: payload.gen_started } : {}),
      ...(payload.gen_finished ? { gen_finished: payload.gen_finished } : {}),
      extra: {
        bias: null,
        token_count: estimateTokenCount(swText),
        ...(sIdx === newMsg.swipe_id
          ? {
              ...(payload.api ? { api: String(payload.api) } : {}),
              ...(payload.model ? { model: String(payload.model) } : {}),
              ...(payload.reasoning ? { reasoning: String(payload.reasoning) } : {}),
              ...(typeof payload.reasoning_duration === 'number'
                ? { reasoning_duration: payload.reasoning_duration }
                : {}),
              ...(typeof payload.time_spent === 'number'
                ? { time_spent: payload.time_spent }
                : {}),
              ...(payload.fallback_info ? { fallback_info: payload.fallback_info } : {}),
            }
          : {}),
      },
    }));
  }

  if (payload.force_avatar) {
    newMsg.force_avatar = payload.force_avatar;
  }

  let headerDirty = false;
  if (isUser) {
    if (!parsed.header) {
      parsed.header = {
        chat_metadata: {},
        user_name: senderName,
        character_name: card?.name || chatFolder,
      };
      headerDirty = true;
    } else if (parsed.header.user_name !== senderName) {
      parsed.header.user_name = senderName;
      headerDirty = true;
    }
    const personaFile = payload.force_avatar
      ? extractPersonaFileFromForceAvatar(payload.force_avatar)
      : '';
    if (personaFile) {
      if (!parsed.header.chat_metadata) parsed.header.chat_metadata = {};
      if (parsed.header.chat_metadata.persona !== personaFile) {
        parsed.header.chat_metadata.persona = personaFile;
        headerDirty = true;
      }
    }
  }

  parsed.messages.push(newMsg);
  if (headerDirty) {
    await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  } else {
    fs.appendFileSync(filePath, `${JSON.stringify(newMsg)}\n`, 'utf8');
    const st = fs.statSync(filePath);
    parsed.mtimeMs = st.mtimeMs;
    parsed.size = st.size;
  }
  invalidateChatSummaryFileCache(filePath);

  const newIndex = parsed.messages.length - 1;
  return {
    chatFolder,
    fileName,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(newMsg, newIndex),
  };
}

export async function patchChatMessage(
  avatarOrFolder,
  fileName,
  messageIndex,
  patch = {},
  isGroup = false,
) {
  const { chatFolder, filePath, card } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, false);
  const msg = parsed.messages[idx];

  const ensureSwipeInfoAt = (sIdx, swText) => {
    if (!Array.isArray(msg.swipe_info)) msg.swipe_info = [];
    if (!msg.swipe_info[sIdx] || typeof msg.swipe_info[sIdx] !== 'object') {
      msg.swipe_info[sIdx] = {
        send_date: msg.send_date || formatSillyTavernSendDate(),
        extra: { bias: null, token_count: estimateTokenCount(swText) },
      };
    }
    if (!msg.swipe_info[sIdx].extra || typeof msg.swipe_info[sIdx].extra !== 'object') {
      msg.swipe_info[sIdx].extra = { bias: null };
    }
    return msg.swipe_info[sIdx];
  };

  const applySwipeMeta = (sInfo, swText) => {
    sInfo.extra.token_count = estimateTokenCount(swText);
    if (patch.gen_started) sInfo.gen_started = patch.gen_started;
    if (patch.gen_finished) sInfo.gen_finished = patch.gen_finished;
    if (patch.api) sInfo.extra.api = String(patch.api);
    if (patch.model) sInfo.extra.model = String(patch.model);
    if (patch.reasoning !== undefined) sInfo.extra.reasoning = String(patch.reasoning);
    if (typeof patch.reasoning_duration === 'number') {
      sInfo.extra.reasoning_duration = patch.reasoning_duration;
    }
    if (typeof patch.time_spent === 'number') {
      sInfo.extra.time_spent = patch.time_spent;
    }
    if (patch.fallback_info !== undefined) {
      if (patch.fallback_info) {
        sInfo.extra.fallback_info = patch.fallback_info;
      } else {
        delete sInfo.extra.fallback_info;
      }
    }
  };

  if (typeof patch.addSwipeText === 'string') {
    let swipeText = patch.addSwipeText;
    if (swipeText && !patch.gen_finished) {
      if (!isGroup) {
        const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
        if (activeRegexScripts.length > 0) {
          const editDepth = Math.max(0, parsed.messages.length - 1 - idx);
          swipeText = applyRegexPipeline(swipeText, activeRegexScripts, {
            placement: msg.is_user ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
            isPermanent: true,
            isEdit: true,
            depth: editDepth,
            charName: card?.nickname || card?.name || chatFolder,
            userName: parsed.header?.user_name || 'User',
          });
        }
      }
      const aiCfg = readCustomizationConfig().chatAndAi;
      swipeText = applyTextFormattingRules(swipeText, {
        trimSpaces: aiCfg.trimSpaces,
        collapseNewlines: aiCfg.collapseNewlines,
        autoFixMarkdown: aiCfg.autoFixMarkdown,
        trimIncompleteSentences: false,
      });
    }
    if (!Array.isArray(msg.swipes) || msg.swipes.length === 0) {
      const firstText = String(msg.mes ?? '');
      msg.swipes = [firstText];
      const s0 = ensureSwipeInfoAt(0, firstText);
      if (msg.extra?.reasoning && !s0.extra.reasoning) s0.extra.reasoning = msg.extra.reasoning;
      if (msg.extra?.api && !s0.extra.api) s0.extra.api = msg.extra.api;
      if (msg.extra?.model && !s0.extra.model) s0.extra.model = msg.extra.model;
      if (msg.extra?.reasoning_duration && !s0.extra.reasoning_duration) {
        s0.extra.reasoning_duration = msg.extra.reasoning_duration;
      }
      if (msg.extra?.fallback_info && !s0.extra.fallback_info) {
        s0.extra.fallback_info = msg.extra.fallback_info;
      }
      if (msg.gen_started && !s0.gen_started) s0.gen_started = msg.gen_started;
      if (msg.gen_finished && !s0.gen_finished) s0.gen_finished = msg.gen_finished;
    }
    msg.swipes.push(swipeText);
    msg.swipe_id = msg.swipes.length - 1;
    msg.mes = swipeText;
    const sendDate = patch.send_date || formatSillyTavernSendDate();
    msg.send_date = sendDate;
    const sInfo = ensureSwipeInfoAt(msg.swipe_id, swipeText);
    sInfo.send_date = sendDate;
    applySwipeMeta(sInfo, swipeText);
  }

  if (typeof patch.appendToActiveSwipe === 'string' && patch.appendToActiveSwipe.length > 0) {
    if (!Array.isArray(msg.swipes) || msg.swipes.length === 0) {
      msg.swipes = [String(msg.mes ?? '')];
    }
    const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
    const joinedText = `${String(msg.swipes[activeSwipeId] ?? msg.mes ?? '')}${patch.appendToActiveSwipe}`;
    msg.swipes[activeSwipeId] = joinedText;
    msg.mes = joinedText;
    const sInfo = ensureSwipeInfoAt(activeSwipeId, joinedText);
    sInfo.extra.token_count = estimateTokenCount(joinedText);
    if (patch.gen_finished) sInfo.gen_finished = patch.gen_finished;
    if (patch.api) sInfo.extra.api = String(patch.api);
    if (patch.model) sInfo.extra.model = String(patch.model);
    if (patch.fallback_info) sInfo.extra.fallback_info = patch.fallback_info;
    if (patch.reasoning) {
      sInfo.extra.reasoning = sInfo.extra.reasoning
        ? `${sInfo.extra.reasoning}\n\n${patch.reasoning}`
        : String(patch.reasoning);
    }
    if (!msg.extra) msg.extra = {};
    msg.extra.token_count = sInfo.extra.token_count;
  }

  if (patch.mes !== undefined || patch.text !== undefined) {
    let nextText = String(patch.mes ?? patch.text ?? '');
    if (nextText) {
      if (!isGroup) {
        const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
        if (activeRegexScripts.length > 0) {
          const editDepth = Math.max(0, parsed.messages.length - 1 - idx);
          nextText = applyRegexPipeline(nextText, activeRegexScripts, {
            placement: msg.is_user ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
            isPermanent: true,
            isEdit: true,
            depth: editDepth,
            charName: card?.nickname || card?.name || chatFolder,
            userName: parsed.header?.user_name || 'User',
          });
        }
      }
      const aiCfg = readCustomizationConfig().chatAndAi;
      nextText = applyTextFormattingRules(nextText, {
        trimSpaces: aiCfg.trimSpaces,
        collapseNewlines: aiCfg.collapseNewlines,
        autoFixMarkdown: aiCfg.autoFixMarkdown,
        trimIncompleteSentences: false,
      });
    }
    msg.mes = nextText;
    if (Array.isArray(msg.swipes) && msg.swipes.length > 0) {
      const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
      msg.swipes[activeSwipeId] = nextText;
      applySwipeMeta(ensureSwipeInfoAt(activeSwipeId, nextText), nextText);
    }
    if (!msg.extra) msg.extra = {};
    msg.extra.token_count = estimateTokenCount(nextText);
  }

  if (patch.reasoning !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.reasoning = String(patch.reasoning);
    if (Array.isArray(msg.swipes) && msg.swipes.length > 0) {
      const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
      ensureSwipeInfoAt(activeSwipeId, msg.swipes[activeSwipeId] || '').extra.reasoning = String(
        patch.reasoning,
      );
    }
  }

  if (patch.api !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.api = String(patch.api);
  }
  if (patch.model !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.model = String(patch.model);
  }
  if (patch.fallback_info !== undefined) {
    if (!msg.extra) msg.extra = {};
    if (patch.fallback_info) {
      msg.extra.fallback_info = patch.fallback_info;
    } else {
      delete msg.extra.fallback_info;
    }
  }

  if (patch.removeAttachmentIndex !== undefined) {
    const removeIdx = Number(patch.removeAttachmentIndex);
    const activeSwipeIdx =
      Array.isArray(msg.swipes) && msg.swipes.length > 0
        ? Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1))
        : -1;
    const activeSwipeObj =
      activeSwipeIdx >= 0 && Array.isArray(msg.swipe_info) ? msg.swipe_info[activeSwipeIdx] : null;

    const currentAtts = extractMessageAttachments(msg, activeSwipeObj);
    const remaining = currentAtts.filter((_, i) => i !== removeIdx);

    const clearExtraMediaKeys = (extraTarget) => {
      if (!extraTarget || typeof extraTarget !== 'object') return;
      delete extraTarget.media;
      delete extraTarget.media_display;
      delete extraTarget.media_index;
      delete extraTarget.image;
      delete extraTarget.image_swipes;
      delete extraTarget.inline_image;
      delete extraTarget.file;
      delete extraTarget.files;
    };

    if (!msg.extra || typeof msg.extra !== 'object') msg.extra = {};
    clearExtraMediaKeys(msg.extra);
    if (activeSwipeObj?.extra) {
      clearExtraMediaKeys(activeSwipeObj.extra);
    }

    if (remaining.length > 0) {
      Object.assign(msg.extra, buildSillyTavernAttachmentExtra(remaining));
    }
  }

  if (patch.name !== undefined) {
    msg.name = String(patch.name);
  }

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  invalidateChatSummaryFileCache(filePath);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(msg, idx),
  };
}

export async function deleteMessageSwipe(
  avatarOrFolder,
  fileName,
  messageIndex,
  swipeId,
  isGroup = false,
) {
  const { chatFolder, filePath } = resolveChatFilePath(avatarOrFolder, fileName, isGroup);
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const msg = parsed.messages[idx];
  if (!Array.isArray(msg.swipes) || msg.swipes.length <= 1) {
    throw new Error('Cannot delete the only swipe of a message');
  }

  const targetSwipe = Number(swipeId);
  if (!Number.isInteger(targetSwipe) || targetSwipe < 0 || targetSwipe >= msg.swipes.length) {
    throw new Error(`Swipe index ${swipeId} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, false);
  msg.swipes.splice(targetSwipe, 1);
  if (Array.isArray(msg.swipe_info) && targetSwipe < msg.swipe_info.length) {
    msg.swipe_info.splice(targetSwipe, 1);
  }

  const nextSwipeId = Math.max(0, Math.min(targetSwipe, msg.swipes.length - 1));
  msg.swipe_id = nextSwipeId;
  msg.mes = String(msg.swipes[nextSwipeId] ?? '');
  const activeInfo = Array.isArray(msg.swipe_info) ? msg.swipe_info[nextSwipeId] : null;
  if (activeInfo?.send_date) {
    msg.send_date = activeInfo.send_date;
  }
  if (!msg.extra) msg.extra = {};
  msg.extra.token_count = estimateTokenCount(msg.mes);
  msg.extra.reasoning = activeInfo?.extra?.reasoning ?? '';

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  invalidateChatSummaryFileCache(filePath);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(msg, idx),
  };
}

export async function deleteChatMessage(
  avatarOrFolder,
  fileName,
  messageIndex,
  options = {},
) {
  const { truncateTail = false, isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, true);
  if (truncateTail) {
    parsed.messages.splice(idx);
  } else {
    parsed.messages.splice(idx, 1);
  }

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  invalidateChatSummaryFileCache(filePath);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
  };
}

export async function deleteChatMessagesBatch(
  avatarOrFolder,
  fileName,
  messageIndices = [],
  options = {},
) {
  const { isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const rawList = Array.isArray(messageIndices) ? messageIndices : [];
  const validSet = new Set();
  for (const raw of rawList) {
    const idx = Number(raw);
    if (Number.isInteger(idx) && idx >= 0 && idx < parsed.messages.length) {
      validSet.add(idx);
    }
  }

  if (validSet.size === 0) {
    throw new Error('No valid message indices provided');
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, true);
  const nextMessages = parsed.messages.filter((_, idx) => !validSet.has(idx));
  const deletedCount = parsed.messages.length - nextMessages.length;

  await writeParsedJsonlChat(filePath, parsed.header, nextMessages);
  invalidateChatSummaryFileCache(filePath);

  return {
    chatFolder,
    fileName,
    backupFile,
    deletedCount,
    totalMessages: nextMessages.length,
  };
}

export async function createNewCharacterChat(avatarOrFolder, options = {}) {
  const {
    greetingIndex = 0,
    greetingText = null,
    introPortraitUrl = null,
    customFileName = null,
  } = options;
  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const activePersonaAvatar = settings?.user_avatar || '';
  const userName =
    (activePersonaAvatar && personasMap[activePersonaAvatar]) ||
    settings.username ||
    'User';
  const characterName = card?.name || chatFolder;
  const fileName = customFileName
    ? path.basename(customFileName)
    : formatSillyTavernChatFilename(characterName);
  const filePath = path.join(dirPath, fileName);

  const rawIdx = Math.max(0, Number(greetingIndex) || 0);
  const resolvedPortraitUrl =
    (typeof introPortraitUrl === 'string' && introPortraitUrl.trim()) ||
    card?.scenarioMeta?.introsMeta?.[rawIdx]?.portraitUrl ||
    null;

  const header = {
    chat_metadata: {
      note_prompt: '',
      note_interval: 1,
      note_position: 1,
      note_depth: 4,
      note_role: 0,
      tainted: false,
      timedWorldInfo: { sticky: {}, cooldown: {} },
      integrity: crypto.randomUUID(),
      ...(resolvedPortraitUrl ? { scenario_portrait_url: resolvedPortraitUrl } : {}),
    },
    user_name: userName,
    character_name: characterName,
  };

  const messages = [];
  if (card) {
    const rawGreetings = [
      String(card.first_mes ?? ''),
      ...(Array.isArray(card.alternate_greetings)
        ? card.alternate_greetings.map((g) => String(g ?? ''))
        : []),
    ];

    const customText = typeof greetingText === 'string' ? greetingText : null;
    if (customText !== null && customText.trim().length > 0 && rawIdx >= rawGreetings.length) {
      const sendDate = formatSillyTavernSendDate();
      messages.push({
        name: characterName,
        is_user: false,
        is_system: false,
        send_date: sendDate,
        mes: customText,
        swipes: [customText],
        swipe_id: 0,
        swipe_info: [{ send_date: sendDate, extra: { bias: null } }],
        extra: {
          bias: null,
          token_count: estimateTokenCount(customText),
        },
      });
    } else {
      const indexedGreetings = rawGreetings
        .map((text, idx) => ({ text, idx }))
        .filter((entry) => entry.text.trim().length > 0);

      if (indexedGreetings.length > 0) {
        const matchedPos = indexedGreetings.findIndex((entry) => entry.idx === rawIdx);
        const safeSwipePos =
          matchedPos >= 0
            ? matchedPos
            : Math.min(rawIdx, indexedGreetings.length - 1);
        const allGreetings = indexedGreetings.map((entry) => entry.text);
        const activeText =
          customText !== null && customText.trim().length > 0
            ? customText
            : allGreetings[safeSwipePos];
        if (customText !== null && customText.trim().length > 0) {
          allGreetings[safeSwipePos] = customText;
        }
        const sendDate = formatSillyTavernSendDate();
        messages.push({
          name: characterName,
          is_user: false,
          is_system: false,
          send_date: sendDate,
          mes: activeText,
          swipes: allGreetings,
          swipe_id: safeSwipePos,
          swipe_info: allGreetings.map(() => ({
            send_date: sendDate,
            extra: { bias: null },
          })),
          extra: {
            bias: null,
            token_count: estimateTokenCount(activeText),
          },
        });
      }
    }
  }

  await writeParsedJsonlChat(filePath, header, messages);
  return getChatWindow(avatarOrFolder, { fileName, limit: 20 });
}

/**
 * Creates a new branch (fork) from an existing `.jsonl` chat file.
 * Names the new file `<base> - Branch #<N>.jsonl` using the lowest unused N >= 1.
 * When `options.upToMessageIndex` is provided, keeps messages `0..upToMessageIndex`
 * inclusive and trims everything after it in the newly created branch.
 */
export async function branchCharacterChat(avatarOrFolder, sourceFileName, options = {}) {
  const { upToMessageIndex = null } = options || {};
  const { dirPath } = resolveCharacterChatDir(avatarOrFolder);
  const { fileName: resolvedSource, filePath: sourcePath } = resolveChatFilePath(
    avatarOrFolder,
    sourceFileName,
    false,
  );

  const parsed = readParsedJsonlChat(sourcePath);
  if (!parsed) {
    throw new Error(`Source chat "${resolvedSource}" not found`);
  }

  const sourceStem = resolvedSource.replace(/\.jsonl$/i, '');
  let baseStem = sourceStem
    .replace(/\s*-\s*Branch\s*#\d+$/i, '')
    .replace(/^Branch\s*#\d+\s*-\s*/i, '')
    .trim();
  if (!baseStem) {
    baseStem = sourceStem;
  }

  const existingFiles = new Set(
    fs.existsSync(dirPath)
      ? fs
          .readdirSync(dirPath, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'))
          .map((e) => e.name.toLowerCase())
      : [],
  );

  let branchNum = 1;
  let newFileName = `${baseStem} - Branch #${branchNum}.jsonl`;
  while (existingFiles.has(newFileName.toLowerCase())) {
    branchNum += 1;
    newFileName = `${baseStem} - Branch #${branchNum}.jsonl`;
  }

  const totalCount = parsed.messages.length;
  const hasCutoff =
    upToMessageIndex !== null &&
    upToMessageIndex !== undefined &&
    Number.isFinite(Number(upToMessageIndex));
  const forkMesIdx =
    totalCount === 0
      ? 0
      : hasCutoff
        ? Math.max(0, Math.min(Math.trunc(Number(upToMessageIndex)), totalCount - 1))
        : totalCount - 1;

  const sourceSlice =
    totalCount === 0 ? [] : parsed.messages.slice(0, forkMesIdx + 1);

  const newFilePath = path.join(dirPath, newFileName);
  const newHeader = {
    ...(parsed.header || {}),
    chat_metadata: {
      ...(parsed.header?.chat_metadata || {}),
      main_chat: sourceStem,
      bbFork: {
        parent: sourceStem,
        mesId: forkMesIdx,
      },
      integrity: crypto.randomUUID(),
    },
  };

  const clonedMessages = sourceSlice.map((m) => structuredClone(m));
  await writeParsedJsonlChat(newFilePath, newHeader, clonedMessages);

  return getChatWindow(avatarOrFolder, { fileName: newFileName, limit: 20 });
}

/**
 * Deletes one or more `.jsonl` chat files for a character (saving a backup first).
 */
export function deleteCharacterChatFiles(avatarOrFolder, fileNames = []) {
  const targets = Array.isArray(fileNames) ? fileNames : [fileNames];
  const uniqueNames = Array.from(
    new Set(
      targets
        .map((n) => path.basename(String(n || '').trim()))
        .filter((n) => n && n.toLowerCase().endsWith('.jsonl')),
    ),
  );

  if (uniqueNames.length === 0) {
    throw new Error('At least one valid .jsonl chat file is required');
  }

  const { chatFolder, dirPath } = resolveCharacterChatDir(avatarOrFolder);
  const deleted = [];

  for (const name of uniqueNames) {
    const filePath = path.join(dirPath, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      ensureChatBackup(filePath, chatFolder, true);
    } catch {
      // ignore backup error on delete
    }
    fs.unlinkSync(filePath);
    invalidateChatFileCache(filePath);
    clearChatBackupTimestamp(filePath);
    deleted.push(name);
  }

  const remaining = fs.existsSync(dirPath)
    ? fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl')).length
    : 0;

  return {
    chatFolder,
    deleted,
    deletedCount: deleted.length,
    remainingChatsCount: remaining,
  };
}

/**
 * Deletes every `.jsonl` chat file inside a character's chat directory (creating rotating
 * backups first) and invalidates both chat and card summary caches.
 */
export function deleteAllCharacterChats(avatarOrFolder) {
  const { chatFolder, dirPath } = resolveCharacterChatDir(avatarOrFolder);
  if (!fs.existsSync(dirPath)) {
    return {
      chatFolder,
      deleted: [],
      deletedCount: 0,
      remainingChatsCount: 0,
    };
  }

  const allJsonlNames = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'))
    .map((e) => e.name);

  if (allJsonlNames.length === 0) {
    return {
      chatFolder,
      deleted: [],
      deletedCount: 0,
      remainingChatsCount: 0,
    };
  }

  const result = deleteCharacterChatFiles(avatarOrFolder, allJsonlNames);
  invalidateCardStoreCaches();
  return result;
}

/**
 * Updates `header.chat_metadata` inside a `.jsonl` chat file (e.g. `world_info`, `persona`).
 */
export async function patchChatMetadata(
  avatarOrFolder,
  fileName,
  metadataPatch = {},
  isGroup = false,
) {
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const nextChatMeta = {
    ...(parsed.header?.chat_metadata || {}),
    ...(metadataPatch || {}),
  };
  Object.keys(nextChatMeta).forEach((k) => {
    if (nextChatMeta[k] === null) delete nextChatMeta[k];
  });

  const nextHeader = {
    ...(parsed.header || {}),
    chat_metadata: nextChatMeta,
  };

  await writeParsedJsonlChat(filePath, nextHeader, parsed.messages);
  invalidateChatSummaryFileCache(filePath);

  return {
    chatFolder,
    fileName,
    chatMetadata: nextChatMeta,
  };
}

/**
 * Replaces the active user persona across an existing `.jsonl` chat:
 * updates `header.user_name`, `header.chat_metadata.persona`, and every user message's
 * `name` + `force_avatar`, creating a safety backup beforehand.
 */
export async function replacePersonaInChat(
  avatarOrFolder,
  fileName,
  { personaAvatar, personaName, isGroup = false } = {},
) {
  const safePersonaAvatar = path.basename(String(personaAvatar || '').trim());
  if (!safePersonaAvatar) {
    throw new Error('Target personaAvatar is required');
  }

  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const resolvedPersonaName =
    String(personaName || '').trim() ||
    personasMap[safePersonaAvatar] ||
    safePersonaAvatar.replace(/\.(png|jpg|jpeg|webp)$/i, '') ||
    'User';

  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  ensureChatBackup(filePath, chatFolder, true);

  let updatedUserMessages = 0;
  for (const msg of parsed.messages) {
    if (msg && msg.is_user) {
      msg.name = resolvedPersonaName;
      msg.force_avatar = `User Avatars/${safePersonaAvatar}`;
      updatedUserMessages += 1;
    }
  }

  const nextChatMeta = {
    ...(parsed.header?.chat_metadata || {}),
  };
  if (updatedUserMessages > 0) {
    nextChatMeta.persona = safePersonaAvatar;
  } else {
    delete nextChatMeta.persona;
  }

  const nextHeader = {
    ...(parsed.header || {}),
    user_name: resolvedPersonaName,
    chat_metadata: nextChatMeta,
  };

  await writeParsedJsonlChat(filePath, nextHeader, parsed.messages);
  invalidateChatSummaryFileCache(filePath);

  const windowData = getChatWindow(avatarOrFolder, {
    fileName,
    limit: 20,
    isGroup,
  });

  return {
    updatedUserMessages,
    ...windowData,
  };
}







