import fs from 'node:fs';
import path from 'node:path';
import { getFullCharacterCard, readUserSettings } from './cardStore.js';
import {
  resolveChatFilePath,
  readParsedJsonlChat,
  resolveChatPersonaState,
  extractMessageAttachments,
  resolveStAssetDiskPath,
} from './chatStore.js';
import {
  getPresetByName,
  getConnectionAndPresetSettings,
  ST_DEFAULT_SYSTEM_PROMPTS,
} from './presetStore.js';
import { getApiHubState } from './apiHubStore.js';
import { readSession } from './sessionStore.js';
import {
  estimateTokens,
  resolveMacros,
  stripReasoningFromHistoryText,
  parseMesExampleBlocks,
} from './macroResolver.js';
import { scanWorldInfoForPrompt } from './worldInfoScanner.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readMessageRecapConfig } from './recapStore.js';
import { readCustomizationConfig } from './customizationStore.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../../src/core/regex/regexEngine.js';
import {
  normalizeRecapConfig,
  buildRecapSyntheticRegexScript,
} from '../../src/core/recap/recapEngine.js';
import { applyTextFormattingRules } from '../../src/core/messages/messageDecorator.js';

/**
 * Resolves the active user persona for a given character & chat from `settings.json`.
 * Placement in the compiled prompt is controlled exclusively by Prompt Manager (`personaDescription`).
 */
function resolveActivePersonaContext(settings, card, chatHeader = {}, chatMessages = []) {
  const pu = settings?.power_user || {};
  const personasMap = pu.personas || {};
  const descMap = pu.persona_descriptions || {};

  // Priority: 1. Persona active in existing chat, 2. Character-connected persona, 3. Active user_avatar
  const chatPersona = resolveChatPersonaState(
    { header: chatHeader, messages: chatMessages },
    settings,
  );
  let avatarKey = chatPersona.chatPersonaAvatar || '';

  if (!avatarKey && card?.avatar) {
    const stem = card.avatar.replace(/\.(png|json)$/i, '');
    for (const [pAvatar, meta] of Object.entries(descMap)) {
      const conns = Array.isArray(meta?.connections) ? meta.connections : [];
      const linked = conns.some(
        (c) =>
          c &&
          (c.id === card.avatar ||
            c.id === stem ||
            c.avatar === card.avatar ||
            c.name === card.name),
      );
      if (linked) {
        avatarKey = pAvatar;
        break;
      }
    }
  }

  if (!avatarKey) {
    avatarKey = settings?.user_avatar || Object.keys(personasMap)[0] || 'user-default.png';
  }
  avatarKey = path.basename(avatarKey);

  const meta = descMap[avatarKey] || {};
  const userName =
    personasMap[avatarKey] ||
    chatPersona.chatPersonaName ||
    avatarKey.replace(/\.(png|jpg|jpeg|webp)$/i, '') ||
    'User';

  return {
    avatar: avatarKey,
    userName: String(userName).trim() || 'User',
    description: String(meta.description || '').trim(),
  };
}

/**
 * Extracts normalized active message text from a SillyTavern `.jsonl` message entry.
 */
const MAX_PROMPT_TEXT_FILE_BYTES = 64 * 1024;
const MAX_VISION_MESSAGES = 4;
const VISION_MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

function readAttachmentTextForPrompt(att) {
  if (!att) return '';
  if (typeof att.textContent === 'string' && att.textContent.trim()) {
    return att.textContent.slice(0, MAX_PROMPT_TEXT_FILE_BYTES);
  }
  const diskPath = resolveStAssetDiskPath(att.stUrl || att.url || '');
  if (!diskPath || !fs.existsSync(diskPath)) return '';
  try {
    const st = fs.statSync(diskPath);
    const len = Math.min(st.size, MAX_PROMPT_TEXT_FILE_BYTES);
    if (len <= 0) return '';
    const fd = fs.openSync(diskPath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    return st.size > MAX_PROMPT_TEXT_FILE_BYTES
      ? `${text}\n… [File truncated at 64 KB]`
      : text;
  } catch {
    return '';
  }
}

function loadVisionImagePayload(att) {
  if (!att) return null;
  const rawUrl = String(att.stUrl || att.url || '').trim();
  if (!rawUrl) return null;

  if (rawUrl.startsWith('data:')) {
    const m = rawUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!m) return null;
    const mimeType = m[1].toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
      return null;
    }
    return { mimeType, base64Data: m[2].replace(/\s+/g, '') };
  }

  const diskPath = resolveStAssetDiskPath(rawUrl);
  if (!diskPath || !fs.existsSync(diskPath)) return null;
  const ext = path.extname(diskPath).replace(/^\./, '').toLowerCase();
  const mimeType = VISION_MIME_BY_EXT[ext];
  if (!mimeType) return null;

  try {
    const stat = fs.statSync(diskPath);
    if (stat.size <= 0 || stat.size > 20 * 1024 * 1024) return null;
    const buf = fs.readFileSync(diskPath);
    return { mimeType, base64Data: buf.toString('base64') };
  } catch {
    return null;
  }
}

