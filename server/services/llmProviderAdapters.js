import { executeWithConnectionKeyFailover } from './apiHubStore.js';
import { isSyntheticThinkPrefill } from './llmReasoningParser.js';
import {
  DEFAULT_GEMINI_SAFETY_SETTINGS,
  applyAdditionalBodyParameters,
  applyAdditionalRequestHeaders,
} from '../../src/core/presets/additionalParameters.js';
import { detectGeminiFilterRefusal } from '../../src/core/refusal/refusalEngine.js';

export const CONNECT_TIMEOUT_MS = 45000;

export function formatOpenAiTurnContent(text, images = []) {
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

export function formatAnthropicTurnContent(text, images = []) {
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

export function sanitizeMessagesForCapabilities(
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

export function resolveOpenAiReasoningEffort(effortRaw, target, showThoughts = true) {
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

export function calculateClaudeThinkingConfig(maxTokens, effortRaw, caps) {
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

export function calculateGeminiThinkingConfig(
  maxTokens,
  effortRaw,
  modelId = '',
  includeThoughts = true,
) {
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

export function buildOpenAiPayload(target, compiled, caps, continueMode = false) {
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

export function buildAnthropicPayload(target, compiled, caps, continueMode = false) {
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

export function buildGeminiPayload(target, compiled, caps, continueMode = false) {
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

export function buildProviderRequestPayload(target, compiled, caps, continueMode = false) {
  const payload =
    target.protocol === 'anthropic'
      ? buildAnthropicPayload(target, compiled, caps, continueMode)
      : target.protocol === 'gemini'
        ? buildGeminiPayload(target, compiled, caps, continueMode)
        : buildOpenAiPayload(target, compiled, caps, continueMode);

  applyAdditionalBodyParameters(payload, {
    includeRaw: compiled.samplers.custom_include_body,
    excludeRaw: compiled.samplers.custom_exclude_body,
    protocol: target.protocol,
  });

  return payload;
}

export function buildHeadersForProtocol(
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

export function parseProtocolSseDataPayload(protocol, json, emitNativeReasoning, pushRawText) {
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

  // OpenAI-compatible & TextGen SSE (`choices[0].delta`, `choices[0].message`, or `choices[0].text`)
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
  } else if (typeof choice.text === 'string' && choice.text.length > 0) {
    pushRawText(choice.text);
  }
}

export async function openUpstreamStreamWithFailover(
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

export async function readUpstreamSseBody({
  res,
  protocol,
  signal,
  emitReasoning,
  inlineSplitter,
}) {
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






