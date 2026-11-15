import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { isDemoCardId } from '@core/cards/cardsApi.js';
import { fetchApiHubState } from '@core/api/apiHubApi.js';
import {
  readCachedPresetDraft,
  writeCachedPresetDraft,
  pickNewestSessionSlice,
} from '@core/session/sessionApi.js';
import {
  fetchPresetsOverview,
  patchPresetAndConnectionSettings,
  fetchCategoryPresets,
  fetchPresetDetails,
  savePresetDetails,
  removePresetFile,
  renamePresetFile,
  duplicatePresetFile,
  exportPresetFile,
  importPresetFiles,
  bulkRemovePresetFiles,
  patchCategoryPresetsMeta,
  resolveCharacterBoundPreset,
} from '@core/presets/presetsApi.js';
import {
  applyEditedPromptToOrdered,
  applyEditedGroupToOrdered,
} from '@ui/index.js';

function serializeOpenaiComparable(doc) {
  if (!doc) return '';
  return JSON.stringify({
    data: doc.data || {},
    orderedPrompts: doc.orderedPrompts || [],
    unlinkedPrompts: doc.unlinkedPrompts || [],
  });
}

function serializeTextgenComparable(doc) {
  if (!doc) return '';
  return JSON.stringify({ data: doc.data || {} });
}

/**
 * Domain workspace controller for OpenAI/TextGen prompt & sampler presets,
 * `PresetVaultInspector` unsaved draft persistence (`localStorage` +
 * `session.json`), folders/stars/character bindings, and `PromptEditorSheet`
 * selection/update handlers.
 */
