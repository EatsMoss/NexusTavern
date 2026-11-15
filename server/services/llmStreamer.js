import {
  getApiHubState,
  executeWithConnectionKeyFailover,
  resolveActiveGenerationTarget,
  verifyConnectionOnlineStatus,
} from './apiHubStore.js';
import { compileChatPrompt } from './promptCompiler.js';
import {
  resolveChatFilePath,
  readParsedJsonlChat,
  appendChatMessage,
  patchChatMessage,
  formatSillyTavernSendDate,
} from './chatStore.js';
import { resolveModelCapabilities } from './modelCapabilities.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readRefusalCatcherConfig } from './refusalStore.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../../src/core/regex/regexEngine.js';
import {
  DEFAULT_GEMINI_SAFETY_SETTINGS,
  applyAdditionalBodyParameters,
  applyAdditionalRequestHeaders,
} from '../../src/core/presets/additionalParameters.js';
import {
  detectRefusalInHead,
  detectRefusalInReasoningHeadings,
  detectGeminiFilterRefusal,
  startsWithRpMarker,
  formatRefusalErrorMessage,
  formatReasoningRefusalErrorMessage,
  formatFilterRefusalErrorMessage,
  buildFallbackRedirectInfo,
  formatAllModelsRefusedMessage,
  formatEmptyResponseErrorMessage,
} from '../../src/core/refusal/refusalEngine.js';

const CONNECT_TIMEOUT_MS = 45000;

/**
 * Streaming state machine that separates inline `<think>...</think>` or
 * `<thinking>...</thinking>` blocks at the start of an LLM response into
 * `onReasoning(delta)` vs `onText(delta)` without losing partial tag chunks.
 */
export function createInlineThinkSplitter({ onReasoning, onText }) {
  let state = 'init'; // 'init' | 'in_think' | 'body'
  let buffer = '';
  let activeCloseTag = '</think>';

  const OPEN_TAGS = [
    { open: '<think>', close: '</think>' },
    { open: '<thinking>', close: '</thinking>' },
    { open: '<reasoning>', close: '</reasoning>' },
  ];

  const flushInitAsBody = () => {
    state = 'body';
    if (buffer) {
      const out = buffer;
      buffer = '';
      onText(out);
    }
  };

  return {
    push(chunk) {
      if (!chunk) return;
      if (state === 'body') {
        onText(chunk);
        return;
      }

      buffer += chunk;

      if (state === 'init') {
        const trimmedStart = buffer.replace(/^\s+/, '');
        if (!trimmedStart) {
          if (buffer.length > 32) flushInitAsBody();
          return;
        }
        for (const tag of OPEN_TAGS) {
          if (trimmedStart.toLowerCase().startsWith(tag.open)) {
            const afterOpen = trimmedStart.slice(tag.open.length).replace(/^\r?\n/, '');
            activeCloseTag = tag.close;
            state = 'in_think';
            buffer = afterOpen;
            break;
          }
        }
        if (state === 'init') {
          const lower = trimmedStart.toLowerCase();
          const couldBePartialOpen = OPEN_TAGS.some(
            (t) => t.open.startsWith(lower) && lower.length < t.open.length,
          );
          if (!couldBePartialOpen) {
            flushInitAsBody();
          }
          return;
        }
      }

      if (state === 'in_think') {
        const lowerBuf = buffer.toLowerCase();
        const closeIdx = lowerBuf.indexOf(activeCloseTag);
        if (closeIdx !== -1) {
          const thoughtPart = buffer.slice(0, closeIdx);
          if (thoughtPart) onReasoning(thoughtPart);
          const rest = buffer.slice(closeIdx + activeCloseTag.length).replace(/^\s*\r?\n/, '');
          buffer = '';
          state = 'body';
          if (rest) onText(rest);
          return;
        }

        // Keep up to `activeCloseTag.length - 1` trailing chars in case close tag is split across chunks
        const holdLen = activeCloseTag.length - 1;
        if (buffer.length > holdLen) {
          const safeLen = buffer.length - holdLen;
          const emitPart = buffer.slice(0, safeLen);
          buffer = buffer.slice(safeLen);
          if (emitPart) onReasoning(emitPart);
        }
      }
    },
    finish() {
      if (!buffer) return;
      if (state === 'in_think') {
        onReasoning(buffer);
      } else {
        onText(buffer);
      }
      buffer = '';
    },
  };
}

function isSyntheticThinkPrefill(msg) {
  if (!msg || msg.role !== 'assistant' || msg.source === 'chatHistory') return false;
  const stripped = String(msg.content ?? '')
    .replace(/<\/?(?:think|thinking|reasoning)[^>]*>/gi, '')
    .replace(/[\s\u2800]+/g, '');
  return stripped.length === 0;
}

