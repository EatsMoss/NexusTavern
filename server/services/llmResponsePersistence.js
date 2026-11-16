import { getApiHubState } from './apiHubStore.js';
import {
  appendChatMessage,
  patchChatMessage,
  formatSillyTavernSendDate,
} from './chatStore.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readCustomizationConfig } from './customizationStore.js';
import { estimateTokens } from './macroResolver.js';
import { recordConsoleLog } from './consoleLogger.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../../src/core/regex/regexEngine.js';
import { applyTextFormattingRules } from '../../src/core/messages/messageDecorator.js';
import { formatEmptyResponseErrorMessage } from '../../src/core/refusal/refusalEngine.js';

export async function persistGeneratedOutput({
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

export async function finalizeAndPersistStreamResponse({
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
}) {
  const {
    stoppedByUser,
    generatedText,
    generatedReasoning,
    genStartedIso,
    genFinishedIso,
    durationMs,
    ttftMs,
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

  const aiCfg = readCustomizationConfig().chatAndAi;
  if (finalCleanText && normalizedMode !== 'continue' && !stoppedByUser) {
    finalCleanText = applyTextFormattingRules(finalCleanText, {
      trimSpaces: aiCfg.trimSpaces,
      collapseNewlines: aiCfg.collapseNewlines,
      autoFixMarkdown: aiCfg.autoFixMarkdown,
      trimIncompleteSentences: aiCfg.trimIncompleteSentences,
    });
  }

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
    recordConsoleLog({
      category: 'error',
      level: 'error',
      scope: 'LLM Error',
      title: `Empty response returned by ${activeTarget.modelName}`,
      summary: emptyErr.message,
      badges: [{ label: 'EMPTY', tone: 'danger' }],
    });
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

  const responseTokens = estimateTokens(finalCleanText);
  const reasoningTokens = finalCleanReasoning ? estimateTokens(finalCleanReasoning) : 0;
  const outputTokens = responseTokens + reasoningTokens;
  const tokensPerSec =
    durationMs > 0 && outputTokens > 0
      ? Number(((outputTokens / durationMs) * 1000).toFixed(1))
      : null;

  recordConsoleLog({
    category: 'output',
    level: stoppedByUser ? 'warn' : 'success',
    scope: 'LLM Output',
    title: `${stoppedByUser ? 'Stopped' : 'Completed'} ${normalizedMode.toUpperCase()} from ${activeTarget.connectionName} → ${activeTarget.modelName}`,
    summary: `~${outputTokens} tok in ${(durationMs / 1000).toFixed(2)}s${
      tokensPerSec ? ` (${tokensPerSec} tok/s)` : ''
    }${chatFileName ? ` • Saved to "${chatFileName}"` : ''}`,
    badges: [
      { label: stoppedByUser ? 'STOPPED' : 'OK', tone: stoppedByUser ? 'warn' : 'ok' },
      { label: `~${outputTokens} tok`, tone: 'neutral' },
      { label: `${durationMs}ms`, tone: 'neutral' },
      ...(tokensPerSec ? [{ label: `${tokensPerSec} t/s`, tone: 'accent' }] : []),
    ],
    details: {
      status: stoppedByUser ? 'stopped' : 'completed',
      connectionName: activeTarget.connectionName,
      modelName: activeTarget.modelName,
      mode: normalizedMode,
      ttftMs: ttftMs || null,
      durationMs,
      reasoningDurationMs: reasoningDurationMs || null,
      responseTokens,
      reasoningTokens,
      outputTokens,
      tokensPerSec,
      reasoning: finalCleanReasoning,
      response: finalCleanText,
      savedFile: chatFileName || null,
      fallbackInfo: fallbackInfo || null,
    },
  });

  return {
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
}

