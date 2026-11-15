import { useState, useEffect, useCallback } from 'react';
import {
  fetchRegexWorkspace,
  saveRegexScopeScripts,
  patchRegexMasterSwitch,
  saveRegexFoldersMeta,
  transferRegexScriptBetweenScopes,
} from '@core/regex/regexApi.js';
import { normalizeRegexScript } from '@core/regex/regexEngine.js';
import { setRegexDisplayState } from '@core/regex/regexDisplayStore.js';

export function useRegexWorkspace({
  activeCardAvatar = '',
  hasActiveScenario = false,
  activePresetName = '',
  liveCardScripts = null,
  livePresetScripts = null,
  onRefreshActiveCard,
  onRefreshActivePresetScripts,
  onNotify,
} = {}) {
  const [activeScope, setActiveScope] = useState('global');
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [globalScripts, setGlobalScripts] = useState([]);
  const [cardScripts, setCardScripts] = useState([]);
  const [presetScripts, setPresetScripts] = useState([]);
  const [foldersMeta, setFoldersMeta] = useState({});

  const syncWorkspace = useCallback(async () => {
    try {
      const res = await fetchRegexWorkspace({
        cardAvatar: activeCardAvatar,
        presetName: activePresetName,
      });
      if (!res?.ok) return;
      const nextMaster = res.masterEnabled !== false;
      const nextGlobal = Array.isArray(res.globalScripts) ? res.globalScripts : [];
      const nextCard = Array.isArray(res.cardScripts) ? res.cardScripts : [];
      const nextPreset = Array.isArray(res.presetScripts) ? res.presetScripts : [];

      setMasterEnabled(nextMaster);
      setGlobalScripts(nextGlobal);
      setCardScripts(nextCard);
      setPresetScripts(nextPreset);
      setFoldersMeta(res.foldersMeta || {});

      setRegexDisplayState({
        masterEnabled: nextMaster,
        globalScripts: nextGlobal,
        presetScripts: nextPreset,
        cardScripts: hasActiveScenario ? nextCard : [],
      });
    } catch {
      // background sync fallback
    }
  }, [activeCardAvatar, activePresetName, hasActiveScenario]);

  useEffect(() => {
    syncWorkspace();
  }, [syncWorkspace]);

  useEffect(() => {
    if (!Array.isArray(livePresetScripts)) return;
    const normalized = livePresetScripts
      .filter((s) => s && typeof s === 'object')
      .map((s) => normalizeRegexScript(s));
    setPresetScripts(normalized);
    setRegexDisplayState({ presetScripts: normalized });
  }, [livePresetScripts]);

  useEffect(() => {
    if (!hasActiveScenario) {
      setRegexDisplayState({ cardScripts: [] });
      return;
    }
    if (!Array.isArray(liveCardScripts)) return;
    const normalized = liveCardScripts
      .filter((s) => s && typeof s === 'object')
      .map((s) => normalizeRegexScript(s));
    setCardScripts(normalized);
    setRegexDisplayState({ cardScripts: normalized });
  }, [hasActiveScenario, liveCardScripts]);

  const currentScopeKey =
    activeScope === 'card'
      ? `card:${activeCardAvatar || 'none'}`
      : activeScope === 'preset'
        ? `preset:${activePresetName || 'Default'}`
        : 'global';

  const currentFolderEntry = foldersMeta?.[currentScopeKey] || {
    folders: [],
    assignments: {},
  };

  const handleToggleMaster = useCallback(
    async (enabled) => {
      setMasterEnabled(enabled);
      setRegexDisplayState({ masterEnabled: enabled });
      try {
        await patchRegexMasterSwitch(enabled);
      } catch (err) {
        onNotify?.(err?.message || 'Failed to update Regex master switch', 'error');
      }
    },
    [onNotify],
  );

  const handleSaveScripts = useCallback(
    async (scope, nextScripts) => {
      if (scope === 'global') {
        setGlobalScripts(nextScripts);
        setRegexDisplayState({ globalScripts: nextScripts });
      } else if (scope === 'card') {
        setCardScripts(nextScripts);
        setRegexDisplayState({ cardScripts: hasActiveScenario ? nextScripts : [] });
      } else if (scope === 'preset') {
        setPresetScripts(nextScripts);
        setRegexDisplayState({ presetScripts: nextScripts });
      }

      const targetId =
        scope === 'card'
          ? activeCardAvatar
          : scope === 'preset'
            ? activePresetName
            : '';

      try {
        const res = await saveRegexScopeScripts({ scope, targetId, scripts: nextScripts });
        if (scope === 'card' && res?.card && onRefreshActiveCard) {
          onRefreshActiveCard(res.card);
        } else if (scope === 'preset' && Array.isArray(res?.scripts) && onRefreshActivePresetScripts) {
          onRefreshActivePresetScripts(targetId || activePresetName, res.scripts);
        }
      } catch (err) {
        onNotify?.(err?.message || 'Failed to save Regex rules', 'error');
        syncWorkspace();
      }
    },
    [
      activeCardAvatar,
      activePresetName,
      hasActiveScenario,
      onRefreshActiveCard,
      onRefreshActivePresetScripts,
      onNotify,
      syncWorkspace,
    ],
  );

  const handleSaveFolders = useCallback(
    async (nextFolders, nextAssignments) => {
      setFoldersMeta((prev) => ({
        ...prev,
        [currentScopeKey]: { folders: nextFolders, assignments: nextAssignments },
      }));
      try {
        const res = await saveRegexFoldersMeta({
          scopeKey: currentScopeKey,
          folders: nextFolders,
          assignments: nextAssignments,
        });
        if (res?.foldersMeta) setFoldersMeta(res.foldersMeta);
      } catch (err) {
        onNotify?.(err?.message || 'Failed to save Regex folders', 'error');
      }
    },
    [currentScopeKey, onNotify],
  );

  const handleTransferScript = useCallback(
    async (scriptId, toScope, mode = 'move') => {
      const fromTargetId =
        activeScope === 'card' ? activeCardAvatar : activeScope === 'preset' ? activePresetName : '';
      const toTargetId =
        toScope === 'card' ? activeCardAvatar : toScope === 'preset' ? activePresetName : '';

      try {
        const res = await transferRegexScriptBetweenScopes({
          fromScope: activeScope,
          fromTargetId,
          toScope,
          toTargetId,
          scriptId,
          mode,
        });
        if (res?.ok) {
          await syncWorkspace();
          if (
            (activeScope === 'preset' || toScope === 'preset') &&
            Array.isArray(res.presetScripts) &&
            onRefreshActivePresetScripts
          ) {
            onRefreshActivePresetScripts(res.activePresetName || activePresetName, res.presetScripts);
          }
          onNotify?.(`${mode === 'copy' ? 'Copied' : 'Moved'} rule to ${toScope} scope`, 'success');
        }
      } catch (err) {
        onNotify?.(err?.message || 'Failed to transfer rule', 'error');
      }
    },
    [
      activeScope,
      activeCardAvatar,
      activePresetName,
      syncWorkspace,
      onRefreshActivePresetScripts,
      onNotify,
    ],
  );

  return {
    activeScope,
    setActiveScope,
    masterEnabled,
    globalScripts,
    cardScripts,
    presetScripts,
    scopeFolders: currentFolderEntry.folders || [],
    scopeAssignments: currentFolderEntry.assignments || {},
    handleToggleMaster,
    handleSaveScripts,
    handleSaveFolders,
    handleTransferScript,
    syncWorkspace,
  };
}