function formatOpenAiTurnContent(text, images = []) {
  if (!Array.isArray(images) || images.length === 0) {
    return text;
  }
  const parts = [];
  if (text) {
    parts.push({ type: 'text', text });
  }
  for (const img of images) {
    if (img?.mimeType && img?.base64Data) {
      const detail =
        img.detail === 'low' || img.detail === 'high' ? img.detail : undefined;
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64Data}`,
          ...(detail ? { detail } : {}),
        },
      });
    }
  }
  return parts.length > 0 ? parts : text;
}

function formatAnthropicTurnContent(text, images = []) {
  if (!Array.isArray(images) || images.length === 0) {
    return text;
  }
  const blocks = [];
  for (const img of images) {
    if (img?.mimeType && img?.base64Data) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.base64Data,
        },
      });
    }
  }
  if (text) {
    blocks.push({ type: 'text', text });
  }
  return blocks.length > 0 ? blocks : text;
}

function sanitizeMessagesForCapabilities(
  rawMessages,
  caps,
  { charName, continueMode, allowContinuePrefill = false },
) {
  const list = Array.isArray(rawMessages)
    ? rawMessages.map((m) => ({
        ...m,
        role: m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : 'system',
        content: String(m.content ?? ''),
        images: Array.isArray(m.images) ? m.images : [],
      }))
    : [];

  const allowTrailing = Boolean(
    caps.allowTrailingAssistant || (continueMode && allowContinuePrefill),
  );

  if (!allowTrailing) {
    while (list.length > 0 && isSyntheticThinkPrefill(list[list.length - 1])) {
      list.pop();
    }
    if (list.length > 0 && list[list.length - 1].source === 'continueNudge') {
      list[list.length - 1].role = 'user';
    }
    if (list.length > 0 && list[list.length - 1].role === 'assistant') {
      list.push({
        role: 'user',
        content: continueMode
          ? '[Continue your previous message seamlessly from where it left off without repeating yourself.]'
          : `[Continue the roleplay naturally as ${charName || 'Character'}.]`,
        source: 'trailingAssistantGuard',
      });
    }
  }

  return list;
}

function resolveOpenAiReasoningEffort(effortRaw, target, showThoughts = true) {
  const effort = String(effortRaw || 'auto')
    .trim()
    .toLowerCase();
  if (!effort || effort === 'auto') return undefined;

  const isOpenRouter = String(target?.routeId || '')
    .toLowerCase()
    .includes('openrouter');
  const modelLower = String(target?.upstreamModelId || '').toLowerCase();
  const isGpt5 = modelLower.startsWith('gpt-5') || modelLower.includes('/gpt-5');

  if (effort === 'min') {
    if (isOpenRouter && !showThoughts) return 'none';
    if (isOpenRouter || isGpt5) return 'minimal';
    return 'low';
  }
  if (effort === 'max') {
    return 'high';
  }
  if (['low', 'medium', 'high', 'minimal', 'none'].includes(effort)) {
    return effort;
  }
  return undefined;
}

function calculateClaudeThinkingConfig(maxTokens, effortRaw, caps) {
  const effort = String(effortRaw || 'auto')
    .trim()
    .toLowerCase();
  if (!effort || effort === 'auto' || !caps.isClaudeThinkingCapable) {
    return null;
  }

  if (caps.isClaudeAdaptive) {
    const mapped = effort === 'min' ? 'low' : effort;
    if (['low', 'medium', 'high', 'max'].includes(mapped)) {
      return { mode: 'adaptive', effort: mapped };
    }
    return null;
  }

  let budget = 0;
  switch (effort) {
    case 'min':
      budget = 1024;
      break;
    case 'low':
      budget = Math.floor(maxTokens * 0.1);
      break;
    case 'medium':
      budget = Math.floor(maxTokens * 0.25);
      break;
    case 'high':
      budget = Math.floor(maxTokens * 0.5);
      break;
    case 'max':
      budget = Math.floor(maxTokens * 0.95);
      break;
    default:
      return null;
  }
  budget = Math.max(1024, budget);
  return { mode: 'budget', budgetTokens: budget };
}

function calculateGeminiThinkingConfig(maxTokens, effortRaw, modelId = '', includeThoughts = true) {
  const m = String(modelId || '').toLowerCase();
  const effort = String(effortRaw || 'auto')
    .trim()
    .toLowerCase();
  const isGemini3 = m.includes('gemini-3') || m.includes('/gemini-3') || m.startsWith('3.');
  const isPro = m.includes('pro');

  const cfg = { includeThoughts: Boolean(includeThoughts) };

  if (isGemini3) {
    if (effort === 'min') cfg.thinkingLevel = isPro ? 'LOW' : 'MINIMAL';
    else if (effort === 'low') cfg.thinkingLevel = 'LOW';
    else if (effort === 'medium') cfg.thinkingLevel = isPro ? 'HIGH' : 'MEDIUM';
    else if (effort === 'high' || effort === 'max') cfg.thinkingLevel = 'HIGH';
    return cfg;
  }

  if (!effort || effort === 'auto') {
    return cfg;
  }

  let budget = -1;
  if (effort === 'min') {
    budget = isPro ? 128 : 0;
  } else if (effort === 'low') {
    budget = Math.max(isPro ? 128 : 0, Math.floor(maxTokens * 0.1));
  } else if (effort === 'medium') {
    budget = Math.max(isPro ? 128 : 0, Math.floor(maxTokens * 0.25));
  } else if (effort === 'high') {
    budget = Math.max(isPro ? 128 : 0, Math.floor(maxTokens * 0.5));
  } else if (effort === 'max') {
    budget = isPro ? 32768 : 24576;
  }

  if (budget >= 0) {
    cfg.thinkingBudget = Math.min(budget, isPro ? 32768 : 24576);
  }
  return cfg;
}

function buildOpenAiPayload(target, compiled, caps, continueMode = false) {
  const { samplers } = compiled;
  const allowContinuePrefill = Boolean(continueMode && samplers.continue_prefill);
  const sanitized = sanitizeMessagesForCapabilities(compiled.messages, caps, {
    charName: compiled.charName,
    continueMode,
    allowContinuePrefill,
  });

  let messages = [];
  if (caps.strictAlternation) {
    const systemLead = [];
    const dialogue = [];
    let seenDialogue = false;
    for (const m of sanitized) {
      const text = m.content.trim();
      const imgs = Array.isArray(m.images) ? m.images : [];
      if (!text && imgs.length === 0) continue;
      if (m.role === 'system' && !seenDialogue && imgs.length === 0) {
        systemLead.push(text);
      } else {
        seenDialogue = true;
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        if (dialogue.length > 0 && dialogue[dialogue.length - 1].role === role) {
          const prev = dialogue[dialogue.length - 1];
          prev.text = prev.text && text ? `${prev.text}\n\n${text}` : prev.text || text;
          prev.images.push(...imgs);
        } else {
          dialogue.push({ role, text, images: [...imgs] });
        }
      }
    }
    if (dialogue.length === 0 || dialogue[0].role !== 'user') {
      dialogue.unshift({ role: 'user', text: '[Start roleplay]', images: [] });
    }
    if (
      !caps.allowTrailingAssistant &&
      !allowContinuePrefill &&
      dialogue[dialogue.length - 1]?.role === 'assistant'
    ) {
      dialogue.push({
        role: 'user',
        text: continueMode
          ? '[Continue your previous message seamlessly without repeating yourself.]'
          : `[Continue the roleplay naturally as ${compiled.charName || 'Character'}.]`,
        images: [],
      });
    }
    if (systemLead.length > 0) {
      messages.push({ role: 'system', content: systemLead.join('\n\n') });
    }
    messages.push(
      ...dialogue.map((d) => ({
        role: d.role,
        content: formatOpenAiTurnContent(d.text, d.images),
      })),
    );
  } else {
    messages = sanitized
      .filter((m) => m.content.trim().length > 0 || (m.images && m.images.length > 0))
      .map((m) => ({
        role: m.role,
        ...(m.name ? { name: m.name } : {}),
        content: formatOpenAiTurnContent(m.content, m.images),
      }));
  }

  const body = {
    model: target.upstreamModelId,
    messages,
    stream: true,
    max_tokens: samplers.max_tokens,
  };

  if (caps.samplers.temperature) {
    body.temperature = Number(
      Math.min(caps.maxTemperature, Math.max(0, samplers.temperature)).toFixed(2),
    );
  }
  if (caps.samplers.top_p) {
    body.top_p = samplers.top_p;
  }
  if (caps.samplers.top_k && samplers.top_k > 0) {
    body.top_k = samplers.top_k;
  }
  if (caps.samplers.min_p && samplers.min_p > 0) {
    body.min_p = samplers.min_p;
  }
  if (caps.samplers.top_a && samplers.top_a > 0) {
    body.top_a = samplers.top_a;
  }
  if (caps.samplers.frequency_penalty && samplers.frequency_penalty) {
    body.frequency_penalty = samplers.frequency_penalty;
  }
  if (caps.samplers.presence_penalty && samplers.presence_penalty) {
    body.presence_penalty = samplers.presence_penalty;
  }
  if (caps.samplers.repetition_penalty && samplers.repetition_penalty > 1) {
    body.repetition_penalty = samplers.repetition_penalty;
  }
  if (caps.samplers.seed && Number.isInteger(samplers.seed) && samplers.seed >= 0) {
    body.seed = samplers.seed;
  }
  if (caps.samplers.reasoning_effort) {
    const resolvedEffort = resolveOpenAiReasoningEffort(
      samplers.reasoning_effort,
      target,
      samplers.show_thoughts !== false,
    );
    if (resolvedEffort) {
      body.reasoning_effort = resolvedEffort;
    }
  }
  if (
    caps.samplers.verbosity &&
    ['low', 'medium', 'high'].includes(samplers.verbosity)
  ) {
    body.verbosity = samplers.verbosity;
  }
  const isOpenRouterTarget =
    String(target?.routeId || '').toLowerCase().includes('openrouter') ||
    String(target?.endpointUrl || '').toLowerCase().includes('openrouter.ai');

  if (samplers.enable_web_search && isOpenRouterTarget) {
    body.plugins = [{ id: 'web' }];
  }
  if (isOpenRouterTarget && caps.profileId === 'gemini') {
    body.safety_settings = DEFAULT_GEMINI_SAFETY_SETTINGS.map((s) => ({ ...s }));
  }

  return body;
}

function buildAnthropicPayload(target, compiled, caps, continueMode = false) {
  const { samplers } = compiled;
  const useSysPrompt = samplers.claude_use_sysprompt !== false;
  const claudeThinking = calculateClaudeThinkingConfig(
    samplers.max_tokens,
    samplers.reasoning_effort,
    caps,
  );
  const allowContinuePrefill = Boolean(
    continueMode && samplers.continue_prefill && !claudeThinking && !caps.isClaudeAdaptive,
  );

  const sanitized = sanitizeMessagesForCapabilities(compiled.messages, caps, {
    charName: compiled.charName,
    continueMode,
    allowContinuePrefill,
  });

  const systemParts = [];
  const rawTurns = [];
  let seenDialogue = false;

  for (const m of sanitized) {
    const text = String(m.content ?? '').trim();
    const imgs = Array.isArray(m.images) ? m.images : [];
    if (!text && imgs.length === 0) continue;
    if (m.role === 'system' && useSysPrompt && !seenDialogue && imgs.length === 0) {
      systemParts.push(text);
    } else {
      seenDialogue = true;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (rawTurns.length > 0 && rawTurns[rawTurns.length - 1].role === role) {
        const prev = rawTurns[rawTurns.length - 1];
        prev.text = prev.text && text ? `${prev.text}\n\n${text}` : prev.text || text;
        prev.images.push(...imgs);
      } else {
        rawTurns.push({ role, text, images: [...imgs] });
      }
    }
  }

  if (rawTurns.length === 0 || rawTurns[0].role !== 'user') {
    rawTurns.unshift({ role: 'user', text: '[Start roleplay]', images: [] });
  }
  const forbidTrailingAssistant =
    Boolean(claudeThinking) || (!caps.allowTrailingAssistant && !allowContinuePrefill);
  if (forbidTrailingAssistant && rawTurns[rawTurns.length - 1]?.role === 'assistant') {
    rawTurns.push({
      role: 'user',
      text: continueMode
        ? '[Continue your previous message seamlessly without repeating yourself.]'
        : `[Continue the roleplay naturally as ${compiled.charName || 'Character'}.]`,
      images: [],
    });
  }

  const body = {
    model: target.upstreamModelId,
    max_tokens: samplers.max_tokens,
    stream: true,
    messages: rawTurns.map((t) => ({
      role: t.role,
      content: formatAnthropicTurnContent(t.text, t.images),
    })),
  };

  if (caps.samplers.temperature) {
    body.temperature = Number(Math.min(1, Math.max(0, samplers.temperature)).toFixed(2));
  }
  if (systemParts.length > 0) {
    body.system = systemParts.join('\n\n');
  }
  if (caps.samplers.top_k && samplers.top_k > 0) {
    body.top_k = samplers.top_k;
  }

  const anthropicBetas = [];
  if (claudeThinking?.mode === 'adaptive') {
    body.thinking = { type: 'adaptive' };
    body.output_config = { ...(body.output_config || {}), effort: claudeThinking.effort };
    delete body.top_k;
  } else if (claudeThinking?.mode === 'budget') {
    const budgetTokens = claudeThinking.budgetTokens;
    if (body.max_tokens <= budgetTokens) {
      body.max_tokens = budgetTokens + Math.max(1024, samplers.max_tokens);
    }
    body.thinking = {
      type: 'enabled',
      budget_tokens: budgetTokens,
    };
    delete body.temperature;
    delete body.top_p;
    delete body.top_k;
  }

  if (
    caps.samplers.verbosity &&
    ['low', 'medium', 'high'].includes(samplers.verbosity) &&
    !body.output_config?.effort
  ) {
    anthropicBetas.push('effort-2025-11-24');
    body.output_config = { ...(body.output_config || {}), effort: samplers.verbosity };
  }

  if (caps.samplers.web_search && samplers.enable_web_search) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  if (anthropicBetas.length > 0) {
    Object.defineProperty(body, '_anthropicBetas', {
      value: anthropicBetas,
      enumerable: false,
    });
  }

  return body;
}

function buildGeminiPayload(target, compiled, caps, continueMode = false) {
  const { samplers } = compiled;
  const useSysPrompt = samplers.use_makersuite_sysprompt !== false;
  const sanitized = sanitizeMessagesForCapabilities(compiled.messages, caps, {
    charName: compiled.charName,
    continueMode,
  });

  const systemParts = [];
  const contents = [];
  let seenDialogue = false;

  for (const m of sanitized) {
    const text = String(m.content ?? '').trim();
    const imgs = Array.isArray(m.images) ? m.images : [];
    if (!text && imgs.length === 0) continue;
    if (m.role === 'system' && useSysPrompt && !seenDialogue && imgs.length === 0) {
      systemParts.push({ text });
    } else {
      seenDialogue = true;
      const role = m.role === 'assistant' ? 'model' : 'user';
      const turnParts = [];
      for (const img of imgs) {
        if (img?.mimeType && img?.base64Data) {
          turnParts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: img.base64Data,
            },
          });
        }
      }
      if (text) {
        turnParts.push({ text });
      }
      if (turnParts.length === 0) continue;
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push(...turnParts);
      } else {
        contents.push({ role, parts: turnParts });
      }
    }
  }

  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '[Start roleplay]' }] });
  }
  if (!caps.allowTrailingAssistant && contents[contents.length - 1]?.role === 'model') {
    contents.push({
      role: 'user',
      parts: [
        {
          text: continueMode
            ? '[Continue your previous message seamlessly without repeating yourself.]'
            : `[Continue the roleplay naturally as ${compiled.charName || 'Character'}.]`,
        },
      ],
    });
  }

  const generationConfig = {
    maxOutputTokens: samplers.max_tokens,
  };
  if (caps.samplers.temperature) {
    generationConfig.temperature = Number(
      Math.min(caps.maxTemperature, Math.max(0, samplers.temperature)).toFixed(2),
    );
  }
  if (caps.samplers.top_p) {
    generationConfig.topP = samplers.top_p;
  }
  if (caps.samplers.top_k && samplers.top_k > 0) {
    generationConfig.topK = samplers.top_k;
  }
  if (caps.samplers.seed && Number.isInteger(samplers.seed) && samplers.seed >= 0) {
    generationConfig.seed = samplers.seed;
  }
  if (
    caps.samplers.reasoning_effort &&
    (target.supportsReasoning || (samplers.reasoning_effort && samplers.reasoning_effort !== 'auto'))
  ) {
    generationConfig.thinkingConfig = calculateGeminiThinkingConfig(
      samplers.max_tokens,
      samplers.reasoning_effort,
      target.upstreamModelId,
      samplers.show_thoughts !== false,
    );
  } else if (samplers.show_thoughts !== false && target.supportsReasoning) {
    generationConfig.thinkingConfig = { includeThoughts: true };
  }

  const body = {
    contents,
    generationConfig,
    safetySettings: DEFAULT_GEMINI_SAFETY_SETTINGS.map((s) => ({ ...s })),
  };

  if (caps.samplers.web_search && samplers.enable_web_search) {
    body.tools = [{ google_search: {} }];
  }

  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }

  return body;
}

function buildHeadersForProtocol(
  target,
  apiKey,
  payload = null,
  customIncludeHeadersRaw = '',
) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream, application/json',
  };

  if (target.protocol === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    if (Array.isArray(payload?._anthropicBetas) && payload._anthropicBetas.length > 0) {
      headers['anthropic-beta'] = payload._anthropicBetas.join(',');
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      if (target.connectionType === 'rp_proxy') {
        headers.Authorization = `Bearer ${apiKey}`;
      }
    }
  } else if (target.protocol === 'gemini') {
    if (apiKey) {
      headers['x-goog-api-key'] = apiKey;
      if (target.connectionType === 'rp_proxy') {
        headers.Authorization = `Bearer ${apiKey}`;
      }
    }
  } else {
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    headers['HTTP-Referer'] = 'https://nexustavern.local';
    headers['X-Title'] = 'NexusTavern';
  }

  applyAdditionalRequestHeaders(headers, customIncludeHeadersRaw);

  return headers;
}

function parseProtocolSseDataPayload(protocol, json, emitNativeReasoning, pushRawText) {
  if (!json || typeof json !== 'object') return;

  if (json.error) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : json.error.message || JSON.stringify(json.error);
    const err = new Error(msg);
    const filterHit = detectGeminiFilterRefusal({ error: json.error, message: msg });
    if (filterHit) {
      err.filterBlock = filterHit.matchedFilter;
    }
    throw err;
  }

  if (protocol === 'anthropic') {
    if (json.type === 'error' && json.error) {
      throw new Error(json.error.message || 'Anthropic stream error');
    }
    if (json.type === 'content_block_start' && json.content_block) {
      if (json.content_block.type === 'thinking' && json.content_block.thinking) {
        emitNativeReasoning(String(json.content_block.thinking));
      } else if (json.content_block.type === 'text' && json.content_block.text) {
        pushRawText(String(json.content_block.text));
      }
    } else if (json.type === 'content_block_delta' && json.delta) {
      if (json.delta.type === 'thinking_delta' && json.delta.thinking) {
        emitNativeReasoning(String(json.delta.thinking));
      } else if (json.delta.type === 'text_delta' && json.delta.text) {
        pushRawText(String(json.delta.text));
      }
    }
    return;
  }

  if (protocol === 'gemini') {
    const geminiFilterHit = detectGeminiFilterRefusal(json);
    if (geminiFilterHit) {
      const err = new Error(
        `Gemini blocked generation (${geminiFilterHit.matchedFilter})`,
      );
      err.filterBlock = geminiFilterHit.matchedFilter;
      throw err;
    }
    if (json.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked prompt: ${json.promptFeedback.blockReason}`);
    }
    const candidate = Array.isArray(json.candidates) ? json.candidates[0] : null;
    if (!candidate) return;
    const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
    let hasBodyText = false;
    for (const part of parts) {
      if (!part || typeof part.text !== 'string' || !part.text) continue;
      if (part.thought === true) {
        emitNativeReasoning(part.text);
      } else {
        hasBodyText = true;
        pushRawText(part.text);
      }
    }
    if (
      !hasBodyText &&
      candidate.finishReason &&
      !['STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)
    ) {
      throw new Error(`Gemini stopped generation (${candidate.finishReason})`);
    }
    return;
  }

  // OpenAI-compatible SSE (`choices[0].delta` or non-stream fallback `choices[0].message`)
  const oaiFilterHit = detectGeminiFilterRefusal(json);
  if (oaiFilterHit) {
    const err = new Error(`Generation blocked (${oaiFilterHit.matchedFilter})`);
    err.filterBlock = oaiFilterHit.matchedFilter;
    throw err;
  }

  const choice = Array.isArray(json.choices) ? json.choices[0] : null;
  if (!choice) return;
  const delta = choice.delta || choice.message || {};

  const nativeReason =
    delta.reasoning_content ?? delta.reasoning ?? delta.thought ?? null;
  if (typeof nativeReason === 'string' && nativeReason.length > 0) {
    emitNativeReasoning(nativeReason);
  }

  if (typeof delta.content === 'string' && delta.content.length > 0) {
    pushRawText(delta.content);
  } else if (Array.isArray(delta.content)) {
    for (const block of delta.content) {
      if (!block) continue;
      if ((block.type === 'thinking' || block.type === 'reasoning') && block.text) {
        emitNativeReasoning(String(block.text));
      } else if (typeof block.text === 'string' && block.text) {
        pushRawText(block.text);
      }
    }
  }
}

