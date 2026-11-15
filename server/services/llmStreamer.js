import {
  getApiHubState,
  resolveActiveGenerationTarget,
  verifyConnectionOnlineStatus,
} from './apiHubStore.js';
import { compileChatPrompt } from './promptCompiler.js';
import {
  resolveChatFilePath,
  readParsedJsonlChat,
} from './chatStore.js';
import { resolveModelCapabilities } from './modelCapabilities.js';
import { readRefusalCatcherConfig } from './refusalStore.js';
import { estimateTokens } from './macroResolver.js';
import {
  recordConsoleLog,
  maskUrlSecrets,
  extractWireMessagesForLog,
  extractWireSamplersForLog,
} from './consoleLogger.js';
import {
  detectRefusalInHead,
  detectRefusalInReasoningHeadings,
  startsWithRpMarker,
  formatRefusalErrorMessage,
  formatReasoningRefusalErrorMessage,
  formatFilterRefusalErrorMessage,
  buildFallbackRedirectInfo,
  formatAllModelsRefusedMessage,
} from '../../src/core/refusal/refusalEngine.js';
import {
  createInlineThinkSplitter,
  countNormalizedLines,
} from './llmReasoningParser.js';
import {
  buildProviderRequestPayload,
  openUpstreamStreamWithFailover,
  readUpstreamSseBody,
} from './llmProviderAdapters.js';
import { finalizeAndPersistStreamResponse } from './llmResponsePersistence.js';

