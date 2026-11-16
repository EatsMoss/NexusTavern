import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchChatOlderTokenSummary } from '@core/chats/chatsApi.js';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import {
  estimateHistorySliceTokenBreakdown,
  estimateRecapInjectedPromptTokens,
} from '@core/presets/tokenEstimator.js';

/**
 * Computes live prompt token telemetry (`chatHistoryTokenBreakdown` +
 * `promptTokenContext`) across the active scenario card, persona, visible/older
 * chat window, active prompt-scoped regex scripts, and Message Recap plugin.
 */
export function usePromptTokenTelemetry({
  hasActiveScenario,
  committedChatCardId,
  selectedCardId,
  activeChatFile = '',
  chatMetaStats,
  messages,
  activeCardFull,
  activeCharacter,
  personaName,
  activePersonaObj,
  regexWorkspace,
  recapConfig,
}) {
  const activePromptRegexScripts = useMemo(() => {
    if (!regexWorkspace.masterEnabled) return [];
    return [
      ...(regexWorkspace.globalScripts || []),
      ...(regexWorkspace.presetScripts || []),
      ...(hasActiveScenario ? regexWorkspace.cardScripts || [] : []),
    ];
  }, [
    regexWorkspace.masterEnabled,
    regexWorkspace.globalScripts,
    regexWorkspace.presetScripts,
    regexWorkspace.cardScripts,
    hasActiveScenario,
  ]);

  const compressionSignature = useMemo(() => {
    const recapPart = recapConfig
      ? `${recapConfig.enabled ? 1 : 0}|${recapConfig.stripEnabled ? 1 : 0}|${
          recapConfig.keepFullDepth ?? 4
        }|${recapConfig.stripFindRegex || ''}`
      : 'none';
    const rxPart = activePromptRegexScripts
      .filter((s) => s && !s.disabled && s.promptOnly)
      .map(
        (s) =>
          `${s.id}:${s.findRegex}:${s.replaceString}:${s.minDepth ?? ''}:${s.maxDepth ?? ''}`,
      )
      .join(';');
    return `${recapPart}::${rxPart}`;
  }, [recapConfig, activePromptRegexScripts]);

  const windowScopeKey = `${selectedCardId || ''}::${activeChatFile || ''}::${
    chatMetaStats.startIndex || 0
  }`;
  const [olderOverride, setOlderOverride] = useState(null);
  const lastCompressionSigRef = useRef(compressionSignature);

  useEffect(() => {
    const sigChanged = lastCompressionSigRef.current !== compressionSignature;
    lastCompressionSigRef.current = compressionSignature;

    if (
      !sigChanged ||
      !hasActiveScenario ||
      !selectedCardId ||
      isDemoCardId(selectedCardId) ||
      committedChatCardId !== selectedCardId ||
      !chatMetaStats.hasMoreOlder ||
      !(Number(chatMetaStats.startIndex) > 0)
    ) {
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetchChatOlderTokenSummary(selectedCardId, {
          file: activeChatFile || null,
          beforeIndex: Number(chatMetaStats.startIndex) || 0,
        });
        if (!cancelled && res?.ok && res.found) {
          setOlderOverride({
            scopeKey: windowScopeKey,
            olderHistoryTokens: Number(res.olderHistoryTokens || 0),
            olderHistoryRawTokens: Number(
              res.olderHistoryRawTokens ?? res.olderHistoryTokens ?? 0,
            ),
          });
        }
      } catch {
        // Ignore transient network errors; visible window tokens still update immediately
      }
    }, 380);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    compressionSignature,
    hasActiveScenario,
    selectedCardId,
    committedChatCardId,
    activeChatFile,
    chatMetaStats.hasMoreOlder,
    chatMetaStats.startIndex,
    windowScopeKey,
  ]);

  const chatHistoryTokenBreakdown = useMemo(() => {
    const resolvedCharName = activeCardFull?.name || activeCharacter?.name || 'Character';
    const resolvedUserName = personaName || 'User';
    const nameCtx = { charName: resolvedCharName, userName: resolvedUserName };
    if (hasActiveScenario && committedChatCardId === selectedCardId) {
      const matchedOverride =
        olderOverride && olderOverride.scopeKey === windowScopeKey ? olderOverride : null;
      const olderActive = chatMetaStats.hasMoreOlder
        ? Number(
            matchedOverride
              ? matchedOverride.olderHistoryTokens
              : chatMetaStats.olderHistoryTokens || 0,
          )
        : 0;
      const olderRaw = chatMetaStats.hasMoreOlder
        ? Number(
            matchedOverride
              ? matchedOverride.olderHistoryRawTokens
              : (chatMetaStats.olderHistoryRawTokens ?? olderActive),
          )
        : 0;
      const visible = estimateHistorySliceTokenBreakdown(messages, nameCtx, {
        regexScripts: activePromptRegexScripts,
        recapConfig,
      });
      const activeTokens = olderActive + visible.activeTokens;
      const rawTokens = Math.max(activeTokens, olderRaw + visible.rawTokens);
      return {
        activeTokens,
        rawTokens,
        savedTokens: Math.max(0, rawTokens - activeTokens),
      };
    }
    if (hasActiveScenario && activeCardFull?.first_mes) {
      return estimateHistorySliceTokenBreakdown(
        [{ isUser: false, text: activeCardFull.first_mes }],
        nameCtx,
        {
          regexScripts: activePromptRegexScripts,
          recapConfig,
        },
      );
    }
    return { activeTokens: 0, rawTokens: 0, savedTokens: 0 };
  }, [
    hasActiveScenario,
    committedChatCardId,
    selectedCardId,
    chatMetaStats.hasMoreOlder,
    chatMetaStats.olderHistoryTokens,
    chatMetaStats.olderHistoryRawTokens,
    olderOverride,
    windowScopeKey,
    messages,
    activeCardFull?.name,
    activeCardFull?.first_mes,
    activeCharacter?.name,
    personaName,
    activePromptRegexScripts,
    recapConfig,
  ]);

  const recapPluginPromptTokens = useMemo(
    () =>
      estimateRecapInjectedPromptTokens(recapConfig, {
        charName: activeCardFull?.name || activeCharacter?.name || 'Character',
        userName: personaName || 'User',
      }),
    [recapConfig, activeCardFull?.name, activeCharacter?.name, personaName],
  );

  const promptTokenContext = useMemo(
    () => ({
      charName: activeCardFull?.name || activeCharacter?.name || 'Character',
      userName: personaName || 'User',
      charDescription: activeCardFull?.description || '',
      charPersonality: activeCardFull?.personality || '',
      scenario: activeCardFull?.scenario || '',
      mesExample: activeCardFull?.mes_example || '',
      personaDescription: activePersonaObj?.description || '',
      chatHistoryTokens: chatHistoryTokenBreakdown.activeTokens,
      chatHistoryRawTokens: chatHistoryTokenBreakdown.rawTokens,
      chatHistorySavedTokens: chatHistoryTokenBreakdown.savedTokens,
      pluginExtraPromptTokens: recapPluginPromptTokens,
    }),
    [
      activeCardFull?.name,
      activeCardFull?.description,
      activeCardFull?.personality,
      activeCardFull?.scenario,
      activeCardFull?.mes_example,
      activeCharacter?.name,
      personaName,
      activePersonaObj?.description,
      chatHistoryTokenBreakdown,
      recapPluginPromptTokens,
    ],
  );

  return {
    chatHistoryTokenBreakdown,
    promptTokenContext,
  };
}