async function openUpstreamStreamWithFailover(
  target,
  payload,
  signal,
  customIncludeHeadersRaw = '',
) {
  return executeWithConnectionKeyFailover(target.connectionId, async ({ apiKey }) => {
    if (signal?.aborted) {
      const abErr = new Error('Generation stopped by user');
      abErr.name = 'AbortError';
      throw abErr;
    }

    const connectCtrl = new AbortController();
    const timeoutId = setTimeout(() => connectCtrl.abort(), CONNECT_TIMEOUT_MS);
    const onExternalAbort = () => connectCtrl.abort();
    if (signal) signal.addEventListener('abort', onExternalAbort, { once: true });

    const cleanKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    const requestUrl =
      target.protocol === 'gemini' && cleanKey
        ? `${target.endpointUrl}${target.endpointUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(cleanKey)}`
        : target.endpointUrl;

    try {
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: buildHeadersForProtocol(
          target,
          cleanKey,
          payload,
          customIncludeHeadersRaw,
        ),
        body: JSON.stringify(payload),
        signal: connectCtrl.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let bodyJson = null;
        try {
          bodyJson = errText ? JSON.parse(errText) : null;
        } catch {
          bodyJson = null;
        }
        const cleanMsg =
          bodyJson?.error?.message ||
          (typeof bodyJson?.error === 'string' ? bodyJson.error : '') ||
          bodyJson?.message ||
          errText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) ||
          `HTTP ${res.status}`;
        const err = new Error(`${target.connectionName} (${res.status}): ${cleanMsg}`);
        err.httpStatus = res.status;
        err.bodyJson = bodyJson;
        const filterHit = detectGeminiFilterRefusal({
           ...(bodyJson && typeof bodyJson === 'object' ? bodyJson : {}),
          httpErrorMessage: cleanMsg,
          errText,
        });
        if (filterHit) {
          err.filterBlock = filterHit.matchedFilter;
        }
        throw err;
      }

      return { res, onExternalAbort };
    } catch (err) {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      if (err.name === 'AbortError' && !signal?.aborted) {
        const tErr = new Error(
          `Upstream timed out waiting for first byte (${Math.round(CONNECT_TIMEOUT_MS / 1000)}s)`,
        );
        tErr.httpStatus = 0;
        throw tErr;
      }
      throw err;
    }
  });
}