export { createInlineThinkSplitter };

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

  const payload = buildProviderRequestPayload(target, compiled, caps, isCont);

  const wireMessages = extractWireMessagesForLog(target.protocol, payload);
  const wireSamplers = extractWireSamplersForLog(payload);
  const wireTotalTokens = wireMessages.reduce((sum, m) => sum + (m.tokens || 0), 0);
  const compiledBlocks = Array.isArray(compiled.messages)
    ? compiled.messages.map((m, idx) => ({
        index: idx,
        role: m.role || 'system',
        label: m.label || m.source || `Block #${idx + 1}`,
        source: m.source || '',
        tokens: m.tokens || estimateTokens(m.content || ''),
        chars: String(m.content || '').length,
        images: Array.isArray(m.images) ? m.images.length : 0,
      }))
    : [];

  const savedHistoryTok = Number(compiled.stats?.historyTokensSaved) || 0;
  recordConsoleLog({
    category: 'prompt',
    level: 'info',
    scope: 'LLM Request',
    title: `Generating ${normalizedMode.toUpperCase()} via ${target.connectionName} → ${target.modelName}`,
    summary: `${wireMessages.length} wire turns (~${wireTotalTokens} tok${savedHistoryTok > 0 ? `, saved ~${savedHistoryTok} tok via regex/recap` : ''}) • Preset "${compiled.presetName || 'Default'}"`,
    badges: [
      { label: normalizedMode.toUpperCase(), tone: 'accent' },
      { label: target.protocol.toUpperCase(), tone: 'neutral' },
      { label: `~${wireTotalTokens} tok`, tone: 'neutral' },
      ...(savedHistoryTok > 0
        ? [{ label: `Saved ${savedHistoryTok} tok`, tone: 'ok' }]
        : []),
    ],
    details: {
      endpoint: maskUrlSecrets(target.endpointUrl || ''),
      protocol: target.protocol,
      connectionName: target.connectionName,
      modelId: target.upstreamModelId,
      modelName: target.modelName,
      mode: normalizedMode,
      character: compiled.charName,
      user: compiled.userName,
      presetName: compiled.presetName || 'Default',
      totalTokens: wireTotalTokens,
      promptStats: compiled.stats || null,
      wireSamplers,
      compiledBlocks,
      messages: wireMessages,
      rawPayload: payload,
    },
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
      const waitMs = Math.max(1, Math.round(performance.now() - connectStartMs));
      recordConsoleLog({
        category: 'output',
        level: 'warn',
        scope: 'LLM Output',
        title: `Generation stopped before first token (${target.modelName})`,
        summary: `Aborted by user after ${waitMs}ms while waiting for ${target.connectionName}`,
        badges: [
          { label: 'STOPPED', tone: 'warn' },
          { label: `${waitMs}ms`, tone: 'neutral' },
        ],
        details: {
          status: 'stopped',
          connectionName: target.connectionName,
          modelName: target.modelName,
          mode: normalizedMode,
          durationMs: waitMs,
          ttftMs: null,
          outputTokens: 0,
          reasoning: '',
          response: '',
        },
      });
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
  let firstChunkMs = null;
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

  const emitReasoning = (rDelta) => {
    if (!rDelta || caughtRefusal) return;
    if (firstChunkMs === null) {
      firstChunkMs = Math.max(1, Math.round(performance.now() - connectStartMs));
    }
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
    if (firstChunkMs === null) {
      firstChunkMs = Math.max(1, Math.round(performance.now() - connectStartMs));
    }
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
    ttftMs: firstChunkMs,
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
  let attemptResult;

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
      recordConsoleLog({
        category: 'error',
        level: 'error',
        scope: 'LLM Error',
        title: primaryErr?.refusalDetected
          ? `Refusal intercepted on ${primaryTarget.modelName}`
          : `Generation failed on ${primaryTarget.connectionName} → ${primaryTarget.modelName}`,
        summary: primaryErr?.message || 'Upstream generation failed',
        badges: [
          ...(primaryErr?.httpStatus ? [{ label: `HTTP ${primaryErr.httpStatus}`, tone: 'danger' }] : []),
          ...(primaryErr?.refusalDetected ? [{ label: 'REFUSAL', tone: 'warn' }] : []),
        ],
        details: {
          connectionName: primaryTarget.connectionName,
          modelName: primaryTarget.modelName,
          httpStatus: primaryErr?.httpStatus || null,
          errorBody: primaryErr?.bodyJson || null,
          meta: primaryErr?.matchedPhrase
            ? { matchedPhrase: primaryErr.matchedPhrase }
            : primaryErr?.matchedFilter
              ? { matchedFilter: primaryErr.matchedFilter }
              : null,
        },
      });
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

    recordConsoleLog({
      category: 'system',
      level: 'warn',
      scope: 'Refusal Catcher',
      title: `Refusal intercepted on ${primaryTarget.modelName} → Redirecting to ${fallbackTarget.modelName}`,
      summary: primaryErr?.message || 'Redirecting to uncensored fallback target',
      badges: [
        { label: 'FALLBACK', tone: 'warn' },
        { label: fallbackTarget.modelName, tone: 'accent' },
      ],
      details: {
        fromConnection: primaryTarget.connectionName,
        fromModel: primaryTarget.modelName,
        toConnection: fallbackTarget.connectionName,
        toModel: fallbackTarget.modelName,
        reason: primaryErr?.message || '',
      },
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
        recordConsoleLog({
          category: 'error',
          level: 'error',
          scope: 'Refusal Catcher',
          title: `Both primary (${primaryTarget.modelName}) and fallback (${fallbackTarget.modelName}) refused`,
          summary: allErr.message,
          badges: [{ label: 'ALL REFUSED', tone: 'danger' }],
        });
        throw allErr;
      }
      recordConsoleLog({
        category: 'error',
        level: 'error',
        scope: 'LLM Error',
        title: `Fallback generation failed on ${fallbackTarget.connectionName} → ${fallbackTarget.modelName}`,
        summary: fallbackErr?.message || 'Fallback target failed',
        details: {
          connectionName: fallbackTarget.connectionName,
          modelName: fallbackTarget.modelName,
          httpStatus: fallbackErr?.httpStatus || null,
          errorBody: fallbackErr?.bodyJson || null,
        },
      });
      throw fallbackErr;
    }
  }

  if (attemptResult.abortedBeforeStart) {
    onEvent(attemptResult.abortedPayload);
    return attemptResult.abortedPayload;
  }

  const donePayload = await finalizeAndPersistStreamResponse({
    attemptResult,
    characterAvatar,
    cardOverride,
    chatFileName,
    presetOverride,
    compiled,
    normalizedMode,
    resolvedIdx,
    baseContinueText,
    persist,
    activeTarget,
    fallbackInfo,
  });

  onEvent(donePayload);
  return donePayload;
}





