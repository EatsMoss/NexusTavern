import { useMemo } from 'react';
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

  const chatHistoryTokenBreakdown = useMemo(() => {
    const resolvedCharName = activeCardFull?.name || activeCharacter?.name || 'Character';
    const resolvedUserName = personaName || 'User';
    const nameCtx = { charName: resolvedCharName, userName: resolvedUserName };
    if (hasActiveScenario && committedChatCardId === selectedCardId) {
      const olderActive = chatMetaStats.hasMoreOlder
        ? Number(chatMetaStats.olderHistoryTokens || 0)
        : 0;
      const olderRaw = chatMetaStats.hasMoreOlder
        ? Number(chatMetaStats.olderHistoryRawTokens ?? olderActive)
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