export function usePresetsWorkspace({
  isMobile,
  selectedCardId,
  ensureSessionPromise,
  queueSessionPatch,
  onHydrateApiHub,
  setChatListOpen,
  setTimelinesOpen,
  setSheetExpanded,
  setEditingIntroTarget,
  setCreateScenarioModalOpen,
  setPersonaModalOpen,
  setRightOpen,
  runWithWorkspaceUnsavedGuard,
  scrollToChatBottom,
  pushToast,
}) {
  const promptEditorSheetRef = useRef(null);

  const [mainApi, setMainApi] = useState('openai');
  const [openaiPresets, setOpenaiPresets] = useState([]);
  const [textgenPresets, setTextgenPresets] = useState([]);
  const [activePresets, setActivePresets] = useState({
    openai: 'Default',
    textgen: 'Default',
  });
  const [starredPresets, setStarredPresets] = useState([]);
  const [presetCategoryMeta, setPresetCategoryMeta] = useState({
    openai: { starred: [], folders: [], presetFolders: {}, characterBindings: {} },
    textgen: { starred: [], folders: [], presetFolders: {}, characterBindings: {} },
  });
  const [presetsBootDone, setPresetsBootDone] = useState(false);
  const lastAutoPresetCardRef = useRef('');
  const [cleanOpenaiSnapshot, setCleanOpenaiSnapshot] = useState('');
  const [cleanTextgenSnapshot, setCleanTextgenSnapshot] = useState('');
  const [activeOpenaiDoc, setActiveOpenaiDoc] = useState(null);
  const [activeTextgenDoc, setActiveTextgenDoc] = useState(null);
  const [presetStatusMsg, setPresetStatusMsg] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [editingPromptSelection, setEditingPromptSelection] = useState(null);

  const presetsBootReadyRef = useRef(false);
  const lastSavedPresetDraftSigRef = useRef(null);
  const onHydrateApiHubRef = useRef(onHydrateApiHub);
  onHydrateApiHubRef.current = onHydrateApiHub;

  const loadPresetsAndVault = useCallback(async () => {
    const sessionPromise = ensureSessionPromise();
    try {
      const [overview, oaiRes, tgRes, hubRes, sessionRes] = await Promise.all([
        fetchPresetsOverview(),
        fetchCategoryPresets('openai'),
        fetchCategoryPresets('textgen'),
        fetchApiHubState().catch(() => null),
        sessionPromise,
      ]);

      const localPresetDraft = readCachedPresetDraft();
      const serverPresetDraft = sessionRes?.presetDraft || null;
      const savedPresetDraft = pickNewestSessionSlice(localPresetDraft, serverPresetDraft);
      if (savedPresetDraft && !localPresetDraft) {
        writeCachedPresetDraft(savedPresetDraft);
      } else if (
        localPresetDraft &&
        (!serverPresetDraft ||
          (Number(localPresetDraft.updatedAtMs) || 0) > (Number(serverPresetDraft.updatedAtMs) || 0))
      ) {
        queueSessionPatch({ presetDraft: localPresetDraft });
      }

      if (overview?.mainApi) setMainApi(overview.mainApi);
      if (overview?.activePresets) setActivePresets(overview.activePresets);
      if (hubRes?.ok) onHydrateApiHubRef.current?.(hubRes);

      setOpenaiPresets(oaiRes?.presets || []);
      setTextgenPresets(tgRes?.presets || []);

      if (oaiRes?.meta || tgRes?.meta) {
        setPresetCategoryMeta((prev) => ({
          ...prev,
          openai: oaiRes?.meta || prev.openai,
          textgen: tgRes?.meta || prev.textgen,
        }));
        if (Array.isArray(oaiRes?.meta?.starred) && oaiRes.meta.starred.length > 0) {
          setStarredPresets(oaiRes.meta.starred);
        }
      }

      const oaiName = overview?.activePresets?.openai || oaiRes?.presets?.[0]?.name;
      if (oaiName) {
        const oaiDoc = await fetchPresetDetails('openai', oaiName);
        if (oaiDoc?.preset) {
          setCleanOpenaiSnapshot(serializeOpenaiComparable(oaiDoc.preset));
          if (
            savedPresetDraft?.category === 'openai' &&
            savedPresetDraft?.presetName === oaiDoc.preset.name
          ) {
            const restoredDoc = {
              ...oaiDoc.preset,
              data:
                savedPresetDraft.data && typeof savedPresetDraft.data === 'object'
                  ? { ...oaiDoc.preset.data, ...savedPresetDraft.data }
                  : oaiDoc.preset.data,
              orderedPrompts: Array.isArray(savedPresetDraft.orderedPrompts)
                ? savedPresetDraft.orderedPrompts
                : oaiDoc.preset.orderedPrompts,
              unlinkedPrompts: Array.isArray(savedPresetDraft.unlinkedPrompts)
                ? savedPresetDraft.unlinkedPrompts
                : oaiDoc.preset.unlinkedPrompts,
            };
            lastSavedPresetDraftSigRef.current = serializeOpenaiComparable(restoredDoc);
            setActiveOpenaiDoc(restoredDoc);
          } else {
            lastSavedPresetDraftSigRef.current = null;
            setActiveOpenaiDoc(oaiDoc.preset);
            if (savedPresetDraft?.category === 'openai') {
              writeCachedPresetDraft(null);
              queueSessionPatch({ presetDraft: null });
            }
          }
        }
      }

      const tgName = overview?.activePresets?.textgen || tgRes?.presets?.[0]?.name;
      if (tgName) {
        const tgDoc = await fetchPresetDetails('textgen', tgName);
        if (tgDoc?.preset) {
          setCleanTextgenSnapshot(serializeTextgenComparable(tgDoc.preset));
          if (
            savedPresetDraft?.category === 'textgen' &&
            savedPresetDraft?.presetName === tgDoc.preset.name
          ) {
            const restoredTg = {
              ...tgDoc.preset,
              data:
                savedPresetDraft.data && typeof savedPresetDraft.data === 'object'
                  ? { ...tgDoc.preset.data, ...savedPresetDraft.data }
                  : tgDoc.preset.data,
            };
            lastSavedPresetDraftSigRef.current = serializeTextgenComparable(restoredTg);
            setActiveTextgenDoc(restoredTg);
          } else {
            setActiveTextgenDoc(tgDoc.preset);
            if (savedPresetDraft?.category === 'textgen') {
              writeCachedPresetDraft(null);
              queueSessionPatch({ presetDraft: null });
            }
          }
        }
      }
      presetsBootReadyRef.current = true;
      setPresetsBootDone(true);
    } catch {
      // Keep fallback UI state if server is unreachable
    }
  }, [ensureSessionPromise, queueSessionPatch]);

  useEffect(() => {
    loadPresetsAndVault();
  }, [loadPresetsAndVault]);

  const refreshCategoryListState = useCallback(async (category) => {
    const res = await fetchCategoryPresets(category);
    if (category === 'openai') setOpenaiPresets(res?.presets || []);
    else if (category === 'textgen') setTextgenPresets(res?.presets || []);
    if (res?.meta && (category === 'openai' || category === 'textgen')) {
      setPresetCategoryMeta((prev) => ({ ...prev, [category]: res.meta }));
      if (category === 'openai') setStarredPresets(res.meta.starred || []);
    }
    return res;
  }, []);

  const handleSelectPreset = useCallback(
    async (category, nextName) => {
      if (!nextName) return;
      setActivePresets((prev) => ({ ...prev, [category]: nextName }));
      setLoadingPreset(true);
      try {
        const [docRes] = await Promise.all([
          fetchPresetDetails(category, nextName),
          patchPresetAndConnectionSettings({ activePresets: { [category]: nextName } }),
        ]);
        if (docRes?.preset) {
          if (category === 'openai') {
            lastSavedPresetDraftSigRef.current = null;
            writeCachedPresetDraft(null);
            queueSessionPatch({ presetDraft: null });
            setActiveOpenaiDoc(docRes.preset);
            setCleanOpenaiSnapshot(serializeOpenaiComparable(docRes.preset));
          } else if (category === 'textgen') {
            lastSavedPresetDraftSigRef.current = null;
            writeCachedPresetDraft(null);
            queueSessionPatch({ presetDraft: null });
            setActiveTextgenDoc(docRes.preset);
            setCleanTextgenSnapshot(serializeTextgenComparable(docRes.preset));
          }
          setPresetStatusMsg(`Loaded ${nextName} (${docRes.preset.elapsedMs} ms)`);
        }
      } catch (err) {
        setPresetStatusMsg(`Error: ${err.message}`);
      } finally {
        setLoadingPreset(false);
      }
    },
    [queueSessionPatch],
  );

  const handleSavePresetDoc = useCallback(
    async (category, doc) => {
      if (!doc || !doc.name || savingPreset) return;
      setSavingPreset(true);
      try {
        const res = await savePresetDetails(category, doc.name, {
          data: doc.data,
          orderedPrompts: doc.orderedPrompts,
          unlinkedPrompts: doc.unlinkedPrompts,
        });
        if (res?.preset) {
          if (category === 'openai') {
            lastSavedPresetDraftSigRef.current = null;
            writeCachedPresetDraft(null);
            queueSessionPatch({ presetDraft: null });
            setActiveOpenaiDoc(res.preset);
            setCleanOpenaiSnapshot(serializeOpenaiComparable(res.preset));
          } else if (category === 'textgen') {
            lastSavedPresetDraftSigRef.current = null;
            writeCachedPresetDraft(null);
            queueSessionPatch({ presetDraft: null });
            setActiveTextgenDoc(res.preset);
            setCleanTextgenSnapshot(serializeTextgenComparable(res.preset));
          }
          await refreshCategoryListState(category);
          setPresetStatusMsg(`Saved ${doc.name} (${res.preset.elapsedMs} ms)`);
        }
      } catch (err) {
        setPresetStatusMsg(`Save failed: ${err.message}`);
      } finally {
        setSavingPreset(false);
      }
    },
    [savingPreset, queueSessionPatch, refreshCategoryListState],
  );

  const handleSaveAsPreset = useCallback(
    async (category, newName, sourceDoc) => {
      if (!newName || !sourceDoc) return;
      setSavingPreset(true);
      try {
        const res = await savePresetDetails(category, newName, {
          data: sourceDoc.data,
          orderedPrompts: sourceDoc.orderedPrompts,
          unlinkedPrompts: sourceDoc.unlinkedPrompts,
        });
        await refreshCategoryListState(category);
        if (res?.preset) {
          await handleSelectPreset(category, res.preset.name);
          setPresetStatusMsg(`Created preset "${res.preset.name}"`);
        }
      } catch (err) {
        setPresetStatusMsg(`Save As failed: ${err.message}`);
      } finally {
        setSavingPreset(false);
      }
    },
    [refreshCategoryListState, handleSelectPreset],
  );

  const handleRenamePreset = useCallback(
    async (category, oldName, newName) => {
      if (!oldName || !newName) return;
      try {
        const res = await renamePresetFile(category, oldName, newName);
        await refreshCategoryListState(category);
        if (res?.newName) {
          setActivePresets((prev) => ({ ...prev, [category]: res.newName }));
          if (category === 'openai' && activeOpenaiDoc?.name === oldName) {
            setActiveOpenaiDoc((prev) => (prev ? { ...prev, name: res.newName } : prev));
          } else if (category === 'textgen' && activeTextgenDoc?.name === oldName) {
            setActiveTextgenDoc((prev) => (prev ? { ...prev, name: res.newName } : prev));
          } else {
            await handleSelectPreset(category, res.newName);
          }
          setPresetStatusMsg(`Renamed "${oldName}" → "${res.newName}"`);
        }
      } catch (err) {
        setPresetStatusMsg(`Rename failed: ${err.message}`);
      }
    },
    [activeOpenaiDoc?.name, activeTextgenDoc?.name, refreshCategoryListState, handleSelectPreset],
  );

  const handleDuplicatePreset = useCallback(
    async (category, sourceName) => {
      if (!sourceName) return;
      try {
        const res = await duplicatePresetFile(category, sourceName);
        await refreshCategoryListState(category);
        if (res?.newName) {
          await handleSelectPreset(category, res.newName);
          setPresetStatusMsg(`Duplicated "${sourceName}" → "${res.newName}"`);
        }
      } catch (err) {
        setPresetStatusMsg(`Duplicate failed: ${err.message}`);
      }
    },
    [refreshCategoryListState, handleSelectPreset],
  );

  const handleDeletePreset = useCallback(
    async (category, targetName) => {
      if (!targetName) return;
      try {
        await removePresetFile(category, targetName);
        const listing = await refreshCategoryListState(category);
        const nextFallback = listing?.presets?.[0]?.name || '';
        if (nextFallback) await handleSelectPreset(category, nextFallback);
        setPresetStatusMsg(`Deleted "${targetName}" (backup saved)`);
      } catch (err) {
        setPresetStatusMsg(`Delete failed: ${err.message}`);
      }
    },
    [refreshCategoryListState, handleSelectPreset],
  );

  const handleBulkDeletePresets = useCallback(
    async (category, names) => {
      if (!Array.isArray(names) || names.length === 0) return;
      try {
        const res = await bulkRemovePresetFiles(category, names);
        const listing = await refreshCategoryListState(category);
        if (names.includes(activePresets[category])) {
          const nextFallback = listing?.presets?.[0]?.name || '';
          if (nextFallback) await handleSelectPreset(category, nextFallback);
        }
        setPresetStatusMsg(
          `Bulk deleted ${res?.deletedCount || names.length} presets (backed up)`,
        );
      } catch (err) {
        setPresetStatusMsg(`Bulk delete failed: ${err.message}`);
      }
    },
    [activePresets, refreshCategoryListState, handleSelectPreset],
  );

  const handleExportPreset = useCallback(async (category, name, includeConnection = false) => {
    if (!name) return;
    try {
      const res = await exportPresetFile(category, name, includeConnection);
      if (res?.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.fileName || `${name}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setPresetStatusMsg(
          `Exported "${name}.json" (${includeConnection ? 'with connection' : 'clean'})`,
        );
      }
    } catch (err) {
      setPresetStatusMsg(`Export failed: ${err.message}`);
    }
  }, []);

  const handleImportPresetFiles = useCallback(
    async (category, items) => {
      if (!Array.isArray(items) || items.length === 0) return;
      try {
        const res = await importPresetFiles(category, items);
        await refreshCategoryListState(category);
        const firstImported = res?.imported?.[0]?.name;
        if (firstImported) await handleSelectPreset(category, firstImported);
        setPresetStatusMsg(`Imported ${res?.importedCount || items.length} preset(s)`);
      } catch (err) {
        setPresetStatusMsg(`Import failed: ${err.message}`);
      }
    },
    [refreshCategoryListState, handleSelectPreset],
  );

  const handlePresetMetaPatch = useCallback(async (category, patch) => {
    try {
      const res = await patchCategoryPresetsMeta(category, patch);
      if (res?.presets) {
        if (category === 'openai') setOpenaiPresets(res.presets);
        else if (category === 'textgen') setTextgenPresets(res.presets);
      }
      if (res?.meta) {
        setPresetCategoryMeta((prev) => ({ ...prev, [category]: res.meta }));
        if (category === 'openai') setStarredPresets(res.meta.starred || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const isCurrentPresetDirty = useMemo(() => {
    if (mainApi === 'openai' && activeOpenaiDoc) {
      const snap = serializeOpenaiComparable(activeOpenaiDoc);
      return Boolean(cleanOpenaiSnapshot && snap !== cleanOpenaiSnapshot);
    }
    if (mainApi !== 'openai' && activeTextgenDoc) {
      const snap = serializeTextgenComparable(activeTextgenDoc);
      return Boolean(cleanTextgenSnapshot && snap !== cleanTextgenSnapshot);
    }
    return false;
  }, [mainApi, activeOpenaiDoc, activeTextgenDoc, cleanOpenaiSnapshot, cleanTextgenSnapshot]);

  const handleBindPresetToCharacter = useCallback(
    async (avatar, presetName, category = 'openai') => {
      const cleanAvatar = String(avatar || '').trim();
      if (!cleanAvatar) return;
      const cleanPreset = presetName ? String(presetName).trim() : '';
      await handlePresetMetaPatch(category, {
        bindCharacter: {
          avatar: cleanAvatar,
          presetName: cleanPreset || null,
        },
      });
      if (
        cleanPreset &&
        cleanAvatar === selectedCardId &&
        activePresets[category] !== cleanPreset &&
        !isCurrentPresetDirty
      ) {
        await handleSelectPreset(category, cleanPreset);
      }
    },
    [selectedCardId, activePresets, isCurrentPresetDirty, handlePresetMetaPatch, handleSelectPreset],
  );

  const handleUnbindAllCharactersFromPreset = useCallback(
    async (presetName, category = 'openai') => {
      const cleanPreset = String(presetName || '').trim();
      if (!cleanPreset) return;
      await handlePresetMetaPatch(category, {
        unbindPresetCharacters: cleanPreset,
      });
    },
    [handlePresetMetaPatch],
  );

  // Auto-activate character-bound preset whenever the active scenario changes
  useEffect(() => {
    if (!presetsBootDone || !selectedCardId || isDemoCardId(selectedCardId)) {
      return;
    }
    if (lastAutoPresetCardRef.current === selectedCardId) {
      return;
    }
    lastAutoPresetCardRef.current = selectedCardId;

    const activeCategory = mainApi === 'openai' ? 'openai' : 'textgen';
    const bindings = presetCategoryMeta[activeCategory]?.characterBindings || {};
    const boundPreset = resolveCharacterBoundPreset(bindings, selectedCardId);
    if (!boundPreset) return;

    const list = activeCategory === 'openai' ? openaiPresets : textgenPresets;
    const exists = list.some((p) => p.name === boundPreset);
    if (!exists || activePresets[activeCategory] === boundPreset) {
      return;
    }

    if (isCurrentPresetDirty) {
      pushToast({
        variant: 'info',
        icon: 'sliders',
        message: `Kept unsaved preset draft (bound preset "${boundPreset}" was not auto-applied)`,
      });
      return;
    }

    handleSelectPreset(activeCategory, boundPreset);
  }, [
    presetsBootDone,
    selectedCardId,
    mainApi,
    presetCategoryMeta,
    openaiPresets,
    textgenPresets,
    activePresets,
    isCurrentPresetDirty,
    handleSelectPreset,
    pushToast,
  ]);

  // Persist unsaved prompt/sampler changes for the active preset (without overwriting its .json file)
  useEffect(() => {
    if (!presetsBootReadyRef.current) return;

    if (mainApi === 'openai' && activeOpenaiDoc?.name && cleanOpenaiSnapshot) {
      const currentSig = serializeOpenaiComparable(activeOpenaiDoc);
      if (currentSig !== cleanOpenaiSnapshot) {
        if (lastSavedPresetDraftSigRef.current === currentSig) return;
        lastSavedPresetDraftSigRef.current = currentSig;
        const draft = writeCachedPresetDraft({
          category: 'openai',
          presetName: activeOpenaiDoc.name,
          data: activeOpenaiDoc.data || {},
          orderedPrompts: activeOpenaiDoc.orderedPrompts || [],
          unlinkedPrompts: activeOpenaiDoc.unlinkedPrompts || [],
          updatedAtMs: Date.now(),
        });
        queueSessionPatch({ presetDraft: draft });
      } else if (
        lastSavedPresetDraftSigRef.current !== null ||
        readCachedPresetDraft()?.category === 'openai'
      ) {
        lastSavedPresetDraftSigRef.current = null;
        writeCachedPresetDraft(null);
        queueSessionPatch({ presetDraft: null });
      }
    } else if (mainApi !== 'openai' && activeTextgenDoc?.name && cleanTextgenSnapshot) {
      const currentSig = serializeTextgenComparable(activeTextgenDoc);
      if (currentSig !== cleanTextgenSnapshot) {
        if (lastSavedPresetDraftSigRef.current === currentSig) return;
        lastSavedPresetDraftSigRef.current = currentSig;
        const draft = writeCachedPresetDraft({
          category: 'textgen',
          presetName: activeTextgenDoc.name,
          data: activeTextgenDoc.data || {},
          updatedAtMs: Date.now(),
        });
        queueSessionPatch({ presetDraft: draft });
      } else if (
        lastSavedPresetDraftSigRef.current !== null ||
        readCachedPresetDraft()?.category === 'textgen'
      ) {
        lastSavedPresetDraftSigRef.current = null;
        writeCachedPresetDraft(null);
        queueSessionPatch({ presetDraft: null });
      }
    }
  }, [
    mainApi,
    activeOpenaiDoc,
    cleanOpenaiSnapshot,
    activeTextgenDoc,
    cleanTextgenSnapshot,
    queueSessionPatch,
  ]);

  // Surface completed preset events/errors as TopBar notifications
  useEffect(() => {
    const text = String(presetStatusMsg || '').trim();
    if (!text || text.endsWith('...') || /^loaded\s+/i.test(text)) return;
    const isErr = /failed|^error:/i.test(text);
    pushToast({
      variant: isErr ? 'error' : 'success',
      message: text,
    });
  }, [presetStatusMsg, pushToast]);

  const handleRefreshActivePresetScripts = useCallback((presetName, nextScripts) => {
    setActiveOpenaiDoc((prev) => {
      if (!prev || (presetName && prev.name && prev.name !== presetName)) return prev;
      const nextDoc = {
        ...prev,
        data: {
          ...(prev.data || {}),
          extensions: {
            ...(prev.data?.extensions || {}),
            regex_scripts: nextScripts,
          },
        },
      };
      setCleanOpenaiSnapshot((prevSnap) => {
        if (!prevSnap) return prevSnap;
        try {
          const parsedSnap = JSON.parse(prevSnap);
          parsedSnap.data = {
            ...(parsedSnap.data || {}),
            extensions: {
              ...(parsedSnap.data?.extensions || {}),
              regex_scripts: nextScripts,
            },
          };
          return JSON.stringify(parsedSnap);
        } catch {
          return prevSnap;
        }
      });
      return nextDoc;
    });
  }, []);

  const handleChangeEditingPromptSelection = useCallback(
    (nextSelection, opts) => {
      const skip = Boolean(opts && typeof opts === 'object' && opts.skipGuard);
      const isSamePrompt =
        Boolean(nextSelection && editingPromptSelection) &&
        nextSelection.mode === editingPromptSelection.mode &&
        (nextSelection.mode === 'group'
          ? nextSelection.groupId === editingPromptSelection.groupId
          : nextSelection.identifier === editingPromptSelection.identifier);
      if (isSamePrompt) return;

      runWithWorkspaceUnsavedGuard(
        () => {
          if (nextSelection) {
            setChatListOpen(false);
            setTimelinesOpen(false);
            setSheetExpanded(false);
            setEditingIntroTarget(null);
            setCreateScenarioModalOpen(false);
            setPersonaModalOpen(false);
            if (isMobile) {
              setRightOpen(false);
            }
            setEditingPromptSelection(nextSelection);
          } else {
            setEditingPromptSelection(null);
            scrollToChatBottom();
          }
        },
        { skipGuard: skip },
      );
    },
    [
      editingPromptSelection,
      isMobile,
      setChatListOpen,
      setTimelinesOpen,
      setSheetExpanded,
      setEditingIntroTarget,
      setCreateScenarioModalOpen,
      setPersonaModalOpen,
      setRightOpen,
      scrollToChatBottom,
      runWithWorkspaceUnsavedGuard,
    ],
  );

  const handleSaveEditedPromptInDoc = useCallback((updatedPrompt) => {
    setActiveOpenaiDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        orderedPrompts: applyEditedPromptToOrdered(prev.orderedPrompts || [], updatedPrompt),
      };
    });
  }, []);

  const handleSaveEditedGroupInDoc = useCallback((updatedGroup, promptTokenContext) => {
    setActiveOpenaiDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        orderedPrompts: applyEditedGroupToOrdered(
          prev.orderedPrompts || [],
          updatedGroup,
          promptTokenContext,
        ),
      };
    });
  }, []);

  return {
    promptEditorSheetRef,
    mainApi,
    openaiPresets,
    textgenPresets,
    activePresets,
    starredPresets,
    presetCategoryMeta,
    activeOpenaiDoc,
    setActiveOpenaiDoc,
    activeTextgenDoc,
    setActiveTextgenDoc,
    presetStatusMsg,
    setPresetStatusMsg,
    savingPreset,
    loadingPreset,
    isCurrentPresetDirty,
    editingPromptSelection,
    setEditingPromptSelection,
    refreshCategoryListState,
    handleSelectPreset,
    handleSavePresetDoc,
    handleSaveAsPreset,
    handleRenamePreset,
    handleDuplicatePreset,
    handleDeletePreset,
    handleBulkDeletePresets,
    handleExportPreset,
    handleImportPresetFiles,
    handlePresetMetaPatch,
    handleBindPresetToCharacter,
    handleUnbindAllCharactersFromPreset,
    handleRefreshActivePresetScripts,
    handleChangeEditingPromptSelection,
    handleSaveEditedPromptInDoc,
    handleSaveEditedGroupInDoc,
  };
}