function extractJsonlMessageText(msg) {
  if (!msg || typeof msg !== 'object') return '';
  if (Array.isArray(msg.swipes) && typeof msg.swipe_id === 'number' && msg.swipes[msg.swipe_id] !== undefined) {
    return String(msg.swipes[msg.swipe_id] ?? '');
  }
  return String(msg.mes ?? msg.text ?? '');
}

function buildFallbackCard(cardOverride) {
  if (cardOverride && typeof cardOverride === 'object') return cardOverride;
  return {
    name: 'Character',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    extensions: {},
  };
}

function squashConsecutiveSystemMessages(messages = []) {
  const out = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    const hasImages = Array.isArray(m.images) && m.images.length > 0;
    const prevHasImages = prev && Array.isArray(prev.images) && prev.images.length > 0;
    if (
      prev &&
      prev.role === 'system' &&
      m.role === 'system' &&
      prev.source !== 'dialogueExamples' &&
      m.source !== 'dialogueExamples' &&
      !hasImages &&
      !prevHasImages &&
      !prev.name &&
      !m.name
    ) {
      const mergedContent = `${prev.content}\n\n${m.content}`;
      out[out.length - 1] = {
        ...prev,
        content: mergedContent,
        label: `${prev.label} + ${m.label}`,
        tokens: estimateTokens(mergedContent),
      };
    } else {
      out.push(m);
    }
  }
  return out;
}

function applyPromptPostProcessing(messages = [], mode = '') {
  const cleanMode = String(mode || '')
    .trim()
    .toLowerCase();
  if (!cleanMode || messages.length === 0) return messages;

  const baseMode = cleanMode.replace(/_tools$/, '');

  if (baseMode === 'single') {
    const joined = messages
      .map((m) => String(m.content || '').trim())
      .filter(Boolean)
      .join('\n\n');
    const mergedImages = messages.flatMap((m) => (Array.isArray(m.images) ? m.images : []));
    return [
      {
        role: 'user',
        content: joined || '[Start roleplay]',
        ...(mergedImages.length > 0 ? { images: mergedImages } : {}),
        label: 'Single Consolidated Prompt',
        source: 'postProcessingSingle',
        tokens: estimateTokens(joined) + mergedImages.length * 256,
      },
    ];
  }

  // Convert mid-prompt system messages to user for semi / strict alternation
  let working = messages.map((m, idx) => {
    if (baseMode === 'strict') {
      if (m.role === 'system' && idx > 0) {
        return { ...m, role: 'user' };
      }
    } else if (baseMode === 'semi') {
      const hasPriorNonSystem = messages.slice(0, idx).some((x) => x.role !== 'system');
      if (m.role === 'system' && hasPriorNonSystem) {
        return { ...m, role: 'user' };
      }
    }
    return { ...m };
  });

  if (baseMode === 'strict' && working[0]?.role === 'system') {
    // Keep at most a single leading system block; if followed by system, merge below,
    // and ensure first non-system turn is user.
  }

  // Merge consecutive identical roles (merge / semi / strict)
  const merged = [];
  for (const m of working) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role && !prev.name && !m.name) {
      const nextText =
        prev.content && m.content
          ? `${prev.content}\n\n${m.content}`
          : prev.content || m.content;
      const nextImgs = [
        ...(Array.isArray(prev.images) ? prev.images : []),
        ...(Array.isArray(m.images) ? m.images : []),
      ];
      merged[merged.length - 1] = {
        ...prev,
        content: nextText,
        ...(nextImgs.length > 0 ? { images: nextImgs } : {}),
        tokens: estimateTokens(nextText) + nextImgs.length * 256,
      };
    } else {
      merged.push(m);
    }
  }

  if (baseMode === 'strict') {
    const firstNonSystemIdx = merged.findIndex((m) => m.role !== 'system');
    if (firstNonSystemIdx === -1) {
      const sys = merged[0];
      return sys ? [{ ...sys, role: 'user' }] : merged;
    }
    if (merged[firstNonSystemIdx].role === 'assistant') {
      merged.splice(firstNonSystemIdx, 0, {
        role: 'user',
        content: '[Start roleplay]',
        label: 'Strict Role Guard',
        source: 'postProcessingStrict',
        tokens: 4,
      });
    }
  }

  return merged;
}

function applyOverrideWithOriginal(presetPromptText, cardOverrideText, forbidOverrides = false) {
  const base = String(presetPromptText ?? '');
  const over = String(cardOverrideText ?? '').trim();
  if (forbidOverrides || !over) return base;
  if (over.includes('{{original}}')) {
    return over.replace(/\{\{original\}\}/gi, base);
  }
  return over;
}

/**
 * Compiles the complete 1-on-1 Chat Completion prompt array for LLM inference & Live Dry-Run inspection.
 */