async function readUpstreamSseBody({ res, protocol, signal, emitReasoning, inlineSplitter }) {
  let stoppedByUser = false;
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();

  if (!res.body || contentType.includes('application/json')) {
    const fullJson = await res.json().catch(() => null);
    if (fullJson) {
      parseProtocolSseDataPayload(protocol, fullJson, emitReasoning, (raw) =>
        inlineSplitter.push(raw),
      );
    }
    return { stoppedByUser };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuf = '';

  const cancelReaderOnAbort = () => {
    stoppedByUser = true;
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) {
      stoppedByUser = true;
      await reader.cancel().catch(() => {});
      return { stoppedByUser };
    }
    signal.addEventListener('abort', cancelReaderOnAbort, { once: true });
  }

  try {
    while (true) {
      if (signal?.aborted) {
        stoppedByUser = true;
        await reader.cancel().catch(() => {});
        break;
      }
      const { value, done } = await reader.read();
      if (done) break;

      lineBuf += decoder.decode(value, { stream: true });
      const lines = lineBuf.split(/\r?\n/);
      lineBuf = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        let parsedChunk = null;
        try {
          parsedChunk = JSON.parse(dataStr);
        } catch {
          parsedChunk = null;
        }
        if (parsedChunk) {
          parseProtocolSseDataPayload(protocol, parsedChunk, emitReasoning, (raw) =>
            inlineSplitter.push(raw),
          );
        }
      }
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', cancelReaderOnAbort);
    }
  }

  const tail = lineBuf.trim();
  if (tail.startsWith('data:')) {
    const dataStr = tail.slice(5).trim();
    if (dataStr && dataStr !== '[DONE]') {
      try {
        parseProtocolSseDataPayload(protocol, JSON.parse(dataStr), emitReasoning, (raw) =>
          inlineSplitter.push(raw),
        );
      } catch {
        // ignore incomplete trailing fragment
      }
    }
  }

  return { stoppedByUser };
}

async function persistGeneratedOutput({
  persist,
  characterAvatar,
  chatFileName,
  normalizedMode,
  resolvedIdx,
  charName,
  finalCleanText,
  finalCleanReasoning,
  reasoningDurationMs,
  genStartedIso,
  genFinishedIso,
  durationMs,
  target,
  fallbackInfo = null,
}) {
  const hasAnyOutput = finalCleanText.length > 0 || finalCleanReasoning.length > 0;
  if (!persist || !characterAvatar || !chatFileName || !hasAnyOutput) {
    return null;
  }

  const metaFields = {
    api: target.connectionName,
    model: target.modelName,
    reasoning: finalCleanReasoning,
    ...(reasoningDurationMs ? { reasoning_duration: reasoningDurationMs } : {}),
    gen_started: genStartedIso,
    gen_finished: genFinishedIso,
    time_spent: durationMs,
    send_date: formatSillyTavernSendDate(),
    ...(normalizedMode === 'continue'
      ? fallbackInfo
        ? { fallback_info: fallbackInfo }
        : {}
      : { fallback_info: fallbackInfo || null }),
  };

  if (normalizedMode === 'swipe' && resolvedIdx !== null) {
    return patchChatMessage(characterAvatar, chatFileName, resolvedIdx, {
      addSwipeText: finalCleanText,
      ...metaFields,
    });
  }
  if (normalizedMode === 'continue' && resolvedIdx !== null) {
    return patchChatMessage(characterAvatar, chatFileName, resolvedIdx, {
      appendToActiveSwipe: finalCleanText,
      ...metaFields,
    });
  }
  return appendChatMessage(characterAvatar, chatFileName, {
    name: charName,
    is_user: false,
    mes: finalCleanText,
    ...metaFields,
  });
}