export function compileChatPrompt({
  characterAvatar = '',
  cardOverride = null,
  chatFileName = '',
  messagesOverride = null,
  presetOverride = null,
  recapOverride = null,
  draftUserMessage = '',
  continueMode = false,
  historyEndExclusiveIndex = null,
} = {}) {
  const t0 = performance.now();
  const settings = readUserSettings();
  const hubState = getApiHubState();
  const presetSettings = getConnectionAndPresetSettings();
  const recapConfig = recapOverride
    ? normalizeRecapConfig(recapOverride)
    : readMessageRecapConfig();

  // 1. Load character card (disk or live unsaved override)
  const diskCard = characterAvatar ? getFullCharacterCard(characterAvatar) : null;
  const card = cardOverride
    ? { ...(diskCard || {}), ...cardOverride }
    : diskCard || buildFallbackCard(null);

  // 2. Load full `.jsonl` chat from disk (bypassing client Tail-First window)
  let chatHeader = { chat_metadata: {} };
  let rawChatMessages = [];

  if (characterAvatar && chatFileName) {
    try {
      const resolved = resolveChatFilePath(characterAvatar, chatFileName, false);
      const parsedChat = readParsedJsonlChat(resolved.filePath);
      if (parsedChat) {
        chatHeader = parsedChat.header || { chat_metadata: {} };
        rawChatMessages = Array.isArray(parsedChat.messages) ? parsedChat.messages : [];
      }
    } catch {
      // Fallback to messagesOverride or greeting
    }
  }

  if (rawChatMessages.length === 0 && Array.isArray(messagesOverride) && messagesOverride.length > 0) {
    rawChatMessages = messagesOverride.map((m) => ({
      name: m.name || m.sender,
      is_user: m.role === 'user' || Boolean(m.is_user ?? m.isUser),
      is_system: m.role === 'system' || Boolean(m.is_system),
      mes: m.text ?? m.mes ?? (Array.isArray(m.swipes) ? m.swipes[m.swipeId || 0] : '') ?? '',
    }));
  } else if (rawChatMessages.length === 0 && card.first_mes) {
    rawChatMessages = [
      {
        name: card.name || 'Character',
        is_user: false,
        mes: card.first_mes,
      },
    ];
  }

  if (
    historyEndExclusiveIndex !== null &&
    historyEndExclusiveIndex !== undefined &&
    Number.isInteger(Number(historyEndExclusiveIndex)) &&
    Number(historyEndExclusiveIndex) >= 0
  ) {
    rawChatMessages = rawChatMessages.slice(0, Number(historyEndExclusiveIndex));
  }

  // Append optional pending user message (for live preview or 4.4.3 generation)
  if (typeof draftUserMessage === 'string' && draftUserMessage.trim()) {
    rawChatMessages = [
      ...rawChatMessages,
      {
        name: chatHeader?.user_name || 'User',
        is_user: true,
        mes: draftUserMessage.trim(),
      },
    ];
  }

  // 3. Resolve active Persona & Preset
  const persona = resolveActivePersonaContext(settings, card, chatHeader, rawChatMessages);
  const charName = String(card.nickname || card.name || 'Character').trim();
  const userName = persona.userName;

  const activePresetName = presetSettings.activePresets?.openai || 'Default';
  const diskPreset = getPresetByName('openai', activePresetName);
  const sessionDraft =
    !presetOverride
      ? (() => {
          const draft = readSession()?.presetDraft;
          return draft &&
            draft.category === 'openai' &&
            draft.presetName === activePresetName
            ? draft
            : null;
        })()
      : null;
  const effectiveOverride = presetOverride || sessionDraft;
  const oaiData = {
    ...(diskPreset?.data || {}),
    ...(effectiveOverride?.data || {}),
  };
  const orderedPrompts = Array.isArray(effectiveOverride?.orderedPrompts)
    ? effectiveOverride.orderedPrompts
    : Array.isArray(diskPreset?.orderedPrompts) && diskPreset.orderedPrompts.length > 0
      ? diskPreset.orderedPrompts
      : ST_DEFAULT_SYSTEM_PROMPTS.map((p) => ({ ...p, enabled: true }));

  const maxContext = Math.min(
    2000000,
    Math.max(512, Number(oaiData.openai_max_context) || 16384),
  );
  const maxTokens = Math.min(
    256000,
    Math.max(16, Number(oaiData.openai_max_tokens) || 1000),
  );
  const tokenBudget = Math.max(256, maxContext - maxTokens);

  // 4. Build Macro Context
  const customizationCfg = readCustomizationConfig();
  const aiCfg = customizationCfg.chatAndAi;

  const varsMap = new Map(
    Object.entries(chatHeader?.chat_metadata?.variables || {}).map(([k, v]) => [k, String(v)]),
  );

  const nonSystemMessages = rawChatMessages.filter((m) => m && !m.is_system);
  const assistantIndices = [];
  nonSystemMessages.forEach((m, idx) => {
    if (!m.is_user) assistantIndices.push(idx);
  });
  const allowedReasoningIdxSet = new Set(
    aiCfg.reasoningIncludeInPrompts && aiCfg.reasoningMaxAdditions > 0
      ? assistantIndices.slice(-aiCfg.reasoningMaxAdditions)
      : [],
  );

  const normalizedHistoryAll = nonSystemMessages
    .map((m, idx) => {
      const isUser = Boolean(m.is_user);
      const rawText = extractJsonlMessageText(m);
      let cleanText = isUser ? rawText : stripReasoningFromHistoryText(rawText);
      cleanText = applyTextFormattingRules(cleanText, {
        trimSpaces: aiCfg.trimSpaces,
        collapseNewlines: aiCfg.collapseNewlines,
        autoFixMarkdown: false,
        trimIncompleteSentences: false,
      });
      if (!isUser && allowedReasoningIdxSet.has(idx)) {
        const extraReasoning = String(m?.extra?.reasoning || m?.reasoning || '').trim();
        if (extraReasoning) {
          cleanText = `<think>\n${extraReasoning}\n</think>\n\n${cleanText}`.trim();
        }
      }

      const directAtts = Array.isArray(m.attachments)
        ? m.attachments
        : extractMessageAttachments(m);
      const imageAtts = [];
      const fileBlocks = [];

      for (const att of directAtts) {
        if (!att) continue;
        if (att.kind === 'image') {
          imageAtts.push(att);
        } else if (att.kind === 'text' || att.kind === 'code') {
          const txt = readAttachmentTextForPrompt(att);
          if (txt) {
            fileBlocks.push(`[Attached File: ${att.name}]\n\`\`\`\n${txt}\n\`\`\``);
          } else {
            fileBlocks.push(`[Attached File: ${att.name}]`);
          }
        } else {
          fileBlocks.push(`[Attached File: ${att.name}]`);
        }
      }

      if (fileBlocks.length > 0) {
        cleanText = cleanText.trim()
          ? `${cleanText.trim()}\n\n${fileBlocks.join('\n\n')}`
          : fileBlocks.join('\n\n');
      }

      return {
        index: idx,
        role: isUser ? 'user' : 'assistant',
        speakerName: String(m.name || (isUser ? userName : charName)),
        rawContent: cleanText,
        imageAtts,
      };
    })
    .filter((m) => m.rawContent.trim().length > 0 || m.imageAtts.length > 0);

  const lastMsg = normalizedHistoryAll[normalizedHistoryAll.length - 1]?.rawContent || '';
  const lastUserMsg =
    [...normalizedHistoryAll].reverse().find((m) => m.role === 'user')?.rawContent || '';
  const lastCharMsg =
    [...normalizedHistoryAll].reverse().find((m) => m.role === 'assistant')?.rawContent || '';

  const baseMacroCtx = {
    charName,
    userName,
    modelId: hubState.activeModelId || '',
    variables: varsMap,
    lastMessage: lastMsg,
    lastUserMessage: lastUserMsg,
    lastCharMessage: lastCharMsg,
    mesExamplesRaw: card.mes_example || '',
    charSystemPrompt: card.system_prompt || '',
    charPostHistory: card.post_history_instructions || '',
  };

  const resolvedCharDesc = resolveMacros(card.description || '', baseMacroCtx).trim();
  const resolvedCharPers = resolveMacros(card.personality || '', baseMacroCtx).trim();
  const resolvedCharScen = resolveMacros(card.scenario || '', baseMacroCtx).trim();
  const resolvedPersonaDesc = resolveMacros(persona.description || '', baseMacroCtx).trim();

  const macroCtx = {
    ...baseMacroCtx,
    charDescription: resolvedCharDesc,
    charPersonality: resolvedCharPers,
    charScenario: resolvedCharScen,
    personaDescription: resolvedPersonaDesc,
    newExampleChatPrompt: oaiData.new_example_chat_prompt ?? '[Example Chat]',
  };

  // 5. Scan World Info against recent 12 messages
  const scanWindowText = normalizedHistoryAll
    .slice(-12)
    .map((m) => m.rawContent)
    .join('\n');

  const worldInfo = scanWorldInfoForPrompt({
    card,
    settings,
    chatMetadata: chatHeader?.chat_metadata || {},
    recentMessagesText: scanWindowText,
    wiFormat: String(oaiData.wi_format ?? '{0}'),
    macroCtx,
  });

  // Resolve active Regex stack (Global + Preset + Card) for Prompt-stage transformations
  const activeRegexScripts = resolveActiveRegexScriptsServer({
    card,
    oaiData,
    settings,
  });

  if (activeRegexScripts.length > 0) {
    if (worldInfo.beforeText) {
      worldInfo.beforeText = applyRegexPipeline(worldInfo.beforeText, activeRegexScripts, {
        placement: REGEX_PLACEMENT.WORLD_INFO,
        isPrompt: true,
        charName,
        userName,
      }).trim();
    }
    if (worldInfo.afterText) {
      worldInfo.afterText = applyRegexPipeline(worldInfo.afterText, activeRegexScripts, {
        placement: REGEX_PLACEMENT.WORLD_INFO,
        isPrompt: true,
        charName,
        userName,
      }).trim();
    }
    for (const dEntry of worldInfo.depthEntries) {
      if (dEntry && dEntry.content) {
        dEntry.content = applyRegexPipeline(dEntry.content, activeRegexScripts, {
          placement: REGEX_PLACEMENT.WORLD_INFO,
          isPrompt: true,
          depth: dEntry.injection_depth,
          charName,
          userName,
        }).trim();
      }
    }
  }

  // 6. Collect @Depth injections
  const depthInjections = [...worldInfo.depthEntries];

  const cardDepthPrompt = card.extensions?.depth_prompt;
  if (cardDepthPrompt && String(cardDepthPrompt.prompt || '').trim()) {
    const dpText = resolveMacros(cardDepthPrompt.prompt, macroCtx).trim();
    if (dpText) {
      depthInjections.push({
        identifier: 'characterDepthPrompt',
        name: "Character's Note (@Depth)",
        role: ['system', 'user', 'assistant'].includes(cardDepthPrompt.role)
          ? cardDepthPrompt.role
          : 'system',
        content: dpText,
        injection_depth: Number(cardDepthPrompt.depth ?? 4),
        injection_order: 100,
        source: 'characterDepthPrompt',
      });
    }
  }

  // 7. Walk Prompt Manager `orderedPrompts` into pre-history & post-history segments
  const preHistoryMessages = [];
  const postHistoryMessages = [];
  let seenChatHistoryMarker = false;

  const pushEntry = (targetArr, msgObj) => {
    const content = String(msgObj.content || '').trim();
    if (!content) return;
    targetArr.push({
      role: msgObj.role || 'system',
      ...(msgObj.name ? { name: msgObj.name } : {}),
      content,
      label: msgObj.label || msgObj.source || 'Prompt',
      source: msgObj.source || 'prompt',
      ...(msgObj.depth !== undefined ? { depth: msgObj.depth } : {}),
      tokens: estimateTokens(content),
    });
  };

  for (const p of orderedPrompts) {
    if (!p || !p.enabled) continue;
    const id = p.identifier;

    if (id === 'chatHistory') {
      seenChatHistoryMarker = true;
      continue;
    }

    if (!p.marker && Number(p.injection_position) === 1) {
      let rawContent = p.content || '';
      if (id === 'main') {
        rawContent = applyOverrideWithOriginal(
          rawContent,
          card.system_prompt,
          p.forbid_overrides || !aiCfg.preferCharacterPrompt,
        );
      } else if (id === 'jailbreak') {
        rawContent = applyOverrideWithOriginal(
          rawContent,
          card.post_history_instructions,
          p.forbid_overrides || !aiCfg.preferCharacterJailbreak,
        );
      }
      const expanded = resolveMacros(rawContent, { ...macroCtx, original: p.content || '' }).trim();
      if (expanded) {
        depthInjections.push({
          identifier: id,
          name: p.name || id,
          role: p.role || 'system',
          content: expanded,
          injection_depth: Number(p.injection_depth ?? 4),
          injection_order: Number(p.injection_order ?? 100),
          source: 'promptManagerDepth',
        });
      }
      continue;
    }

    const bucket = seenChatHistoryMarker ? postHistoryMessages : preHistoryMessages;

    if (p.marker) {
      if (id === 'charDescription' && resolvedCharDesc) {
        pushEntry(bucket, { role: 'system', content: resolvedCharDesc, label: `Char Description (${charName})`, source: 'charDescription' });
      } else if (id === 'charPersonality' && resolvedCharPers) {
        pushEntry(bucket, { role: 'system', content: resolveMacros(String(oaiData.personality_format || '{{personality}}'), macroCtx), label: 'Char Personality', source: 'charPersonality' });
      } else if (id === 'scenario' && resolvedCharScen) {
        pushEntry(bucket, { role: 'system', content: resolveMacros(String(oaiData.scenario_format || '{{scenario}}'), macroCtx), label: 'Scenario', source: 'scenario' });
      } else if (id === 'personaDescription' && resolvedPersonaDesc && persona.position === 0) {
        pushEntry(bucket, { role: persona.role || 'system', content: resolvedPersonaDesc, label: `Persona (${userName})`, source: 'personaDescription' });
      } else if (id === 'worldInfoBefore' && worldInfo.beforeText) {
        pushEntry(bucket, { role: 'system', content: worldInfo.beforeText, label: 'World Info (Before)', source: 'worldInfoBefore' });
      } else if (id === 'worldInfoAfter' && worldInfo.afterText) {
        pushEntry(bucket, { role: 'system', content: worldInfo.afterText, label: 'World Info (After)', source: 'worldInfoAfter' });
      } else if (
        id === 'dialogueExamples' &&
        card.mes_example &&
        aiCfg.exampleMessagesBehavior !== 'strip'
      ) {
        for (const ex of parseMesExampleBlocks(card.mes_example, macroCtx)) {
          pushEntry(bucket, { ...ex, source: 'dialogueExamples' });
        }
      }
      continue;
    }

    let rawPromptContent = p.content || '';
    if (id === 'main') {
      rawPromptContent = applyOverrideWithOriginal(
        rawPromptContent,
        card.system_prompt,
        p.forbid_overrides || !aiCfg.preferCharacterPrompt,
      );
    } else if (id === 'jailbreak') {
      rawPromptContent = applyOverrideWithOriginal(
        rawPromptContent,
        card.post_history_instructions,
        p.forbid_overrides || !aiCfg.preferCharacterJailbreak,
      );
    }

    pushEntry(bucket, {
      role: p.role || 'system',
      content: resolveMacros(rawPromptContent, { ...macroCtx, original: p.content || '' }),
      label: p.name || id,
      source: id,
    });
  }

  // 7.5. Inject native Message Recap prompts (Opening Rules & Closing Reminder)
  let recapOpeningBeforeHistory = null;
  if (recapConfig.enabled) {
    if (recapConfig.openingEnabled) {
      const openingText = resolveMacros(recapConfig.openingPrompt || '', macroCtx).trim();
      if (openingText) {
        if (recapConfig.openingPosition === 'depth') {
          depthInjections.push({
            identifier: 'messageRecapOpening',
            name: 'Message Recap (Opening Rules)',
            role: recapConfig.openingRole || 'system',
            content: openingText,
            injection_depth: Number(recapConfig.openingDepth ?? 4),
            injection_order: 90,
            source: 'messageRecapOpening',
          });
        } else {
          recapOpeningBeforeHistory = {
            role: recapConfig.openingRole || 'system',
            content: openingText,
            label: 'Message Recap (Opening Rules)',
            source: 'messageRecapOpening',
            tokens: estimateTokens(openingText),
          };
        }
      }
    }

    if (recapConfig.closingEnabled) {
      const closingText = resolveMacros(recapConfig.closingPrompt || '', macroCtx).trim();
      if (closingText) {
        if (recapConfig.closingPosition === 'depth') {
          depthInjections.push({
            identifier: 'messageRecapClosing',
            name: 'Message Recap (Closing Reminder)',
            role: recapConfig.closingRole || 'system',
            content: closingText,
            injection_depth: Number(recapConfig.closingDepth ?? 0),
            injection_order: 999,
            source: 'messageRecapClosing',
          });
        } else {
          pushEntry(postHistoryMessages, {
            role: recapConfig.closingRole || 'system',
            content: closingText,
            label: 'Message Recap (Closing Reminder)',
            source: 'messageRecapClosing',
          });
        }
      }
    }
  }

  const recapStripScript = buildRecapSyntheticRegexScript(recapConfig);
  const historyRegexScripts = recapStripScript
    ? [recapStripScript, ...activeRegexScripts]
    : activeRegexScripts;

  // 8. Budget tokens & select tail of chatHistory, then splice @Depth injections
  const fixedTokens =
    preHistoryMessages.reduce((s, m) => s + m.tokens, 0) +
    postHistoryMessages.reduce((s, m) => s + m.tokens, 0) +
    depthInjections.reduce((s, d) => s + estimateTokens(d.content), 0) +
    (recapOpeningBeforeHistory ? recapOpeningBeforeHistory.tokens : 0);

  const newChatBanner = resolveMacros(String(oaiData.new_chat_prompt ?? '[Start a new Chat]'), macroCtx).trim();
  const newChatBannerTokens = newChatBanner ? estimateTokens(newChatBanner) : 0;

  let remainingHistoryBudget = Math.max(64, tokenBudget - fixedTokens - newChatBannerTokens);
  const namesBehavior =
    oaiData.names_behavior !== undefined && oaiData.names_behavior !== null
      ? Number(oaiData.names_behavior)
      : oaiData.names_in_completion
        ? 2
        : 0;
  const mediaInliningEnabled = Boolean(
    oaiData.media_inlining ?? oaiData.image_inlining ?? true,
  );
  const inlineImageQuality = ['low', 'high'].includes(
    String(oaiData.inline_image_quality || '').toLowerCase(),
  )
    ? String(oaiData.inline_image_quality).toLowerCase()
    : 'auto';

  const formatSpeakerMessage = (text, h) => {
    const speaker = String(h.speakerName || '').trim();
    const startsWithSpeaker =
      speaker && text.toLowerCase().startsWith(`${speaker.toLowerCase()}:`);
    let formattedContent = text;
    let messageApiName = '';

    if (namesBehavior === 2 && speaker && !startsWithSpeaker) {
      formattedContent = `${speaker}: ${text}`;
    } else if (namesBehavior === 1 && speaker) {
      if (/^[a-zA-Z0-9_-]{1,64}$/.test(speaker)) {
        messageApiName = speaker;
      } else if (!startsWithSpeaker) {
        formattedContent = `${speaker}: ${text}`;
      }
    } else if (namesBehavior === 0 && speaker && !startsWithSpeaker) {
      const expectedSpeaker = h.role === 'user' ? userName : charName;
      if (speaker.toLowerCase() !== String(expectedSpeaker || '').trim().toLowerCase()) {
        formattedContent = `${speaker}: ${text}`;
      }
    }

    return { formattedContent, messageApiName };
  };

  const selectedHistoryReversed = [];
  let visionMessagesIncluded = 0;
  let historyTokensSum = 0;
  let historyTokensRawSum = 0;

  for (let i = normalizedHistoryAll.length - 1; i >= 0; i -= 1) {
    const h = normalizedHistoryAll[i];
    const msgDepth = normalizedHistoryAll.length - 1 - i;
    const rawResolvedMsg = resolveMacros(h.rawContent, macroCtx).trim();
    let resolvedMsg = rawResolvedMsg;
    if (resolvedMsg && historyRegexScripts.length > 0) {
      resolvedMsg = applyRegexPipeline(resolvedMsg, historyRegexScripts, {
        placement:
          h.role === 'user' ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
        isPrompt: true,
        depth: msgDepth,
        charName,
        userName,
      }).trim();
    }

    let resolvedImages = [];
    if (
      mediaInliningEnabled &&
      h.imageAtts.length > 0 &&
      visionMessagesIncluded < MAX_VISION_MESSAGES
    ) {
      resolvedImages = h.imageAtts
        .map(loadVisionImagePayload)
        .filter(Boolean)
        .map((img) => ({ ...img, detail: inlineImageQuality }));
      if (resolvedImages.length > 0) {
        visionMessagesIncluded += 1;
      }
    }

    const imageTokens = resolvedImages.length * 256;
    const rawEffectiveText = rawResolvedMsg || (resolvedImages.length > 0 ? '[Attached image]' : '');
    const rawMsgTok = rawEffectiveText
      ? estimateTokens(formatSpeakerMessage(rawEffectiveText, h).formattedContent) + imageTokens
      : 0;

    if (!resolvedMsg && resolvedImages.length === 0) {
      if (rawMsgTok > 0 && remainingHistoryBudget > 0) {
        historyTokensRawSum += rawMsgTok;
      }
      continue;
    }

    const effectiveText = resolvedMsg || '[Attached image]';
    const { formattedContent, messageApiName } = formatSpeakerMessage(effectiveText, h);
    const msgTok = estimateTokens(formattedContent) + imageTokens;

    if (selectedHistoryReversed.length > 0 && msgTok > remainingHistoryBudget) {
      break;
    }
    remainingHistoryBudget -= msgTok;
    historyTokensSum += msgTok;
    historyTokensRawSum += Math.max(msgTok, rawMsgTok);
    selectedHistoryReversed.push({
      role: h.role,
      ...(messageApiName ? { name: messageApiName } : {}),
      content: formattedContent,
      ...(resolvedImages.length > 0 ? { images: resolvedImages } : {}),
      label: `${h.speakerName} (#${h.index + 1})`,
      source: 'chatHistory',
      tokens: msgTok,
    });
  }

  const historySegment = selectedHistoryReversed.reverse();

  // Gradual push-out (`exampleMessagesBehavior === 'normal'`): once real chat history
  // overflows the budget, drop example dialogues so actual conversation wins tokens.
  const effectivePreHistory =
    aiCfg.exampleMessagesBehavior === 'normal' &&
    historySegment.length < normalizedHistoryAll.length
      ? preHistoryMessages.filter((m) => m.source !== 'dialogueExamples')
      : preHistoryMessages;

  // Sort @Depth injections: deepest first; same depth sorted by ascending order
  const sortedDepth = [...depthInjections].sort((a, b) => {
    const da = Number(a.injection_depth ?? 4);
    const db = Number(b.injection_depth ?? 4);
    if (db !== da) return db - da;
    return Number(a.injection_order ?? 100) - Number(b.injection_order ?? 100);
  });

  // Group by depth so insertions at depth D measure from the actual chat history tail
  const byDepth = new Map();
  for (const d of sortedDepth) {
    const depthVal = Math.max(0, Math.round(Number(d.injection_depth ?? 4)));
    if (!byDepth.has(depthVal)) byDepth.set(depthVal, []);
    byDepth.get(depthVal).push(d);
  }

  const baseChatCount = historySegment.length;
  // Insert from shallowest or deepest? Measure index from original history positions cleanly:
  const depthBucketsAsc = Array.from(byDepth.entries()).sort((a, b) => a[0] - b[0]);
  // Build final history with depth blocks placed before the D-th message from the end
  const historyWithDepth = [];
  const pushDepthGroup = (depthVal) => {
    const group = byDepth.get(depthVal);
    if (!group) return;
    for (const item of group) {
      historyWithDepth.push({
        role: item.role || 'system',
        content: item.content,
        label: item.name,
        source: item.source || 'depthInjection',
        depth: depthVal,
        tokens: estimateTokens(item.content),
      });
    }
  };

  // Any depth > baseChatCount goes right at the top of chat history
  for (const [dVal] of [...depthBucketsAsc].reverse()) {
    if (dVal > baseChatCount) pushDepthGroup(dVal);
  }
  for (let idx = 0; idx < baseChatCount; idx += 1) {
    const depthHere = baseChatCount - idx;
    if (byDepth.has(depthHere)) pushDepthGroup(depthHere);
    historyWithDepth.push(historySegment[idx]);
  }
  if (byDepth.has(0)) pushDepthGroup(0);

  if (recapOpeningBeforeHistory) {
    if (seenChatHistoryMarker) {
      historyWithDepth.unshift(recapOpeningBeforeHistory);
    } else {
      effectivePreHistory.push(recapOpeningBeforeHistory);
    }
  }

  if (newChatBanner && (historySegment.length > 0 || seenChatHistoryMarker)) {
    historyWithDepth.unshift({
      role: 'system',
      content: newChatBanner,
      label: 'New Chat Marker',
      source: 'newChatPrompt',
      tokens: newChatBannerTokens,
    });
  }

  let compiledMessages = [
    ...effectivePreHistory,
    ...(seenChatHistoryMarker ? historyWithDepth : []),
    ...postHistoryMessages,
  ];

  const continuePrefill = Boolean(oaiData.continue_prefill ?? false);
  const continuePostfix =
    oaiData.continue_postfix !== undefined && oaiData.continue_postfix !== null
      ? String(oaiData.continue_postfix)
      : ' ';

  if (continueMode && !continuePrefill) {
    const nudge = resolveMacros(
      String(oaiData.continue_nudge_prompt || '[Continue your last message without repeating yourself.]'),
      macroCtx,
    ).trim();
    if (nudge) {
      compiledMessages.push({
        role: 'system',
        content: nudge,
        label: 'Continue Nudge',
        source: 'continueNudge',
        tokens: estimateTokens(nudge),
      });
    }
  }

  const prefill = resolveMacros(String(oaiData.claude_assistant_prefill || ''), macroCtx).trim();
  if (prefill && !(continueMode && continuePrefill)) {
    compiledMessages.push({
      role: 'assistant',
      content: prefill,
      label: 'Assistant Prefill',
      source: 'assistantPrefill',
      tokens: estimateTokens(prefill),
    });
  }

  if (oaiData.squash_system_messages) {
    compiledMessages = squashConsecutiveSystemMessages(compiledMessages);
  }

  const postProcessingMode = String(oaiData.custom_prompt_post_processing || '').trim();
  if (postProcessingMode) {
    compiledMessages = applyPromptPostProcessing(compiledMessages, postProcessingMode);
  }

  const totalTokens = compiledMessages.reduce((s, m) => s + (m.tokens || 0), 0);
  const rawReasoningEffort = String(
    oaiData.reasoning_effort ?? oaiData.openai_reasoning_effort ?? 'auto',
  )
    .trim()
    .toLowerCase();

  return {
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
    providerId: hubState.activeProviderId,
    providerName: hubState.activeProviderName,
    modelId: hubState.activeModelId,
    modelName: hubState.activeModelName,
    presetName: activePresetName,
    charName,
    userName,
    samplers: {
      temperature: Number(oaiData.temperature ?? 1),
      top_p: Number(oaiData.top_p ?? 1),
      top_k: Number(oaiData.top_k ?? 0),
      min_p: Number(oaiData.min_p ?? 0),
      top_a: Number(oaiData.top_a ?? 0),
      frequency_penalty: Number(oaiData.freq_pen ?? oaiData.frequency_penalty ?? 0),
      presence_penalty: Number(oaiData.pres_pen ?? oaiData.presence_penalty ?? 0),
      repetition_penalty: Number(oaiData.repetition_penalty ?? 1),
      seed: Number(oaiData.seed ?? -1),
      max_tokens: maxTokens,
      max_context: maxContext,
      claude_use_sysprompt: Boolean(oaiData.claude_use_sysprompt ?? true),
      use_makersuite_sysprompt: Boolean(oaiData.use_makersuite_sysprompt ?? true),
      reasoning_effort: rawReasoningEffort || 'auto',
      verbosity: String(oaiData.verbosity || 'auto')
        .trim()
        .toLowerCase(),
      show_thoughts: Boolean(oaiData.show_thoughts ?? true),
      enable_web_search: Boolean(oaiData.enable_web_search ?? false),
      continue_prefill: continuePrefill,
      continue_postfix: continuePostfix,
      custom_prompt_post_processing: postProcessingMode,
      custom_include_body: String(oaiData.custom_include_body || ''),
      custom_exclude_body: String(oaiData.custom_exclude_body || ''),
      custom_include_headers: String(oaiData.custom_include_headers || ''),
      stream: Boolean(oaiData.stream_openai ?? true),
    },
    assistantPrefill: prefill,
    promptCaching: aiCfg.promptCaching,
    verbosePromptLogging: Boolean(customizationCfg.system?.verbosePromptLogging),
    stats: {
      totalTokens,
      maxContext,
      maxTokens,
      tokenBudget,
      budgetUsedPct: Math.min(100, Math.round((totalTokens / tokenBudget) * 100)),
      messageBlocksCount: compiledMessages.length,
      historyIncluded: historySegment.length,
      historyTotal: normalizedHistoryAll.length,
      historyTokens: historyTokensSum,
      historyTokensRaw: historyTokensRawSum,
      historyTokensSaved: Math.max(0, historyTokensRawSum - historyTokensSum),
      recapEnabled: Boolean(recapConfig.enabled),
      depthInjectionsCount: sortedDepth.length,
      worldInfoActivated: worldInfo.activatedCount,
    },
    messages: compiledMessages,
  };
}