async function executeSingleTargetAttempt({
  target,
  compiled,
  normalizedMode,
  resolvedIdx,
  baseContinueText,
  refusalConfig,
  signal,
  onEvent,
}) {
  const caps = resolveModelCapabilities({
    modelId: target.upstreamModelId,
    protocol: target.protocol,
    routeId: target.routeId,
    connectionType: target.connectionType,
  });
  const isCont = normalizedMode === 'continue';

  const payload =
    target.protocol === 'anthropic'
      ? buildAnthropicPayload(target, compiled, caps, isCont)
      : target.protocol === 'gemini'
        ? buildGeminiPayload(target, compiled, caps, isCont)
        : buildOpenAiPayload(target, compiled, caps, isCont);

  applyAdditionalBodyParameters(payload, {
    includeRaw: compiled.samplers.custom_include_body,
    excludeRaw: compiled.samplers.custom_exclude_body,
    protocol: target.protocol,
  });

  const prefillPrefix =
    target.protocol === 'anthropic' &&
    caps.allowTrailingAssistant &&
    compiled.assistantPrefill &&
    !isCont
      ? `${compiled.assistantPrefill}`
      : '';

  const clientStreamEnabled = compiled.samplers.stream !== false;
  const showThoughts = compiled.samplers.show_thoughts !== false;
  const refusalStreamHoldActive =
    Boolean(refusalConfig.enabled) &&
    refusalConfig.bannedPhrases.length > 0 &&
    clientStreamEnabled;

  const streamAbortCtrl = new AbortController();
  const forwardExternalAbort = () => {
    if (!streamAbortCtrl.signal.aborted) {
      streamAbortCtrl.abort();
    }
  };
  if (signal) {
    if (signal.aborted) {
      streamAbortCtrl.abort();
    } else {
      signal.addEventListener('abort', forwardExternalAbort, { once: true });
    }
  }

  onEvent({
    type: 'phase',
    phase: 'waiting',
    streaming: clientStreamEnabled,
  });

  const connectStartMs = performance.now();
  let res;
  let onExternalAbort;
  try {
    const opened = await openUpstreamStreamWithFailover(
      target,
      payload,
      streamAbortCtrl.signal,
      compiled.samplers.custom_include_headers,
    );
    res = opened.res;
    onExternalAbort = opened.onExternalAbort;
  } catch (err) {
    if (signal) signal.removeEventListener('abort', forwardExternalAbort);
    if (err?.name === 'AbortError' || signal?.aborted) {
      return {
        abortedBeforeStart: true,
        abortedPayload: {
          type: 'done',
          mode: normalizedMode,
          stopped: true,
          text: normalizedMode === 'continue' ? baseContinueText : '',
          appendedText: '',
          reasoning: '',
          durationMs: Math.max(1, Math.round(performance.now() - connectStartMs)),
          reasoningDurationMs: null,
          api: target.connectionName,
          model: target.modelName,
          totalMessages: null,
          message: null,
          hub: getApiHubState(),
        },
      };
    }
    if (err?.filterBlock && refusalConfig.enabled) {
      const refusalErr = new Error(formatFilterRefusalErrorMessage(err.filterBlock));
      refusalErr.refusalDetected = true;
      refusalErr.matchedFilter = err.filterBlock;
      refusalErr.rawError = err.message || '';
      throw refusalErr;
    }
    throw err;
  }

  const genStartedIso = new Date().toISOString();
  const genStartMs = performance.now();
  let reasoningStartMs = null;
  let reasoningEndMs = null;
  let generatedText = prefillPrefix;
  let modelGeneratedText = '';
  let continuePostfixPending =
    isCont && baseContinueText.length > 0
      ? String(compiled.samplers.continue_postfix ?? ' ')
      : '';
  let generatedReasoning = '';
  let checkedReasoningLineCount = 0;
  let finalizedReasoningCheck = false;
  let stoppedByUser = false;
  let notifiedGeneratingPhase = false;
  let caughtRefusal = null;
  let rpBypassConfirmed = false;
  let gateReleased = !refusalStreamHoldActive;
  let bufferedStreamDelta = refusalStreamHoldActive ? prefillPrefix : '';
  let gateTimer = null;

  const clearGateTimer = () => {
    if (gateTimer !== null) {
      clearTimeout(gateTimer);
      gateTimer = null;
    }
  };

  const flushGateBufferNow = () => {
    clearGateTimer();
    gateReleased = true;
    if (bufferedStreamDelta && clientStreamEnabled) {
      const out = bufferedStreamDelta;
      bufferedStreamDelta = '';
      onEvent({ type: 'delta', textDelta: out });
    }
  };

  const triggerRefusalAbort = (match) => {
    if (caughtRefusal) return;
    caughtRefusal = match;
    clearGateTimer();
    if (!streamAbortCtrl.signal.aborted) {
      streamAbortCtrl.abort();
    }
  };

  const releaseRefusalGateIfSafe = () => {
    clearGateTimer();
    if (gateReleased || caughtRefusal) return;
    const match = detectRefusalInHead(modelGeneratedText, refusalConfig);
    if (match) {
      triggerRefusalAbort(match);
      return;
    }
    flushGateBufferNow();
  };

  const notifyGeneratingPhaseOnce = () => {
    if (notifiedGeneratingPhase) return;
    notifiedGeneratingPhase = true;
    onEvent({
      type: 'phase',
      phase: 'generating',
      streaming: clientStreamEnabled,
    });
  };

  onEvent({
    type: 'start',
    mode: normalizedMode,
    targetMessageIndex: resolvedIdx,
    baseText: baseContinueText,
    streaming: clientStreamEnabled,
    api: target.connectionName,
    model: target.modelName,
    modelId: target.modelId,
    protocol: target.protocol,
    charName: compiled.charName,
    promptStats: compiled.stats,
  });

  const respContentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!clientStreamEnabled && !respContentType.includes('text/event-stream')) {
    notifyGeneratingPhaseOnce();
  }

  if (prefillPrefix && clientStreamEnabled && gateReleased) {
    onEvent({ type: 'delta', textDelta: prefillPrefix });
  }

  const countNormalizedLines = (str) => {
    let n = 1;
    for (let i = 0; i < str.length; i += 1) {
      if (str.charCodeAt(i) === 10) n += 1;
    }
    return n;
  };

  const emitReasoning = (rDelta) => {
    if (!rDelta || caughtRefusal) return;
    if (reasoningStartMs === null) reasoningStartMs = performance.now();
    reasoningEndMs = performance.now();
    generatedReasoning += rDelta;

    if (refusalConfig.enabled) {
      const startLineIndex = Math.max(0, checkedReasoningLineCount - 1);
      const headingHit = detectRefusalInReasoningHeadings(generatedReasoning, {
        startLineIndex,
        allowFinalAtxWithoutNewline: false,
      });
      if (headingHit) {
        triggerRefusalAbort(headingHit);
        return;
      }
      checkedReasoningLineCount = countNormalizedLines(generatedReasoning);
    }

    if (clientStreamEnabled && showThoughts) {
      onEvent({ type: 'delta', reasoningDelta: rDelta });
    } else {
      notifyGeneratingPhaseOnce();
    }
  };

  const emitText = (tDelta) => {
    if (!tDelta || caughtRefusal) return;
    if (reasoningStartMs !== null && reasoningEndMs === null) {
      reasoningEndMs = performance.now();
    }
    if (!finalizedReasoningCheck && generatedReasoning && refusalConfig.enabled) {
      finalizedReasoningCheck = true;
      const headingHit = detectRefusalInReasoningHeadings(generatedReasoning, {
        startLineIndex: Math.max(0, checkedReasoningLineCount - 1),
        allowFinalAtxWithoutNewline: true,
      });
      if (headingHit) {
        triggerRefusalAbort(headingHit);
        return;
      }
    }
    let effectiveDelta = tDelta;
    if (continuePostfixPending) {
      const sep = continuePostfixPending;
      continuePostfixPending = '';
      if (!baseContinueText.endsWith(sep) && !/^\s/.test(effectiveDelta)) {
        effectiveDelta = `${sep}${effectiveDelta}`;
      }
    }

    modelGeneratedText += tDelta;
    generatedText += effectiveDelta;

    if (!rpBypassConfirmed && startsWithRpMarker(modelGeneratedText)) {
      rpBypassConfirmed = true;
    }

    if (
      !rpBypassConfirmed &&
      refusalConfig.enabled &&
      modelGeneratedText.length <= refusalConfig.headWindowChars + 120
    ) {
      const match = detectRefusalInHead(modelGeneratedText, refusalConfig);
      if (match) {
        triggerRefusalAbort(match);
        return;
      }
    }

    if (clientStreamEnabled) {
      if (!gateReleased) {
        bufferedStreamDelta += effectiveDelta;
        if (rpBypassConfirmed) {
          flushGateBufferNow();
          return;
        }
        notifyGeneratingPhaseOnce();
        if (gateTimer === null) {
          if (refusalConfig.delayMs <= 0) {
            releaseRefusalGateIfSafe();
          } else {
            gateTimer = setTimeout(releaseRefusalGateIfSafe, refusalConfig.delayMs);
          }
        }
      } else {
        onEvent({ type: 'delta', textDelta: effectiveDelta });
      }
    } else {
      notifyGeneratingPhaseOnce();
    }
  };

  const inlineSplitter = createInlineThinkSplitter({
    onReasoning: emitReasoning,
    onText: emitText,
  });

  try {
    const outcome = await readUpstreamSseBody({
      res,
      protocol: target.protocol,
      signal: streamAbortCtrl.signal,
      emitReasoning,
      inlineSplitter,
    });
    stoppedByUser = Boolean(outcome.stoppedByUser && !caughtRefusal && signal?.aborted);
  } catch (streamErr) {
    if (caughtRefusal) {
      // Handled right after finally so nothing is persisted
    } else if (streamErr?.filterBlock && refusalConfig.enabled) {
      caughtRefusal = {
        matchedFilter: streamErr.filterBlock,
        rawError: streamErr.message || '',
      };
    } else if (streamErr.name === 'AbortError' || signal?.aborted) {
      stoppedByUser = true;
    } else if (!generatedText.trim()) {
      const check = await verifyConnectionOnlineStatus(target.connectionId).catch(() => null);
      if (check?.isOffline) {
        const offlineErr = new Error(
          `${target.connectionName}: Proxy is unavailable, please try again later.`,
        );
        offlineErr.proxyOffline = true;
        offlineErr.connectionId = target.connectionId;
        offlineErr.connectionName = target.connectionName;
        offlineErr.cause = streamErr;
        throw offlineErr;
      }
      throw streamErr;
    }
  } finally {
    clearGateTimer();
    inlineSplitter.finish();
    streamAbortCtrl.signal.removeEventListener('abort', onExternalAbort);
    if (signal) signal.removeEventListener('abort', forwardExternalAbort);
  }

  if (!caughtRefusal && !stoppedByUser && refusalConfig.enabled && generatedReasoning) {
    caughtRefusal = detectRefusalInReasoningHeadings(generatedReasoning, {
      startLineIndex: Math.max(0, checkedReasoningLineCount - 1),
      allowFinalAtxWithoutNewline: true,
    });
  }

  if (!caughtRefusal && !stoppedByUser && !rpBypassConfirmed && refusalConfig.enabled) {
    caughtRefusal = detectRefusalInHead(modelGeneratedText, refusalConfig);
  }

  if (caughtRefusal) {
    const refusalErr = new Error(
      caughtRefusal.matchedFilter
        ? formatFilterRefusalErrorMessage(caughtRefusal.matchedFilter)
        : caughtRefusal.matchedHeading
          ? formatReasoningRefusalErrorMessage(
              caughtRefusal.matchedHeading,
              caughtRefusal.matchedHeadingKeyword,
            )
          : formatRefusalErrorMessage(caughtRefusal.matchedPhrase),
    );
    refusalErr.refusalDetected = true;
    if (caughtRefusal.matchedFilter) {
      refusalErr.matchedFilter = caughtRefusal.matchedFilter;
    }
    if (caughtRefusal.matchedHeading) {
      refusalErr.matchedHeading = caughtRefusal.matchedHeading;
    }
    if (caughtRefusal.matchedHeadingKeyword) {
      refusalErr.matchedHeadingKeyword = caughtRefusal.matchedHeadingKeyword;
    }
    if (caughtRefusal.matchedPhrase) {
      refusalErr.matchedPhrase = caughtRefusal.matchedPhrase;
    }
    if (caughtRefusal.rawError) {
      refusalErr.rawError = caughtRefusal.rawError;
    }
    throw refusalErr;
  }

  if (clientStreamEnabled && !gateReleased && bufferedStreamDelta) {
    flushGateBufferNow();
  }

  const genFinishedIso = new Date().toISOString();
  const durationMs = Math.max(1, Math.round(performance.now() - genStartMs));
  const reasoningDurationMs =
    reasoningStartMs !== null
      ? Math.max(1, Math.round((reasoningEndMs || performance.now()) - reasoningStartMs))
      : null;

  return {
    abortedBeforeStart: false,
    stoppedByUser,
    generatedText,
    generatedReasoning,
    genStartedIso,
    genFinishedIso,
    durationMs,
    reasoningDurationMs,
  };
}

export async function streamChatGeneration({
  characterAvatar = '',
  cardOverride = null,
  chatFileName = '',
  messagesOverride = null,
  presetOverride = null,
  mode = 'reply',
  targetMessageIndex = null,
  connectionId = '',
  modelId = '',
  persist = true,
  signal = null,
  onEvent = () => {},
} = {}) {
  const primaryTarget = resolveActiveGenerationTarget({ connectionId, modelId });
  const normalizedMode = ['reply', 'swipe', 'continue'].includes(mode) ? mode : 'reply';

  let resolvedIdx =
    targetMessageIndex !== null && targetMessageIndex !== undefined
      ? Number(targetMessageIndex)
      : null;

  let baseContinueText = '';
  if (
    characterAvatar &&
    chatFileName &&
    (normalizedMode === 'swipe' || normalizedMode === 'continue')
  ) {
    const resolved = resolveChatFilePath(characterAvatar, chatFileName, false);
    const parsed = readParsedJsonlChat(resolved.filePath);
    if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      if (resolvedIdx === null || resolvedIdx < 0 || resolvedIdx >= parsed.messages.length) {
        resolvedIdx = parsed.messages.length - 1;
      }
      if (normalizedMode === 'continue') {
        const targetMsg = parsed.messages[resolvedIdx];
        const sw = Array.isArray(targetMsg?.swipes) ? targetMsg.swipes : null;
        const sId = Number(targetMsg?.swipe_id ?? 0);
        baseContinueText =
          sw && sw[sId] !== undefined ? String(sw[sId]) : String(targetMsg?.mes ?? '');
      }
    }
  }

  const compiled = compileChatPrompt({
    characterAvatar,
    cardOverride,
    chatFileName,
    messagesOverride,
    presetOverride,
    continueMode: normalizedMode === 'continue',
    historyEndExclusiveIndex: normalizedMode === 'swipe' ? resolvedIdx : null,
  });

  const refusalConfig = readRefusalCatcherConfig();
  let activeTarget = primaryTarget;
  let fallbackInfo = null;
  let attemptResult = null;

  try {
    attemptResult = await executeSingleTargetAttempt({
      target: primaryTarget,
      compiled,
      normalizedMode,
      resolvedIdx,
      baseContinueText,
      refusalConfig,
      signal,
      onEvent,
    });
  } catch (primaryErr) {
    const canFallback =
      Boolean(primaryErr?.refusalDetected) &&
      !signal?.aborted &&
      Boolean(refusalConfig.enabled) &&
      Boolean(refusalConfig.fallbackEnabled) &&
      Boolean(refusalConfig.fallbackConnectionId || refusalConfig.fallbackModelId);

    if (!canFallback) {
      throw primaryErr;
    }

    const fallbackTarget = resolveActiveGenerationTarget({
      connectionId: refusalConfig.fallbackConnectionId,
      modelId: refusalConfig.fallbackModelId,
    });

    const pendingFallbackInfo = buildFallbackRedirectInfo({
      primaryTarget,
      fallbackTarget,
      primaryErr,
    });

    onEvent({
      type: 'fallback_reset',
      fromApi: primaryTarget.connectionName,
      fromModel: primaryTarget.modelName,
      toApi: fallbackTarget.connectionName,
      toModel: fallbackTarget.modelName,
      fallbackInfo: pendingFallbackInfo,
    });

    try {
      attemptResult = await executeSingleTargetAttempt({
        target: fallbackTarget,
        compiled,
        normalizedMode,
        resolvedIdx,
        baseContinueText,
        refusalConfig,
        signal,
        onEvent,
      });
      activeTarget = fallbackTarget;
      fallbackInfo = pendingFallbackInfo;
    } catch (fallbackErr) {
      if (fallbackErr?.refusalDetected) {
        const allErr = new Error(
          formatAllModelsRefusedMessage(primaryTarget.modelName, fallbackTarget.modelName),
        );
        allErr.refusalDetected = true;
        allErr.allModelsRefused = true;
        throw allErr;
      }
      throw fallbackErr;
    }
  }

  if (attemptResult.abortedBeforeStart) {
    onEvent(attemptResult.abortedPayload);
    return attemptResult.abortedPayload;
  }

  const {
    stoppedByUser,
    generatedText,
    generatedReasoning,
    genStartedIso,
    genFinishedIso,
    durationMs,
    reasoningDurationMs,
  } = attemptResult;

  const rawCleanText =
    normalizedMode === 'continue' ? generatedText : generatedText.replace(/^\s*\r?\n/, '');
  const rawCleanReasoning = generatedReasoning.trim();

  const activeRegexScripts = resolveActiveRegexScriptsServer({
    cardAvatar: characterAvatar,
    card: cardOverride || null,
    oaiData: presetOverride?.data || null,
  });

  let finalCleanText = rawCleanText;
  let finalCleanReasoning = rawCleanReasoning;

  if (activeRegexScripts.length > 0) {
    if (finalCleanText && normalizedMode !== 'continue') {
      finalCleanText = applyRegexPipeline(finalCleanText, activeRegexScripts, {
        placement: REGEX_PLACEMENT.AI_OUTPUT,
        isPermanent: true,
        depth: 0,
        charName: compiled.charName,
        userName: compiled.userName,
      });
    }
    if (finalCleanReasoning) {
      finalCleanReasoning = applyRegexPipeline(finalCleanReasoning, activeRegexScripts, {
        placement: REGEX_PLACEMENT.REASONING,
        isPermanent: true,
        depth: 0,
        charName: compiled.charName,
        userName: compiled.userName,
      });
    }
  }

  if (!stoppedByUser && !finalCleanText.trim()) {
    const emptyErr = new Error(formatEmptyResponseErrorMessage());
    emptyErr.emptyResponse = true;
    throw emptyErr;
  }

  const savedResult = await persistGeneratedOutput({
    persist,
    characterAvatar,
    chatFileName,
    normalizedMode,
    resolvedIdx,
    charName: compiled.charName,
    finalCleanText,
    finalCleanReasoning,
    reasoningDurationMs,
    genStartedIso,
    genFinishedIso,
    durationMs,
    target: activeTarget,
    fallbackInfo,
  });

  const donePayload = {
    type: 'done',
    mode: normalizedMode,
    stopped: stoppedByUser,
    text: normalizedMode === 'continue' ? `${baseContinueText}${finalCleanText}` : finalCleanText,
    appendedText: finalCleanText,
    reasoning: finalCleanReasoning,
    durationMs,
    reasoningDurationMs,
    api: activeTarget.connectionName,
    model: activeTarget.modelName,
    fallbackInfo: fallbackInfo || null,
    totalMessages: savedResult?.totalMessages ?? null,
    message: savedResult?.message ?? null,
    hub: getApiHubState(),
  };

  onEvent(donePayload);
  return donePayload;
}





